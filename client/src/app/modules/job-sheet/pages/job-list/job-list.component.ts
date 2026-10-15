import { HttpEventType } from '@angular/common/http';
import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, firstValueFrom, switchMap, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as FileSaver from 'file-saver';

import { JobService } from 'src/app/core/services/job/job.service';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { JobHistoryService } from 'src/app/core/services/job/job-history.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ModalService } from 'src/app/shared/components/modal';
import { AllocateTypeModalComponent, AllocateTypeResult } from '../allocate-type-modal/allocate-type-modal.component';
import { MarkLostModalComponent } from '../mark-lost-modal/mark-lost-modal.component';
import { TransferProcurementPersonComponent, TransferProcurementPersonResult } from '../transfer-procurement-person/transfer-procurement-person.component';

import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridColumn,
  DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailOverviewSection, DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

import { allocateStatus, filterJob, getJob, JobTable } from 'src/app/shared/interfaces/job.interface';
import { JobWorkflowTimeline, TimelineEvent } from 'src/app/shared/interfaces/job-history.interface';
import { environment } from 'src/environments/environment';

const ALLOCATE_STATUS_LABELS: Record<string, string> = {
  [allocateStatus.Pending]: 'Pending',
  [allocateStatus.OpenToWork]: 'Open To Work',
  [allocateStatus.WorkInProgress]: 'In Progress',
  [allocateStatus.Completed]: 'Completed',
  [allocateStatus.Lost]: 'Lost',
};
const allocateStatusLabel = (v: unknown): string => ALLOCATE_STATUS_LABELS[String(v)] ?? (v ? String(v) : '—');

type WorkflowState = { status: 'loading' | 'ready' | 'error'; timeline: JobWorkflowTimeline | null };

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZES = [5, 15, 30, 50];

@Component({
  selector: 'app-job-list',
  templateUrl: './job-list.component.html',
  styleUrls: ['./job-list.component.css'],
  providers: [NumberFormatterPipe, DatePipe],
  imports: [
    NgIf, NgFor, NgClass, NgSwitch, NgSwitchCase, AsyncPipe, DatePipe, DecimalPipe,
    DataGridComponent, DetailOverviewComponent, DetailDocumentsComponent, ActionButtonComponent, ViewToggleComponent,
    DetailTimelineComponent,
  ],
})
export class JobListComponent {
  @ViewChild('grid') grid?: DataGridComponent<getJob>;

