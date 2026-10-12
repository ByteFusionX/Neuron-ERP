import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument, DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CreateStockHoldComponent } from './modals/create-stock-hold/create-stock-hold.component';
import { ResolveStockHoldComponent } from './modals/resolve-stock-hold/resolve-stock-hold.component';
import { DisputeStockHoldComponent } from './modals/dispute-stock-hold/dispute-stock-hold.component';
import { ResolveDisputeComponent } from './modals/resolve-dispute/resolve-dispute.component';
import { ViewGrnDetailsModalComponent } from 'src/app/modules/stocks/modals/view-grn-details-modal/view-grn-details-modal.component';
import { ViewPoDetailsModalComponent } from 'src/app/modules/stocks/modals/view-po-details-modal/view-po-details-modal.component';

type ReturnRecord = any;

@Component({
  selector: 'app-grn-stock-holds',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    DataGridComponent,
    DetailOverviewComponent,
    DetailTableComponent,
    DetailDocumentsComponent,
    ActionButtonComponent,
  ],
  templateUrl: './stock-holds.component.html',
  styleUrl: './stock-holds.component.css',
  providers: [DatePipe],
})
export class GrnStockHoldsComponent implements OnInit {
  @ViewChild('returnsGrid') returnsGrid!: DataGridComponent<ReturnRecord>;

