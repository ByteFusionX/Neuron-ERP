import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ViewPurchaseRequestDetailsModalComponent, ViewPurchaseRequestDetailsModalData } from '../view-purchase-request-details-modal/view-purchase-request-details-modal.component';
import { ViewLpoDetailsModalComponent, ViewLpoDetailsModalData } from '../view-lpo-details-modal/view-lpo-details-modal.component';
import { StockReturnDrawerComponent } from 'src/app/modules/stocks/pages/stock-return-drawer/stock-return-drawer.component';

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
    ActionButtonComponent,
    StockReturnDrawerComponent,
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
  private datePipe = inject(DatePipe);

  rows: any[] = [];
  /** Supplier return: accepted goods going back against a GRN. */
  returnOpen = false;
  returnGrnId = '';
  total = 0;
  isLoading = false;
  page = 1;
  row = 15;
  searchQuery = '';
  density: 'comfortable' | 'compact' = 'comfortable';

  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  views: DataGridView<any>[] = [{ id: 'all', label: 'All' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'GRN' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'eye' },
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
    this.getGRNs();
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'grnDate', label: 'GRN Date', type: 'date', sortable: true, width: '130px' },
      { key: 'grnNo', label: 'GRN No', sortable: true },
      { key: 'jobId', label: 'Job No', valueGetter: (r) => r?.jobId?.jobId || r?.purchaseOrderId?.purchaseId?.jobId?.jobId || 'N/A' },
      { key: 'purchaseNo', label: 'PR No', valueGetter: (r) => r?.purchaseOrderId?.purchaseId?.purchaseNo || 'N/A' },
      { key: 'poNo', label: 'LPO No', valueGetter: (r) => r?.purchaseOrderId?.poNo || 'N/A' },
      { key: 'supplier', label: 'Supplier', valueGetter: (r) => r?.purchaseOrderId?.supplierId?.supplierName || 'N/A' },
      { key: 'warehouse', label: 'Warehouse', valueGetter: (r) => r?.warehouse?.wareHouseName || 'N/A' },
      { key: 'acceptedQty', label: 'Accepted Qty', type: 'number', align: 'right', valueGetter: (r) => this.totalAcceptedQty(r) },
      { key: 'rejectedQty', label: 'Rejected Qty', type: 'number', align: 'right', valueGetter: (r) => this.totalRejectedQty(r) },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => this.formatEmployeeName(r?.createdBy) },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'view', label: 'Open GRN', icon: 'eye', quick: true, panel: true },
      {
        id: 'purchaseRequest',
        label: 'View PR',
        icon: 'card',
        quick: true,
        panel: true,
        hidden: (r) => !r?.purchaseOrderId?.purchaseId,
      },
      {
        id: 'lpo',
        label: 'View LPO',
        icon: 'wallet',
        quick: true,
        panel: true,
        hidden: (r) => !r?.purchaseOrderId,
      },
      { id: 'supplierReturn', label: 'Return to supplier' },
    ];
  }

  getGRNs(query?: Partial<DataGridQuery>): void {
    this.isLoading = true;
    const params: any = {
      page: query?.page ?? this.page,
      row: query?.pageSize ?? this.row,
      search: query?.search ?? this.searchQuery,
    };

    this.page = params.page;
    this.row = params.row;
    this.searchQuery = params.search || '';

    this.grnService.getAllGRNs(params).subscribe({
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
    this.getGRNs(query);
  }

  onViewChange(view: DataGridView<any>): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === view.id ? this.total : undefined }));
  }

  onCreateGRN(): void {
    this.router.navigate(['/grn/create-grn']);
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    switch (event.action.id) {
      case 'view':
        this.viewDetails(event.row);
        break;
      case 'purchaseRequest':
        this.viewPurchaseRequestDetails(event.row);
        break;
      case 'lpo':
        this.viewLpoDetails(event.row);
        break;
      case 'supplierReturn':
        this.returnGrnId = event.row._id;
        this.returnOpen = true;
        break;
    }
  }

  openDetailTab(row: any, tab: string): void {
    if (!this.grid) return;
    this.grid.activeTab = tab;
    this.grid.openRow(row);
  }

  title = (row: any): string => row?.grnNo || 'GRN';
  subtitle = (row: any): string => [row?.purchaseOrderId?.supplierId?.supplierName, row?.purchaseOrderId?.poNo ? `LPO ${row.purchaseOrderId.poNo}` : '']
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

  documentRows(row: any): Record<string, any>[] {
    return [
      { type: 'Supplier Invoice', number: row?.supplierInvoiceNo || 'N/A', date: this.formatDate(row?.supplierInvoiceDate), files: row?.supplierInvoices?.length || 0 },
      { type: 'Delivery Note', number: row?.supplierDeliveryNoteNo || 'N/A', date: this.formatDate(row?.grnDate), files: row?.supplierDeliveryNotes?.length || 0 },
      { type: 'Purchase Request', number: row?.purchaseOrderId?.purchaseId?.purchaseNo || 'N/A', date: this.formatDate(row?.purchaseOrderId?.purchaseId?.date), files: '-' },
      { type: 'LPO', number: row?.purchaseOrderId?.poNo || 'N/A', date: this.formatDate(row?.purchaseOrderId?.poDate), files: '-' },
    ];
  }

  readonly documentColumns: DetailTableColumn[] = [
    { key: 'type', label: 'Document' },
    { key: 'number', label: 'Number' },
    { key: 'date', label: 'Date' },
    { key: 'files', label: 'Files' },
  ];

  viewPurchaseRequestDetails(grn: any): void {
    const purchaseRequest = grn?.purchaseOrderId?.purchaseId;
    const purchaseId = purchaseRequest?._id || purchaseRequest;

    if (!purchaseId) {
      this.notificationService.info('No Purchase Request linked to this GRN');
      return;
    }

    const modalData: ViewPurchaseRequestDetailsModalData = {
      purchaseId,
      purchaseOrderId: grn?.purchaseOrderId?._id || grn?.purchaseOrderId,
    };
    this._dialog.open(ViewPurchaseRequestDetailsModalComponent, {
      data: modalData,
      width: '1000px',
      maxHeight: '90vh',
    });
  }

  viewLpoDetails(grn: any): void {
    const purchaseOrderId = grn?.purchaseOrderId?._id || grn?.purchaseOrderId;

    if (!purchaseOrderId) {
      this.notificationService.info('No LPO linked to this GRN');
      return;
    }

    const modalData: ViewLpoDetailsModalData = { purchaseOrderId };
    this._dialog.open(ViewLpoDetailsModalComponent, {
      data: modalData,
      width: '1000px',
      maxHeight: '90vh',
    });
  }

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

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === 'all' ? this.total : undefined }));
  }
}
