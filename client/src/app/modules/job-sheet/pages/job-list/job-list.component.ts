import { HttpEventType } from '@angular/common/http';
import { AsyncPipe, DatePipe, NgClass, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, forkJoin, of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as FileSaver from 'file-saver';

import { JobService } from 'src/app/core/services/job/job.service';
import { JobHistoryService } from 'src/app/core/services/job/job-history.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AllocateTypeModalComponent } from '../allocate-type-modal/allocate-type-modal.component';
import { TransferProcurementPersonComponent } from '../transfer-procurement-person/transfer-procurement-person.component';

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

@Component({
  selector: 'app-job-list',
  templateUrl: './job-list.component.html',
  styleUrls: ['./job-list.component.css'],
  providers: [NumberFormatterPipe, DatePipe],
  imports: [
    NgIf, NgClass, NgSwitch, NgSwitchCase, AsyncPipe, DatePipe,
    DataGridComponent, DetailOverviewComponent, DetailDocumentsComponent, ActionButtonComponent, ViewToggleComponent,
  ],
})
export class JobListComponent {
  rows: getJob[] = [];
  columns: DataGridColumn<getJob>[] = [];
  rowActions: DataGridRowAction<getJob>[] = [];
  views: DataGridView<getJob>[] = [
    { id: 'all', label: 'All', filters: [] },
    { id: 'pending', label: 'Pending', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.Pending }] },
    { id: 'open-to-work', label: 'Open To Work', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.OpenToWork }] },
    { id: 'in-progress', label: 'In Progress', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.WorkInProgress }] },
    { id: 'completed', label: 'Completed', filters: [{ id: 1, key: 'allocateStatus', op: 'eq', value: allocateStatus.Completed }] },
  ];
  bulkActions: DataGridBulkAction[] = [{ id: 'delete', label: 'Delete', variant: 'danger' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Job Sheet' }];

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'comments', label: 'Comments', icon: 'calendar' },
    { id: 'lpo', label: 'Documents', icon: 'eye' },
    { id: 'workflow', label: 'Workflow', icon: 'activity' },
  ];

  jobTitle = (r: getJob) => r.jobId ?? '';
  jobSubtitle = (r: getJob) => r.clientDetails?.companyName ?? '';

  readonly allocateStatusBadgeClasses: Record<string, string> = {
    [allocateStatus.Pending]: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
    [allocateStatus.OpenToWork]: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
    [allocateStatus.WorkInProgress]: 'bg-violet-50 text-violet-700 ring-violet-200 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900 dark:border-violet-900',
    [allocateStatus.Completed]: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  };

  isLoading = true;
  isFiltered = false;
  isDeleteOption = false;
  canAllocateJobs = false;
  canConvertToPurchase = false;
  canTransferProcurementPerson = false;

  total = 0;
  totalLpoValue = 0;
  private activeViewId = 'all';
  page = 1;
  row = 10;
  searchQuery = '';
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  selectedEmployee: string | null = null;

  private confirm = inject(ConfirmDialogService);
  private subscriptions = new Subscription();

  constructor(
    private _jobService: JobService,
    private _jobHistoryService: JobHistoryService,
    private _employeeService: EmployeeService,
    private _dialog: MatDialog,
    private _router: Router,
    private _route: ActivatedRoute,
    private toast: ToastrService,
    private numberFormat: NumberFormatterPipe,
  ) {}

  ngOnInit(): void {
    this.checkPrivileges();
    this.buildColumns();
    this.buildRowActions();

    this._route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      this.searchQuery = params['search'] || '';
      this.selectedEmployee = params['employee'] || null;
      this.activeViewId = this.views.some((v) => v.id === params['view']) ? params['view'] : 'all';
      this.isFiltered = !!(this.searchQuery || this.selectedEmployee);
      this.getJobs();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private checkPrivileges(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((data) => {
        this.canAllocateJobs = data?.category?.privileges?.jobSheet?.allocateJobs || false;
        this.canConvertToPurchase = data?.category?.privileges?.purchase?.create || false;
        this.canTransferProcurementPerson = data?.category?.privileges?.jobSheet?.transferProcurementPerson || false;
        this.isDeleteOption = data?.category?.role === 'superAdmin';
      })
    );
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'updatedDate', label: 'Date', type: 'date', sortable: true, width: '120px' },
      { key: 'jobId', label: 'Job Id', sortable: true },
      { key: 'customerName', label: 'Customer', valueGetter: (r) => r.clientDetails?.companyName },
      { key: 'description', label: 'Description', valueGetter: (r) => r.quotation?.subject },
      { key: 'salesPerson', label: 'Sales Person', valueGetter: (r) => this.fullName(r.salesPersonDetails?.[0]) },
      { key: 'department', label: 'Department', valueGetter: (r) => r.departmentDetails?.[0]?.departmentName ?? '' },
      { key: 'quoteId', label: 'Quote Id', valueGetter: (r) => r.quotation?.quoteId },
      { key: 'dealId', label: 'Deal Id', valueGetter: (r) => (r.quotation?.dealData as any)?.dealId ?? '' },
      { key: 'procurementPerson', label: 'Procurement Person', valueGetter: (r) => this.fullName(r.procurementPerson) },
      { key: 'lpoValue', label: 'LPO Value', valueGetter: (r) => `${this.numberFormat.transform(r.lpoValue ?? 0)} QAR` },
      {
        key: 'allocateStatus', label: 'Allocate Status', type: 'badge',
        badgeClasses: this.allocateStatusBadgeClasses,
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'allocate', label: 'Allocate', icon: 'refresh', quick: true,
        hidden: (r) => !this.canAllocateJobs || r.allocateStatus === allocateStatus.Completed,
      },
      {
        id: 'delete', label: 'Delete', icon: 'trash', quick: true, variant: 'danger',
        hidden: () => !this.isDeleteOption,
      },
    ];
  }

  private fullName(person?: { firstName?: string; lastName?: string } | null): string {
    return person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() : '';
  }

  onViewChange(view: DataGridView<getJob>): void {
    this.activeViewId = view.id;
    this.refreshViewCounts();
  }

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;
    this.isFiltered = !!this.searchQuery;
    this.getJobs();
    this.updateUrlParams();
  }

  private updateUrlParams(): void {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        page: this.page !== 1 ? this.page : null,
        row: this.row !== 10 ? this.row : null,
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

  getJobs(): void {
    this.isLoading = true;
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        const access = employee?.category?.privileges?.jobSheet?.viewReport;
        const userId = employee?._id;

        const filterData: filterJob = {
          search: this.searchQuery,
          page: this.page,
          row: this.row,
          status: null,
          salesPerson: this.selectedEmployee,
          access,
          userId,
          allocateStatus: this.currentAllocateStatus(),
          sortKey: this.sortKey,
          sortDir: this.sortDir,
        };

        this._jobService.getJobs(filterData).subscribe({
          next: (data: JobTable) => {
            this.rows = data ? [...data.job] : [];
            this.total = data ? data.total : 0;
            this.totalLpoValue = data ? data.totalLpo : 0;
            this.refreshViewCounts();
            this.isLoading = false;
          },
          error: () => {
            this.rows = [];
            this.isLoading = false;
          },
        });
      })
    );
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
      case 'delete':
        this.onDeleteJob(row);
        break;
    }
  }

  onBulkAction({ action, rows }: DataGridBulkActionEvent<getJob>, grid: DataGridComponent<getJob>): void {
    if (action.id !== 'delete') return;
    if (!this.isDeleteOption) {
      this.toast.warning('You do not have permission to delete jobs');
      return;
    }

    const count = `${rows.length} job${rows.length === 1 ? '' : 's'}`;
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `Delete ${count}?`,
        description: 'This cannot be undone.',
        icon: 'heroExclamationCircle',
        IconColor: 'orange',
      },
    });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (!approved) return;
      const employee = this._employeeService.employeeToken();
      const deleteRequests = rows.map((r) => this._jobService.deleteJob({ dataId: r._id, employeeId: employee.id }));
      forkJoin(deleteRequests.length ? deleteRequests : [of(null)]).subscribe({
        next: () => {
          grid.clearSelection();
          grid.notify(`${count} deleted`);
          this.getJobs();
        },
        error: () => this.toast.error('Failed to delete one or more jobs'),
      });
    });
  }

  onDeleteJob(row: getJob): void {
    if (!this.isDeleteOption) {
      this.toast.warning('You do not have permission to delete jobs');
      return;
    }
    const employee = this._employeeService.employeeToken();
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Job',
        description: 'Are you sure you want to delete this job? This action cannot be undone.',
        icon: 'heroExclamationTriangle',
        IconColor: 'red',
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this._jobService.deleteJob({ dataId: row._id, employeeId: employee.id }).subscribe({
        next: () => {
          this.toast.success('Job deleted successfully');
          this.getJobs();
        },
        error: () => this.toast.error('Failed to delete job'),
      });
    });
  }

  openAllocateTypeSelecter(row: getJob): void {
    if (!this.canAllocateJobs) {
      this.toast.warning('You do not have permission to allocate jobs');
      return;
    }
    const dialogRef = this._dialog.open(AllocateTypeModalComponent, {
      data: row,
      width: '500px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this._jobService.updateAllocateType({
        id: result.id,
        jobId: result.jobId,
        allocationType: result.allocationType,
        procurementPerson: result.procurementPerson,
      }).subscribe({
        next: (res) => {
          if (res.success) {
            this.toast.success('Job Allocated successfully');
            this.getJobs();
          }
        },
        error: () => this.toast.error('Failed to allocate job'),
      });
    });
  }

  onTransferProcurementPerson(row: getJob): void {
    if (!this.canTransferProcurementPerson) {
      this.toast.warning('You do not have permission to transfer procurement person');
      return;
    }
    const dialogRef = this._dialog.open(TransferProcurementPersonComponent, {
      data: { jobId: row._id, currentProcurementPerson: row.procurementPerson },
      width: '500px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.procurementPersonId) return;
      this._jobService.transferProcurementPerson(row._id, result.procurementPersonId).subscribe({
        next: (response) => {
          if (response.success) {
            this.toast.success('Procurement person transferred successfully');
            this.getJobs();
          }
        },
        error: (error) => this.toast.error(error?.error?.message || 'Failed to transfer procurement person'),
      });
    });
  }

  canTransfer(row: getJob): boolean {
    return this.canTransferProcurementPerson &&
      (row.allocateStatus === allocateStatus.OpenToWork || row.allocateStatus === allocateStatus.WorkInProgress);
  }

  onConvertToPurchase(row: getJob): void {
    this._router.navigate(['/purchase/create'], { queryParams: { jobId: row.jobId } });
  }

  canConvert(row: getJob): boolean {
    return this.canConvertToPurchase && !row.hasPurchaseRequest &&
      (row.allocateStatus === allocateStatus.OpenToWork || row.allocateStatus === allocateStatus.WorkInProgress);
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
          { type: 'field', label: 'Date', value: row.updatedDate ? new Date(row.updatedDate).toLocaleDateString() : '—' },
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
      window.open(`${environment.api}/file/${file.fileName}`, '_blank');
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

  private workflowCache = new Map<string, BehaviorSubject<JobWorkflowTimeline | null>>();

  workflowFor(row: getJob): Observable<JobWorkflowTimeline | null> {
    const id = row._id;
    let subject = this.workflowCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<JobWorkflowTimeline | null>(null);
      this.workflowCache.set(id, subject);
      this._jobHistoryService.getJobHistory(id).subscribe({
        next: (res) => subject!.next(res.success ? res.data : null),
        error: () => subject!.next(null),
      });
    }
    return subject.asObservable();
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
