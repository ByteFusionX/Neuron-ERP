import { HttpEventType } from '@angular/common/http';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { EventsService } from 'src/app/core/services/events/events.service';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { DetailTaskItem } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { FollowUpCreateModalComponent, FollowUpModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/follow-up-create-modal.component';
import { FollowUpPanelComponent } from 'src/app/shared/components/detail-panel/follow-up-panel/follow-up-panel.component';
import { FollowUpViewModel, followUpCellClass, followUpViewer } from 'src/app/shared/utils/follow-up.util';
import { dealSheetPriceDetails } from 'src/app/shared/utils/deal-pricing.util';
import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ApprovalJourneyComponent } from 'src/app/shared/components/approval-journey/approval-journey.component';
import { ApprovalJourneyStage } from 'src/app/shared/components/approval-journey/approval-journey.model';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridDetailTab,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
  DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailFootRow, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { CreatePurchaseComponent } from '../create-purchase/create-purchase.component';
import { ModalService } from 'src/app/shared/components/modal';
import { ResetWorkflowComponent, ResetWorkflowModalData } from 'src/app/modules/presales/pages/reset-workflow/reset-workflow.component';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { JobStatus } from 'src/app/shared/interfaces/job.interface';
import { STATUS_TONE_CLASSES, StatusTone } from 'src/app/shared/components/status-indicator/status-tone';

type SourceType = 'job' | 'manual';

const ALL_STATUSES = ['New', 'In Progress', 'Pending', 'Rejected', 'Revoked', 'Approved'];
const PENDING_STATUSES = ['Pending'];
const APPROVED_STATUSES = ['Approved'];
// A job allocated to a buyer is New (open to work) until the PR is sent for approval: then Pending, then Approved.
const NEW_STATUSES = ['New', 'In Progress'];
const IN_PROGRESS_STATUSES = ['In Progress'];
const REJECTED_STATUSES = ['Rejected'];
const REVOKED_STATUSES = ['Revoked'];

/** Same tones as the Job Sheet list's Job Status badge. */
const JOB_STATUS_TONES: Record<string, StatusTone> = {
  [JobStatus.WorkInProgress]: 'progress',
  [JobStatus.Delivered]: 'info',
  [JobStatus.partiallyDelivered]: 'warning',
  [JobStatus.partiallyInvoiced]: 'warning',
  [JobStatus.invoiced]: 'info',
  [JobStatus.completed]: 'success',
  [JobStatus.onHold]: 'warning',
  [JobStatus.cancelled]: 'danger',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  New: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  'In Progress': 'bg-violet-50 text-violet-700 ring-violet-200 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900 dark:border-violet-900',
  Rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  Revoked: 'bg-orange-50 text-orange-700 ring-orange-200 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900 dark:border-orange-900',
};

const PR_VIEW_IDS = ['followUp', 'new', 'inProgress', 'rejected', 'revoked', 'all', 'pending', 'readyToPo', 'remainingPo', 'completed'];

@Component({
  selector: 'app-purchase-request-list',
  imports: [FollowUpPanelComponent, DetailTaskListComponent, CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailTimelineComponent, ApprovalJourneyComponent, ActionButtonComponent, CreatePurchaseComponent],
  providers: [DatePipe],
  templateUrl: './purchase-request-list.component.html',
  styleUrl: './purchase-request-list.component.css',
})
export class PurchaseRequestListComponent {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private readonly _eventsService = inject(EventsService);
  private readonly _enquiryService = inject(EnquiryService);
  private eventsCache = new Map<string, BehaviorSubject<Events[]>>();
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private employeeService = inject(EmployeeService);
  private confirmDialog = inject(ConfirmDialogService);
  private modal = inject(ModalService);
  private workflowService = inject(WorkflowService);
  private auditLog = inject(AuditLogService);
  private prWorkflowSteps: { id: string; label: string }[] = [];
  private subscriptions = new Subscription();

  detailLoading = false;
  private readonly allDetailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'followups', label: 'Follow-ups', icon: 'chat' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'approval', label: 'Approval', icon: 'activity' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  get detailTabs(): DataGridDetailTab[] {
    return this.activeViewId === 'new' ? this.jobDetailTabs : this.allDetailTabs;
  }
  private readonly jobDetailTabs = this.allDetailTabs.filter((tab) => !['followups', 'events'].includes(tab.id));

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  /** Audit-log events for a PR; approvals are left out (rejections are kept) because the Approval tab already shows them. */
  historyFor(row: any): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory(row.sourceType === 'manual' ? 'generalPurchaseRequest' : 'purchaseRequest', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries((entries || []).filter((e) => e.action !== 'approved'))),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item', type: 'html', truncate: true },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
    { key: 'price', label: 'Unit Cost', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  rows: any[] = [];
  total = 0;
  isLoading = false;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PR' }];
  /** Jobs allocated to the signed-in buyer, waiting for their PR; the tab shows only while there are some. */
  private readonly newView: DataGridView<any> = { id: 'new', label: 'New' };
  private baseViews: DataGridView<any>[] = [
    { id: 'all', label: 'All', hidePill: true },
    { id: 'followUp', label: 'Follow Up' },
    { id: 'inProgress', label: 'In Progress' },
    { id: 'pending', label: 'Pending' },
    { id: 'readyToPo', label: 'Ready to PO' },
    { id: 'remainingPo', label: 'Remaining PO' },
    { id: 'completed', label: 'Completed' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'revoked', label: 'Revoked' },
  ];
  views: DataGridView<any>[] = [this.newView, ...this.baseViews];
  isSuperAdmin = false;
  canApprovePR = false;
  myId = '';
  private newCount = 0;
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];

  activeViewId = 'all';

  page = 1;
  row = 15;
  searchQuery = '';
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;

