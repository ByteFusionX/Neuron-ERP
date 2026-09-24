import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AsyncPipe, NgClass, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { HttpEventType } from '@angular/common/http';
import { SelectEmployeeComponent } from '../select-employee/select-employee.component';
import { ViewFeedbackComponent } from '../view-feedback/view-feedback.component';
import { ViewEstimationComponent } from '../view-estimation/view-estimation.component';
import { EstimationFormDrawerComponent } from '../estimation-form-drawer/estimation-form-drawer.component';
import { ReassignEmployeeComponent } from '../reassign-employee/reassign-employee.component';
import { RejectionHistoryDrawerComponent } from 'src/app/modules/enquirys/pages/rejection-history-drawer/rejection-history-drawer.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EventsService } from 'src/app/core/services/events/events.service';
import { EventActionsService } from 'src/app/core/services/events/event-actions.service';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailCommentsComponent } from 'src/app/shared/components/detail-panel/detail-comments.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { DetailComment, DetailDocument, DetailOverviewSection, DetailTaskItem } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-assigned-jobs-list',
  templateUrl: './assigned-jobs-list.component.html',
  styleUrls: ['./assigned-jobs-list.component.css'],
  imports: [NgIf, NgClass, NgSwitch, NgSwitchCase, AsyncPipe, NgIcon, DataGridComponent, DetailOverviewComponent, DetailCommentsComponent, DetailDocumentsComponent, DetailTaskListComponent, RejectionHistoryDrawerComponent, ViewEstimationComponent, EstimationFormDrawerComponent]
})
export class AssignedJobsListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  rows: any[] = [];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'comments', label: 'Comments', icon: 'chat' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  detailLoading = false;

  viewAssignedFor: boolean = false;
  isLoading: boolean = true;
  subscriptions = new Subscription();

  page: number = 1;
  row: number = 10;
  total: number = 0;
  searchQuery: string = '';

  userId!: string | undefined;

  private confirm = inject(ConfirmDialogService);

  constructor(
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService,
    private _eventsService: EventsService,
    private _eventActions: EventActionsService,
    private _route: ActivatedRoute,
    private _router: Router,
  ) { }

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this._employeeService.employeeData$.subscribe((data) => {
      this.viewAssignedFor = data?.category.privileges.assignedJob.viewReport == 'all';
      this.userId = data?._id;
      this.buildColumns();
      this.buildRowActions();
    });
    this._route.queryParams.subscribe((params) => {
      this.initialPage = params['page'] ? parseInt(params['page'], 10) : 1;
    });
    this.getJobsData();
  }

  /** Deep-links `?page=` into the grid's own client-side pager, same pattern as quotation-list. */
  ngAfterViewInit(): void {
    if (this.grid && this.initialPage > 1) this.grid.page = this.initialPage;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private initialPage = 1;

  private buildColumns(): void {
    this.columns = [
      { key: 'enqId', label: 'Enquiry ID', valueGetter: (r) => r.enquiryId, cellClass: (r) => r?.preSale?.seenbyEmployee ? 'text-violet-500' : 'text-orange-500' },
      { key: 'customerName', label: 'Customer Name', valueGetter: (r) => r.client?.[0]?.companyName },
      { key: 'description', label: 'Description', valueGetter: (r) => r.title },
      { key: 'assignedBy', label: 'Assign. By', valueGetter: (r) => `${r.salesPerson?.[0]?.firstName ?? ''} ${r.salesPerson?.[0]?.lastName ?? ''}`.trim() },
      { key: 'assignedTo', label: 'Reassign. To', visible: this.viewAssignedFor, valueGetter: (r) => r.reAssigned?.[0] ? `${r.reAssigned[0].firstName} ${r.reAssigned[0].lastName}` : '—' },
      { key: 'department', label: 'Depart.', valueGetter: (r) => r.department?.[0]?.departmentName },
      { key: 'status', label: 'Status', type: 'badge', visible: this.viewAssignedFor, badgeClasses: this.statusBadgeClasses },
    ];
  }

  readonly statusBadgeClasses: Record<string, string> = {
    'Assigned To Presale Engineer': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'Assigned To Presale Manager': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'Rejected by Presale Engineer': 'bg-red-50 text-red-700 ring-red-200',
  };

  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'reassign', label: 'Reassign', icon: 'transfer', quick: true,
        hidden: (r) => !this.viewAssignedFor || r.status === 'Assigned To Presale Engineer',
      },
      {
        id: 'feedbackAsk', label: 'Ask For Feedback', icon: 'chat', quick: true,
        hidden: (r) => !r.preSale?.newFeedbackAccess,
      },
      {
        id: 'viewFeedback', label: 'View Feedback', icon: 'eye', quick: true,
        hidden: (r) => !r.preSale?.feedback?.length,
        badge: (r) => this.hasUnseenFeedback(r.preSale?.feedback || []),
      },
      {
        id: 'rejectionHistory', label: 'Rejection History', icon: 'info', quick: true,
        hidden: (r) => r.status !== 'Rejected by Presale Engineer',
      },
      {
        id: 'uploadEstimation', label: 'Upload Estimation', icon: 'upload', quick: true,
        hidden: (r) => !!r.preSale?.estimations,
      },
      {
        id: 'viewEstimation', label: 'View Estimation', icon: 'eye', quick: true,
        hidden: (r) => !r.preSale?.estimations,
      },
      { id: 'reject', label: 'Reject Job', icon: 'close', variant: 'danger', quick: true },
      { id: 'send', label: 'Send', icon: 'send', quick: true },
    ];
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'reassign': this.onReassignClicks(row._id); break;
      case 'feedbackAsk': this.onFeedback(row); break;
      case 'viewFeedback': this.viewFeedback(row); break;
      case 'rejectionHistory': this.openReview(row.preSale?.rejectionHistory); break;
      case 'uploadEstimation': this.onUploadClicks(row._id); break;
      case 'viewEstimation': this.onViewEstimation(row.preSale?.estimations, row._id); break;
      case 'reject': this.onRejectJob(row); break;
      case 'send': this.onSendClicked(row); break;
    }
  }

  getJobsData() {
    let access;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.assignedJob.viewReport;
      this.userId = employee?._id;
    });
    if (this.userId) {
      this.isLoading = true;
      this.subscriptions.add(
        this._enquiryService.getPresale(this.page, this.row, 'assigned', access, this.userId, this.searchQuery).subscribe({
          next: (data) => {
            this.rows = data.enquiry;
            this.total = data.total;
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
          }
        })
      );
    }
  }

  onQueryChange(query: DataGridQuery): void {
    this.page = query.page;
    this.row = query.pageSize;
    this.searchQuery = query.search;
    this.getJobsData();
  }

  onRowOpen(row: any): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
    if (row?._id && !row.preSale?.seenbyEmployee) {
      this.markJobAsViewed(row._id);
      row.preSale.seenbyEmployee = true;
    }
  }

  markJobAsViewed(jobId: string) {
    this._enquiryService.markJobAsViewed(jobId).subscribe();
  }

  rowTitle = (r: any) => r.enquiryId ?? '';
  rowSubtitle = (r: any) => r.client?.[0]?.companyName ?? '';

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Enquiry Id', value: row.enquiryId, numeric: true },
          { type: 'field', label: 'Customer', value: row.client?.[0]?.companyName },
          { type: 'field', label: 'Description', value: row.title },
          { type: 'field', label: 'Assigned By', value: `${row.salesPerson?.[0]?.firstName ?? ''} ${row.salesPerson?.[0]?.lastName ?? ''}`.trim() },
          { type: 'field', label: 'Department', value: row.department?.[0]?.departmentName },
          { type: 'field', label: 'Status', value: row.status, pill: true, visible: this.viewAssignedFor },
          { type: 'field', label: 'Assigned To', value: row.reAssigned?.[0] ? `${row.reAssigned[0].firstName} ${row.reAssigned[0].lastName}` : '—', visible: this.viewAssignedFor },
        ],
      },
    ];
  }

  commentsFor(row: any): DetailComment[] {
    const list: DetailComment[] = [];
    const assignedByName = row.salesPerson?.[0] ? `${row.salesPerson[0].firstName} ${row.salesPerson[0].lastName}` : 'Sales Person';
    if (row.preSale?.comment) {
      list.push({ text: row.preSale.comment, by: assignedByName, date: row.date });
    }
    (row.preSale?.revisionComment || []).forEach((c: string) => {
      list.push({ text: c, by: 'Revision', date: row.date });
    });
    return list;
  }

  // ---- Events tab (mirrors quotation-list's Events tab, scoped to this enquiry) --------------

  private eventsCache = new Map<string, BehaviorSubject<Events[]>>();

  eventsFor(row: any): Observable<Events[]> {
    const id = row._id as string;
    let subject = this.eventsCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<Events[]>([]);
      this.eventsCache.set(id, subject);
      this._eventsService.fetchEvents(id).subscribe((events: Events[]) => subject!.next(events || []));
    }
    return subject.asObservable();
  }

  eventItems(events: Events[]): DetailTaskItem[] {
    return this._eventActions.toItems(events);
  }

  private updateEvents(row: any, fn: (events: Events[]) => Events[]): void {
    const subject = this.eventsCache.get(row._id as string);
    if (subject) { subject.next(fn(subject.value)); }
  }

  onAddEvent(row: any): void {
    this._eventActions.create({
      from: 'Enquiry',
      collectionId: row._id as string,
      context: row.enquiryId || (row._id as string),
    }).subscribe((created) => {
      if (!created) { return; }
      this.eventsCache.delete(row._id as string);
      this.eventsFor(row);
    });
  }

  onToggleEvent(row: any, item: DetailTaskItem): void {
    this._eventActions.markCompleted(item).subscribe((ok) => {
      if (ok) { this.updateEvents(row, (evs) => evs.map((e) => (e._id === item.id ? { ...e, status: 'completed' } : e))); }
    });
  }

  async onEventOutcome(row: any, item: DetailTaskItem, status: 'success' | 'cancelled'): Promise<void> {
    (await this._eventActions.setOutcome(item, status)).subscribe((ok) => {
      if (ok) { this.updateEvents(row, (evs) => evs.map((e) => (e._id === item.id ? { ...e, status } : e))); }
    });
  }

  async onDeleteEvent(row: any, item: DetailTaskItem): Promise<void> {
    (await this._eventActions.delete(item)).subscribe((ok) => {
      if (ok) { this.updateEvents(row, (evs) => evs.filter((e) => e._id !== item.id)); }
    });
  }

  onPreviewEventFile(file: { id: string; name: string }): void {
    this._eventActions.previewFile(file);
  }

  onDeleteEventFile(row: any, item: DetailTaskItem, file: { id: string; name: string }): void {
    this._eventActions.deleteFile(item, file).subscribe((ok) => {
      if (!ok) { return; }
      this.updateEvents(row, (evs) => evs.map((e) =>
        e._id === item.id ? { ...e, eventFiles: (e.eventFiles || []).filter((f: any) => f.fileName !== file.id) } : e));
    });
  }

  // ---- Documents tab: presale files + estimation ------------------------------------------

  presaleDocuments(row: any): DetailDocument[] {
    return (row.preSale?.presaleFiles || []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname,
      kind: this.fileKind(file),
    }));
  }

  fileKind(file: any): string {
    const name: string = file?.originalname || file?.fileName || '';
    const ext = name.split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  }

  private findPresaleFile(row: any, doc: DetailDocument): any {
    return row.preSale?.presaleFiles?.find((f: any) => f.fileName === doc.id);
  }

  onDocPreview(row: any, doc: DetailDocument): void {
    const file = this.findPresaleFile(row, doc);
    if (file) { this.previewFile(file); }
  }

  onDocDownload(row: any, doc: DetailDocument): void {
    const file = this.findPresaleFile(row, doc);
    if (file) { this.onDownloadClicks(file); }
  }

  previewFile(file: any): void {
    this._enquiryService.getFile(file.fileName).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        if (error.status === 404) {
          this.toast.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toast.error('An error occurred while opening the file.');
        }
      }
    });
  }

  onDownloadClicks(file: any) {
    this.subscriptions.add(
      this._enquiryService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']])
              saveAs(fileContent, file.originalname)
            }
          },
          error: (error) => {
            if (error.status == 404) {
              this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
            }
          }
        })
    )
  }

  estimationFormOpen = false;
  estimationFormMode: 'create' | 'edit' = 'create';
  estimationFormEnqId: string | null = null;
  estimationFormSeed: Estimations | null = null;

  onUploadClicks(enquiryId: string) {
    this.estimationFormMode = 'create';
    this.estimationFormEnqId = enquiryId;
    this.estimationFormSeed = null;
    this.estimationFormOpen = true;
  }

  onEditEstimation(estimation: Estimations, enqId: string) {
    this.estimationTarget = null;
    this.estimationFormMode = 'edit';
    this.estimationFormEnqId = enqId;
    this.estimationFormSeed = estimation;
    this.estimationFormOpen = true;
  }

  onEstimationFormSaved() {
    this.estimationFormOpen = false;
    this.getJobsData();
  }

  onEstimationFormClosed() {
    this.estimationFormOpen = false;
  }

  estimationTarget: { estimation: Estimations; enqId: string } | null = null;

  onViewEstimation(estimation: Estimations, enqId: string) {
    this.estimationTarget = { estimation, enqId };
  }

  onEstimationCleared() {
    const enqId = this.estimationTarget?.enqId;
    if (!enqId) return;
    this._enquiryService.clearEstimations(enqId).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.rows = this.rows.map((enquiry) => {
            if (enquiry._id == enqId) {
              delete (enquiry.preSale as any).estimations
            }
            return enquiry
          })
          this.estimationTarget = null;
        }
      }
    })
  }

  // ---- Row actions: reassign / feedback / reject / send -----------------------------------

  onReassignClicks(enqId: string) {
    const dialog = this._dialog.open(ReassignEmployeeComponent, {
      data: { enquiryId: enqId }
    })
    dialog.afterClosed().subscribe((res) => {
      if (res) {
        this.getJobsData()
        this.toast.success(res.message)
      }
    })
  }

  onFeedback(row: any) {
    if (!row.preSale?.estimations) {
      this.toast.warning('Please complete the estimation Uploads');
      return;
    }
    const dialogRef = this._dialog.open(SelectEmployeeComponent, { width: '400px' });
    dialogRef.afterClosed().subscribe((data: { employeeId: string, comment: string }) => {
      if (data?.employeeId) {
        const feedbackBody = {
          employeeId: data.employeeId,
          comment: data.comment,
          enquiryId: row._id
        }
        this._enquiryService.sendFeedbackRequest(feedbackBody).subscribe((res: any) => {
          if (res) {
            this.getJobsData();
          }
        })
      }
    })
  }

  viewFeedback(row: any) {
    this._dialog.open(ViewFeedbackComponent, {
      data: { feedback: row.preSale.feedback, enqId: row._id },
      width: '400px'
    }).afterClosed().subscribe(() => {
      const feedbackRes = row.preSale.feedback;
      if (feedbackRes?.length) {
        feedbackRes.forEach((fb: feedback) => {
          fb.seenByFeedbackRequester = true;
        })
      }
    })
  }

  hasUnseenFeedback(feedback: feedback[]): boolean {
    return feedback.some((fb: any) => !fb.seenByFeedbackRequester && fb.feedback);
  }

  rejectionsOpen = false;
  rejections: any[] = [];

  openReview(rejectionHistory: any) {
    this.rejections = rejectionHistory ?? [];
    this.rejectionsOpen = true;
  }

  async onSendClicked(row: any): Promise<void> {
    if (!row.preSale?.estimations) {
      this.toast.warning('Please complete the estimation Uploads');
      return;
    }
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Send job back?',
      message: 'This action is irreversible and sends the assigned task back to the salesperson. You can also verify by other employees. Please ensure all files are selected before proceeding.',
      confirmLabel: 'Send',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    const selectedEnquiry: { id: string, status: string } = {
      id: row._id,
      status: 'Work In Progress'
    }
    Object.seal(selectedEnquiry)
    this.subscriptions.add(
      this._enquiryService.updateEnquiryStatus(selectedEnquiry).subscribe((data) => {
        if (data) {
          this.rows = this.rows.filter((r) => r._id !== row._id);
          this.total = this.rows.length;
          if (data.quoteId) {
            this.toast.success(`Job has successfully completed and send back to Quotation  \n(${data.quoteId})`)
          } else {
            this.toast.success(`Job has successfully completed and send back to Enquiry \n(${data.update.enquiryId})`)
          }
        }
      })
    )
  }

  async onRejectJob(row: any): Promise<void> {
    if (row.preSale?.estimations) {
      this.toast.warning('Job rejection failed. Please ensure all estimations are cleared before rejecting the job.');
      return;
    }
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Reject Job',
      message: 'Are you sure you want to reject this job?',
      reason: true,
      reasonLabel: 'Reason for rejection',
      confirmLabel: 'Reject',
    });
    if (!confirmed) return;

    this._enquiryService.rejectJob(row._id, reason ?? '', 'Manager').subscribe({
      next: (res) => {
        if (res.success) {
          this.rows = this.rows.filter((r) => r._id !== row._id);
          this.total = this.rows.length;
        }
      },
      error: () => {
        this.toast.warning('Something went wrong while rejecting. Please try again later')
      }
    })
  }
}
