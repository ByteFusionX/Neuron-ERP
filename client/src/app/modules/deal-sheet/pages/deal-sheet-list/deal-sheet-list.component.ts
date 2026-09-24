import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DatePipe, NgClass, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpEventType } from '@angular/common/http';
import { inject } from '@angular/core';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { NgIcon } from '@ng-icons/core';

import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { getDealSheet, Quotatation } from 'src/app/shared/interfaces/quotation.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction,
  DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailOverviewSection, DetailTableColumn, DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { StatusChangeModalComponent, StatusChangeResult } from 'src/app/shared/components/status-change-modal/status-change-modal.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { UpdatedealsheetComponent } from '../../updatedealsheet-component/updatedealsheet-component.component';

/** Deal statuses selectable from the status-change modal; 'pending' is never a target (only a starting point). */
const DEAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
type DealStatus = typeof DEAL_STATUSES[number];

/**
 * Merged Pending/Approved deal sheet grid, replacing the two separate Material list pages with one
 * DataGridComponent instance and "Pending"/"Approved" view tabs — mirrors the quotation-list migration.
 * Approve/Reject reuse the generic StatusChangeModalComponent (status + note) instead of the bespoke
 * RejectDealComponent, and Revoke uses ConfirmDialogService instead of ConfirmationDialogComponent.
 */
@Component({
  selector: 'app-deal-sheet-list',
  templateUrl: './deal-sheet-list.component.html',
  providers: [NumberFormatterPipe, DatePipe],
  imports: [NgIf, NgClass, NgSwitch, NgSwitchCase, DatePipe, FormsModule, NgIcon,
    DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailDocumentsComponent],
})
export class DealSheetListComponent implements OnInit, OnDestroy {
  ngAfterViewInit(): void {
    if (this.grid) { this.grid.activeViewId = this.activeViewId; this.grid.page = this.page; }
  }

  @ViewChild('grid') grid!: DataGridComponent<Quotatation>;

  private confirm = inject(ConfirmDialogService);

  isLoading = true;
  userId: string | undefined;
  isSuperAdmin = false;

  rows: Quotatation[] = [];
  total = 0;
  page = 1;
  row = 10;
  searchQuery = '';
  searchCriteria: 'dealId' | 'customer' | 'salesperson' = 'dealId';