  rows: getJob[] = [];
  columns: DataGridColumn<getJob>[] = [];
  rowActions: DataGridRowAction<getJob>[] = [];
  views: DataGridView<getJob>[] = [
    { id: 'all', label: 'All', filters: [] },
    { id: 'pending', label: 'Pending', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.Pending }] },
    { id: 'open-to-work', label: 'Open To Work', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.OpenToWork }] },
    { id: 'in-progress', label: 'In Progress', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.WorkInProgress }] },
    { id: 'completed', label: 'Completed', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.Completed }] },
    { id: 'lost', label: 'Lost', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.Lost }] },
  ];
  bulkActions: DataGridBulkAction[] = [];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Job Sheet' }];

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'comments', label: 'Comments', icon: 'chat' },
    { id: 'lpo', label: 'Documents', icon: 'files' },
    { id: 'workflow', label: 'Workflow', icon: 'activity' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  statusLabel = allocateStatusLabel;

  jobTitle = (r: getJob) => r.jobId ?? '';
  jobSubtitle = (r: getJob) => r.clientDetails?.companyName ?? '';

  readonly allocateStatusBadgeClasses: Record<string, string> = {
    [allocateStatus.Pending]: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
    [allocateStatus.OpenToWork]: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
    [allocateStatus.WorkInProgress]: 'bg-violet-50 text-violet-700 ring-violet-200 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900 dark:border-violet-900',
    [allocateStatus.Completed]: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    [allocateStatus.Lost]: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  };

  isLoading = true;
  isFiltered = false;
  isSuperAdmin = false;
  canAllocateJobs = false;
  canTransferProcurementPerson = false;

  total = 0;
  totalLpoValue = 0;
  activeViewId = 'all';
  page = 1;
  row = DEFAULT_PAGE_SIZE;
  gridFilters: { key: string; op: string; value?: unknown }[] = [];
  searchQuery = '';
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  selectedEmployee: string | null = null;
  /** Slice handed over from the report (or a shared link); the grid has no control for these, so a banner shows and clears them. */
  scope: { customer: string | null; department: string | null; fromDate: string | null; toDate: string | null } = { customer: null, department: null, fromDate: null, toDate: null };

  private confirm = inject(ConfirmDialogService);
  private auditLog = inject(AuditLogService);
  private modal = inject(ModalService);
  private subscriptions = new Subscription();

  constructor(
    private _jobService: JobService,
    private _jobHistoryService: JobHistoryService,
    private _employeeService: EmployeeService,
    private _router: Router,
    private _route: ActivatedRoute,
    private toast: ToastrService,
    private numberFormat: NumberFormatterPipe,
    private datePipe: DatePipe,
  ) {}

  ngOnInit(): void {
    this.checkPrivileges();
    this.buildColumns();
    this.buildRowActions();

    // The URL is the single source of truth for tab, page, page size and search, so a refresh,
    // a bookmark or the browser Back button restores exactly what the user was looking at.
    this.subscriptions.add(
      this._route.queryParams.subscribe((params) => {
        this.page = Math.max(1, parseInt(params['page'], 10) || 1);
        const row = parseInt(params['row'], 10);
        this.row = PAGE_SIZES.includes(row) ? row : DEFAULT_PAGE_SIZE;
        this.searchQuery = params['search'] || '';
        this.selectedEmployee = params['salesPerson'] || params['employee'] || null;
        this.scope = { customer: params['customer'] || null, department: params['department'] || null, fromDate: params['fromDate'] || null, toDate: params['toDate'] || null };
        this.activeViewId = this.views.some((v) => v.id === params['view']) ? params['view'] : 'all';
        this.isFiltered = !!(this.searchQuery || this.selectedEmployee || this.hasScope);
        if (this.grid) {
          this.grid.activeViewId = this.activeViewId;
          this.grid.page = this.page;
          this.grid.pageSize = this.row;
        }
        this.getJobs();
      })
    );
  }

  ngAfterViewInit(): void {
    // The grid restores its own saved page size on init; the URL (or the default) wins so the footer matches the rows.
    Promise.resolve().then(() => {
      if (!this.grid) return;
      this.grid.pageSize = this.row;
      this.grid.page = this.page;
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private checkPrivileges(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((data) => {
        this.isSuperAdmin = data?.category?.role === 'superAdmin';
        this.canAllocateJobs = this.isSuperAdmin || data?.category?.privileges?.jobSheet?.allocateJobs || false;
        this.canTransferProcurementPerson = this.isSuperAdmin || data?.category?.privileges?.jobSheet?.transferProcurementPerson || false;
      })
    );
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'updatedDate', label: 'Last Updated', type: 'date', sortable: true, width: '120px' },
      { key: 'jobId', label: 'Job Id', sortable: true },
      // Status, owner and value come first so they stay in view without horizontal scrolling at ~1500 px.
      {
        key: 'allocateStatus', label: 'Allocate Status', type: 'badge', sortable: true,
        badgeClasses: this.allocateStatusBadgeClasses,
        badgeLabel: allocateStatusLabel,
        filterOptions: Object.entries(ALLOCATE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
      { key: 'customerName', label: 'Customer', sortable: true, valueGetter: (r) => r.clientDetails?.companyName },
      { key: 'description', label: 'Description', sortable: true, valueGetter: (r) => r.quotation?.subject },
      { key: 'procurementPerson', label: 'Procurement Person', sortable: true, valueGetter: (r) => this.fullName(r.procurementPerson) },
      { key: 'lpoValue', label: 'LPO Value (QAR)', type: 'currency', currencyCode: 'QAR', sortable: true, valueGetter: (r) => r.lpoValue ?? 0 },
      { key: 'salesPerson', label: 'Sales Person', sortable: true, valueGetter: (r) => this.fullName(r.salesPersonDetails?.[0]) },
      { key: 'department', label: 'Department', sortable: true, valueGetter: (r) => r.departmentDetails?.[0]?.departmentName ?? '' },
      { key: 'quoteId', label: 'Quote Id', sortable: true, valueGetter: (r) => r.quotation?.quoteId },
      { key: 'dealId', label: 'Deal Id', sortable: true, valueGetter: (r) => (r.quotation?.dealData as any)?.dealId ?? '' },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'allocate', label: 'Allocate', icon: 'refresh', quick: true,
        hidden: (r) => !this.canAllocate(r),
      },
      {
        id: 'reallocate', label: 'Reallocate', icon: 'refresh', quick: true,
        hidden: (r) => !this.canTransfer(r),
      },
      {
        id: 'lost', label: 'Mark as lost', icon: 'trash', variant: 'danger',
        hidden: (r) => !this.canMarkLost(r),
      },
    ];
  }

  private fullName(person?: { firstName?: string; lastName?: string } | null): string {
    return person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() : '';
  }

  onViewChange(view: DataGridView<getJob>): void {
    // The grid also announces the tab it restored from `initialViewId` on first load; that is not a user switch, so keep the URL's page.
    if (view.id === this.activeViewId) return;
    this.activeViewId = view.id;
    this.page = 1;
    if (this.grid) this.grid.page = 1;
    // The grid emits queryChange right after viewChange, which reloads the data and syncs the URL once.
  }

  /** Only the active tab has a known total (rows are server-paged), so the others show no badge. */
  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.gridFilters = (query.filters ?? []).map((f) => ({ key: f.key, op: f.op, value: f.value }));
    this.sortKey = query.sort?.key ?? null;
    this.sortDir = query.sort?.direction ?? null;
    this.isFiltered = !!(this.searchQuery || this.selectedEmployee);
    this.getJobs();
    this.updateUrlParams();
  }

  private updateUrlParams(): void {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        view: this.activeViewId !== 'all' ? this.activeViewId : null,
        page: this.page !== 1 ? this.page : null,
        row: this.row !== DEFAULT_PAGE_SIZE ? this.row : null,
        search: this.searchQuery || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private currentAllocateStatus(query?: DataGridQuery): allocateStatus | null {
    const view = this.views.find((v) => v.id === this.activeViewId);
    const filter = view?.filters?.find((f) => f.key === 'allocateStatus');
    return (filter?.value as allocateStatus) ?? null;
  }

  get hasScope(): boolean {
    return !!(this.selectedEmployee || this.scope.customer || this.scope.department || this.scope.fromDate || this.scope.toDate);
  }

  get scopeSummary(): string {
    const parts: string[] = [];
    if (this.selectedEmployee) parts.push('sales person');
    if (this.scope.customer) parts.push('customer');
    if (this.scope.department) parts.push('department');
    if (this.scope.fromDate || this.scope.toDate) parts.push('created ' + (this.scope.fromDate || '…') + ' to ' + (this.scope.toDate || '…'));
    return parts.join(', ');
  }

  clearScope(): void {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: { salesPerson: null, employee: null, customer: null, department: null, fromDate: null, toDate: null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Skips a reload when the URL-driven and grid-driven triggers ask for the same query back to back. */
  private lastQueryKey = '';
  private loadSub?: Subscription;

  getJobs(force = false): void {
    const queryKey = [this.activeViewId, this.page, this.row, this.searchQuery, this.selectedEmployee, JSON.stringify(this.scope), JSON.stringify(this.gridFilters), this.sortKey, this.sortDir].join('|');
    if (!force && queryKey === this.lastQueryKey) return;
    this.lastQueryKey = queryKey;
    this.isLoading = true;
    if (force) { this.workflowCache.clear(); this.historyCache.clear(); }

    // A newer request supersedes an older one, so a slow earlier response can never overwrite the current tab.
    this.loadSub?.unsubscribe();
    this.loadSub = this._employeeService.employeeData$.pipe(
      take(1),
      switchMap((employee) => {
      const filterData: filterJob = {
        search: this.searchQuery,
        page: this.page,
        row: this.row,
        status: null,
        salesPerson: this.selectedEmployee,
        ...this.scope,
        access: employee?.category?.privileges?.jobSheet?.viewReport,
        userId: employee?._id,
        allocateStatus: this.currentAllocateStatus(),
        filters: this.gridFilters,
        sortKey: this.sortKey,
        sortDir: this.sortDir,
      };

      return this._jobService.getJobs(filterData);
      })
    ).subscribe({
        next: (data: JobTable) => {
          this.rows = data ? [...data.job] : [];
          this.total = data ? data.total : 0;
          this.totalLpoValue = data ? data.totalLpo : 0;
          this.refreshViewCounts();
          // The grid clamps its page while the total is still 0 (first load from a deep link); restore it now that rows and total arrive together.
          if (this.grid) this.grid.page = Math.min(this.page, Math.max(1, Math.ceil(this.total / this.row)));
          this.isLoading = false;
          // ?page=99 on a 2-page list: jump to the last real page instead of showing an empty table.
          const lastPage = Math.max(1, Math.ceil(this.total / this.row));
          if (!this.rows.length && this.total > 0 && this.page > lastPage) {
            this.page = lastPage;
            this.updateUrlParams();
            this.getJobs(true);
          }
        },
        error: () => {
          this.rows = [];
          this.total = 0;
          this.isLoading = false;
        },
    });
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  onRowAction(event: DataGridRowActionEvent<getJob>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'allocate':
        this.openAllocateTypeSelecter(row);
        break;
      case 'reallocate':
        this.onTransferProcurementPerson(row);
        break;
      case 'lost':
        this.onMarkLost(row);
        break;
    }
  }

  /** Only a pending job can be allocated; once allocated it moves on its own. */
  canAllocate(row: getJob): boolean {
    return this.canAllocateJobs && row.allocateStatus === allocateStatus.Pending;
  }

  /** Losing a job is the other way out of Pending, so it shares the allocate permission. */
  canMarkLost(row: getJob): boolean {
    return this.canAllocateJobs && row.allocateStatus !== allocateStatus.Completed && row.allocateStatus !== allocateStatus.Lost;
  }

  onMarkLost(row: getJob): void {
    if (!this.canMarkLost(row)) {
      this.toast.warning('You do not have permission to mark this job as lost');
      return;
    }
    this.modal.open<string>(MarkLostModalComponent, { width: '520px', data: row }).afterClosed().subscribe((reason) => {
      if (!reason) return;
      this._jobService.markJobLost({ id: row._id, reason }).subscribe({
        next: (res) => {
          this.toast.success(res?.message || 'Job marked lost');
          this.getJobs(true);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to mark job as lost'),
      });
    });
  }

  openAllocateTypeSelecter(row: getJob): void {
    if (!this.canAllocate(row)) {
      this.toast.warning('You do not have permission to allocate this job');
      return;
    }
    this.modal.open<AllocateTypeResult>(AllocateTypeModalComponent, { width: '520px', data: row }).afterClosed().subscribe((result) => {
      if (!result) return;
      this._jobService.updateAllocateType(result).subscribe({
        next: (res) => {
          if (res.success) {
            this.toast.success('Job Allocated successfully');
            this.getJobs(true);
          }
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to allocate job'),
      });
    });
  }

  onTransferProcurementPerson(row: getJob): void {
    if (!this.canTransferProcurementPerson) {
      this.toast.warning('You do not have permission to assign or transfer procurement person');
      return;
    }
    this.modal.open<TransferProcurementPersonResult>(TransferProcurementPersonComponent, {
      width: '520px',
      data: { jobId: row._id, jobLabel: row.jobId, currentProcurementPerson: row.procurementPerson },
    }).afterClosed().subscribe((result) => {
      if (!result?.procurementPersonId) return;
      this._jobService.transferProcurementPerson(row._id, result.procurementPersonId).subscribe({
        next: (response) => {
          if (response.success) {
            this.toast.success(row.procurementPerson ? 'Procurement person transferred successfully' : 'Procurement person assigned successfully');
            this.getJobs(true);
          }
        },
        error: (error) => this.toast.error(error?.error?.message || 'Failed to transfer procurement person'),
      });
    });
  }

  canTransfer(row: getJob): boolean {
    // Supply jobs have a procurement owner to hand over, or to assign when allocation left it blank.
    return this.canTransferProcurementPerson && (!!row.procurementPerson || this.hasSupply(row)) &&
      row.allocateStatus === allocateStatus.OpenToWork;
  }

  private hasSupply(row: getJob): boolean {
    return row.allocateType === 'Supply Only' || row.allocateType === 'Project With Supply';
  }

  transferLabel(row: getJob): string {
    return row.procurementPerson ? 'Transfer Procurement' : 'Assign Procurement';
  }

  // ---- Details tab -----------------------------------------------------------------------

  overviewSections(row: getJob): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Job Id', value: row.jobId, numeric: true },
          { type: 'dg', key: 'allocateStatus' },
          { type: 'field', label: 'Allocate Type', value: row.allocateType || '—' },
          { type: 'field', label: 'Customer', value: row.clientDetails?.companyName },
          { type: 'field', label: 'Sales Person', value: this.fullName(row.salesPersonDetails?.[0]) },
          { type: 'field', label: 'Department', value: row.departmentDetails?.[0]?.departmentName ?? '' },
          { type: 'field', label: 'Last Updated', value: row.updatedDate ? (this.datePipe.transform(row.updatedDate, 'dd MMM yyyy') ?? '—') : '—' },
          { type: 'field', label: 'Procurement Person', value: this.fullName(row.procurementPerson) || '—', visible: !!row.procurementPerson },
        ],
      },
      {
        title: 'Quotation',
        columns: '2',
        fields: [
          { type: 'field', label: 'Quote Id', value: row.quotation?.quoteId, numeric: true },
          { type: 'field', label: 'Deal Id', value: (row.quotation?.dealData as any)?.dealId || '—' },
          { type: 'field', label: 'Description', value: row.quotation?.subject },
          { type: 'field', label: 'LPO Value', value: `${this.numberFormat.transform(row.lpoValue ?? 0)} QAR`, numeric: true },
        ],
      },
    ];
  }

  // ---- Comments tab -----------------------------------------------------------------------

  commentSections(row: getJob): DetailOverviewSection[] {
    return [
      {
        title: 'Comment',
        fields: [
          { type: 'field', label: 'Comment', value: row.comment || '—' },
        ],
      },
    ];
  }

  // ---- Documents / LPO tab ------------------------------------------------------------------

  lpoDocuments(row: getJob): DetailDocument[] {
    return (row.quotation?.lpoFiles || []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname,
      kind: this.lpoFileKind(file),
    }));
  }

  private lpoFileKind(file: any): string {
    const name: string = file?.originalname || file?.fileName || '';
    const ext = name.split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  }

  private findLpoFile(row: getJob, doc: DetailDocument): any {
    return row.quotation?.lpoFiles?.find((file: any) => file.fileName === doc.id);
  }

  onLpoPreviewDoc(row: getJob, doc: DetailDocument): void {
    const file = this.findLpoFile(row, doc);
    if (!file) return;
    if (!file.fileName?.toLowerCase().endsWith('.pdf')) {
      window.open(`${environment.api}/file/${encodeURIComponent(file.fileName)}`, '_blank');
      return;
    }
    this._jobService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const blob = new Blob([event.body], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      },
      error: (error) => {
        if (error.status === 404) this.toast.warning('Sorry, the requested file was not found on the server.');
        else this.toast.error('An error occurred while trying to view the file.');
      },
    });
  }

  onLpoDownloadDoc(row: getJob, doc: DetailDocument): void {
    const file = this.findLpoFile(row, doc);
    if (!file) return;
    this._jobService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          FileSaver.saveAs(new Blob([event.body]), file.originalname);
        }
      },
      error: (error) => {
        if (error.status === 404) this.toast.warning('Sorry, the requested file was not found on the server.');
        else this.toast.error('An error occurred while downloading the file.');
      },
    });
  }

  // ---- Workflow tab -----------------------------------------------------------------------

  private workflowCache = new Map<string, BehaviorSubject<WorkflowState>>();

  workflowFor(row: getJob): Observable<WorkflowState> {
    const id = row._id;
    let subject = this.workflowCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<WorkflowState>({ status: 'loading', timeline: null });
      this.workflowCache.set(id, subject);
      this._jobHistoryService.getJobHistory(id).subscribe({
        next: (res) => subject!.next(res.success ? { status: 'ready', timeline: res.data } : { status: 'error', timeline: null }),
        error: () => subject!.next({ status: 'error', timeline: null }),
      });
    }
    return subject; // same instance every call, so the async pipe in the template does not resubscribe on each change detection
  }

  // ---- History tab (global audit log: allocation, transfer, status, deletion) ------------------

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  historyFor(row: getJob): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory('job', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject;
  }

  eventTone(event: TimelineEvent): string {
    switch (event.status) {
      case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900';
      case 'error': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900';
      case 'warning': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900';
      default: return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900';
    }
  }

  eventPerformedBy(event: TimelineEvent): string {
    return event.performedBy ? this.fullName(event.performedBy) : '';
  }

  trackByEventId = (_: number, e: TimelineEvent) => e.id;
}
