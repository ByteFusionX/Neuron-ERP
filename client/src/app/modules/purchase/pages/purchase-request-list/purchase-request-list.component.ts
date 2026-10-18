import { InitiateLpoComponent } from 'src/app/modules/purchase-order/pages/initiate-lpo/initiate-lpo.component';
import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
import { DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { CreatePurchaseComponent } from '../create-purchase/create-purchase.component';
import { ModalService } from 'src/app/shared/components/modal';
import { ResetWorkflowComponent, ResetWorkflowModalData } from 'src/app/modules/presales/pages/reset-workflow/reset-workflow.component';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';

type SourceType = 'job' | 'manual';

const ALL_STATUSES = ['In Progress', 'Pending', 'Drafted', 'Rejected', 'Approved'];
const PENDING_STATUSES = ['Pending'];
const APPROVED_STATUSES = ['Approved'];
// A job allocated to a buyer starts as New; once the buyer saves the PR it is In Progress, then Pending, then Approved.
const NEW_STATUSES = ['New'];
const IN_PROGRESS_STATUSES = ['In Progress'];
const REJECTED_STATUSES = ['Rejected'];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  New: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  'In Progress': 'bg-indigo-50 text-indigo-700 ring-indigo-200 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900 dark:border-indigo-900',
  Drafted: 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  Rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
};

const PR_VIEW_IDS = ['new', 'inProgress', 'rejected', 'all', 'pending', 'readyToPo', 'remainingPo', 'completed'];