  columns: DataGridColumn<Quotatation>[] = [];
  rowActions: DataGridRowAction<Quotatation>[] = [];
  views: DataGridView<Quotatation>[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'revoked', label: 'Revoked' },
  ];
  private activeViewId: 'all' | 'pending' | 'approved' | 'rejected' | 'revoked' = 'pending';

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'eye' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  readonly dealStatusBadgeClasses: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  };

  rowAccent = (r: Quotatation): 'warning' | null =>
    r.dealData && !r.dealData.seenByApprover ? 'warning' : null;

  dealTitle = (r: Quotatation) => r.dealData?.dealId ?? '';
  dealSubtitle = (r: Quotatation) => r.client?.companyName ?? '';

  private subscriptions = new Subscription();

  constructor(
    private _quoteService: QuotationService,
    private _employeeService: EmployeeService,
    private _jobService: JobService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _dialog: MatDialog,
    private toaster: ToastrService,
    private numberFormat: NumberFormatterPipe,
    private datePipe: DatePipe,
  ) { }

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();

    this._route.data.subscribe((data) => {
      if (['all', 'pending', 'approved', 'rejected', 'revoked'].includes(data['view'])) {
        this.activeViewId = data['view'];
        if (this.grid) this.grid.activeViewId = this.activeViewId;
      }
    });

    this._route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.row = params['row'] ? parseInt(params['row'], 10) : 10;
      this.searchQuery = params['search'] || '';
      this.searchCriteria = params['searchCriteria'] || 'dealId';
      if (this.grid) this.grid.page = this.page;
      this.getDeals();
    });

    this._employeeService.employeeData$.subscribe((employee) => {
      this.userId = employee?._id;
      this.isSuperAdmin = employee?.category.role === 'superAdmin';
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', valueGetter: (r) => r.dealData?.savedDate },
      { key: 'dealId', label: 'Deal Id', valueGetter: (r) => r.dealData?.dealId },
      { key: 'quoteId', label: 'Quote Id' },
      { key: 'customerName', label: 'Customer', valueGetter: (r) => r.client?.companyName },
      { key: 'description', label: 'Description', valueGetter: (r) => r.subject },
      { key: 'salesPerson', label: 'Sales Person', valueGetter: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '' },
      { key: 'department', label: 'Department', valueGetter: (r) => r.department?.departmentName },
      { key: 'paymentTerms', label: 'Payment Terms', valueGetter: (r) => r.dealData?.paymentTerms },
      { key: 'amount', label: 'Amount', valueGetter: (r) => this.formatAmount(r) },
      {
        key: 'dealStatus', label: 'Status', type: 'badge',
        valueGetter: (r) => r.dealData?.status ?? null,
        badgeClasses: this.dealStatusBadgeClasses,
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'viewLpo', label: 'View LPO', icon: 'eye', quick: true, hidden: (r) => !r.lpoFiles?.length },
      { id: 'viewAttachments', label: 'View Attachments', icon: 'upload', quick: true, hidden: (r) => !r.dealData?.attachments?.length },
      { id: 'approve', label: 'Approve', icon: 'refresh', hidden: (r) => r.dealData?.status !== 'pending' },
      { id: 'reject', label: 'Reject', icon: 'trash', hidden: (r) => r.dealData?.status !== 'pending' },
      { id: 'update', label: 'Update Deal', icon: 'pencil', hidden: (r) => r.dealData?.status === 'approved' },
      { id: 'revoke', label: 'Revoke Deal', icon: 'refresh', hidden: (r) => r.dealData?.status !== 'approved' },
    ];
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.getDeals();
    this.updateUrlParams();
  }

  private static readonly viewSegments: Record<'all' | 'pending' | 'approved' | 'rejected' | 'revoked', string> = {
    all: 'dealsheets',
    pending: 'pendings',
    approved: 'approved',
    rejected: 'rejecteds',
    revoked: 'revokeds',
  };

  onViewChange(view: DataGridView<Quotatation>): void {
    this.activeViewId = view.id as 'all' | 'pending' | 'approved' | 'rejected' | 'revoked';
    this.page = 1;
    if (this.grid) this.grid.page = 1;

    const segment = DealSheetListComponent.viewSegments[this.activeViewId];
    this._router.navigate(['/deal-sheet', segment], {
      queryParams: {
        page: null,
        row: this.row !== 10 ? this.row : null,
        search: this.searchQuery || null,
        searchCriteria: this.searchCriteria !== 'dealId' ? this.searchCriteria : null,
      },
      replaceUrl: true,
    });
  }

  /** Only the active tab has a known total (rows are server-paged), so the others show no badge. */
  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  private updateUrlParams(): void {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        page: this.page !== 1 ? this.page : null,
        row: this.row !== 10 ? this.row : null,
        search: this.searchQuery || null,
        searchCriteria: this.searchCriteria !== 'dealId' ? this.searchCriteria : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  getDeals(): void {
    this.isLoading = true;
    let access: string | undefined;
    let userId: string | undefined;
    let role: string | undefined;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport;
      role = employee?.category.role;
      userId = employee?._id;
      this.userId = userId;
    });

    const filterData: any = {
      page: this.page,
      row: this.row,
      access,
      userId,
      role,
      searchQuery: this.searchQuery,
      searchCriteria: this.searchCriteria,
      view: this.activeViewId,
    };

    const request = this.activeViewId === 'approved'
      ? this._quoteService.getApprovedDealSheet(filterData)
      : this._quoteService.getDealSheet(filterData);

    this.subscriptions.add(
      request.subscribe({
        next: (data: getDealSheet) => {
          this.rows = data?.dealSheet ? [...data.dealSheet] : [];
          this.total = data?.total ?? 0;
          this.refreshViewCounts();
          this.isLoading = false;
        },
        error: () => {
          this.rows = [];
          this.total = 0;
          this.isLoading = false;
          this.toaster.error('Failed to load deal sheets');
        },
      }),
    );
  }

  onRowAction(event: DataGridRowActionEvent<Quotatation>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'viewLpo': this.openLpoFiles(row); break;
      case 'viewAttachments': this.openAttachments(row); break;
      case 'approve': this.approveDeal(row); break;
      case 'reject': this.rejectDeal(row); break;
      case 'update': this.updateDeal(row); break;
      case 'revoke': this.revokeDeal(row); break;
    }
  }

  /** Opening the detail panel is the new "viewed" signal, replacing the old IntersectionObserver. */
  onRowOpen(row: Quotatation): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 200);
    if (row._id && row.dealData && !row.dealData.seenByApprover) {
      this._quoteService.markDealAsViewed(row._id).subscribe();
      row.dealData.seenByApprover = true;
    }
  }

  /** Approve/Reject share the generic status-change modal (status + required note for reject). */
  private statusModal(row: Quotatation, target: DealStatus) {
    return this._dialog.open<StatusChangeModalComponent, any, StatusChangeResult<DealStatus> | null>(StatusChangeModalComponent, {
      data: {
        currentStatus: 'pending' as DealStatus,
        statuses: DEAL_STATUSES,
        targetStatus: target,
        requireReasonFor: ['rejected'],
        reasonLabels: {
          approved: { label: 'Note', placeholder: 'Optional comment' },
          rejected: { label: 'Reason', placeholder: 'Why is this deal being rejected?' },
        },
        title: target === 'approved' ? 'Approve deal' : 'Reject deal',
        subtitle: row.dealData?.dealId,
      },
      width: '480px',
      maxWidth: '95vw',
      autoFocus: false,
    }).afterClosed();
  }

  approveDeal(row: Quotatation): void {
    this.statusModal(row, 'approved').subscribe((result) => {
      if (!result) return;
      this._quoteService.approveDeal(row._id, result.reason, this.userId).subscribe({
        next: () => { this.toaster.success('Deal approved'); this.getDeals(); },
        error: (err) => this.toaster.error(err?.error?.message || 'Failed to approve deal'),
      });
    });
  }

  rejectDeal(row: Quotatation): void {
    this.statusModal(row, 'rejected').subscribe((result) => {
      if (!result) return;
      this._quoteService.rejectDeal(result.reason, row._id).subscribe({
        next: () => { this.toaster.success('Deal rejected'); this.getDeals(); },
        error: (err) => this.toaster.error(err?.error?.message || 'Failed to reject deal'),
      });
    });
  }

  private readonly allocateStatusOrder = ['Pending', 'Work In Progress', 'OpenToWork', 'Completed'];

  private canRevokeDeal(row: Quotatation): boolean {
    const allocateStatus = row.job?.allocateStatus;
    if (!allocateStatus) return true;
    return this.allocateStatusOrder.indexOf(allocateStatus) < this.allocateStatusOrder.indexOf('OpenToWork');
  }

  async revokeDeal(row: Quotatation): Promise<void> {
    if (!this.canRevokeDeal(row)) {
      this.toaster.error('Deal cannot be revoked once the job has started allocation (Open to Work or later)');
      return;
    }
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Revoke this deal?',
      message: 'This will permanently delete the created job and the deal status will change back to pending.',
      consequence: 'This cannot be undone.',
      confirmLabel: 'Revoke',
    });
    if (!confirmed) return;

    this._quoteService.revokeDeal(row._id, this.userId).subscribe({
      next: () => { this.toaster.success('Deal revoked'); this.getDeals(); },
      error: (err) => this.toaster.error(err?.error?.message || 'Failed to revoke deal'),
    });
  }

  /** `UpdatedealsheetComponent` seeds its form from `quoteItems` (the deal's own updated items,
   *  same as what the old view-dealsheet page passed via router state). */
  updateDeal(row: Quotatation): void {
    const updateModal = this._dialog.open(UpdatedealsheetComponent, {
      data: {
        approval: false,
        quoteData: row,
        quoteItems: row.dealData?.updatedItems ?? [],
        priceDetails: { totalSellingPrice: this.sellingPrice(row), totalCost: 0, profit: 0, perc: 0 },
        quoteView: false,
      },
    });
    updateModal.afterClosed().subscribe((dealData) => {
      if (!dealData) return;
      this._quoteService.saveDealSheet(dealData, row._id).subscribe({
        next: () => { this.toaster.success('Deal sheet updated'); this.getDeals(); },
        error: () => this.toaster.error('Failed to save deal sheet'),
      });
    });
  }

  openLpoFiles(row: Quotatation): void {
    if (!row.lpoFiles?.length) return;
    const modalData: FileUploadModalData = {
      title: `LPO Files - ${row.dealData?.dealId ?? ''}`,
      existingFiles: row.lpoFiles,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false },
    };
    this._dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  openAttachments(row: Quotatation): void {
    if (!row.dealData?.attachments?.length) return;
    const modalData: FileUploadModalData = {
      title: `Deal Sheet Attachments - ${row.dealData?.dealId ?? ''}`,
      existingFiles: row.dealData.attachments as any,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false },
    };
    this._dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  // --- detail panel content ---------------------------------------------------

  itemRows(row: Quotatation): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    (row.dealData?.updatedItems ?? []).forEach((item) => {
      (item.itemDetails ?? []).forEach((d) => {
        if (!d.dealSelected) return;
        rows.push({ item: d.detail, qty: d.quantity, price: d.unitSellingPrice, amount: (d.quantity ?? 0) * (d.unitSellingPrice ?? 0) });
      });
    });
    return rows;
  }

  dealDocuments(row: Quotatation): DetailDocument[] {
    return (row.dealData?.attachments || []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname,
      kind: (file.originalname?.split('.').pop() || 'FILE').toUpperCase().slice(0, 4),
    }));
  }

  onDealDocPreview(row: Quotatation, doc: DetailDocument): void {
    const file = (row.dealData?.attachments || []).find((f: any) => f.fileName === doc.id);
    if (file) this.previewOrDownload(file, 'view');
  }

  onDealDocDownload(row: Quotatation, doc: DetailDocument): void {
    const file = (row.dealData?.attachments || []).find((f: any) => f.fileName === doc.id);
    if (file) this.previewOrDownload(file, 'download');
  }

  private previewOrDownload(file: any, mode: 'view' | 'download'): void {
    this._jobService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type !== HttpEventType.Response) return;
        const blob = new Blob([event.body]);
        if (mode === 'download') {
          saveAs(blob, file.originalname);
        } else {
          const url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        }
      },
      error: (error) => {
        if (error.status === 404) this.toaster.warning('Sorry, the requested file was not found on the server.');
        else this.toaster.error('An error occurred while opening the file.');
      },
    });
  }

  private sellingPrice(row: Quotatation): number {
    let total = 0;
    (row.dealData?.updatedItems ?? []).forEach((item) => {
      (item.itemDetails ?? []).forEach((d) => {
        if (d.dealSelected) total += (d.unitSellingPrice ?? 0) * (d.quantity ?? 0);
      });
    });
    (row.dealData?.additionalCosts ?? []).forEach((cost) => {
      if (cost.type === 'Customer Discount') total -= cost.value;
    });
    return total;
  }

  formatAmount(row: Quotatation): string {
    if (!row.dealData) return '';
    return `${this.numberFormat.transform(this.sellingPrice(row))} ${row.currency}`;
  }

  approverName(row: Quotatation): string {
    const approver = row.dealData?.approvedBy;
    if (approver && typeof approver === 'object') return `${approver.firstName ?? ''} ${approver.lastName ?? ''}`.trim();
    return '';
  }

  overviewSections(row: Quotatation): DetailOverviewSection[] {
    const deal: any = row.dealData;
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Deal Id', value: deal?.dealId, numeric: true },
          { type: 'field', label: 'Quote Id', value: row.quoteId, numeric: true },
          { type: 'field', label: 'Customer', value: row.client?.companyName },
          { type: 'field', label: 'Sales Person', value: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '' },
          { type: 'field', label: 'Department', value: row.department?.departmentName },
          { type: 'field', label: 'Date', value: this.datePipe.transform(deal?.savedDate, 'dd MMM yyyy') },
          { type: 'dg', key: 'dealStatus', label: 'Status', noHover: true },
          ...(this.approverName(row) ? [{ type: 'field' as const, label: 'Approved by', value: this.approverName(row), noHover: true }] : []),
        ],
      },
      {
        title: 'Overview',
        fields: [
          { type: 'field', label: 'Payment Terms', value: deal?.paymentTerms },
          { type: 'field', label: 'Amount', value: this.formatAmount(row), numeric: true, noHover: true },
          ...(deal?.comments?.length ? [{ type: 'field' as const, label: 'Latest Comment', value: deal.comments[deal.comments.length - 1] }] : []),
        ],
      },
    ];
  }
}