  ngOnInit(): void {
    const initialView = this.route.snapshot.queryParamMap.get('view') ?? '';
    this.activeViewId = PR_VIEW_IDS.includes(initialView) ? initialView : 'all';
    this.buildColumns();
    this.buildRowActions();
    // The PR view page's Edit links here with ?edit=<id>, so it opens the same edit drawer as the list.
    const editId = this.route.snapshot.queryParamMap.get('edit');
    if (editId) {
      this.onEditPr({ _id: editId });
      this.router.navigate([], { relativeTo: this.route, queryParams: { edit: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    this.subscriptions.add(
      this.workflowService.getWorkflows({ feature: WorkflowFeature.PURCHASE_APPROVAL }).subscribe((response) => {
        const steps = (response?.data?.[0]?.steps ?? []).filter((st: any) => st.enabled !== false && !/^superadmin$/i.test(st.role?.role ?? ''));
        this.prWorkflowSteps = [...steps].sort((a: any, b: any) => b.order - a.order)
          .map((st: any) => ({ id: String(st.role?._id ?? st.role), label: st.role?.categoryName ?? '—' }));
      })
    );

    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((data: any) => {
        const role = data?.category?.role;
        this.isSuperAdmin = /^superadmin$/i.test(role ?? '');
        this.myId = data?._id ?? '';
        this.canApprovePR = this.isSuperAdmin
          || data?.category?.privileges?.purchase?.canApprovePR === true
          || data?.extraPrivileges?.purchase?.canApprovePR === true;
        this.refreshViews();
      })
    );

    this.route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      const rowParam = parseInt(params['row'], 10);
      this.row = [5, 15, 30, 50].includes(rowParam) ? rowParam : 15;
      this.searchQuery = params['search'] || '';
      // The URL is the single source for the tab, so a deep link loads that tab's rows (not "All" under a highlighted tab).
      this.activeViewId = PR_VIEW_IDS.includes(params['view']) ? params['view'] : 'all';
      this.buildColumns();
      if (this.grid) {
        this.grid.page = this.page;
        this.grid.activeViewId = this.activeViewId;
      }

      this.getPurchases();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    // New-tab rows are allocated jobs, so they show the Job Sheet list's columns.
    if (this.activeViewId === 'new') {
      const jobStatusLabel = (v: unknown): string => (v === JobStatus.WorkInProgress ? 'In Progress' : v ? String(v) : '—');
      this.columns = [
        { key: 'date', label: 'Last Updated', type: 'date', sortable: true, width: '120px', valueGetter: (r) => r.jobId?.updatedDate ?? r.createdAt },
        { key: 'jobId', label: 'Job Id', sortable: true, valueGetter: (r) => r.jobId?.jobId },
        {
          key: 'jobStatus', label: 'Job Status', type: 'badge', valueGetter: (r) => r.jobStatus ?? r.jobId?.status ?? '',
          badgeClasses: Object.fromEntries(Object.entries(JOB_STATUS_TONES).map(([s, tone]) => [s, STATUS_TONE_CLASSES[tone].pill + ' border'])),
          badgeLabel: jobStatusLabel,
        },
        { key: 'customerName', label: 'Customer', sortable: true, valueGetter: (r) => r.customerId?.companyName },
        { key: 'description', label: 'Subject', valueGetter: (r) => r.description ?? r.jobId?.quoteId?.subject },
        { key: 'lpoValue', label: 'LPO Value (QAR)', type: 'currency', currencyCode: 'QAR', valueGetter: (r) => r.lpoValue ?? 0 },
        { key: 'salesPerson', label: 'Sales Person', valueGetter: (r) => r.salesPerson },
        { key: 'department', label: 'Department', valueGetter: (r) => r.department },
        {
          key: 'procurementPerson', label: 'Assigned To',
          valueGetter: (r) => r.procurementPerson?.firstName ? `${r.procurementPerson.firstName} ${r.procurementPerson.lastName}` : '-',
        },
        { key: 'allocatedBy', label: 'Allocated By', valueGetter: (r) => r.allocatedBy?.firstName ? `${r.allocatedBy.firstName} ${r.allocatedBy.lastName}` : '-' },
        { key: 'quoteId', label: 'Quote Id', valueGetter: (r) => r.quoteNo ?? r.jobId?.quoteId?.quoteId },
        { key: 'dealId', label: 'Deal Id', valueGetter: (r) => r.dealNo ?? r.jobId?.quoteId?.dealData?.dealId },
      ];
      return;
    }
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: '120px', valueGetter: (r) => r.approvedDate || r.createdAt },
      { key: 'customerName', label: 'Customer Name', sortable: true, valueGetter: (r) => r.customerId?.companyName },
      { key: 'purchaseNo', label: 'PR NO', sortable: true },
      { key: 'nextFollowUpDate', label: 'Next Follow-up', type: 'date', sortable: true, valueGetter: (r) => r.followUp?.nextFollowUpDate, cellClass: (r) => followUpCellClass(r.followUp?.nextFollowUpDate, false) },
      { key: 'jobId', label: 'Job ID', sortable: true, valueGetter: (r) => r.jobId?.jobId },
      {
        key: 'totalLpo', label: 'LPO Value', sortable: true,
        valueGetter: (r) => {
          const value = typeof r.totalLpo === 'number' ? r.totalLpo : parseFloat(r.totalLpo) || 0;
          const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return r.currency ? `${formatted} ${r.currency}` : formatted;
        },
      },
      { key: 'awarded', label: 'Awarded', align: 'right', valueGetter: (r) => { const a = this.awardStats(r, true); return a.total ? `${a.awarded}/${a.total}` : '-'; } },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '-' },
      {
        key: 'procurementPerson', label: 'Assigned To',
        valueGetter: (r) => r.procurementPerson?.firstName ? `${r.procurementPerson.firstName} ${r.procurementPerson.lastName}` : '-',
      },
      { key: 'allocatedBy', label: 'Allocated By', valueGetter: (r) => r.allocatedBy?.firstName ? `${r.allocatedBy.firstName} ${r.allocatedBy.lastName}` : '-' },
      {
        key: 'status', label: 'Status', type: 'badge', sortable: true,
        valueGetter: (r) => {
          if (r.status === 'New' || r.status === 'In Progress' || r.status === 'Rejected' || r.status === 'Revoked') return r.status;
          const v = String(r.overallStatus || r.status || 'Pending');
          return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
        },
        badgeClasses: STATUS_BADGE_CLASSES,
      },
    ];
  }

