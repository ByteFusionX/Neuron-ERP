import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { EnquiryService, PresaleTabCounts } from 'src/app/core/services/enquiry/enquiry.service';
import { EstimationHistoryEntry, Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { HttpEventType } from '@angular/common/http';
import { AskFeedbackComponent } from '../ask-feedback/ask-feedback.component';
import { ReplyFeedbackComponent } from '../reply-feedback/reply-feedback.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { GiveFeedbackComponent, GiveFeedbackResult } from '../give-feedback/give-feedback.component';
import { ModalService } from 'src/app/shared/components/modal';
import { ResetWorkflowComponent, ResetWorkflowModalData } from '../reset-workflow/reset-workflow.component';
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
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { WorkingWindow, addWorkingMinutes, workingWindowOf } from 'src/app/shared/utils/working-time';
import { ApprovalStep, WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { ApprovalJourneyComponent } from 'src/app/shared/components/approval-journey/approval-journey.component';
import { ApprovalJourneyStage } from 'src/app/shared/components/approval-journey/approval-journey.model';

const LIMIT_UNIT_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };
const LIMIT_UNIT_SHORT: Record<string, string> = { minute: 'm', hour: 'h', day: 'd' };

export type PresaleTab = 'all' | 'new' | 'assigned' | 'completed' | 'resolve' | 'cancelled' | 'rejected' | 'fu-overdue' | 'fu-today' | 'fu-upcoming';

import { FollowUpCreateModalComponent, FollowUpModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/follow-up-create-modal.component';
import { FollowUpPanelComponent } from 'src/app/shared/components/detail-panel/follow-up-panel/follow-up-panel.component';
import { FollowUpViewModel, followUpCellClass, followUpViewer } from 'src/app/shared/utils/follow-up.util';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
@Component({
  selector: 'app-presales-list',
  templateUrl: './presales-list.component.html',
  styleUrls: ['./presales-list.component.css'],
  imports: [ViewToggleComponent, RouterLink, NgIf, NgFor, NgClass, NgSwitch, NgSwitchCase, AsyncPipe, DatePipe, DataGridComponent, DetailOverviewComponent, DetailDocumentsComponent, DetailTaskListComponent, DetailTimelineComponent, ApprovalJourneyComponent, ViewEstimationComponent, EstimationFormDrawerComponent, ActionButtonComponent, FollowUpPanelComponent]
})
export class PresalesListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  rows: any[] = [];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'followups', label: 'Follow-ups', icon: 'clock' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'feedback', label: 'Feedback', icon: 'chat' },
    { id: 'progress', label: 'Progress', icon: 'account_tree' },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Sales' }];
  views: DataGridView[] = [];
  detailLoading = false;

  readonly tabs: { id: PresaleTab; label: string; countKey: keyof PresaleTabCounts | 'all' | 'none'; serverFilter: string; followUp?: string }[] = [
    { id: 'all', label: 'All Jobs', countKey: 'all', serverFilter: 'all' },
    { id: 'new', label: 'New Jobs', countKey: 'new', serverFilter: 'new' },
    { id: 'assigned', label: 'Assigned Jobs', countKey: 'assignedTab', serverFilter: 'assignedTab' },
    { id: 'completed', label: 'Completed Jobs', countKey: 'completedTab', serverFilter: 'completedTab' },
    { id: 'resolve', label: 'To Resolve', countKey: 'resolve', serverFilter: 'resolve' },
    { id: 'cancelled', label: 'Cancelled Jobs', countKey: 'cancelledTab', serverFilter: 'cancelledTab' },
    // Estimations being chased, across every open tab; the server leaves out finished jobs.
    { id: 'fu-overdue', label: 'Overdue', countKey: 'fuOverdue', serverFilter: 'all', followUp: 'overdue' },
    { id: 'fu-today', label: 'Today', countKey: 'fuToday', serverFilter: 'all', followUp: 'today' },
    { id: 'fu-upcoming', label: 'Upcoming', countKey: 'fuUpcoming', serverFilter: 'all', followUp: 'upcoming' },
  ];
  activeTab: PresaleTab = 'assigned';
  tabCounts: Partial<PresaleTabCounts> = {};
  canAssign = false;
  /** Unset on roles saved before these flags existed, which means allowed. */
  canReject = true;
  canEstimate = true;
  isSuperAdmin = false;
  private access: string | undefined;

  viewAssignedFor: boolean = false;
  isLoading: boolean = true;
  subscriptions = new Subscription();

  page: number = 1;
  row: number = 15;
  total: number = 0;
  searchQuery: string = '';

  userId!: string | undefined;

  presaleWorkflowSteps: ApprovalStep[] = [];
  /** Working days and hours of the presale workflow; time limits only run inside them. */
  presaleWindow: WorkingWindow = workingWindowOf(null);
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
        // The bottom row acts first and the job climbs to Admin, who is pinned on top of every workflow.
        // A switched-off step, or one whose role lost the assign privilege, is skipped (the server does the same).
        const live = (workflow?.steps ?? []).filter((st) => st.enabled !== false && (st.role as any)?.privileges?.assignedJob?.assign === true);
        const timed = live.some((st) => st.escalationHours);
        // Super Admin is pinned on top once: skip it when a stored step already holds a super admin role.
        const hasSuperAdmin = live.some((st) => /^superadmin$/i.test((st.role as any)?.role ?? ''));
        const admin = { role: { categoryName: 'Super Admin' }, order: 1, admin: true, ...(timed ? { escalationHours: 8, escalationUnit: 'hour' } : {}) } as unknown as ApprovalStep;
        this.presaleWindow = workingWindowOf(workflow);
        this.presaleWorkflowSteps = workflow ? [...live].sort((a, b) => b.order - a.order).concat(hasSuperAdmin ? [] : [admin]) : [];
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
      const superAdmin = data?.category?.role === 'superAdmin';
      this.canAssign = superAdmin || data?.category.privileges.assignedJob?.assign === true;
      this.canReject = superAdmin || data?.category.privileges.assignedJob?.reject !== false;
      this.canEstimate = superAdmin || data?.category.privileges.assignedJob?.estimate !== false;
      this.access = data?.category.privileges.assignedJob.viewReport;
      this.userId = data?._id;
      this.isSuperAdmin = data?.category?.role === 'superAdmin';
      // Assigners land on the All Jobs queue unless a ?tab= deep link says otherwise.
      if (this.canAssign && !this.hasTabParam && this.activeTab === 'assigned') {
        this.activeTab = 'all';
        this.getJobsData();
      }
      // A deep link to a tab this role doesn't get falls back to its default.
      if (!this.visibleTabs.some((t) => t.id === this.activeTab)) {
        this.activeTab = this.canAssign ? 'all' : 'assigned';
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

  get visibleTabs() {
    // Assigners run the pipeline (New, Resolve, Completed); assignees work their own queue and chase follow-ups.
    const assignerTabs: PresaleTab[] = ['all', 'new', 'assigned', 'resolve', 'completed', 'cancelled'];
    const assigneeTabs: PresaleTab[] = ['all', 'assigned', 'cancelled', 'fu-overdue', 'fu-today', 'fu-upcoming'];
    if (this.isSuperAdmin) return this.tabs;
    const allowed = this.canAssign ? assignerTabs : assigneeTabs;
    return this.tabs.filter((t) => allowed.includes(t.id));
  }

  countFor(key: keyof PresaleTabCounts | 'all' | 'none'): number | undefined {
    if (key === 'none') return undefined;
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
      { key: 'nextFollowUp', sortable: true, label: 'Follow-up', type: 'date', width: '140px', valueGetter: (r) => r.preSale?.followUp?.nextFollowUpDate ?? null, cellClass: (r) => followUpCellClass(r.preSale?.followUp?.nextFollowUpDate, this.isFollowUpClosed(r)) },
      { key: 'department', sortable: true, label: 'Depart.', valueGetter: (r) => r.department?.[0]?.departmentName },
      { key: 'status', sortable: true, label: 'Status', type: 'badge', locked: true, visible: this.viewAssignedFor || this.isMixedTab, valueGetter: (r) => this.displayStatus(r), badgeClasses: this.statusBadgeClasses, badgeLabel: (v) => this.statusLabel(v) },
    ];
  }

  private assigneeName(r: any): string {
    const person = r.reAssigned?.[0] ?? r.preSale?.presalePerson?.[0];
    return person ? `${person.firstName} ${person.lastName}` : '—';
  }

  /** The enquiry only says "in presales"; the presale job's own review/revision state is shown here instead. */
  displayStatus(r: any): string {
    const ps: string | undefined = r?.preSale?.status;
    return ps && ['new', 'assigned', 'in review', 'in revision', 'rejected', 'returned', 'approved', 'completed', 'cancelled'].includes(ps) ? ps : r?.status;
  }

  /** One line telling the user where the job stands and what happens next. */
  nextStep(r: any): string {
    switch (r?.preSale?.status) {
      case 'new': return 'Waiting to be assigned to a presale engineer.';
      case 'assigned': return 'With the presale engineer — upload an estimation to send it for review.';
      case 'in review': return "Waiting for sales to review the estimation. You can't edit until they approve or request a revision.";
      case 'in revision': return 'Sales asked for changes — update the estimation and send it again.';
      case 'rejected': return 'Rejected by presale. It stays here until a manager reassigns or closes it.';
      case 'returned': return 'Returned to the salesperson, who can resend it or mark the enquiry lost.';
      case 'approved':
      case 'completed': return 'Estimation approved — presale work is complete.';
      case 'cancelled': return 'Enquiry lost — no further presale work is needed.';
      default: return '';
    }
  }

  /** Why Edit is disabled for this job, or '' when editing is allowed. */
  editBlockedReason(r: any): string {
    if (this.activeTab === 'assigned' && ['assigned', 'in revision'].includes(r?.preSale?.status ?? 'assigned')) return '';
    return this.nextStep(r) || 'This estimation can only be edited while the job is assigned to you.';
  }

  /** Reason sales gave when requesting the revision (stored on the version it superseded). */
  revisionReason(r: any): string {
    if (r?.preSale?.status !== 'in revision') return '';
    const history = r?.preSale?.estimationHistory ?? [];
    return history[history.length - 1]?.reason ?? '';
  }

  /** Short badge text; the tab already says which stage a job is in. */
  statusLabel(status: string): string {
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
      'new': 'New',
      'assigned': 'Assigned',
      'rejected': 'Rejected',
      'returned': 'Returned',
      'approved': 'Completed',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
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
    'new': 'bg-blue-50 text-blue-700 ring-blue-200',
    'assigned': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'rejected': 'bg-red-50 text-red-700 ring-red-200',
    'returned': 'bg-purple-50 text-purple-700 ring-purple-200',
    'approved': 'bg-green-50 text-green-700 ring-green-200',
    'completed': 'bg-green-50 text-green-700 ring-green-200',
    'cancelled': 'bg-gray-100 text-gray-700 ring-gray-300',
    'Lost': 'bg-gray-100 text-gray-700 ring-gray-300',
    'lost': 'bg-gray-100 text-gray-700 ring-gray-300',
  };

  /** Tabs that mix jobs of every stage, where an action's eligibility must follow the row's own status. */
  private get isMixedTab(): boolean {
    return this.activeTab === 'all' || this.activeTab === 'resolve' || this.activeTab.startsWith('fu-');
  }

  /** In the mixed "All Jobs" tab, an action's eligibility must follow the row's own status, not the tab id. */
  private rowStage(r: any): PresaleTab {
    if (!this.isMixedTab) return this.activeTab;
    const s: string = r?.status ?? '';
    const ps: string | undefined = r?.preSale?.status;
    if (ps === 'cancelled') return 'cancelled';
    if (ps === 'new') return 'new';
    // A job the salesperson resent keeps preSale.status 'returned' but waits in New, like the server's tab logic.
    if (ps === 'returned' && s.toLowerCase() === 'revision') return 'new';
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
        id: 'followUp', label: 'Follow-ups', icon: 'clock',
        hidden: (r) => this.isFollowUpClosed(r) || this.rowStage(r) === 'new',
      },
      {
        id: 'addEvent', label: 'Add Event', icon: 'calendar',
        hidden: (r) => this.rowStage(r) === 'new',
      },
      {
        id: 'assign', label: 'Assign', icon: 'user', quick: true,
        hidden: (r) => this.rowStage(r) !== 'new' || !this.canAssign,
      },
      {
        id: 'restartWorkflow', label: 'Reset Workflow', icon: 'refresh', quick: true,
        hidden: (r) => this.rowStage(r) !== 'new' || !this.isSuperAdmin || !r.preSale?.assignApproval || !!r.preSale?.presalePerson?.length,
      },
      {
        id: 'escalateHeld', label: 'Escalate to Next Step', icon: 'send', quick: true,
        hidden: (r) => this.rowStage(r) !== 'new' || !this.isSuperAdmin || !this.isHeldAtStep(r) || this.isWorkflowExhausted(r),
      },
      {
        id: 'rejectHeld', label: 'Reject Job', icon: 'close', variant: 'danger', quick: true,
        hidden: (r) => this.rowStage(r) !== 'new' || !this.isSuperAdmin || !this.isHeldAtStep(r),
      },
      {
        id: 'rejectNew', label: 'Reject Job', icon: 'close', variant: 'danger', quick: true,
        // A job held at a workflow step already has the super admin "Reject Job" above; don't show a second one.
        hidden: (r) => this.rowStage(r) !== 'new' || !this.canAssign || !this.canReject || (this.isSuperAdmin && this.isHeldAtStep(r)),
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
        hidden: (r) => this.rowStage(r) !== 'assigned' || !r.preSale?.newFeedbackAccess || !r.preSale?.estimations || !this.canEstimate,
      },
      {
        id: 'giveFeedback', label: 'Give Feedback', icon: 'chat', quick: true,
        hidden: (r) => !this.pendingFeedbackForMe(r) || !this.canAssign,
      },
      {
        id: 'viewFeedback', label: 'View Feedback', icon: 'eye', quick: true,
        hidden: (r) => stageIn(r, 'assigned', 'completed', 'all') || !r.preSale?.feedback?.length,
      },
      {
        id: 'uploadEstimation', label: 'Upload Estimation', icon: 'upload', quick: true,
        hidden: (r) => this.rowStage(r) !== 'assigned' || !!r.preSale?.estimations || !this.canEstimate,
      },
      {
        id: 'viewEstimation', label: 'View Estimation', icon: 'files', quick: true,
        hidden: (r) => stageIn(r, 'assigned', 'completed', 'all') || !r.preSale?.estimations,
      },
      { id: 'reject', label: 'Reject Job', icon: 'close', variant: 'danger', quick: true, hidden: (r) => this.rowStage(r) !== 'assigned' || !this.canReject },
      {
        id: 'send', label: 'Send to Enquiry', icon: 'send', quick: true,
        hidden: (r) => this.rowStage(r) !== 'assigned' || !r.preSale?.estimations || this.hasPendingFeedbackRequest(r) || !this.canEstimate,
      },
    ];
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'followUp': this.openFollowUps(row); break;
      case 'addEvent':
        if (this.grid) { this.grid.activeTab = 'events'; this.grid.openRow(row); }
        break;
      case 'assign': this.onAssignClicks(row._id, 'assign'); break;
      case 'reassign': this.onAssignClicks(row._id, 'reassign'); break;
      case 'restartWorkflow': this.onRestartWorkflow(row); break;
      case 'escalateHeld': this.onResolveHeld(row, 'escalate'); break;
      case 'rejectHeld': this.onResolveHeld(row, 'reject'); break;
      case 'rejectNew': this.onRejectNewJob(row); break;
      case 'return': this.onReturnJob(row); break;
      case 'feedbackAsk': this.onFeedback(row); break;
      case 'giveFeedback': this.onGiveFeedback(row); break;
      case 'viewFeedback': this.viewFeedback(row); break;
      case 'uploadEstimation': this.onUploadClicks(row._id); break;
      case 'viewEstimation': this.onViewEstimation(row.preSale?.estimations, row._id, row.preSale?.estimationHistory, row); break;
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
        this._enquiryService.getPresale(this.page, this.row, this.serverFilter, access, this.userId, this.searchQuery, this.sort, this.tabs.find((t) => t.id === this.activeTab)?.followUp).subscribe({
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

  // --- follow-ups: chasing the estimation, same flow as enquiries --------------------------------------------------

  /** An estimation that is done, cancelled or back with sales is no longer chased. */
  isFollowUpClosed(r: any): boolean {
    return ['approved', 'completed', 'cancelled', 'returned'].includes(String(r?.preSale?.status)) || ['quoted', 'lost'].includes(String(r?.status || '').toLowerCase());
  }

  private readonly followUpViewFor = followUpViewer();

  followUpView(row: any): FollowUpViewModel {
    return this.followUpViewFor(row, row.preSale?.followUp, this.isFollowUpClosed(row));
  }

  openFollowUps(row: any): void {
    if (!this.grid) return;
    this.grid.activeTab = 'followups';
    this.grid.openRow(row);
  }

  onScheduleFollowUp(row: any): void {
    const open = this.followUpView(row).open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.enquiryId || row._id, mode: 'schedule', dueDate: open?.dueIso || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(row, this._enquiryService.schedulePresaleFollowUp(row._id, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
    });
  }

  onLogFollowUp(row: any): void {
    const open = this.followUpView(row).open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.enquiryId || row._id, mode: 'complete', plannedFor: open?.due || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(row, this._enquiryService.schedulePresaleFollowUp(row._id, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
      else if (result?.mode === 'complete') {
        this.saveFollowUp(row, this._enquiryService.completePresaleFollowUp(row._id, {
          date: result.date, outcome: result.outcome, note: result.note, nextFollowUpDate: result.nextFollowUpDate,
        }), 'Follow-up logged');
      }
    });
  }

  async onCancelFollowUp(row: any): Promise<void> {
    const open = this.followUpView(row).open;
    if (!open) return;
    const { confirmed, reason } = await this.confirm.open({
      tone: 'warning',
      title: 'Cancel Follow-up',
      message: 'Close this follow-up without logging an outcome?',
      details: [{ label: 'Planned for', value: open.due }],
      reason: 'optional',
      confirmLabel: 'Cancel follow-up',
      cancelLabel: 'Keep',
    });
    if (!confirmed) return;
    this.saveFollowUp(row, this._enquiryService.cancelPresaleFollowUp(row._id, reason), 'Follow-up cancelled');
  }

  private followUpSaving = false;

  private saveFollowUp(row: any, request: Observable<{ success: boolean; followUp: any }>, successMessage: string): void {
    if (this.followUpSaving) return;
    this.followUpSaving = true;
    request.subscribe({
      next: (response) => {
        row.preSale = { ...row.preSale, followUp: response.followUp };
        this.followUpSaving = false;
        this.toast.success(successMessage);
        this.loadTabCounts();
        // The Overdue / Today / Upcoming tabs depend on the new date, so reload them.
        if (this.activeTab.startsWith('fu-')) this.getJobsData();
        else this.rows = [...this.rows];
      },
      error: (err) => {
        this.followUpSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save follow-up');
      },
    });
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

  roleLabel(step: ApprovalStep): string {
    const names: string[] | undefined = (step as any).roleNames;
    if (names?.length) return names.join(' or ');
    const role: any = step.role;
    return (role && typeof role === 'object') ? (role.categoryName ?? '—') : '—';
  }

  private initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Mirrors the server's lazy escalation resolution (presaleAssignment.service.ts) so the panel
   * reflects steps whose window has elapsed even before the next assign attempt persists it. */
  stepRoleId(step: ApprovalStep): string {
    return String((step.role as any)?._id ?? step.role);
  }

  /** The ladder this job climbs: the workflow minus any stages a Super Admin switched off for this job. */
  private ladderOf(row: any): ApprovalStep[] {
    const off: string[] = (row?.preSale?.assignApproval?.disabledRoles ?? []).map((id: any) => String(id?._id ?? id));
    const steps = off.length ? this.presaleWorkflowSteps.filter((st) => (st as any).admin || !off.includes(this.stepRoleId(st))) : this.presaleWorkflowSteps;
    // Rows sharing an order are one "Or" stage (same grouping as the server): one entry, with the longest member's window.
    const windowOf = (st: ApprovalStep) => (st.escalationHours || 0) * (LIMIT_UNIT_MS[st.escalationUnit as string] ?? LIMIT_UNIT_MS['hour']);
    const stages: ApprovalStep[] = [];
    for (const st of steps) {
      const at = stages.findIndex((s) => s.order === st.order && !(st as any).admin);
      if (at < 0) { stages.push({ ...st, roleNames: [this.roleLabel(st)] } as any); continue; }
      const lead = windowOf(st) > windowOf(stages[at]) ? st : stages[at];
      stages[at] = { ...lead, roleNames: [...(stages[at] as any).roleNames, this.roleLabel(st)] } as any;
    }
    return stages;
  }

  /** Stages a reset can give another chance (Admin is always included). */
  get resettableSteps(): ApprovalStep[] {
    return this.presaleWorkflowSteps.filter((st) => !(st as any).admin);
  }

  private resolveAssignment(row: any, steps: ApprovalStep[]): { index: number; dueAt: Date | null; queue: (Date | null)[] } {
    const approval = row?.preSale?.assignApproval;
    if (!approval || !steps.length) return { index: 0, dueAt: null, queue: [] };
    let index = approval.stepIndex ?? 0;
    let dueAt = approval.escalationDueAt ? new Date(approval.escalationDueAt) : null;
    const now = new Date();
    // Each step's window is counted in working time only, like the server.
    const nextDue = (from: Date, step: any): Date | null => {
      const amount = step.admin ? (steps.some((st) => st.escalationHours) ? 8 * 60 : 0) : (step.escalationHours || 0) * ((LIMIT_UNIT_MS[step.escalationUnit as string] ?? LIMIT_UNIT_MS['hour']) / 60_000);
      return amount ? addWorkingMinutes(from, amount, this.presaleWindow) : null;
    };
    while (index < steps.length - 1 && dueAt && dueAt <= now && ((steps[index] as any).timeoutAction ?? 'escalate') === 'escalate') {
      index += 1;
      dueAt = nextDue(dueAt, steps[index]);
    }
    // The queue: when each later step would take over if nobody assigns in time.
    const queue: (Date | null)[] = [];
    let cursor = dueAt;
    for (let i = index + 1; i < steps.length; i++) {
      queue[i] = cursor;
      cursor = cursor ? nextDue(cursor, steps[i]) : null;
    }
    return { index, dueAt, queue };
  }

  /** Builds the escalation ladder for this job, ticking off roles it has already moved past.
   * Listed backward (last/current-most role first) so the top of the panel shows who is next. */
  progressStages(row: any): ApprovalJourneyStage[] {
    const steps = this.ladderOf(row);
    if (!steps.length) {
      return [{ key: 'empty', variant: 'empty', icon: 'help_outline', title: 'No presale workflow configured', subtitle: 'An admin can set one up in Settings → Workflow.' }];
    }

    const { index: currentIndex, dueAt, queue } = this.resolveAssignment(row, steps);

    const stages: ApprovalJourneyStage[] = steps.map((step, i) => {
      const roleName = this.roleLabel(step);
      const isDone = i < currentIndex;
      const isCurrent = i === currentIndex;
      const isLast = i === steps.length - 1;
      const hours = step.escalationHours ? `${step.escalationHours}${LIMIT_UNIT_SHORT[step.escalationUnit ?? 'hour'] ?? 'h'}` : 'no time limit';

      let subtitle: string;
      if (isDone) {
        subtitle = 'Assignment window elapsed — responsibility moved to the next role.';
      } else if (isCurrent) {
        subtitle = isLast
          ? 'Final fallback — responsible now and does not escalate further.'
          : `Responsible now — escalates to the next role after ${hours} of working time if not assigned${dueAt ? ` (by ${dueAt.toLocaleString()})` : ''}.`;
      } else {
        subtitle = isLast
          ? `Final fallback — takes over ${hours} (working time) after reaching this role if still unassigned${queue[i] ? ` · expected from ${queue[i]!.toLocaleString()}` : ''}.`
          : `Takes over ${hours} (working time) after reaching this role if still unassigned${queue[i] ? ` · expected from ${queue[i]!.toLocaleString()}` : ''}, then escalates further.`;
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
    const rejections = row.preSale?.rejectionHistory ?? [];
    const lastRejection = rejections[rejections.length - 1];
    if (lastRejection) {
      const when = lastRejection.rejectedAt ? new Date(lastRejection.rejectedAt).toLocaleString() : '';
      stages.unshift({
        key: 'last-rejection',
        variant: 'rejected',
        icon: 'close',
        title: `Last rejected${lastRejection.rejectedRole ? ` by ${lastRejection.rejectedRole}` : ''}`,
        subtitle: [lastRejection.rejectionReason || 'No reason given', when].filter(Boolean).join(' · '),
      });
    }
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

  // ---- History tab: the presale-related entries of the enquiry's global audit log ----------

  private readonly presaleAuditActions = new Set([
    'sent-to-presale', 'resent-to-presale', 'assigned', 'reassigned', 'self-assigned',
    'presale-rejected', 'presale-returned', 'presale-cancelled',
    'estimation-uploaded', 'estimation-deleted', 'revision-requested',
    'feedback-requested', 'feedback-given',
  ]);

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  historyFor(row: any): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this._auditLog.getHistory('enquiry', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries((entries || []).filter((e) => this.presaleAuditActions.has(e.action)))),
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
      this._eventsService.fetchEvents(id, 'Presale').subscribe((events: Events[]) => subject!.next(events || []));
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
      stage: 'Presale',
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

  estimationTarget: { estimation: Estimations; enqId: string; history: EstimationHistoryEntry[]; blockedReason: string; revisionReason: string } | null = null;

  onViewEstimation(estimation: Estimations, enqId: string, history: EstimationHistoryEntry[] = [], row?: any) {
    this.estimationTarget = { estimation, enqId, history, blockedReason: this.editBlockedReason(row), revisionReason: this.revisionReason(row) };
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

  /** True once every workflow step has elapsed with nobody assigned: the job is waiting on a Super Admin. */
  private isWorkflowExhausted(row: any): boolean {
    const steps = this.ladderOf(row);
    const { index, dueAt } = this.resolveAssignment(row, steps);
    return !!row?.preSale?.assignApproval && !row.preSale?.presalePerson?.length && steps.length > 0 && index >= steps.length - 1 && !!dueAt && dueAt <= new Date();
  }

  /** True once the job's current step has run out of time with nobody assigned and the workflow will not move it on by itself
   * (a notify-only step, or the last step): the decision is the Super Admin's. */
  private isHeldAtStep(row: any): boolean {
    const steps = this.ladderOf(row);
    if (!row?.preSale?.assignApproval || row.preSale?.presalePerson?.length || !steps.length) return false;
    const { index, dueAt } = this.resolveAssignment(row, steps);
    if (!dueAt || dueAt > new Date()) return false;
    return index >= steps.length - 1 || ((steps[index] as any).timeoutAction ?? 'escalate') === 'notify';
  }

  async onResolveHeld(row: any, action: 'escalate' | 'reject'): Promise<void> {
    const rejecting = action === 'reject';
    const { confirmed, reason } = await this.confirm.open({
      tone: rejecting ? 'reject' : 'approve',
      title: rejecting ? 'Reject Job' : 'Escalate to the next step?',
      message: rejecting
        ? 'No one was assigned in time. The job goes back to the salesperson with your reason.'
        : 'The current role did not assign this job in time. Escalating hands it to the next role in the workflow.',
      ...(rejecting ? { reason: true, reasonLabel: 'Reason for rejection' } : {}),
      confirmLabel: rejecting ? 'Reject' : 'Escalate',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this._enquiryService.resolveHeldAssignment(row._id, action, reason ?? '').subscribe({
      next: (res) => {
        this.toast.success(res.message);
        this.getJobsData();
      },
      error: (err) => this.toast.warning(err?.error?.message || 'Something went wrong. Please try again.'),
    });
  }

  async onRejectNewJob(row: any): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Reject Job',
      message: 'This job has not been assigned yet. It goes back to the salesperson with your reason.',
      reason: true,
      reasonLabel: 'Reason for rejection',
      confirmLabel: 'Reject',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this._enquiryService.rejectNewJob(row._id, reason ?? '').subscribe({
      next: (res) => {
        this.toast.success(res.message);
        this.refreshHistory(row);
        this.getJobsData();
      },
      error: (err) => this.toast.warning(err?.error?.message || 'Could not reject this job. Please try again.'),
    });
  }

  onRestartWorkflow(row: any): void {
    const data: ResetWorkflowModalData = {
      jobId: row._id,
      context: row.enquiryId,
      stages: this.resettableSteps.map((st) => ({ id: this.stepRoleId(st), label: this.roleLabel(st) })),
    };
    this.modal.open<boolean>(ResetWorkflowComponent, { width: '520px', data })
      .afterClosed().subscribe((reset) => { if (reset) this.getJobsData(); });
  }

  async onReturnJob(row: any): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'approve',
      title: 'Return to enquiry?',
      message: 'The job goes back to the salesperson with the rejection reason. They can resend it or mark the enquiry lost.',
      reason: 'optional',
      reasonLabel: 'Note for the salesperson',
      confirmLabel: 'Return',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this._enquiryService.returnJob(row._id, reason?.trim() || undefined).subscribe({
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
    return this.activeTab === 'assigned' && this.rowStage(row) === 'assigned' && !!row.preSale?.newFeedbackAccess && !!row.preSale?.estimations;
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
          { value: 'clear', label: 'Clear the estimation', hint: 'Archives everything entered so far to its history; it will no longer show as the current estimation. This cannot be undone.', typeToConfirm: 'clear work' },
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