@Component({
  selector: 'app-purchase-request-list',
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, ApprovalJourneyComponent, ActionButtonComponent, InitiateLpoComponent, CreatePurchaseComponent],
  providers: [DatePipe],
  templateUrl: './purchase-request-list.component.html',
  styleUrl: './purchase-request-list.component.css',
})
export class PurchaseRequestListComponent {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private employeeService = inject(EmployeeService);
  private confirmDialog = inject(ConfirmDialogService);
  private modal = inject(ModalService);
  private workflowService = inject(WorkflowService);
  private prWorkflowSteps: { id: string; label: string }[] = [];
  private subscriptions = new Subscription();

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'approval', label: 'Approval', icon: 'activity' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  rows: any[] = [];
  total = 0;
  isLoading = false;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PR' }];
  /** Jobs allocated to the signed-in buyer, waiting for their PR; the tab shows only while there are some. */
  private readonly newView: DataGridView<any> = { id: 'new', label: 'New', hidePill: true };
  private baseViews: DataGridView<any>[] = [
    { id: 'all', label: 'All', hidePill: true },
    { id: 'inProgress', label: 'In Progress' },
    { id: 'pending', label: 'Pending' },
    { id: 'readyToPo', label: 'Ready to PO' },
    { id: 'remainingPo', label: 'Remaining PO' },
    { id: 'completed', label: 'Completed' },
    { id: 'rejected', label: 'Rejected' },
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
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: '120px', valueGetter: (r) => r.approvedDate || r.createdAt },
      { key: 'customerName', label: 'Customer Name', sortable: true, valueGetter: (r) => r.customerId?.companyName },
      { key: 'purchaseNo', label: 'PR NO', sortable: true },
      { key: 'jobId', label: 'Job ID', sortable: true, valueGetter: (r) => r.jobId?.jobId },
      {
        key: 'totalLpo', label: 'LPO Value', sortable: true,
        valueGetter: (r) => {
          const value = typeof r.totalLpo === 'number' ? r.totalLpo : parseFloat(r.totalLpo) || 0;
          const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return r.currency ? `${formatted} ${r.currency}` : formatted;
        },
      },
      { key: 'selectedPrQuantity', label: 'PR Qty', align: 'right', valueGetter: (r) => r.selectedPrQuantity ?? '-' },
      { key: 'issuedPoQuantity', label: 'PO Qty', align: 'right', valueGetter: (r) => r.issuedPoQuantity ?? '-' },
      { key: 'remainingPoQuantity', label: 'Remaining', align: 'right', valueGetter: (r) => r.remainingPoQuantity ?? '-' },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '-' },
      { key: 'supplier', label: 'Supplier', valueGetter: (r) => r.supplierId?.supplierName || '-' },
      {
        key: 'procurementPerson', label: 'Allocated To',
        valueGetter: (r) => r.procurementPerson?.firstName ? `${r.procurementPerson.firstName} ${r.procurementPerson.lastName}` : '-',
      },
      { key: 'allocatedBy', label: 'Allocated By', valueGetter: (r) => r.allocatedBy?.firstName ? `${r.allocatedBy.firstName} ${r.allocatedBy.lastName}` : '-' },
      {
        key: 'status', label: 'Status', type: 'badge', sortable: true,
        valueGetter: (r) => {
          if (r.status === 'Drafted' || r.status === 'New' || r.status === 'In Progress' || r.status === 'Rejected') return r.status;
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
    return r.status === 'Drafted' || r.status === 'In Progress' || r.status === 'Rejected' || (r.status === 'New' && this.hasItems(r));
  }

  /** Every product line has an awarded supplier offer (done in Compare & award). */
  private allAwarded(r: any): boolean {
    const lines = (r.items ?? []).flatMap((item: any) => item.itemDetails ?? []).filter((d: any) => Number(d.quantity) > 0);
    return lines.length > 0 && lines.every((d: any) => (d.comparisons ?? []).some((c: any) => c.selected));
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
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true, hidden: (r) => !this.canEdit(r) },
      { id: 'createPr', label: 'Create PR', icon: 'plus', quick: true, hidden: (r) => !this.canCreateFromJob(r) },
      { id: 'sendApproval', label: 'Send for approval', icon: 'send', quick: true, hidden: (r) => r.status !== 'In Progress' || !this.allAwarded(r) },
      {
        id: 'initiateLpo', label: 'Initiate LPO', icon: 'send', quick: true,
        hidden: (r) => !this.isFullyApproved(r),
      },
      {
        id: 'approve', label: 'Approve', icon: 'check', quick: true,
        hidden: (r) => !this.canDecide(r),
      },
      {
        id: 'reject', label: 'Reject', icon: 'close',
        hidden: (r) => !this.canDecide(r),
      },
      { id: 'resetWorkflow', label: 'Reset Workflow', icon: 'refresh', quick: true, hidden: (r) => r.status !== 'Pending' || !this.isSuperAdmin },
    ];
  }

  private statusesForView(viewId: string): string[] {
    switch (viewId) {
      case 'new': return NEW_STATUSES;
      case 'inProgress': return IN_PROGRESS_STATUSES;
      case 'rejected': return REJECTED_STATUSES;
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
    };

    this.subscriptions.add(
      this.purchaseService.getPurchases(filterParams).subscribe({
        next: (response) => {
          this.rows = response.purchase.data;
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
    const requests = countViews.reduce((acc, view) => {
      acc[view.id] = this.purchaseService.getPurchases({
        page: 1,
        row: 1,
        status: this.statusesForView(view.id),
        search: this.searchQuery || undefined,
        sourceType: this.sourceTypeForView(view.id),
        poProgress: this.poProgressForView(view.id),
        allocation: this.allocationForView(view.id),
      }).pipe(catchError(() => of(null)));
      return acc;
    }, {} as Record<string, Observable<any>>);

    this.subscriptions.add(
      forkJoin(requests).subscribe({
        next: (results) => {
          this.baseViews = this.baseViews.map((view) => ({
            ...view,
            count: results[view.id]?.purchase?.total ?? view.count ?? 0,
          }));
          this.newCount = results['new']?.purchase?.total ?? this.newCount;
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
      case 'initiateLpo':
        this.openInitiateLpo(row._id);
        break;
      case 'edit':
        this.onEditPr(row);
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

  /** Moves a saved In Progress PR to Pending without opening the drawer. */
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

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  openFullPurchase(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/view-purchase', row._id]);
  }

  prTitle = (r: any) => r.purchaseNo ?? '';
  prSubtitle = (r: any) => r.customerId?.companyName ?? '';

  formatAmount(row: any): string {
    const value = typeof row?.totalLpo === 'number' ? row.totalLpo : parseFloat(row?.totalLpo) || 0;
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return row?.currency ? `${formatted} ${row.currency}` : formatted;
  }

  itemRows(row: any): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    (row.items ?? []).forEach((item: any) => {
      (item.itemDetails ?? []).forEach((d: any) => {
        rows.push({ item: d.detail, qty: d.quantity, price: d.unitCost, amount: (d.quantity ?? 0) * (d.unitCost ?? 0) });
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

    add('done', 'check_circle', 'Purchase request created', join(name(row.createdBy), when(row.createdAt)));

    if (row.allocatedTo && row.allocatedAt) {
      add('done', 'check_circle', `Allocated to ${name(row.procurementPerson) || 'buyer'}`, join(row.allocatedBy ? `By ${name(row.allocatedBy)}` : '', when(row.allocatedAt)));
    }

    if (row.status === 'New') {
      add('current', 'schedule', 'Waiting for the buyer to create the purchase request');
    } else if (row.status === 'In Progress' || row.status === 'Drafted') {
      add('current', 'schedule', 'Being prepared by the buyer');
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

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'PR No', value: row.purchaseNo, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Customer', value: row.customerId?.companyName },
          { type: 'field', label: 'Job ID', value: row.jobId?.jobId },
          { type: 'field', label: 'Supplier', value: row.supplierId?.supplierName || '-' },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.approvedDate || row.createdAt, 'dd MMM yyyy') },
          { type: 'field', label: 'Created By', value: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '-' },
          { type: 'field', label: 'Procurement Person', value: row.procurementPerson?.firstName ? `${row.procurementPerson.firstName} ${row.procurementPerson.lastName}` : '-' },
          { type: 'field', label: 'Remaining PO Qty', value: row.remainingPoQuantity ?? 0, numeric: true, noHover: true },
        ],
      },
      {
        title: 'Overview',
        fields: [
          { type: 'field', label: 'LPO Value', value: `${(row.totalLpo ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${row.currency ?? ''}`, numeric: true, noHover: true },
        ],
      },
    ];
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

  onEditPr(row: any, event?: Event): void {
    event?.stopPropagation();
    this.editDrawerPurchaseId = row._id;
    this.editDrawerOpen = true;
  }

  onEditDrawerSaved(): void {
    this.getPurchases();
  }

  onEditDrawerClosed(): void {
    this.editDrawerOpen = false;
    this.editDrawerPurchaseId = null;
  }
  /** Initiate LPO opens as a slide-over on top of the list. */
  initiateLpoPurchaseId: string | null = null;

  openInitiateLpo(purchaseId: string): void {
    this.initiateLpoPurchaseId = purchaseId;
  }

  onInitiateLpoClosed(): void {
    this.initiateLpoPurchaseId = null;
  }

  /** An LPO went out, so the PR may have moved to Remaining PO or Completed. */
  onInitiateLpoIssued(): void {
    this.getPurchases();
  }
}
