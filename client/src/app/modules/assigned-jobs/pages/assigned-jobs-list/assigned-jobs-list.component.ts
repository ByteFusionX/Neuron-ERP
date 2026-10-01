import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AsyncPipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { EnquiryService, PresaleTabCounts } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { HttpEventType } from '@angular/common/http';
import { AskFeedbackComponent } from '../ask-feedback/ask-feedback.component';
import { ReplyFeedbackComponent } from '../reply-feedback/reply-feedback.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { GiveFeedbackComponent, GiveFeedbackResult } from '../give-feedback/give-feedback.component';
import { ModalService } from 'src/app/shared/components/modal';
import { ViewEstimationComponent } from '../view-estimation/view-estimation.component';
import { EstimationFormDrawerComponent } from '../estimation-form-drawer/estimation-form-drawer.component';
import { AssignEmployeeComponent } from '../assign-employee/assign-employee.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EventsService } from 'src/app/core/services/events/events.service';
import { EventActionsService } from 'src/app/core/services/events/event-actions.service';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { DetailDocument, DetailOverviewSection, DetailTaskItem, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { NgIcon } from '@ng-icons/core';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { ApprovalStep, WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { ApprovalJourneyComponent } from 'src/app/shared/components/approval-journey/approval-journey.component';
import { ApprovalJourneyStage } from 'src/app/shared/components/approval-journey/approval-journey.model';

const DEFAULT_ESCALATION_HOURS = 48;

export type PresaleTab = 'all' | 'new' | 'assigned' | 'completed' | 'resolve' | 'cancelled' | 'rejected';

import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
@Component({
  selector: 'app-assigned-jobs-list',
  templateUrl: './assigned-jobs-list.component.html',
  styleUrls: ['./assigned-jobs-list.component.css'],
  imports: [ViewToggleComponent, RouterLink, NgIf, NgFor, NgClass, NgSwitch, NgSwitchCase, AsyncPipe, NgIcon, DataGridComponent, DetailOverviewComponent, DetailDocumentsComponent, DetailTaskListComponent, DetailTimelineComponent, ApprovalJourneyComponent, ViewEstimationComponent, EstimationFormDrawerComponent, ActionButtonComponent]
})
export class AssignedJobsListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  rows: any[] = [];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'feedback', label: 'Feedback', icon: 'chat' },
    { id: 'progress', label: 'Progress', icon: 'account_tree' },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Sales' }];
  views: DataGridView[] = [];
  detailLoading = false;

  readonly tabs: { id: PresaleTab; label: string; countKey: keyof PresaleTabCounts | 'all'; serverFilter: string }[] = [
    { id: 'all', label: 'All Jobs', countKey: 'all', serverFilter: 'all' },
    { id: 'new', label: 'New Jobs', countKey: 'new', serverFilter: 'new' },
    { id: 'assigned', label: 'Assigned Jobs', countKey: 'assignedTab', serverFilter: 'assignedTab' },
    { id: 'completed', label: 'Completed Jobs', countKey: 'completedTab', serverFilter: 'completedTab' },
    { id: 'resolve', label: 'To Resolve', countKey: 'resolve', serverFilter: 'resolve' },
    { id: 'cancelled', label: 'Cancelled Jobs', countKey: 'cancelledTab', serverFilter: 'cancelledTab' },
  ];
  activeTab: PresaleTab = 'assigned';
  tabCounts: Partial<PresaleTabCounts> = {};
  canAssign = false;
  private access: string | undefined;

  viewAssignedFor: boolean = false;
  isLoading: boolean = true;
  subscriptions = new Subscription();

  page: number = 1;
  row: number = 10;
  total: number = 0;
  searchQuery: string = '';

  userId!: string | undefined;

  presaleWorkflowSteps: ApprovalStep[] = [];

  private confirm = inject(ConfirmDialogService);
  private modal = inject(ModalService);
  private _auditLog = inject(AuditLogService);

  constructor(
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService,
    private _eventsService: EventsService,
    private _eventActions: EventActionsService,
    private _workflowService: WorkflowService,
    private _route: ActivatedRoute,
    private _router: Router,
  ) { }

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this.refreshViews();
    this.subscriptions.add(
      this._workflowService.getWorkflows({ feature: WorkflowFeature.PRESALE }).subscribe((response) => {
        const workflow = response?.data?.[0];
        this.presaleWorkflowSteps = [...(workflow?.steps ?? [])].sort((a, b) => a.order - b.order);
      })
    );
    // Read the ?tab= deep link first so the employee callback below knows whether to default to New.
    this._route.queryParams.subscribe((params) => {
      this.initialPage = params['page'] ? parseInt(params['page'], 10) : 1;
      // "rejected" was this tab's old name; keep old links working.
      const tab = this.tabs.find((t) => t.id === (params['tab'] === 'rejected' ? 'resolve' : params['tab']));
      this.hasTabParam = !!tab;
      if (tab) this.activeTab = tab.id;
    });
    this._employeeService.employeeData$.subscribe((data) => {
      this.viewAssignedFor = data?.category.privileges.assignedJob.viewReport == 'all';
      this.canAssign = this.isAdminRole(data) || data?.category.privileges.assignedJob?.assign === true;
      this.access = data?.category.privileges.assignedJob.viewReport;
      this.userId = data?._id;
      // Assigners land on the All Jobs queue unless a ?tab= deep link says otherwise.
      if (this.canAssign && !this.hasTabParam && this.activeTab === 'assigned') {
        this.activeTab = 'all';
        this.getJobsData();
      }
      this.buildColumns();
      this.buildRowActions();
      this.refreshViews();
      setTimeout(() => this.syncGridView());
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
  private hasTabParam = false;

  private isAdminRole(employee: any): boolean {
    const role = employee?.category?.role;
    return role === 'admin' || role === 'superAdmin';
  }

  get visibleTabs() {
    return this.tabs;
  }

  countFor(key: keyof PresaleTabCounts | 'all'): number | undefined {
    if (key === 'all') {
      const { new: n, assignedTab, completedTab, resolve, cancelledTab } = this.tabCounts;
      if (n === undefined && assignedTab === undefined && completedTab === undefined && resolve === undefined && cancelledTab === undefined) return undefined;
      return (n ?? 0) + (assignedTab ?? 0) + (completedTab ?? 0) + (resolve ?? 0) + (cancelledTab ?? 0);
    }
    return this.tabCounts[key];
  }

  /** Tabs above the grid, same pattern as quotation views; the grid keeps the active one in ?tab=. */
  private refreshViews(): void {
    this.views = this.visibleTabs.map((t) => ({ id: t.id, label: t.label, count: this.countFor(t.countKey), hideCount: this.countFor(t.countKey) === undefined }));
  }

  /** Makes the grid's active tab match the tab chosen by deep link or role default. */
  private syncGridView(): void {
    const view = this.views.find((v) => v.id === this.activeTab);
    if (this.grid && view && this.grid.activeViewId !== view.id) this.grid.selectView(view);
  }

  onViewChange(view: DataGridView): void {
    const tab = view.id as PresaleTab;
    if (tab === this.activeTab && this.isLoading) return;
    this.activeTab = tab;
    this.page = 1;
    this.buildColumns();
    this.buildRowActions();
    this.getJobsData();
  }

  private loadTabCounts(): void {
    if (!this.userId) return;
    this._enquiryService.getPresaleTabCounts(this.access, this.userId).subscribe((counts) => { this.tabCounts = counts; this.refreshViews(); });
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'enqId', sortable: true, label: 'Enquiry ID', valueGetter: (r) => r.enquiryId, cellClass: (r) => r?.preSale?.seenbyEmployee ? 'text-violet-500' : 'text-orange-500' },
      { key: 'customerName', sortable: true, label: 'Customer Name', valueGetter: (r) => r.client?.[0]?.companyName },
      { key: 'description', sortable: true, label: 'Description', valueGetter: (r) => r.title },
      { key: 'assignedBy', sortable: true, label: 'Sent By', valueGetter: (r) => `${r.salesPerson?.[0]?.firstName ?? ''} ${r.salesPerson?.[0]?.lastName ?? ''}`.trim() },
      { key: 'assignedTo', label: 'Assigned To', locked: true, visible: this.viewAssignedFor && this.activeTab !== 'new', valueGetter: (r) => this.assigneeName(r) },
      { key: 'department', sortable: true, label: 'Depart.', valueGetter: (r) => r.department?.[0]?.departmentName },
      { key: 'status', sortable: true, label: 'Status', type: 'badge', locked: true, visible: this.viewAssignedFor || this.activeTab === 'all' || this.activeTab === 'resolve', valueGetter: (r) => this.displayStatus(r), badgeClasses: this.statusBadgeClasses, badgeLabel: (v) => this.statusLabel(v) },
    ];
  }

  private assigneeName(r: any): string {
    const person = r.reAssigned?.[0] ?? r.preSale?.presalePerson?.[0];
    return person ? `${person.firstName} ${person.lastName}` : '—';
  }

  /** The enquiry only says "in presales"; the presale job's own review/revision state is shown here instead. */
  private displayStatus(r: any): string {
    const ps: string | undefined = r?.preSale?.status;
    return ps === 'in review' || ps === 'in revision' ? ps : r?.status;
  }

  /** Short badge text; the tab already says which stage a job is in. */
  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      'Assigned To Presale Engineer': 'Assigned',
      'Assigned To Presale Manager': 'Assigned',
      'Assigned To Presales': 'Assigned',
      'in presales': 'Assigned',
      'Sent to Presales': 'New',
      'Rejected by Presale Engineer': 'Rejected',
      'Rejected by Presale Manager': 'Rejected',
      'Work In Progress': 'Completed',
      'Lost': 'Cancelled',
      'lost': 'Cancelled',
      'in review': 'In Review',
      'in revision': 'In Revision',
    };
    return labels[status] ?? status;
  }

  readonly statusBadgeClasses: Record<string, string> = {
    'Assigned To Presale Engineer': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'Assigned To Presale Manager': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'in presales': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'in review': 'bg-blue-50 text-blue-700 ring-blue-200',
    'in revision': 'bg-orange-50 text-orange-700 ring-orange-200',
    'Rejected by Presale Engineer': 'bg-red-50 text-red-700 ring-red-200',
    'Rejected by Presale Manager': 'bg-red-50 text-red-700 ring-red-200',
    'Sent to Presales': 'bg-blue-50 text-blue-700 ring-blue-200',
    'Work In Progress': 'bg-green-50 text-green-700 ring-green-200',
    'Lost': 'bg-gray-100 text-gray-700 ring-gray-300',
    'lost': 'bg-gray-100 text-gray-700 ring-gray-300',
  };

  /** In the mixed "All Jobs" tab, an action's eligibility must follow the row's own status, not the tab id. */
  private rowStage(r: any): PresaleTab {
    if (this.activeTab !== 'all' && this.activeTab !== 'resolve') return this.activeTab;
    const s: string = r?.status ?? '';
    const ps: string | undefined = r?.preSale?.status;
    if (ps === 'cancelled') return 'cancelled';
    if (ps === 'new') return 'new';
    if (ps === 'rejected') return 'rejected';
    if (ps === 'assigned' || ps === 'in review' || ps === 'in revision' || ps === 'estimated') return 'assigned';
    if (ps === 'approved') return 'completed';
    if (s === 'estimated' && ps !== 'cancelled') return 'assigned';
    if (s === 'Sent to Presales') return 'new';
    if (s === 'Work In Progress') return 'completed';
    if (s.startsWith('Rejected')) return 'rejected';
    if (s.startsWith('Assigned') || s === 'in presales') return 'assigned';
    return this.activeTab;
  }

  private buildRowActions(): void {
    const stageIn = (r: any, ...tabs: PresaleTab[]) => !tabs.includes(this.rowStage(r));
    this.rowActions = [
      {
        id: 'assign', label: 'Assign', icon: 'user', quick: true,
        hidden: (r) => this.rowStage(r) !== 'new' || !this.canAssign,
      },
      {
        id: 'reassign', label: 'Reassign', icon: 'user', quick: true,
        hidden: (r) => this.rowStage(r) !== 'rejected' || !this.canAssign,
      },
      {
        id: 'return', label: 'Return to Enquiry', icon: 'send', quick: true,
        hidden: (r) => this.rowStage(r) !== 'rejected' || !this.canAssign,
      },
      {
        id: 'feedbackAsk', label: 'Ask For Feedback', icon: 'chat', quick: true,
        hidden: (r) => this.rowStage(r) !== 'assigned' || !r.preSale?.newFeedbackAccess,
      },
      {
        id: 'giveFeedback', label: 'Give Feedback', icon: 'chat', quick: true,
        hidden: (r) => !this.pendingFeedbackForMe(r),
      },
      {
        id: 'viewFeedback', label: 'View Feedback', icon: 'eye', quick: true,
        hidden: (r) => stageIn(r, 'assigned', 'completed', 'all') || !r.preSale?.feedback?.length,
      },
      {
        id: 'uploadEstimation', label: 'Upload Estimation', icon: 'upload', quick: true,
        hidden: (r) => this.rowStage(r) !== 'assigned' || !!r.preSale?.estimations,
      },
      {
        id: 'viewEstimation', label: 'View Estimation', icon: 'files', quick: true,
        hidden: (r) => stageIn(r, 'assigned', 'completed', 'all') || !r.preSale?.estimations,
      },
      { id: 'reject', label: 'Reject Job', icon: 'close', variant: 'danger', quick: true, hidden: (r) => this.rowStage(r) !== 'assigned' },
      {
        id: 'send', label: 'Send to Enquiry', icon: 'send', quick: true,
        hidden: (r) => this.rowStage(r) !== 'assigned' || !r.preSale?.estimations || this.hasPendingFeedbackRequest(r),
      },
    ];
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'assign': this.onAssignClicks(row._id, 'assign'); break;
      case 'reassign': this.onAssignClicks(row._id, 'reassign'); break;
      case 'return': this.onReturnJob(row); break;
      case 'feedbackAsk': this.onFeedback(row); break;
      case 'giveFeedback': this.onGiveFeedback(row); break;
      case 'viewFeedback': this.viewFeedback(row); break;
      case 'uploadEstimation': this.onUploadClicks(row._id); break;
      case 'viewEstimation': this.onViewEstimation(row.preSale?.estimations, row._id); break;
      case 'reject': this.onRejectJob(row); break;
      case 'send': this.onSendClicked(row); break;
    }
  }

  getJobsData() {
    // Whatever triggered this reload changed a job, so any history already fetched is stale.
    this.refreshHistory();
    let access;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.assignedJob.viewReport;
      this.userId = employee?._id;
    });
    if (this.userId) {
      this.isLoading = true;
      this.subscriptions.add(
        this._enquiryService.getPresale(this.page, this.row, this.serverFilter, access, this.userId, this.searchQuery, this.sort).subscribe({
          next: (data) => {
            this.rows = data.enquiry;
            this.total = data.total;
            this.isLoading = false;
            this.loadTabCounts();
          },
          error: () => {
            this.isLoading = false;
          }
        })
      );
    }
  }

  private get serverFilter(): string {
    return this.tabs.find((t) => t.id === this.activeTab)!.serverFilter;
  }

  private sort: DataGridQuery['sort'] = { key: null, direction: null };

  onQueryChange(query: DataGridQuery): void {
    this.page = query.page;
    this.row = query.pageSize;
    this.searchQuery = query.search;
    this.sort = query.sort;
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
          { type: 'field', label: 'Cancel Reason', value: row.preSale?.cancelReason || row.lostReason || '—', visible: row.preSale?.status === 'cancelled' },
        ],
      },
    ];
  }

  // ---- Progress tab: presale assignment escalation ladder ----------------------------------

  private roleLabel(step: ApprovalStep): string {
    const role: any = step.role;
    return (role && typeof role === 'object') ? (role.categoryName ?? '—') : '—';
  }

  private initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Mirrors the server's lazy escalation resolution (presaleAssignment.service.ts) so the panel
   * reflects steps whose window has elapsed even before the next assign attempt persists it. */
  private resolveAssignment(row: any, steps: ApprovalStep[]): { index: number; dueAt: Date | null } {
    const approval = row?.preSale?.assignApproval;
    if (!approval || !steps.length) return { index: 0, dueAt: null };
    let index = approval.stepIndex ?? 0;
    let dueAt = approval.escalationDueAt ? new Date(approval.escalationDueAt) : null;
    const now = new Date();
    while (index < steps.length - 1 && dueAt && dueAt <= now) {
      index += 1;
      const hours = (steps[index] as any).escalationHours || DEFAULT_ESCALATION_HOURS;
      dueAt = new Date(dueAt.getTime() + hours * 60 * 60 * 1000);
    }
    return { index, dueAt };
  }

  /** Builds the escalation ladder for this job, ticking off roles it has already moved past.
   * Listed backward (last/current-most role first) so the top of the panel shows who is next. */
  progressStages(row: any): ApprovalJourneyStage[] {
    const steps = this.presaleWorkflowSteps;
    if (!steps.length) {
      return [{ key: 'empty', variant: 'empty', icon: 'help_outline', title: 'No presale workflow configured', subtitle: 'An admin can set one up in Settings → Workflow.' }];
    }

    const { index: currentIndex, dueAt } = this.resolveAssignment(row, steps);

    const stages: ApprovalJourneyStage[] = steps.map((step, i) => {
      const roleName = this.roleLabel(step);
      const isDone = i < currentIndex;
      const isCurrent = i === currentIndex;
      const isLast = i === steps.length - 1;
      const hours = step.escalationHours ?? DEFAULT_ESCALATION_HOURS;

      let subtitle: string;
      if (isDone) {
        subtitle = 'Assignment window elapsed — responsibility moved to the next role.';
      } else if (isCurrent) {
        subtitle = isLast
          ? 'Final fallback — responsible now and does not escalate further.'
          : `Responsible now — escalates to the next role after ${hours}h if not assigned${dueAt ? ` (by ${dueAt.toLocaleString()})` : ''}.`;
      } else {
        subtitle = isLast
          ? `Final fallback — takes over ${hours}h after reaching this role if still unassigned.`
          : `Takes over ${hours}h after reaching this role if still unassigned, then escalates further.`;
      }

      return {
        key: `step-${i}`,
        variant: isDone ? 'done' : isCurrent ? 'current' : 'stage',
        icon: isDone ? 'check_circle' : undefined,
        initials: isDone ? undefined : this.initials(roleName),
        stepNumber: i + 1,
        title: roleName,
        subtitle,
      } as ApprovalJourneyStage;
    });

    // Newest first: a cancelled job's outcome sits above the escalation ladder.
    stages.reverse();
    const ps: string | undefined = row.preSale?.status;
    if (ps === 'in review' || ps === 'in revision') {
      const hasOpenRequest = this.hasPendingFeedbackRequest(row);
      stages.unshift({
        key: 'presale-state',
        variant: 'current',
        initials: ps === 'in review' ? 'IR' : 'RV',
        title: ps === 'in review' ? 'In review' : 'In revision',
        subtitle: ps === 'in review'
          ? (hasOpenRequest ? 'Feedback requested — awaiting a decision.' : 'Estimation uploaded — awaiting review.')
          : 'Sent back by the reviewer — update the estimation and send it again.',
      } as ApprovalJourneyStage);
    }
    if (row.preSale?.status === 'cancelled') {
      const reason = row.preSale.cancelReason || row.lostReason;
      const when = row.preSale.cancelledAt ? new Date(row.preSale.cancelledAt).toLocaleString() : '';
      stages.unshift({
        key: 'cancelled',
        variant: 'rejected',
        icon: 'close',
        title: 'Cancelled — enquiry lost',
        subtitle: [reason, when].filter(Boolean).join(' · ') || undefined,
      });
    }
    return stages;
  }

  // ---- History tab: the enquiry's global audit log, same as the Enquiries page ------------

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  historyFor(row: any): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this._auditLog.getHistory('enquiry', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }

  /** Drops cached history so the next render re-reads it after something changed on a job. */
  private refreshHistory(row?: any): void {
    if (row) this.historyCache.delete(row._id);
    else this.historyCache.clear();
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

  onAssignClicks(enqId: string, mode: 'assign' | 'reassign' = 'reassign') {
    const row = this.rows?.find((r: any) => r._id === enqId);
    this.modal.open<{ message: string }>(AssignEmployeeComponent, {
      width: '520px',
      data: { enquiryId: enqId, context: row?.enquiryId, mode, canAssign: this.canAssign }
    }).afterClosed().subscribe((res) => {
      if (res) {
        this.getJobsData()
        this.toast.success(res.message)
      }
    })
  }

  async onReturnJob(row: any): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Return to enquiry?',
      message: 'The job goes back to the salesperson with the rejection reason. They can resend it or mark the enquiry lost.',
      confirmLabel: 'Return',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this._enquiryService.returnJob(row._id).subscribe({
      next: (res) => {
        this.toast.success(res.message);
        this.getJobsData();
      },
      error: (err) => this.toast.warning(err?.error?.message || 'Could not return this job. Please try again.'),
    });
  }

  onFeedback(row: any) {
    if (!row.preSale?.estimations) {
      this.toast.warning('Please complete the estimation Uploads');
      return;
    }
    this.modal.open<string>(AskFeedbackComponent, { width: '520px', data: { context: row.enquiryId } })
      .afterClosed().subscribe((comment) => {
        if (!comment) return;
        this._enquiryService.sendFeedbackRequest({ enquiryId: row._id, comment }).subscribe({
          next: () => {
            this.toast.success('Feedback requested from the person who assigned this job');
            this.getJobsData();
          },
          error: (err) => this.toast.warning(err?.error?.message || 'Could not send the feedback request. Please try again.'),
        });
      });
  }

  /** The unanswered feedback request addressed to the signed-in user, if any. */
  pendingFeedbackForMe(row: any): any | undefined {
    if (!this.userId) return undefined;
    return (row.preSale?.feedback || []).find((fb: any) => !fb.feedback && String(fb.employeeId?._id ?? fb.employeeId) === String(this.userId));
  }

  onGiveFeedback(row: any, detailOpen = false): void {
    const request = this.pendingFeedbackForMe(row);
    if (!request) return;
    if (!detailOpen) {
      this.grid.activeTab = 'feedback';
      this.grid.openRow(row);
    }
    this.modal.open<GiveFeedbackResult>(GiveFeedbackComponent, { width: '520px', data: { context: row.enquiryId, question: request.comment } })
      .afterClosed().subscribe((result) => {
        if (!result) return;
        this._enquiryService.giveFeedback({ enquiryId: row._id, feedbackId: request._id, feedback: result.feedback, action: result.action }).subscribe({
          next: () => {
            this.toast.success(result.action === 'send' ? 'Feedback given and the job sent back to enquiry' : 'Feedback given and the job returned for revision');
            this.getJobsData();
          },
          error: (err) => this.toast.warning(err?.error?.message || 'Could not submit your feedback. Please try again.'),
        });
      });
  }

  /** Ask For Feedback from the details footer: only for jobs still in the Assigned tab. */
  canAskFeedback(row: any): boolean {
    return this.activeTab === 'assigned' && this.rowStage(row) === 'assigned' && !!row.preSale?.newFeedbackAccess;
  }

  /** The latest answered feedback, replyable only from the To Resolve tab (no request waiting on the assigner). */
  replyTarget(row: any): any | undefined {
    if (this.activeTab !== 'resolve' || this.rowStage(row) !== 'assigned' || !row.preSale?.newFeedbackAccess || this.hasPendingFeedbackRequest(row)) return undefined;
    return [...(row.preSale?.feedback || [])].reverse().find((fb: any) => !!fb.feedback);
  }

  onReplyFeedback(row: any): void {
    const target = this.replyTarget(row);
    if (!target) return;
    this.modal.open<string>(ReplyFeedbackComponent, { width: '520px', data: { context: row.enquiryId, feedback: target.feedback } })
      .afterClosed().subscribe((comment) => {
        if (!comment) return;
        this._enquiryService.sendFeedbackRequest({ enquiryId: row._id, comment }).subscribe({
          next: () => {
            this.toast.success('Reply sent to the person who assigned this job');
            this.grid.closeDetail();
            const view = this.views.find((v) => v.id === 'assigned');
            if (view && this.grid.activeViewId !== view.id) this.grid.selectView(view);
            else this.getJobsData();
          },
          error: (err) => this.toast.warning(err?.error?.message || 'Could not send your reply. Please try again.'),
        });
      });
  }

  viewFeedback(row: any) {
    this.grid.activeTab = 'feedback';
    this.grid.openRow(row);
  }

  hasPendingFeedbackRequest(row: any): boolean {
    return (row.preSale?.feedback || []).some((fb: any) => !fb.feedback);
  }

  async onSendClicked(row: any): Promise<void> {
    if (!row.preSale?.estimations) {
      this.toast.warning('Please complete the estimation Uploads');
      return;
    }
    if (this.hasPendingFeedbackRequest(row)) {
      this.toast.warning('A feedback request is still awaiting a response. Please wait before sending this job back to enquiry.');
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
          this.getJobsData();
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
    const hasEstimation = !!row.preSale?.estimations;
    const { confirmed, reason, choice } = await this.confirm.open({
      tone: 'reject',
      title: 'Reject Job',
      message: 'Are you sure you want to reject this job?',
      reason: true,
      reasonLabel: 'Reason for rejection',
      confirmLabel: 'Reject',
      ...(hasEstimation ? {
        choices: [
          { value: 'keep', label: 'Keep the estimation', hint: 'The salesperson can see it, and presales can start from it if the job is resent.' },
          { value: 'clear', label: 'Clear the estimation', hint: 'Deletes everything entered so far. This cannot be undone.', typeToConfirm: 'clear work' },
        ],
        defaultChoice: 'keep',
      } : {}),
    });
    if (!confirmed) return;

    this._enquiryService.rejectJob(row._id, reason ?? '', 'Manager', choice === 'clear').subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Job rejected');
          this.refreshHistory(row);
          this.getJobsData();
        }
      },
      error: (err) => this.toast.warning(err?.error?.message || 'Something went wrong while rejecting. Please try again later'),
    })
  }
}
