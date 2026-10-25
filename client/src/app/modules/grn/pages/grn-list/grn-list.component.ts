import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocument, DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import saveAs from 'file-saver';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { StockReturnDrawerComponent } from 'src/app/modules/stocks/pages/stock-return-drawer/stock-return-drawer.component';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { CreateGrnComponent } from '../create-grn/create-grn.component';
import { StockService } from 'src/app/core/services/stock/stock.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';

@Component({
  selector: 'app-grn-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IconsModule,
    DataGridComponent,
    DetailOverviewComponent,
    DetailTableComponent,
    DetailDocumentsComponent,
    ActionButtonComponent,
    StockReturnDrawerComponent,
    CreateGrnComponent,
  ],
  templateUrl: './grn-list.component.html',
  styleUrl: './grn-list.component.css',
  providers: [DatePipe],
})
export class GrnListComponent implements OnInit {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private grnService = inject(GrnService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private datePipe = inject(DatePipe);
  private stockService = inject(StockService);
  private purchaseOrderService = inject(PurchaseOrderService);
  private purchaseService = inject(PurchaseService);
  private confirm = inject(ConfirmDialogService);

  rows: any[] = [];
  /** Supplier return: rejected goods leaving quarantine against a GRN. */
  returnOpen = false;
  returnGrnId = '';
  createDrawerOpen = false;
  editGrnId: string | null = null;
  /** LPO to preselect when the drawer is opened from an Arriving row. */
  createLpoId: string | null = null;
  total = 0;
  isLoading = false;
  page = 1;
  row = 15;
  searchQuery = '';
  activeViewId = 'all';
  density: 'comfortable' | 'compact' = 'comfortable';

  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  views: DataGridView<any>[] = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming', hideCount: true },
    { id: 'arriving', label: 'Arriving', hideCount: true },
    { id: 'pending', label: 'Nothing received', hideCount: true },
    { id: 'partial', label: 'Partly received', hideCount: true },
    { id: 'arrived', label: 'Fully received', hideCount: true },
    { id: 'returns', label: 'Returns', hideCount: true },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'GRN' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'partNo', label: 'Part No.' },
    { key: 'itemDescription', label: 'Description' },
    { key: 'orderedQty', label: 'Ordered', type: 'number', total: true },
    { key: 'receivedQty', label: 'Received', type: 'number', total: true },
    { key: 'acceptedQty', label: 'Accepted', type: 'number', total: true },
    { key: 'rejectedQty', label: 'Rejected', type: 'number', total: true },
  ];

  constructor(private _dialog: MatDialog) {}

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    // The grid restores a URL view without asking for data, so load for that view here.
    const view = this.route.snapshot.queryParamMap.get('view');
    if (view && this.views.some((v) => v.id === view)) this.activeViewId = view;
    this.getGRNs();
  }

  /** Upcoming and Arriving both list placed LPOs rather than GRNs. */
  get isArrivingView(): boolean {
    return this.activeViewId === 'arriving' || this.activeViewId === 'upcoming';
  }

  /** Upcoming: expected after today. Arriving: due today, overdue or undated. Both list LPOs still short of goods. */
  private readonly arrivingColumns: DataGridColumn<any>[] = [
    { key: 'expectedDeliveryDate', label: 'Expected', type: 'date', width: '130px' },
    { key: 'due', label: 'Due', valueGetter: (r) => this.dueLabel(r) },
    { key: 'poNo', label: 'LPO No' },
    { key: 'supplier', label: 'Supplier', valueGetter: (r) => r?.supplierId?.supplierName || 'N/A' },
    { key: 'jobId', label: 'Job No', valueGetter: (r) => r?.jobId?.jobId || 'N/A' },
    { key: 'orderedQty', label: 'Ordered', type: 'number', align: 'right' },
    { key: 'receivedQty', label: 'Received', type: 'number', align: 'right' },
    { key: 'acceptedQty', label: 'Accepted', type: 'number', align: 'right' },
    { key: 'placedBy', label: 'Placed By', valueGetter: (r) => this.formatEmployeeName(r?.placedBy) },
  ];
  private readonly arrivingActions: DataGridRowAction<any>[] = [
    { id: 'receive', label: 'Create GRN', icon: 'plus', quick: true, persistent: true },
    { id: 'previewPo', label: 'Preview PO', icon: 'card' },
    { id: 'viewPurchase', label: 'View Purchase', icon: 'files', hidden: (r) => !this.purchaseId(r) },
  ];
  private grnColumns: DataGridColumn<any>[] = [];
  private grnActions: DataGridRowAction<any>[] = [];

  dueLabel(r: any): string {
    if (!r?.expectedDeliveryDate) return 'No date';
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const due = new Date(r.expectedDeliveryDate); due.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - start.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days < 0) return `${-days} day${days === -1 ? '' : 's'} late`;
    return `In ${days} day${days === 1 ? '' : 's'}`;
  }

  rowAccent = (r: any): 'danger' | 'warning' | null => {
    if (!this.isArrivingView || !r?.expectedDeliveryDate) return null;
    const label = this.dueLabel(r);
    return label.endsWith('late') ? 'danger' : label === 'Today' ? 'warning' : null;
  };

  private buildColumns(): void {
    this.grnColumns = [
      { key: 'grnDate', label: 'GRN Date', type: 'date', sortable: true, width: '130px' },
      { key: 'grnNo', label: 'GRN No', sortable: true },
      { key: 'jobId', label: 'Job No', valueGetter: (r) => r?.jobId?.jobId || r?.purchaseOrderId?.purchaseId?.jobId?.jobId || 'N/A' },
      { key: 'poNo', label: 'LPO No', valueGetter: (r) => r?.purchaseOrderId?.poNo || 'N/A' },
      { key: 'supplier', label: 'Supplier', valueGetter: (r) => r?.purchaseOrderId?.supplierId?.supplierName || 'N/A' },
      { key: 'warehouse', label: 'Warehouse', valueGetter: (r) => r?.warehouse?.wareHouseName || 'N/A' },
      { key: 'acceptedQty', label: 'Accepted Qty', type: 'number', align: 'right', valueGetter: (r) => this.totalAcceptedQty(r) },
      { key: 'rejectedQty', label: 'Rejected Qty', type: 'number', align: 'right', valueGetter: (r) => this.totalRejectedQty(r) },
      {
        key: 'outcomeStatus', label: 'Status', type: 'badge',
        valueGetter: (r) => r?.outcomeStatus || (this.totalRejectedQty(r) > 0 ? 'Return Required' : 'Completed'),
        badgeClasses: {
          'Completed': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
          'Resolved': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
          'Return Required': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          'Return in Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        },
      },
      { key: 'invoiceStatus', label: 'Invoice', valueGetter: (r) => r?.invoiceStatus || (this.totalRejectedQty(r) > 0 ? 'Blocked by Return' : 'Ready for Invoice') },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => this.formatEmployeeName(r?.createdBy) },
    ];
    this.columns = this.grnColumns;
  }

  private buildRowActions(): void {
    this.grnActions = [
      { id: 'view', label: 'Open GRN', icon: 'eye', quick: true, panel: true },
      { id: 'edit', label: 'Edit GRN', icon: 'pencil', quick: true },
      { id: 'previewPo', label: 'Preview PO', icon: 'card' },
      { id: 'viewPurchase', label: 'View Purchase', icon: 'files', hidden: (r) => !this.purchaseId(r) },
      { id: 'previewReceipt', label: 'Preview receipt', icon: 'eye', hidden: () => !['partial', 'arrived'].includes(this.activeViewId) },
      { id: 'supplierReturn', label: 'Create Return', hidden: (r) => this.totalRejectedQty(r) <= 0 || ['Return in Progress', 'Resolved'].includes(r?.outcomeStatus) },
      { id: 'resolveReturn', label: 'Mark Return Resolved', hidden: (r) => r?.outcomeStatus !== 'Return in Progress' },
    ];
    this.rowActions = this.grnActions;
  }

  getGRNs(query?: Partial<DataGridQuery>): void {
    this.isLoading = true;
    const params: any = {
      page: query?.page ?? this.page,
      row: query?.pageSize ?? this.row,
      search: query?.search ?? this.searchQuery,
    };
    if (this.activeViewId !== 'all' && !this.isArrivingView) params.status = this.activeViewId;
    if (this.isArrivingView) params.stage = this.activeViewId;

    this.page = params.page;
    this.row = params.row;
    this.searchQuery = params.search || '';
    this.columns = this.isArrivingView ? this.arrivingColumns : this.grnColumns;
    this.rowActions = this.isArrivingView ? this.arrivingActions : this.grnActions;

    const request = this.isArrivingView ? this.grnService.getArrivingPurchaseOrders(params) : this.grnService.getAllGRNs(params);
    request.subscribe({
      next: (response) => {
        if (response.success) {
          this.rows = response.data || [];
          this.total = response.pagination?.total || 0;
          this.refreshViewCounts();
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching GRNs:', error);
        this.notificationService.error('Failed to load GRNs');
        this.isLoading = false;
      },
    });
  }

  onQueryChange(query: DataGridQuery): void {
    clearTimeout(this.viewLoadTimer);
    this.activeViewId = query.viewId || 'all';
    this.getGRNs(query);
  }

  private viewLoadTimer?: ReturnType<typeof setTimeout>;

  onViewChange(view: DataGridView<any>): void {
    if (view.id === this.activeViewId) return;
    this.activeViewId = view.id;
    // A clicked tab follows up with a query change; a view restored from saved prefs does not, so load it here.
    clearTimeout(this.viewLoadTimer);
    this.viewLoadTimer = setTimeout(() => this.getGRNs({ page: 1 }));
  }

  onCreateGRN(lpoId: string | null = null): void {
    this.createLpoId = lpoId;
    this.editGrnId = null;
    this.createDrawerOpen = true;
  }

  onEditGRN(grnId: string): void {
    this.createLpoId = null;
    this.editGrnId = grnId;
    this.createDrawerOpen = true;
  }

  onCreateDrawerSaved(): void {
    this.getGRNs();
  }

  onCreateDrawerClosed(): void {
    this.createDrawerOpen = false;
    this.createLpoId = null;
    this.editGrnId = null;
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    switch (event.action.id) {
      case 'receive':
        this.onCreateGRN(event.row._id);
        break;
      case 'view':
        this.viewDetails(event.row);
        break;
      case 'edit':
        this.onEditGRN(event.row._id);
        break;
      case 'previewReceipt':
        this.previewReceipt(event.row);
        break;
      case 'previewPo':
        this.previewPo(event.row);
        break;
      case 'viewPurchase':
        this.router.navigate(['/purchase/view-purchase', this.purchaseId(event.row)]);
        break;
      case 'supplierReturn':
        this.returnGrnId = event.row._id;
        this.returnOpen = true;
        break;
      case 'resolveReturn':
        this.resolveReturn(event.row);
        break;
    }
  }

  /** The purchase request behind a row: the PO itself on the arriving tabs, the GRN's PO otherwise. */
  private purchaseId(r: any): string {
    const pr = r?.purchaseId ?? r?.purchaseOrderId?.purchaseId;
    return pr?._id ?? pr ?? '';
  }

  private previewReceipt(row: any): void {
    const items = row?.items || [];
    if (!items.length) {
      this.notificationService.warning('No items recorded on this GRN');
      return;
    }
    this.grnService.generateGRNReceiptPDF(row, items).then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        this._dialog.open(PdfPreviewComponent, {
          data: { url: window.URL.createObjectURL(blob), formatedQuote: row, type: 'grn' },
        });
      });
    }).catch((error) => {
      console.error('Error generating PDF:', error);
      this.notificationService.error('Failed to load GRN receipt');
    });
  }

  private previewPo(row: any): void {
    const purchaseOrderId = this.isArrivingView
      ? row?._id
      : (typeof row?.purchaseOrderId === 'string' ? row.purchaseOrderId : row?.purchaseOrderId?._id);
    if (!purchaseOrderId) {
      this.notificationService.warning('No purchase order is linked to this GRN');
      return;
    }

    this.purchaseOrderService.getPurchaseOrderById(purchaseOrderId).subscribe({
      next: (response: any) => {
        const purchaseOrder = response?.success ? response.data : response;
        this.purchaseService.generatePDF(purchaseOrder, false)
          .then((pdf) => pdf.getBlob((blob: Blob) => {
            this._dialog.open(PdfPreviewComponent, {
              data: { url: window.URL.createObjectURL(blob), formatedQuote: purchaseOrder, type: 'purchase' },
            });
          }))
          .catch(() => this.notificationService.error('Error generating PDF. Please try again.'));
      },
      error: () => this.notificationService.error('Failed to load the PO'),
    });
  }

  private async resolveReturn(row: any): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Mark return as resolved?',
      message: 'The rejected goods have been returned or settled with the supplier, and the GRN will be ready for invoice.',
      details: [{ label: 'GRN', value: row.grnNo }],
      confirmLabel: 'Mark Resolved',
    });
    if (!confirmed) return;
    this.stockService.resolveSupplierReturn(row._id).subscribe({
      next: (response) => {
        this.notificationService.success(response.message);
        this.getGRNs();
      },
      error: (error) => this.notificationService.error(error?.error?.message || 'Could not resolve return'),
    });
  }

  openDetailTab(row: any, tab: string): void {
    if (!this.grid) return;
    this.grid.activeTab = tab;
    this.grid.openRow(row);
  }

  title = (row: any): string => (this.isArrivingView ? row?.poNo : row?.grnNo) || 'GRN';
  subtitle = (row: any): string => this.isArrivingView ? (row?.supplierId?.supplierName || '') : [row?.purchaseOrderId?.supplierId?.supplierName, row?.purchaseOrderId?.poNo ? `LPO ${row.purchaseOrderId.poNo}` : '']
    .filter(Boolean)
    .join('  •  ');

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'Receipt',
        columns: '2',
        fields: [
          { type: 'field', label: 'GRN No', value: row?.grnNo, numeric: true },
          { type: 'field', label: 'GRN Date', value: this.formatDate(row?.grnDate) },
          { type: 'field', label: 'Supplier', value: row?.purchaseOrderId?.supplierId?.supplierName || 'N/A' },
          { type: 'field', label: 'Warehouse', value: row?.warehouse?.wareHouseName || 'N/A' },
          { type: 'field', label: 'Received By', value: this.formatEmployeeName(row?.receivedBy) || 'N/A' },
          { type: 'field', label: 'Created By', value: this.formatEmployeeName(row?.createdBy) || 'N/A' },
        ],
      },
      {
        title: 'Linked Documents',
        columns: '2',
        fields: [
          { type: 'field', label: 'Purchase Request', value: row?.purchaseOrderId?.purchaseId?.purchaseNo || 'N/A', pill: !!row?.purchaseOrderId?.purchaseId, tone: 'info' },
          { type: 'field', label: 'LPO No', value: row?.purchaseOrderId?.poNo || 'N/A', pill: !!row?.purchaseOrderId, tone: 'neutral' },
          { type: 'field', label: 'Job No', value: row?.jobId?.jobId || row?.purchaseOrderId?.purchaseId?.jobId?.jobId || 'N/A' },
          { type: 'field', label: 'Supplier Invoice', value: row?.supplierInvoiceNo || 'N/A' },
          { type: 'field', label: 'Invoice Date', value: this.formatDate(row?.supplierInvoiceDate) },
          { type: 'field', label: 'Delivery Note', value: row?.supplierDeliveryNoteNo || 'N/A' },
        ],
      },
      {
        title: 'Quantity Summary',
        columns: '2',
        fields: [
          { type: 'field', label: 'Ordered Qty', value: this.totalOrderedQty(row), numeric: true },
          { type: 'field', label: 'Received Qty', value: this.totalReceivedQty(row), numeric: true },
          { type: 'field', label: 'Accepted Qty', value: this.totalAcceptedQty(row), numeric: true, tone: 'good' },
          { type: 'field', label: 'Rejected Qty', value: this.totalRejectedQty(row), numeric: true, pill: this.totalRejectedQty(row) > 0, tone: this.totalRejectedQty(row) > 0 ? 'warn' : 'neutral' },
          { type: 'field', label: 'Outcome', value: row?.outcomeStatus || (this.totalRejectedQty(row) > 0 ? 'Return Required' : 'Completed'), pill: true, tone: ['Completed', 'Resolved'].includes(row?.outcomeStatus) ? 'good' : 'warn' },
          { type: 'field', label: 'Invoice', value: row?.invoiceStatus || (this.totalRejectedQty(row) > 0 ? 'Blocked by Return' : 'Ready for Invoice'), pill: true, tone: row?.invoiceStatus === 'Blocked by Return' ? 'warn' : 'good' },
        ],
      },
    ];
  }

  itemRows(row: any): Record<string, any>[] {
    return (row?.items || []).map((item: any) => ({
      partNo: this.formatPartNumber(item?.partNo),
      itemDescription: item?.itemDescription || '-',
      orderedQty: item?.orderedQty || 0,
      receivedQty: item?.receivedQty || 0,
      acceptedQty: item?.acceptedQty || 0,
      rejectedQty: this.getRejectedQty(item),
      remarks: item?.remarks || '-',
    }));
  }

  /** Files uploaded against the PO; a GRN row carries its LPO, an Arriving row is the LPO. */
  poDocuments(row: any): DetailDocument[] {
    const files = this.isArrivingView ? row?.documents : row?.purchaseOrderId?.documents;
    return (files ?? []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname || file.fileName,
      kind: file.mimetype?.split('/').pop(),
      size: file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : undefined,
      date: file.uploadedAt,
    }));
  }

  private static readonly PREVIEW_MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', txt: 'text/plain',
  };

  private fetchDocument(doc: DetailDocument, then: (blob: Blob) => void): void {
    this.purchaseOrderService.getFile(doc.id).subscribe({
      next: then,
      error: (error) => {
        if (error.status === 404) this.notificationService.warning('The file was not found on the server.');
        else this.notificationService.error('An error occurred while opening the file.');
      },
    });
  }

  onDocumentOpen(doc: DetailDocument): void {
    this.fetchDocument(doc, (blob) => {
      const mime = GrnListComponent.PREVIEW_MIME[doc.id.split('.').pop()?.toLowerCase() ?? ''];
      const url = window.URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    });
  }

  onDocumentDownload(doc: DetailDocument): void {
    this.fetchDocument(doc, (blob) => saveAs(blob, doc.name));
  }

  arrivingSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'Delivery',
        columns: '2',
        fields: [
          { type: 'field', label: 'LPO No', value: row?.poNo || 'N/A', numeric: true },
          { type: 'field', label: 'Expected', value: this.formatDate(row?.expectedDeliveryDate) },
          { type: 'field', label: 'Due', value: this.dueLabel(row), pill: true, tone: this.dueLabel(row).endsWith('late') ? 'warn' : 'neutral' },
          { type: 'field', label: 'Supplier', value: row?.supplierId?.supplierName || 'N/A' },
          { type: 'field', label: 'Placed By', value: this.formatEmployeeName(row?.placedBy) },
          { type: 'field', label: 'Delivery Location', value: row?.placeOfDelivery || 'N/A' },
        ],
      },
      {
        title: 'Linked',
        columns: '2',
        fields: [
          { type: 'field', label: 'Purchase Request', value: row?.purchaseId?.purchaseNo || 'N/A' },
          { type: 'field', label: 'Job No', value: row?.jobId?.jobId || 'N/A' },
        ],
      },
      {
        title: 'Quantity Summary',
        columns: '2',
        fields: [
          { type: 'field', label: 'Ordered Qty', value: row?.orderedQty ?? 0, numeric: true },
          { type: 'field', label: 'Received Qty', value: row?.receivedQty ?? 0, numeric: true },
          { type: 'field', label: 'Accepted Qty', value: row?.acceptedQty ?? 0, numeric: true, tone: 'good' },
        ],
      },
    ];
  }

  arrivingItemRows(row: any): Record<string, any>[] {
    return (row?.items || []).map((item: any) => ({
      partNo: this.formatPartNumber(item?.partNo),
      itemDescription: item?.detail || item?.itemDescription || '-',
      orderedQty: item?.quantity || 0,
    }));
  }

  readonly arrivingItemColumns: DetailTableColumn[] = [
    { key: 'partNo', label: 'Part No.' },
    { key: 'itemDescription', label: 'Description' },
    { key: 'orderedQty', label: 'Ordered', type: 'number', total: true },
  ];

  viewDetails(grn: any): void {
    const grnId = grn?._id;
    if (!grnId) {
      this.notificationService.info('Unable to open this GRN');
      return;
    }

    this.router.navigate(['/grn/view-grn', grnId], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return 'N/A';
    if (typeof employee === 'string') return employee;
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim();
    return name || employee.userName || employee.email || 'N/A';
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    return partNo.partNo || '-';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return this.datePipe.transform(date, 'dd MMM yyyy') || 'N/A';
  }

  getRejectedQty(item: any): number {
    if (item?.rejectedQty !== undefined && item?.rejectedQty !== null) return item.rejectedQty;
    return Math.max(0, (item?.receivedQty || 0) - (item?.acceptedQty || 0));
  }

  private sumItems(row: any, selector: (item: any) => number): number {
    if (!Array.isArray(row?.items)) return 0;
    return row.items.reduce((sum: number, item: any) => sum + (selector(item) || 0), 0);
  }

  totalOrderedQty(row: any): number {
    return this.sumItems(row, (item) => item.orderedQty);
  }

  totalReceivedQty(row: any): number {
    return this.sumItems(row, (item) => item.receivedQty);
  }

  totalAcceptedQty(row: any): number {
    return this.sumItems(row, (item) => item.acceptedQty);
  }

  totalRejectedQty(row: any): number {
    return this.sumItems(row, (item) => this.getRejectedQty(item));
  }

  /** Server-paged tabs only know their own total, so ask each view for a one-row page to get its count. */
  private refreshViewCounts(): void {
    const countOf = (id: string) => {
      const params: any = { page: 1, row: 1, search: this.searchQuery };
      const arriving = id === 'upcoming' || id === 'arriving';
      if (arriving) params.stage = id;
      else if (id !== 'all') params.status = id;
      const request = arriving ? this.grnService.getArrivingPurchaseOrders(params) : this.grnService.getAllGRNs(params);
      return request.pipe(map((r) => r?.pagination?.total ?? 0), catchError(() => of(undefined)));
    };
    forkJoin(this.views.map((v) => countOf(v.id))).subscribe((counts) => {
      this.views = this.views.map((v, i) => ({ ...v, count: counts[i], hideCount: counts[i] === undefined }));
    });
  }
}