  /** Approved on the PR itself and no approval stage still waiting (the stage list reports lower-case statuses). */
  private isFullyApproved(r: any): boolean {
    return r.status === 'Approved' && String(r.overallStatus || 'approved').toLowerCase() === 'approved';
  }

  private isMine(r: any): boolean {
    return !!this.myId && String(r.allocatedTo?._id ?? r.allocatedTo ?? '') === this.myId;
  }

  /** Drafts and rejected requests go back to be fixed. */
  canEdit(r: any): boolean {
    return r.status === 'Rejected' || r.status === 'Revoked' || r.status === 'In Progress' || (r.status === 'New' && this.hasItems(r));
  }

  /** Every product line has an awarded supplier offer (done in Compare & award). */
  private allAwarded(r: any): boolean {
    const lines = (r.items ?? []).flatMap((item: any) => item.itemDetails ?? []).filter((d: any) => Number(d.quantity) > 0);
    return lines.length > 0 && lines.every((d: any) => this.isAllocated(d));
  }

  /** Same rule as the server's submit gate: short with a reason, or chosen suppliers priced and covering the quantity, or a priced default supplier. */
  private isAllocated(d: any): boolean {
    if (d.short && String(d.shortReason || '').trim()) return true;
    const won = (d.comparisons ?? []).filter((c: any) => c.selected);
    if (!won.length) return false;
    if (won.some((c: any) => !c.supplierId || !(Number(c.unitPrice) > 0))) return false;
    if (!won.some((c: any) => c.awardedQty)) return true;
    return won.reduce((sum: number, c: any) => sum + (Number(c.awardedQty) || Number(d.quantity) || 0), 0) + 0.0001 >= Number(d.quantity);
  }

  /** The request's supplier: the header one (general purchase), else the suppliers its lines are awarded to. */
  supplierLabel(r: any): string {
    if (r.supplierId?.supplierName) return r.supplierId.supplierName;
    const names = new Set<string>();
    (r.items ?? []).forEach((item: any) => (item.itemDetails ?? []).forEach((d: any) =>
      (d.comparisons ?? []).filter((c: any) => c.selected && c.supplierName).forEach((c: any) => names.add(c.supplierName))));
    if (!names.size) return '-';
    const list = [...names];
    return list.length <= 2 ? list.join(', ') : `${list[0]} +${list.length - 1} more`;
  }

  /** `explicitOnly` leaves out lines that only have the deal supplier as default, so the grid counts real awards. */
  awardStats(r: any, explicitOnly = false): { awarded: number; total: number } {
    const lines = (r.items ?? []).flatMap((item: any) => item.itemDetails ?? []).filter((d: any) => Number(d.quantity) > 0);
    return { awarded: lines.filter((d: any) => (d.comparisons ?? []).some((c: any) => c.selected)).length, total: lines.length };
  }

  /** The one thing this request is waiting on, shown in the grid and the details panel. */
  nextStep(r: any): string {
    if (this.canCreateFromJob(r)) return 'Create PR';
    if (r.status === 'New' || r.status === 'In Progress') {
      const { awarded, total } = this.awardStats(r);
      if (!total) return 'Add items';
      // RFQ is optional: a line with a chosen supplier can go straight to approval.
      if (awarded === total) return 'Send for approval';
      const offersIn = (r.items ?? []).some((item: any) => (item.itemDetails ?? []).some((d: any) => (d.comparisons ?? []).length));
      return offersIn ? 'Compare & award' : 'Pick supplier or send RFQ';
    }
    if (r.status === 'Rejected' || r.status === 'Revoked') return 'Fix and resubmit';
    if (r.status === 'Pending') return 'Awaiting approval';
    if (this.isFullyApproved(r)) return (r.remainingPoQuantity ?? 1) > 0 ? 'Initiate LPO' : 'Done';
    return '-';
  }

  /** Progress strip for the details panel. */
  flowSteps(r: any): { label: string; done: boolean }[] {
    const { awarded, total } = this.awardStats(r);
    const submitted = !['New', 'In Progress', 'Rejected', 'Revoked'].includes(r.status);
    const offersIn = (r.items ?? []).some((item: any) => (item.itemDetails ?? []).some((d: any) => (d.comparisons ?? []).length));
    return [
      { label: 'Created', done: total > 0 },
      { label: 'Offers in', done: offersIn || submitted },
      { label: `Awarded${total ? ` ${awarded}/${total}` : ''}`, done: (total > 0 && awarded === total) || submitted },
      { label: 'Submitted', done: submitted },
      { label: 'Approved', done: this.isFullyApproved(r) },
    ];
  }

  private hasItems(r: any): boolean {
    return Array.isArray(r.items) && r.items.length > 0;
  }

  private jobIdOf(r: any): string | null {
    return r.jobId?._id ?? (typeof r.jobId === 'string' ? r.jobId : null);
  }

  /** A New request is an allocated job with no PR yet; its buyer creates the PR from it. */
  canCreateFromJob(r: any): boolean {
    return r.status === 'New' && !this.hasItems(r) && !!this.jobIdOf(r) && (this.activeViewId === 'new' || this.isMine(r) || this.isSuperAdmin);
  }