  private grnService = inject(GrnService);
  private stockHoldService = inject(StockHoldService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private dialog = inject(MatDialog);
  private datePipe = inject(DatePipe);
  canInitiateHold = signal<boolean>(false);
  pendingRows: ReturnRecord[] = [];
  returnRows: ReturnRecord[] = [];
  combinedRows: ReturnRecord[] = [];
  pendingLoading = false;
  returnsLoading = false;
  density: 'comfortable' | 'compact' = 'comfortable';

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'GRN' }, { label: 'Returns' }];
  returnColumns: DataGridColumn<ReturnRecord>[] = [];
  rowActions: DataGridRowAction<ReturnRecord>[] = [];
  views: DataGridView<ReturnRecord>[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending', predicate: (r) => r.recordType === 'pending' },
    { id: 'awaiting', label: 'In Return', predicate: (r) => ['AwaitingReturn', 'AwaitingReplacement'].includes(r.status) },
    { id: 'disputed', label: 'Disputed', predicate: (r) => r.disputeStatus === 'SupplierDisputed' },
    { id: 'resolved', label: 'Resolved', predicate: (r) => ['Resolved', 'Disposed'].includes(r.status) },
  ];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Overview', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'logistics', label: 'Logistics', icon: 'transfer' },
    { id: 'resolution', label: 'Resolution', icon: 'wallet' },
    { id: 'documents', label: 'Documents', icon: 'eye' },
    { id: 'events', label: 'Events', icon: 'calendar' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'partNo', label: 'Part No.' },
    { key: 'description', label: 'Description', wrap: true },
    { key: 'returnQty', label: 'Return Qty', type: 'number', total: true },
    { key: 'resolvedQty', label: 'Resolved', type: 'number', total: true },
    { key: 'unresolvedQty', label: 'Open', type: 'number', total: true },
    { key: 'reason', label: 'Reason', wrap: true },
  ];

  readonly resolutionColumns: DetailTableColumn[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'type', label: 'Resolution' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'note', label: 'Note', wrap: true },
  ];

  readonly statusBadgeClasses: Record<string, string> = {
    AwaitingReturn: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200',
    AwaitingReplacement: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200',
    PartiallyResolved: 'bg-violet-50 text-violet-700 ring-violet-200 border-violet-200',
    Resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200',
    Disposed: 'bg-slate-100 text-slate-700 ring-slate-200 border-slate-200',
    PendingReturn: 'bg-orange-50 text-orange-700 ring-orange-200 border-orange-200',
  };

  ngOnInit(): void {
    this.checkPrivileges();
    this.buildReturnColumns();
    this.buildActions();
    this.getRejections();
    this.loadStockHolds();
  }

  private checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      const privileges = data?.category?.privileges as any;
      const hasGrnView = privileges?.grn?.viewReport && privileges.grn.viewReport !== 'none';
      this.canInitiateHold.set(!!(privileges?.stockHold?.canInitiateHold || hasGrnView));
    });
  }

  private buildReturnColumns(): void {
    this.returnColumns = [
      { key: 'returnNo', label: 'Return No', sortable: true, valueGetter: (r) => r.recordType === 'pending' ? 'Pending' : (r.returnNo || this.displayReturnNo(r)) },
      { key: 'grn', label: 'GRN', valueGetter: (r) => r?.grnNo || r?.grnId?.grnNo || 'N/A' },
      { key: 'supplier', label: 'Supplier', valueGetter: (r) => r?.supplierId?.supplierName || r?.purchaseOrderId?.supplierId?.supplierName || 'N/A' },
      { key: 'itemDescription', label: 'Item' },
      { key: 'rejectedQty', label: 'Return Qty', type: 'number', align: 'right' },
      { key: 'unresolvedQty', label: 'Open Qty', type: 'number', align: 'right', valueGetter: (r) => r.recordType === 'pending' ? r.rejectedQty : r.unresolvedQty },
      { key: 'logisticsType', label: 'Return Method', valueGetter: (r) => this.logisticsLabel(r.logisticsType) },
      { key: 'resolutionType', label: 'Vendor Resolution', valueGetter: (r) => this.resolutionLabel(r.resolutionType) },
      { key: 'disputeStatus', label: 'Dispute', valueGetter: (r) => this.disputeLabel(r.disputeStatus) },
      { key: 'status', label: 'Return Status', type: 'badge', badgeClasses: this.statusBadgeClasses, badgeLabel: (v) => this.statusLabel(v) },
    ];
  }

  private buildActions(): void {
    this.rowActions = [
      { id: 'createReturn', label: 'Create Purchase Return', icon: 'refresh', quick: true, panel: true, hidden: (r) => r.recordType !== 'pending' || !this.canInitiateHold() },
      { id: 'resolve', label: 'Resolve Return', icon: 'check', quick: true, panel: true, hidden: (r) => r.recordType === 'pending' || !this.canInitiateHold() || r?.unresolvedQty <= 0 || r?.disputeStatus === 'SupplierDisputed' },
      { id: 'dispute', label: 'Mark Supplier Dispute', icon: 'flag', quick: true, panel: true, hidden: (r) => r.recordType === 'pending' || !this.canInitiateHold() || r?.disputeStatus !== 'None' },
      { id: 'resolveDispute', label: 'Resolve Dispute', icon: 'check', quick: true, panel: true, hidden: (r) => r.recordType === 'pending' || !this.canInitiateHold() || r?.disputeStatus !== 'SupplierDisputed' },
      { id: 'viewGrn', label: 'View GRN', icon: 'eye', panel: true },
      { id: 'viewLpo', label: 'View LPO', icon: 'wallet', hidden: (r) => !this.poNo(r) },
    ];
  }

  getRejections(): void {
    this.pendingLoading = true;
    this.grnService.getGRNRejections().subscribe({
      next: (response) => {
        const rows = response.success ? (response.data || []).flatMap((grn: any) =>
          (grn.items || []).map((item: any) => ({
            recordType: 'pending',
            status: 'PendingReturn',
            disputeStatus: 'None',
            grnId: grn.grnId,
            pendingKey: `${grn.grnId}-${item.itemIndex}`,
            registerKey: `pending-${grn.grnId}-${item.itemIndex}`,
            grnNo: grn.grnNo,
            grnDate: grn.grnDate,
            purchaseOrderId: grn.purchaseOrderId,
            warehouse: grn.warehouse,
            partNo: item.partNo,
            itemDescription: item.itemDescription,
            rejectedQty: item.rejectedQty,
            rejectionReason: item.rejectionReason || '-',
            itemIndex: item.itemIndex,
          }))
        ) : [];
        this.pendingRows = rows;
        this.mergeReturnRows();
        this.pendingLoading = false;
      },
      error: () => {
        this.notificationService.error('Failed to load GRN rejections');
        this.pendingLoading = false;
      }
    });
  }

  loadStockHolds(): void {
    this.returnsLoading = true;
    this.stockHoldService.getStockHolds().subscribe({
      next: (response) => {
        this.returnRows = response.success ? (response.data || []).map((row: any) => ({ ...row, recordType: 'return', registerKey: row._id })) : [];
        this.mergeReturnRows();
        this.returnsLoading = false;
      },
      error: () => {
        this.notificationService.error('Failed to load purchase returns');
        this.returnsLoading = false;
      }
    });
  }

  onReturnAction(event: DataGridRowActionEvent<ReturnRecord>): void {
    if (event.action.id === 'createReturn') this.openInitiateHoldModal(event.row);
    if (event.action.id === 'resolve') this.openResolveModal(event.row);
    if (event.action.id === 'dispute') this.openDisputeModal(event.row);
    if (event.action.id === 'resolveDispute') this.openResolveDisputeModal(event.row);
    if (event.action.id === 'viewGrn') this.openGrnDetails(event.row);
    if (event.action.id === 'viewLpo') this.openLpoDetails(event.row);
  }

  openInitiateHoldModal(row: any): void {
    this.dialog.open(CreateStockHoldComponent, {
      width: '680px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        grnId: row.grnId,
        itemIndex: row.itemIndex,
        itemDescription: row.itemDescription,
        rejectedQty: row.rejectedQty,
        rejectionReason: row.rejectionReason,
      }
    }).afterClosed().subscribe((result) => {
      if (result) {
        this.getRejections();
        this.loadStockHolds();
      }
    });
  }

  openResolveModal(item: any): void {
    this.dialog.open(ResolveStockHoldComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: item }
    }).afterClosed().subscribe((result) => result && this.loadStockHolds());
  }

  openDisputeModal(item: any): void {
    this.dialog.open(DisputeStockHoldComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: item }
    }).afterClosed().subscribe((result) => result && this.loadStockHolds());
  }

  openResolveDisputeModal(item: any): void {
    this.dialog.open(ResolveDisputeComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: item }
    }).afterClosed().subscribe((result) => result && this.loadStockHolds());
  }

  openGrnDetails(item: any): void {
    if (!item?.grnId) return;
    const grnId = typeof item.grnId === 'string' ? item.grnId : item.grnId._id;
    this.dialog.open(ViewGrnDetailsModalComponent, { data: { grnId }, width: '1200px', maxWidth: '95vw', maxHeight: '90vh' });
  }

  openLpoDetails(row: any): void {
    const poNo = this.poNo(row);
    if (!poNo) return;
    this.dialog.open(ViewPoDetailsModalComponent, { data: { poNo }, width: '1200px', maxWidth: '95vw', maxHeight: '90vh' });
  }

  title = (row: ReturnRecord): string => row.recordType === 'pending' ? (row?.grnNo || 'Pending Rejection') : this.displayReturnNo(row);
  subtitle = (row: ReturnRecord): string => row.recordType === 'pending'
    ? [row?.purchaseOrderId?.supplierId?.supplierName, row?.purchaseOrderId?.poNo ? `LPO ${row.purchaseOrderId.poNo}` : ''].filter(Boolean).join('  •  ')
    : [row?.supplierId?.supplierName, row?.grnId?.grnNo ? `GRN ${row.grnId.grnNo}` : ''].filter(Boolean).join('  •  ');
  pendingTitle = (row: ReturnRecord): string => row?.grnNo || 'Pending Rejection';
  pendingSubtitle = (row: ReturnRecord): string => [row?.purchaseOrderId?.supplierId?.supplierName, row?.purchaseOrderId?.poNo ? `LPO ${row.purchaseOrderId.poNo}` : ''].filter(Boolean).join('  •  ');

  overviewSections(row: ReturnRecord): DetailOverviewSection[] {
    return [
      {
        title: 'Return',
        columns: '2',
        fields: [
          { type: 'field', label: 'Return No', value: this.displayReturnNo(row), numeric: true },
          { type: 'field', label: 'Status', value: this.statusLabel(row.status), pill: true, tone: this.statusTone(row.status) },
          { type: 'field', label: 'GRN', value: row?.grnId?.grnNo || 'N/A' },
          { type: 'field', label: 'Supplier', value: row?.supplierId?.supplierName || 'N/A' },
          { type: 'field', label: 'Vendor Authorization', value: row?.vendorAuthorizationNo || 'N/A' },
          { type: 'field', label: 'Created', value: this.formatDate(row?.createdAt) },
        ],
      },
      {
        title: 'Reason',
        fields: [
          { type: 'field', label: 'Return Reason', value: row?.returnReason || row?.disputeNote || 'N/A', noHover: true },
          { type: 'field', label: 'Notes', value: row?.returnNotes || 'N/A', noHover: true },
        ],
      },
    ];
  }

  logisticsSections(row: ReturnRecord): DetailOverviewSection[] {
    return [{
      title: 'Logistics',
      columns: '2',
      fields: [
        { type: 'field', label: 'Return Method', value: this.logisticsLabel(row.logisticsType), pill: true, tone: 'info' },
        { type: 'field', label: 'Dispatch Date', value: this.formatDate(row.dispatchDate) },
        { type: 'field', label: 'Courier', value: row.courierName || 'N/A' },
        { type: 'field', label: 'Tracking Ref', value: row.trackingRef || 'N/A', numeric: true },
        { type: 'field', label: 'Quarantine Stock', value: row.stockEntryId ? 'Created' : 'Not required', pill: true, tone: row.stockEntryId ? 'warn' : 'neutral' },
      ],
    }];
  }

  resolutionSections(row: ReturnRecord): DetailOverviewSection[] {
    const financial = row?.financialResolution;
    return [{
      title: 'Resolution',
      columns: '2',
      fields: [
        { type: 'field', label: 'Vendor Resolution', value: this.resolutionLabel(row.resolutionType), pill: !!row.resolutionType, tone: row.resolutionType ? 'good' : 'neutral' },
        { type: 'field', label: 'Dispute', value: this.disputeLabel(row.disputeStatus), pill: true, tone: row.disputeStatus === 'SupplierDisputed' ? 'bad' : 'neutral' },
        { type: 'field', label: 'Resolved Qty', value: row.resolvedQty || 0, numeric: true },
        { type: 'field', label: 'Open Qty', value: row.unresolvedQty || 0, numeric: true },
        { type: 'field', label: 'Financial Resolution', value: financial?.type || 'N/A' },
        { type: 'field', label: 'Adjusted Amount', value: financial?.adjustedAmount ?? 'N/A', numeric: true },
      ],
    }];
  }

  itemRows(row: ReturnRecord): Record<string, any>[] {
    return [{
      partNo: row.partNo || '-',
      description: row.itemDescription || '-',
      returnQty: row.rejectedQty || 0,
      resolvedQty: row.resolvedQty || 0,
      unresolvedQty: row.unresolvedQty || 0,
      reason: row.returnReason || '-',
    }];
  }

  resolutionRows(row: ReturnRecord): Record<string, any>[] {
    return (row.resolutionHistory || []).map((h: any) => ({
      date: h.date,
      type: this.resolutionLabel(h.resolutionType),
      qty: h.qty,
      note: h.note || '-',
    }));
  }

  documents(row: ReturnRecord): DetailDocument[] {
    return [
      ...(row.attachments || []).map((file: any) => ({
        id: file.fileName || file.originalname,
        name: file.originalname || file.fileName || 'Attachment',
        kind: this.fileKind(file.originalname || file.fileName),
        date: file.uploadedAt,
      })),
      { id: 'grn', name: row?.grnId?.grnNo ? `GRN ${row.grnId.grnNo}` : 'Linked GRN', kind: 'GRN' },
      ...(this.poNo(row) ? [{ id: 'lpo', name: `LPO ${this.poNo(row)}`, kind: 'LPO' }] : []),
    ];
  }

  onOpenDocument(row: ReturnRecord, doc: DetailDocument): void {
    if (doc.id === 'grn') this.openGrnDetails(row);
    if (doc.id === 'lpo') this.openLpoDetails(row);
  }

  eventsRows(row: ReturnRecord): Record<string, any>[] {
    const rows: Record<string, any>[] = [
      { date: row.createdAt, event: 'Purchase return created', by: this.formatEmployeeName(row.initiatedBy), note: row.returnReason || row.itemDescription },
    ];
    if (row.disputedAt) rows.push({ date: row.disputedAt, event: 'Supplier dispute raised', by: this.formatEmployeeName(row.disputedBy), note: row.disputeNote || '-' });
    (row.resolutionHistory || []).forEach((h: any) => rows.push({ date: h.date, event: this.resolutionLabel(h.resolutionType), by: this.formatEmployeeName(h.actionBy), note: h.note || `${h.qty} qty resolved` }));
    if (row.disputeResolvedAt) rows.push({ date: row.disputeResolvedAt, event: 'Supplier dispute resolved', by: this.formatEmployeeName(row.disputeResolvedBy), note: row.disputeResolutionNote || '-' });
    return rows;
  }

  readonly eventsColumns: DetailTableColumn[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'event', label: 'Event' },
    { key: 'by', label: 'By' },
    { key: 'note', label: 'Note', wrap: true },
  ];

  pendingOverviewSections(row: ReturnRecord): DetailOverviewSection[] {
    return [{
      title: 'Rejected GRN Item',
      columns: '2',
      fields: [
        { type: 'field', label: 'GRN No', value: row.grnNo, numeric: true },
        { type: 'field', label: 'LPO No', value: row?.purchaseOrderId?.poNo || 'N/A' },
        { type: 'field', label: 'Supplier', value: row?.purchaseOrderId?.supplierId?.supplierName || 'N/A' },
        { type: 'field', label: 'Warehouse', value: row?.warehouse?.wareHouseName || 'N/A' },
        { type: 'field', label: 'Item', value: row.itemDescription || 'N/A' },
        { type: 'field', label: 'Rejected Qty', value: row.rejectedQty || 0, numeric: true, pill: true, tone: 'warn' },
        { type: 'field', label: 'Reason', value: row.rejectionReason || 'N/A' },
      ],
    }];
  }

  logisticsLabel(value: string): string {
    return { PhysicalReturn: 'Physical Return', SupplierPickup: 'Supplier Pickup', Courier: 'Courier', NoPhysicalReturn: 'No Physical Return' }[value] || value || '-';
  }

  resolutionLabel(value: string): string {
    return { Replacement: 'Replacement', AlternateSupplierSourcing: 'Alternate Supplier Sourcing', CreditOnly: 'Credit Only', Disposed: 'Disposed' }[value] || (value ? value : 'Not decided yet');
  }

  disputeLabel(value: string): string {
    return { None: 'No Dispute', SupplierDisputed: 'Supplier Disputed', DisputeResolved: 'Dispute Resolved' }[value] || value || '-';
  }

  statusLabel(value: string): string {
    return { PendingReturn: 'Pending Return', AwaitingReturn: 'Awaiting Return', AwaitingReplacement: 'Awaiting Replacement', PartiallyResolved: 'Partially Resolved', Resolved: 'Resolved', Disposed: 'Disposed' }[value] || value || '-';
  }

  statusTone(value: string): 'neutral' | 'info' | 'warn' | 'good' | 'bad' {
    if (value === 'Resolved') return 'good';
    if (value === 'Disposed') return 'neutral';
    if (value === 'PartiallyResolved') return 'info';
    return 'warn';
  }

  displayReturnNo(row: ReturnRecord): string {
    return row?.returnNo || String(row?.holdNo || '').replace(/^SH-/, 'PR-') || 'Purchase Return';
  }

  poNo(row: any): string {
    return row?.grnId?.purchaseOrderId?.poNo || row?.purchaseOrderId?.poNo || '';
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    return partNo.partNo || '-';
  }

  formatDate(date: any): string {
    return date ? this.datePipe.transform(date, 'dd MMM yyyy') || 'N/A' : 'N/A';
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return 'N/A';
    if (typeof employee === 'string') return employee;
    return [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.userName || 'N/A';
  }

  fileKind(name?: string): string {
    const ext = (name || '').split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  }

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === 'all' ? this.combinedRows.length : undefined, hideCount: v.id !== 'all' }));
  }

  private mergeReturnRows(): void {
    this.combinedRows = [...this.pendingRows, ...this.returnRows];
    this.refreshViewCounts();
  }
}