  // Each action shows only where it applies, so a row never lists buttons it cannot use.
  private buildRowActions(): void {
    this.rowActions = [
      { id: 'followUp', label: 'Follow-ups', icon: 'chat', hidden: () => this.activeViewId === 'new' },
      { id: 'view', label: 'View PR', icon: 'eye', quick: true, hidden: () => this.activeViewId === 'new' },
      { id: 'viewJob', label: 'View Job', icon: 'eye', quick: true, hidden: (r) => this.activeViewId !== 'new' || !this.jobIdOf(r) },
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true, hidden: (r) => !this.canEdit(r) },
      { id: 'createPr', label: 'Create PR', icon: 'plus', quick: true, hidden: (r) => !this.canCreateFromJob(r) },
      { id: 'viewDetails', label: 'View details', icon: 'files', quick: true, hidden: (r) => r.status !== 'Pending' },
      { id: 'sendApproval', label: 'Send for approval', icon: 'send', quick: true, hidden: (r) => !['New', 'In Progress'].includes(r.status) || !this.hasItems(r) || !this.allAwarded(r) },
      // The PR drawer's POs step: one card per awarded supplier with Create PO / Place order.
      { id: 'pos', label: 'POs', icon: 'files', quick: true, hidden: (r) => !this.isFullyApproved(r) },
      {
        id: 'approve', label: 'Approve', icon: 'check', quick: true,
        hidden: (r) => !this.canDecide(r),
      },
      {
        id: 'reject', label: 'Reject', icon: 'close', quick: true,
        hidden: (r) => !this.canDecide(r),
      },
      { id: 'revoke', label: 'Revoke', icon: 'close', quick: true, variant: 'danger', hidden: (r) => r.status !== 'Approved' || !this.canApprovePR },
      { id: 'resetWorkflow', label: 'Reset Workflow', icon: 'refresh', hidden: (r) => r.status !== 'Pending' || !this.isSuperAdmin },
    ];
  }

  private statusesForView(viewId: string): string[] {
    switch (viewId) {
      case 'new': return NEW_STATUSES;
      case 'inProgress': return IN_PROGRESS_STATUSES;
      case 'rejected': return REJECTED_STATUSES;
      case 'revoked': return REVOKED_STATUSES;
      case 'pending': return PENDING_STATUSES;
      case 'readyToPo':
      case 'remainingPo':
      case 'completed':
        return APPROVED_STATUSES;
      default: return ALL_STATUSES;
    }
  }

  private allocationForView(viewId: string): 'new' | undefined {
    return viewId === 'new' ? viewId : undefined;
  }

  private poProgressForView(viewId: string): 'ready' | 'remaining' | 'completed' | undefined {
    if (viewId === 'readyToPo') return 'ready';
    if (viewId === 'remainingPo') return 'remaining';
    if (viewId === 'completed') return 'completed';
    return undefined;
  }

  /** PR list stays scoped to job-linked requests; General has its own page under PO. */
  private sourceTypeForView(viewId: string): SourceType | undefined {
    return viewId === 'new' ? undefined : 'job';
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;
    this.activeViewId = query.viewId || 'all';

    this.getPurchases();
    this.updateUrlParams();
  }

  getPurchases(): void {
    this.isLoading = true;

    const filterParams = {
      page: this.page,
      row: this.row,
      status: this.statusesForView(this.activeViewId),
      search: this.searchQuery || undefined,
      sortKey: this.sortKey || undefined,
      sortDir: this.sortDir || undefined,
      sourceType: this.sourceTypeForView(this.activeViewId),
      poProgress: this.poProgressForView(this.activeViewId),
      allocation: this.allocationForView(this.activeViewId),
      followUpView: this.activeViewId === 'followUp' ? 'followUp' : undefined,
    };

    this.subscriptions.add(
      this.purchaseService.getPurchases(filterParams).subscribe({
        next: (response) => {
          this.rows = response.purchase.data;
          this.historyCache.clear();
          this.total = response.purchase.total ?? 0;
          this.isLoading = false;
        },
        error: (error) => {
          this.notificationService.error('Failed to load purchases');
          console.error('Error loading purchases:', error);
          this.isLoading = false;
        },
      })
    );

    this.loadViewCounts();
  }

  private loadViewCounts(): void {
    // The New count is always fetched so a buyer with allocated jobs gets the tab.
    const countViews = [...this.baseViews, this.newView];
    this.subscriptions.add(
      this.purchaseService.getPurchaseCounts({
        search: this.searchQuery || undefined,
        views: countViews.map((view) => ({
          id: view.id,
          status: this.statusesForView(view.id),
          sourceType: this.sourceTypeForView(view.id),
          poProgress: this.poProgressForView(view.id),
          allocation: this.allocationForView(view.id),
          followUpView: view.id === 'followUp' ? 'followUp' : undefined,
        })),
      }).subscribe({
        next: ({ counts }) => {
          this.baseViews = this.baseViews.map((view) => ({
            ...view,
            count: counts[view.id] ?? view.count ?? 0,
          }));
          this.newCount = counts['new'] ?? this.newCount;
          this.refreshViews();
        },
        error: (error) => console.error('Error loading view counts:', error),
      })
    );
  }

  private refreshViews(): void {
    const showNew = true;
    this.views = [
      ...(showNew ? [{ ...this.newView, count: this.newCount }] : []),
      ...this.baseViews,
    ];
  }

  updateUrlParams(): void {
    const queryParams: any = {
      page: this.page !== 1 ? this.page : null,
      row: this.row !== 15 ? this.row : null,
      search: this.searchQuery || null,
      view: this.activeViewId && this.activeViewId !== 'all' ? this.activeViewId : null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'followUp':
        this.grid.activeTab = 'followups';
        this.grid.openRow(row);
        break;
      case 'view':
        this.openFullPurchase(row);
        break;
      case 'viewJob':
        this.router.navigate(['/job-sheet/view', this.jobIdOf(row)], { state: { returnUrl: this.router.url } });
        break;
      case 'edit':
        this.onEditPr(row);
        break;
      case 'pos':
        this.onEditPr(row);
        break;
      case 'viewDetails':
        this.onEditPr(row, undefined, true);
        break;
      case 'sendApproval':
        void this.sendForApproval(row);
        break;
      case 'approve':
        void this.decide(row, 'approved');
        break;
      case 'reject':
        void this.decide(row, 'rejected');
        break;
      case 'createPr':
        this.onCreatePrForJob(row);
        break;
      case 'resetWorkflow':
        this.resetWorkflow(row);
        break;
      case 'revoke':
        void this.revoke(row);
        break;
    }
  }

  /** A pending PR can be decided by someone allowed to approve, except the person who raised it. */
  private canDecide(r: any): boolean {
    if (r.status !== 'Pending' || !this.canApprovePR) return false;
    if (this.isSuperAdmin) return true;
    const creator = r.createdBy?._id ?? r.createdBy;
    return !(creator && creator === this.myId);
  }

  resetWorkflow(row: any): void {
    const data: ResetWorkflowModalData = {
      jobId: row._id,
      context: row.purchaseNo,
      contextLabel: 'Purchase request',
      description: 'Tick the approval stages that get another chance on this purchase request. Unticked stages are skipped for this request only.',
      stages: this.prWorkflowSteps,
      restart: (ids) => this.purchaseService.resetPurchaseWorkflow(row._id, ids),
    };
    this.modal.open<boolean>(ResetWorkflowComponent, { width: '520px', data })
      .afterClosed().subscribe((reset) => { if (reset) this.getPurchases(); });
  }

  /** Moves a saved New PR to Pending without opening the drawer. */
  async sendForApproval(row: any): Promise<void> {
    if (!this.hasItems(row)) {
      this.notificationService.error('Add at least one item before sending for approval');
      return;
    }
    if (!this.allAwarded(row)) {
      this.notificationService.error('Award every product in Compare & award before sending for approval');
      return;
    }
    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Send for approval',
      message: 'This purchase request will move to Pending for approval.',
      details: [{ label: 'PR No', value: row.purchaseNo || '-' }],
      confirmLabel: 'Send',
    });
    if (!confirmed) return;
    this.subscriptions.add(
      this.purchaseService.updatePurchase(row._id, { status: 'Pending' } as any).subscribe({
        next: () => {
          this.notificationService.success('Sent for approval');
          // The open detail panel shows the new status at once instead of In Progress until the reload lands.
          row.status = 'Pending';
          this.getPurchases();
        },
        error: (error) => this.notificationService.error(error?.error?.message || 'Failed to send for approval'),
      })
    );
  }

  async decide(row: any, status: 'approved' | 'rejected'): Promise<void> {
    const approve = status === 'approved';
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: approve ? 'approve' : 'reject',
      title: approve ? 'Approve purchase request' : 'Reject purchase request',
      message: approve ? 'Your approval moves this purchase request on.' : 'This purchase request will be sent back to its creator.',
      details: [{ label: 'PR No', value: row.purchaseNo || '-' }],
      confirmLabel: approve ? 'Approve' : 'Reject',
      reason: approve ? 'optional' : true,
      reasonLabel: approve ? 'Approval comment' : 'Rejection reason',
    });
    if (!confirmed) return;
    if (!approve && !reason?.trim()) {
      this.notificationService.error('Rejection reason is required');
      return;
    }
    this.subscriptions.add(
      this.purchaseService.updatePurchaseStatus(row._id, status, reason ?? '').subscribe({
        next: () => {
          this.notificationService.success(approve ? 'Purchase approved successfully' : 'Purchase rejected successfully');
          this.getPurchases();
        },
        error: (error) => this.notificationService.error(error?.error?.message || `Failed to ${approve ? 'approve' : 'reject'} purchase`),
      })
    );
  }

  /** Takes an approved PR back out of approval so it can be edited and sent again. */
  async revoke(row: any): Promise<void> {
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Revoke purchase request',
      message: 'This approved purchase request goes back to its creator to be edited and sent for approval again. Products already on a purchase order keep their quantity and ordered suppliers; the rest can change.',
      details: [{ label: 'PR No', value: row.purchaseNo || '-' }],
      confirmLabel: 'Revoke',
      reason: true,
      reasonLabel: 'Revoke reason',
    });
    if (!confirmed) return;
    if (!reason?.trim()) {
      this.notificationService.error('Revoke reason is required');
      return;
    }
    this.subscriptions.add(
      this.purchaseService.revokePurchase(row._id, reason.trim()).subscribe({
        next: () => {
          this.notificationService.success('Purchase request revoked');
          this.getPurchases();
        },
        error: (error) => this.notificationService.error(error?.error?.message || 'Failed to revoke purchase request'),
      })
    );
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  openFullPurchase(row: any, event?: Event): void {
    event?.stopPropagation();
    // A New row is an allocated job with no PR yet, so "Job view" opens the job, not a purchase.
    if (row.status === 'New' && !this.hasItems(row) && this.jobIdOf(row)) {
      this.router.navigate(['/job-sheet/view', this.jobIdOf(row)], { state: { returnUrl: this.router.url } });
      return;
    }
    this.router.navigate(['/purchase/view-purchase', row._id]);
  }

  prTitle = (r: any) => r.purchaseNo ?? '';
  prSubtitle = (r: any) => r.customerId?.companyName ?? '';

  formatAmount(row: any): string {
    const value = typeof row?.totalLpo === 'number' ? row.totalLpo : parseFloat(row?.totalLpo) || 0;
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return row?.currency ? `${formatted} ${row.currency}` : formatted;
  }

  private itemRowsCache = new WeakMap<object, Record<string, any>[]>();

  /** Cached per PR: a fresh array every change-detection pass would rebuild the table rows and dismiss the hover tooltip. */
  itemRows(row: any): Record<string, any>[] {
    const cached = this.itemRowsCache.get(row);
    if (cached) return cached;
    const rows = this.buildItemRows(row);
    this.itemRowsCache.set(row, rows);
    return rows;
  }

  /** Footer under the items: total, the PR's supplier discount, then net total. */
  itemFootRows(row: any): DetailFootRow[] {
    const total = this.itemRows(row).reduce((s, r) => s + (Number(r['amount']) || 0), 0);
    const discount = Number(row?.supplierDiscounts?.totalDiscount) || 0;
    const cell = (value: number) => ({ amount: { value, format: 'currency' as const } });
    return [
      { label: 'Total', cells: cell(total) },
      { label: 'Discount', cells: cell(discount) },
      { label: 'Net Total', cells: cell(Math.max(total - discount, 0)), emphasis: true },
    ];
  }

  private buildItemRows(row: any): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    const source = row.items?.length ? row.items : row.dealItems ?? [];
    source.forEach((item: any) => {
      (item.itemDetails ?? []).forEach((d: any) => {
        const won = (d.comparisons ?? []).find((c: any) => c.selected);
        // The base unit cost, never the awarded supplier's price.
        const base = Number(d.dealUnitCost) > 0 ? Number(d.dealUnitCost) : d.unitCost;
        rows.push({ item: String(d.detail ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), award: won ? 'Awarded' : 'Not awarded', qty: d.quantity, unitPrice: d.unitSellingPrice ?? 0, price: base, amount: (d.quantity ?? 0) * (base ?? 0) });
      });
    });
    return rows;
  }

  /** The PR's life as one vertical journey: created, allocated, drafted, then each approval step. */
  approvalJourney(row: any): ApprovalJourneyStage[] {
    const name = (p: any) => (p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '');
    const when = (d: any) => (d ? this.datePipe.transform(d, 'dd MMM yyyy, h:mm a') ?? '' : '');
    const join = (...parts: any[]) => parts.filter(Boolean).join(' · ');
    const stages: ApprovalJourneyStage[] = [];
    const add = (variant: ApprovalJourneyStage['variant'], icon: string, title: string, subtitle?: string) =>
      stages.push({ key: `pr-${stages.length}`, variant, icon, title, subtitle: subtitle || undefined });

    // A New-tab job has no request yet: say what it is waiting for instead of claiming a PR was created.
    const noPrYet = row.status === 'New' && !this.hasItems(row);
    add('done', 'check_circle', noPrYet ? 'Job ready for purchase' : 'Purchase request created', join(name(row.createdBy), when(row.createdAt)));

    if (row.allocatedTo && row.allocatedAt) {
      add('done', 'check_circle', `Allocated to ${name(row.procurementPerson) || 'procurement person'}`, join(row.allocatedBy ? `By ${name(row.allocatedBy)}` : '', when(row.allocatedAt)));
    }

    if (row.status === 'New' || row.status === 'In Progress') {
      add('current', 'schedule', noPrYet
        ? `Waiting for ${name(row.procurementPerson) || 'the allocated person'} to create the PR`
        : 'Purchase request in progress');
    }
    if (noPrYet) {
      add('stage', 'schedule', 'Approval', 'Starts once the PR is sent for approval');
      return stages;
    }

    (row.approvalStatus ?? []).forEach((approval: any, i: number, all: any[]) => {
      const status = approval.status || 'pending';
      const firstPending = status === 'pending' && all.findIndex((a) => (a.status || 'pending') === 'pending') === i;
      const title = approval.managerApproval ? 'Manager approval' : (approval.role?.categoryName || `Approval step ${approval.step}`);
      add(
        status === 'approved' ? 'done' : status === 'rejected' ? 'rejected' : firstPending ? 'current' : 'stage',
        status === 'approved' ? 'check_circle' : status === 'rejected' ? 'close' : 'schedule',
        title,
        approval.updatedBy
          ? join(`${status === 'approved' ? 'Approved' : 'Rejected'} by ${name(approval.updatedBy)}`, when(approval.updatedDate || approval.updatedAt))
          : 'Waiting for approval',
      );
    });
    return stages;
  }

  /** Same figures as the Summary on the PR view page. */
  private prSummaryFields(row: any, money: (v: number) => string): DetailOverviewSection['fields'] {
    const num = (v: any) => Number(v) || 0;
    const deal = row.jobId?.quoteId?.dealData;
    const price = dealSheetPriceDetails(deal?.updatedItems, deal?.additionalCosts, deal?.totalDiscount);
    const sumOf = (type: string) => (deal?.additionalCosts || []).filter((c: any) => c.type === type).reduce((s: number, c: any) => s + num(c.value), 0);
    const customerDiscount = num(deal?.totalDiscount) + sumOf('Customer Discount');
    const jobCostDiscount = sumOf('Supplier Discount');
    let grossCost = 0;
    const suppliers = new Set<string>();
    const idOf = (ref: any): string => String(ref && typeof ref === 'object' ? ref._id : ref ?? '');
    for (const item of row.items || []) {
      for (const d of item.itemDetails || []) {
        const won = (d.comparisons || []).filter((c: any) => c.selected);
        for (const c of won) { grossCost += num(c.unitPrice) * num(c.quantity); suppliers.add(idOf(c.supplierId)); }
        if (!won.length) suppliers.add(idOf(d.supplierId));
      }
    }
    const extras = Array.isArray(row.additionalCosts)
      ? row.additionalCosts
      : (deal?.additionalCosts || []).filter((c: any) => (c.type || 'Additional Cost') === 'Additional Cost');
    const prExtra = extras.reduce((s: number, c: any) => s + num(c.value), 0);
    const saved: any[] = row.supplierDiscounts?.suppliers || [];
    const discRows = saved.length ? saved : (deal?.additionalCosts || []).filter((c: any) => c.type === 'Supplier Discount' && c.supplierId).map((c: any) => ({ supplierId: c.supplierId, discount: c.value }));
    const prDiscount = discRows.filter((d: any) => suppliers.has(idOf(d.supplierId))).reduce((s: number, d: any) => s + num(d.discount), 0);
    const f = (label: string, v: number) => ({ type: 'field' as const, label, value: money(v), numeric: true, noHover: true });
    return [
      f('Total Price', price.totalSellingPrice + customerDiscount),
      f('Discount', customerDiscount),
      f('Net Total Price', price.totalSellingPrice),
      f('Total Cost', price.totalCost + jobCostDiscount),
      f('Cost Discount', jobCostDiscount),
      f('Net Total Cost', price.totalCost),
      f('Total PR Cost', grossCost + prExtra),
      f('PR Cost Discount', prDiscount),
      f('Net PR Total Cost', grossCost + prExtra - prDiscount),
    ];
  }

  overviewSections(row: any): DetailOverviewSection[] {
    const isNewJob = row.status === 'New' && !this.hasItems(row);
    const money = (v: number) => `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${row.currency ?? ''}`.trim();
    const person = (p: any) => p?.firstName ? `${p.firstName} ${p.lastName ?? ''}`.trim() : '-';
    if (isNewJob) {
      const d = row.dealSummary ?? {};
      const sum = (key: string) => ({ type: 'field' as const, label: '', value: money(Number(d[key]) || 0), numeric: true, noHover: true });
      const line = (label: string, key: string) => ({ ...sum(key), label });
      return [
        {
          title: 'General',
          columns: '2',
          fields: [
            { type: 'field', label: 'PR No', value: row.purchaseNo, numeric: true },
            { type: 'dg', key: 'status' },
            { type: 'field', label: 'Customer', value: row.customerId?.companyName },
            { type: 'field', label: 'Job ID', value: row.jobId?.jobId },
            { type: 'field', label: 'Date', value: this.datePipe.transform(row.approvedDate || row.createdAt, 'dd MMM yyyy') },
            { type: 'field', label: 'Sales Person', value: row.salesPerson || '-' },
            { type: 'field', label: 'Allocated By', value: person(row.allocatedBy) },
            { type: 'field', label: 'Procurement Person', value: person(row.procurementPerson) },
          ],
        },
        {
          title: 'Summary',
          columns: '2',
          fields: [
            line('Total Price', 'totalPrice'),
            line('Discount', 'discount'),
            line('Net Total Price', 'netTotalPrice'),
            line('Total Cost', 'totalCost'),
            line('Additional Cost', 'additionalCost'),
            line('Supplier Discount', 'supplierDiscount'),
            line('Net Total Cost', 'netTotalCost'),
          ],
        },
      ];
    }
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'PR No', value: row.purchaseNo, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Customer', value: row.customerId?.companyName },
          { type: 'field', label: 'Job ID', value: row.jobId?.jobId },
          ...(isNewJob ? [] : [{ type: 'field' as const, label: 'Supplier', value: this.supplierLabel(row) }]),
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.approvedDate || row.createdAt, 'dd MMM yyyy') },
          { type: 'field', label: 'Created By', value: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '-' },
          { type: 'field', label: 'Procurement Person', value: row.procurementPerson?.firstName ? `${row.procurementPerson.firstName} ${row.procurementPerson.lastName}` : '-' },
          ...(row.status === 'Rejected' && row.rejectedReason?.length
            ? [{ type: 'field' as const, label: 'Rejection Note', value: row.rejectedReason[row.rejectedReason.length - 1]?.comment || '-' }]
            : []),
        ],
      },
      {
        title: 'Summary',
        columns: '2',
        fields: this.prSummaryFields(row, money),
      },
    ];
  }


  private readonly followUpViewFor = followUpViewer();

  followUpView(row: any): FollowUpViewModel {
    return this.followUpViewFor(row, row.followUp, false);
  }

  onScheduleFollowUp(row: any): void {
    const open = this.followUpView(row).open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.purchaseNo || row._id, mode: 'schedule', dueDate: open?.dueIso || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(row, this.purchaseService.schedulePurchaseFollowUp(row._id as string, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
    });
  }

  onLogFollowUp(row: any): void {
    const open = this.followUpView(row).open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.purchaseNo || row._id, mode: 'complete', plannedFor: open?.due || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(row, this.purchaseService.schedulePurchaseFollowUp(row._id as string, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
      else if (result?.mode === 'complete') {
        this.saveFollowUp(row, this.purchaseService.completePurchaseFollowUp(row._id as string, {
          date: result.date, outcome: result.outcome, note: result.note, nextFollowUpDate: result.nextFollowUpDate,
        }), 'Follow-up logged');
      }
    });
  }

  async onCancelFollowUp(row: any): Promise<void> {
    const open = this.followUpView(row).open;
    if (!open) return;
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'warning',
      title: 'Cancel Follow-up',
      message: 'Close this follow-up without logging an outcome?',
      details: [{ label: 'Planned for', value: open.due }],
      reason: 'optional',
      confirmLabel: 'Cancel follow-up',
      cancelLabel: 'Keep',
    });
    if (!confirmed) return;
    this.saveFollowUp(row, this.purchaseService.cancelPurchaseFollowUp(row._id as string, reason), 'Follow-up cancelled');
  }

  private followUpSaving = false;

  private saveFollowUp(row: any, request: Observable<{ success: boolean; followUp: any }>, successMessage: string): void {
    if (this.followUpSaving) return;
    this.followUpSaving = true;
    request.subscribe({
      next: (response) => {
        row.followUp = response.followUp;
        this.followUpSaving = false;
        this.notificationService.success(successMessage);
        // The Follow Up view depends on the new date, so reload it.
        if (this.activeViewId === 'followUp') this.getPurchases();
        else { this.rows = [...this.rows]; this.loadViewCounts(); }
      },
      error: (err) => {
        this.followUpSaving = false;
        this.notificationService.error(err?.error?.message || 'Failed to save follow-up');
      },
    });
  }


  eventsFor(row: any): Observable<Events[]> {
    let subject = this.eventsCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<Events[]>([]);
      this.eventsCache.set(row._id, subject);
      this._eventsService.fetchEvents(row._id).subscribe((events: Events[]) => subject!.next(events || []));
    }
    return subject.asObservable();
  }


  eventItems(events: Events[]): DetailTaskItem[] {
    return (events || []).map((event) => ({
      id: event._id,
      title: event.event,
      kind: 'event' as const,
      date: event.date as any,
      done: event.status === 'completed' || event.status === 'success',
      eventStatus: (event.status || 'pending') as DetailTaskItem['eventStatus'],
      outcomeable: true,
      assignee: event.employee ? `Assigned to ${[event.employee.firstName, event.employee.lastName].filter(Boolean).join(' ') || event.employee.fullName || ''}`.trim() : undefined,
      description: event.summary,
      deletable: this.isEventCreator(event.createdBy),
      attachments: (event.eventFiles || []).map((file) => ({ id: file.fileName, name: file.originalname })),
    }));
  }

  private isEventCreator(createdBy: any): boolean {
    const employeeId = this.myId;
    if (!employeeId || !createdBy) return false;
    const creatorId = typeof createdBy === 'string' ? createdBy : createdBy._id || createdBy;
    return employeeId == creatorId;
  }

  onAddEvent(row: any): void {
    this.modal.open<EventModalResult>(EventCreateModalComponent, {
      width: '560px',
      data: {
        context: row.purchaseNo || row._id,
        requireSummary: true,
        outlookSync: true,
      },
    }).afterClosed().subscribe((event) => {
      if (!event) return;
      const formData = new FormData();
      formData.append('eventData', JSON.stringify({
        from: 'Purchase',
        collectionId: row._id,
        event: event.title,
        date: event.date,
        endDate: event.endDate,
        summary: event.description,
        location: event.location,
        syncToOutlook: event.syncToOutlook,
        onlineMeeting: event.onlineMeeting,
        attendees: event.attendees,
      }));
      this._eventsService.newEvent(formData, !!event.syncToOutlook).subscribe({
        next: (response) => {
          if (response?.outlookWarning) this.notificationService.warning(response.outlookWarning);
          if (response?.event) {
            this.notificationService.success(response.message || 'Event created successfully');
            this.eventsCache.delete(row._id);
            this.eventsFor(row);
            this.historyCache.delete(row._id);
          }
        },
        error: () => this.notificationService.error('Failed to create event'),
      });
    });
  }

  onToggleEvent(row: any, item: DetailTaskItem): void {
    if (item.done) return;
    this._eventsService.eventStatus(item.id, 'completed').subscribe((response: any) => {
      if (response.success === true) {
        this.notificationService.success('Event completion updated');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.map((event) => event._id === item.id ? { ...event, status: 'completed' } : event));
      }
    });
  }

  async onEventOutcome(row: any, item: DetailTaskItem, status: 'success' | 'cancelled'): Promise<void> {
    const success = status === 'success';
    const { confirmed } = await this.confirmDialog.open({
      tone: success ? 'approve' : 'reject',
      title: success ? 'Mark Event Successful' : 'Cancel Event',
      message: success ? 'Mark this event as successful?' : 'Mark this event as cancelled?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: success ? 'Mark successful' : 'Cancel event',
      cancelLabel: 'Keep as is',
    });
    if (!confirmed) return;
    this._eventsService.eventStatus(item.id, status).subscribe((response: any) => {
      if (response.success === true) {
        this.notificationService.success(success ? 'Event marked successful' : 'Event cancelled');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.map((event) => event._id === item.id ? { ...event, status } : event));
      }
    });
  }

  async onDeleteEvent(row: any, item: DetailTaskItem): Promise<void> {
    const { confirmed } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    if (!confirmed) { return; }
    this._eventsService.eventDelete(item.id).subscribe((response: any) => {
      if (response.success) {
        this.notificationService.success('Event Deleted');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.filter((event) => event._id !== item.id));
      }
    });
  }

  onPreviewEventFile(file: { id: string; name: string }): void {
    this._enquiryService.downloadFile(file.id).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const fileContent = new Blob([event.body], { type: event.body.type || 'application/octet-stream' });
          const fileUrl = URL.createObjectURL(fileContent);
          window.open(fileUrl, '_blank');
          setTimeout(() => URL.revokeObjectURL(fileUrl), 10000);
        }
      },
      error: () => this.notificationService.error('An error occurred while trying to preview the file.'),
    });
  }

  async onDeleteEventFile(row: any, item: DetailTaskItem, file: { id: string; name: string }): Promise<void> {
    const { confirmed } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Delete file',
      message: 'Are you sure you want to delete this file?',
      details: [{ label: 'File', value: file.name }],
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this._eventsService.eventFileDelete(item.id, file.id).subscribe((response: any) => {
      if (response.success) {
        this.notificationService.success('File Deleted');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.map((event) => event._id === item.id
          ? { ...event, eventFiles: (event.eventFiles || []).filter((eventFile) => eventFile.fileName !== file.id) }
          : event));
      }
    });
  }


  // --- Create PR drawer ---------------------------------------------------------

  /** Mounted only while open, so each opening starts the form fresh. */
  createDrawerOpen = false;

  /** Drawer opened from a New row: the job is preselected, so the buyer only fills in the items. */
  createDrawerJobId: string | null = null;

  onCreatePrForJob(row: any, event?: Event): void {
    event?.stopPropagation();
    this.createDrawerJobId = this.jobIdOf(row);
    this.createDrawerOpen = true;
  }

  onCreateDrawerSaved(): void {
    this.getPurchases();
  }

  onCreateDrawerClosed(): void {
    this.createDrawerOpen = false;
    this.createDrawerJobId = null;
  }

  // --- Edit PR drawer -------------------------------------------------------------

  /** Mounted only while open, so each opening starts from a fresh load of that PR. */
  editDrawerOpen = false;
  editDrawerPurchaseId: string | null = null;
  /** Opened from "View details" on a PR sent for approval: read-only, Close only. */
  editDrawerViewOnly = false;

  onEditPr(row: any, event?: Event, viewOnly = false): void {
    event?.stopPropagation();
    this.editDrawerPurchaseId = row._id;
    this.editDrawerViewOnly = viewOnly;
    this.editDrawerOpen = true;
  }

  /** Rows and the open detail panel show Pending at once instead of their old status until the reload lands. */
  onDrawerSubmitted(id: string): void {
    const row = this.rows.find((r) => r._id === id);
    if (row) row.status = 'Pending';
  }

  onEditDrawerSaved(): void {
    this.getPurchases();
  }

  onEditDrawerClosed(): void {
    this.editDrawerOpen = false;
    this.editDrawerPurchaseId = null;
    this.editDrawerViewOnly = false;
  }
}
