import { DetailSectionComponent } from '../../../../shared/components/detail-panel/detail-section.component';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ToastrService } from 'ngx-toastr';
import { Subscription, filter, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';
import { departmentPrivileges } from 'src/app/shared/utils/privilege-fallback';
import { ApprovalStep, Workflow, WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { SfSelectComponent } from 'src/app/shared/components/smart-form/sf-select.component';
import { ApprovalJourneyComponent } from 'src/app/shared/components/approval-journey/approval-journey.component';
import { ApprovalJourneyStage } from 'src/app/shared/components/approval-journey/approval-journey.model';

type WorkflowGridRow = {
  _id: string;
  feature: WorkflowFeature;
  label: string;
  stepsCount: number;
  status: 'Configured' | 'Not configured';
  managerApproval: 'Yes' | 'No';
  workflow: Workflow | null;
};

type TimeoutAction = 'escalate' | 'notify' | 'reject';
type LimitUnit = 'minute' | 'hour' | 'day';
type DraftStep = { roleId: string; roleName: string; escalationHours: number | null; escalationUnit: LimitUnit; minAmount: number | null; reminderPercent: number | null; timeoutAction: TimeoutAction; reminderEnabled: boolean; sameStage: boolean };

const FEATURE_LABELS: Record<WorkflowFeature, string> = {
  [WorkflowFeature.PRESALE]: 'Presale Assignment',
  [WorkflowFeature.PURCHASE_APPROVAL]: 'Purchase Approval',
  [WorkflowFeature.PROJECT_CLAIM]: 'Project Claim',
  [WorkflowFeature.CLAIM]: 'Claim',
};

@Component({
  selector: 'app-approval-workflow',
  standalone: true,
  imports: [NgIf, NgFor, NgClass,FormsModule, DragDropModule,SettingsSectionHeaderComponent, DataGridComponent, ActionButtonComponent, ApprovalJourneyComponent, SfSelectComponent, DetailSectionComponent],
  templateUrl: './approval-workflow.component.html',
  styleUrl: './approval-workflow.component.css',
})
export class ApprovalWorkflowComponent implements OnInit, OnDestroy {
  @ViewChild('workflowGrid') workflowGrid?: DataGridComponent<WorkflowGridRow>;

  privileges!: Privileges | undefined;
  categorySection = false;
  isWorkflowLoading = true;
  workflows: { feature: WorkflowFeature; workflow: Workflow | null }[] = [];
  categories: GetCategory[] = [];

  /** Feature currently being edited inline in the detail panel (null = read-only flow). */
  editingFeature: WorkflowFeature | null = null;
  draftSteps: DraftStep[] = [];
  draftManagerApproval = true;
  draftRepeatReminder = true;
  /** Skip a stage when the requester already holds that stage's role. */
  draftSkipRequester = true;
  draftBusinessHours = false;
  draftWorkingDays: number[] = [0, 1, 2, 3, 4];
  readonly weekdays = [
    { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  ];
  /** Number-only field: stops e, +, - and . from being typed. */
  blockNonDigit(event: KeyboardEvent) {
    if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
  }

  readonly unitOptions:{ value: LimitUnit; label: string }[] = [
    { value: 'minute', label: 'Minutes' },
    { value: 'hour', label: 'Hours' },
    { value: 'day', label: 'Days' },
  ];
  readonly timeoutOptions:{ value: TimeoutAction; label: string }[] = [
    { value: 'escalate', label: 'Escalate' },
    { value: 'notify', label: 'Notify only' },
    { value: 'reject', label: 'Auto-reject' },
  ];
  /** Display name for the manager stage: the CEO / super admin. */
  managerName = 'Super Admin';
  roleSearch = '';
  roleMenuOpen = false;
  isSaving = false;
  private draftSnapshot = '';

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Settings' }];
  detailTabs: DataGridDetailTab[] = [];

  columns: DataGridColumn<WorkflowGridRow>[] = [
    { key: 'label', label: 'Feature', sortable: true, locked: true, valueGetter: (row) => row.label },
    { key: 'stepsCount', label: 'Steps', type: 'number', width: '100px', sortable: true, valueGetter: (row) => row.stepsCount },
    { key: 'managerApproval', label: 'Super Admin', width: '130px', sortable: true, valueGetter: (row) => row.managerApproval },
    {
      key: 'status',
      label: 'Status',
      type: 'badge',
      width: '150px',
      sortable: true,
      badgeClasses: {
        Configured: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30',
        'Not configured': 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      },
      valueGetter: (row) => row.status,
    },
  ];

  rowActions: DataGridRowAction<WorkflowGridRow>[] = [
    { id: 'configure', label: 'New Step', icon: 'edit', quick: true, panel: true, hidden: () => !this.canEdit },
  ];

  private subscriptions = new Subscription();

  constructor(
    private _workflowService: WorkflowService,
    private _employeeService: EmployeeService,
    private _toastr: ToastrService,
  ) {}

  get canViewDepartments(): boolean {
    return departmentPrivileges(this.privileges).view;
  }

  get canEdit(): boolean {
    return departmentPrivileges(this.privileges).edit || this.categorySection;
  }

  get gridRows(): WorkflowGridRow[] {
    return this.workflows.map((w) => ({
      _id: w.feature,
      feature: w.feature,
      label: FEATURE_LABELS[w.feature] ?? w.feature,
      stepsCount: w.workflow?.steps?.length ?? 0,
      status: (w.workflow?.steps?.length ?? 0) > 0 ? 'Configured' : 'Not configured',
      managerApproval: w.workflow?.needsManagerApproval ? 'Yes' : 'No',
      workflow: w.workflow,
    }));
  }

  /** Roles not yet used in the draft — a role can only appear once per flow. Super admin roles are excluded. */
  get availableRoles(): GetCategory[] {
    const used = new Set(this.draftSteps.map((s) => s.roleId));
    return this.categories.filter((c) => c._id && !used.has(c._id) && c.role?.toLowerCase() !== 'superadmin');
  }

  /** Role library filtered by the search box. */
  get filteredRoles(): GetCategory[] {
    const q = this.roleSearch.trim().toLowerCase();
    return q ? this.availableRoles.filter((c) => c.categoryName?.toLowerCase().includes(q)) : this.availableRoles;
  }

  get isDirty(): boolean {
    return this.snapshot() !== this.draftSnapshot;
  }

  /** A route needs at least one approver: the manager (when enabled) or a role step. */
  get canSave(): boolean {
    return this.draftManagerApproval || this.draftSteps.length > 0;
  }

  initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Plain-language description of the route for the read-only view. */
  flowSentence(row: WorkflowGridRow): string {
    const names = this.stepsOf(row).map((s) => this.roleLabel(s));
    names.unshift(this.managerName);
    if (!names.length) return 'Requests are not routed to anyone yet.';
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and then ${names[names.length - 1]}` : names[0];
    return `Each ${row.label.toLowerCase()} is reviewed by ${list}, one after another. Any rejection stops the request.`;
  }

  /** Skip rules and day counting for the Conditions tab; reflects the draft while editing. */
  conditionRules(row: WorkflowGridRow): { key?: 'skip' | 'days'; icon: string; title: string; text: string; active: boolean }[] {
    const editing = this.isEditing(row);
    const skipSelf = editing ? this.draftSkipRequester : row.workflow?.skipRequesterRole !== false;
    const businessOnly = editing ? this.draftBusinessHours : row.workflow?.businessHoursOnly === true;
    const days = editing ? this.draftWorkingDays : (row.workflow?.workingDays?.length ? row.workflow.workingDays : [0, 1, 2, 3, 4]);
    const dayNames = this.weekdays.filter((d) => days.includes(d.value)).map((d) => d.label);
    const rules: { key?: 'skip' | 'days'; icon: string; title: string; text: string; active: boolean }[] = [
      {
        key: 'skip' as const, icon: 'person_off', active: skipSelf, title: 'Skip stages the requester already holds',
        text: skipSelf ? "A stage is skipped when the requester has that stage's role." : 'Off — every stage is kept even if the requester holds its role.',
      },
      {
        key: 'days' as const, icon: 'date_range', active: businessOnly, title: 'Day counting for time limits',
        text: businessOnly
          ? `Counts working days only: ${dayNames.join(', ') || 'none selected'} (${days.length} day${days.length === 1 ? '' : 's'} a week). The clock pauses on other days.`
          : 'Counts every calendar day (7 days a week), including weekends.',
      },
    ];
    (row.workflow?.conditions ?? []).forEach((c: any) => {
      rules.push({ icon: 'filter_alt', active: true, title: 'Workflow applies only when', text: `${c.field} ${c.operator} ${Array.isArray(c.value) ? c.value.join(', ') : c.value ?? ''}` });
    });
    return rules;
  }

  private snapshot(): string {
    return JSON.stringify({ s: this.draftSteps.map((s) => [s.roleId, s.escalationHours, s.escalationUnit, s.minAmount, s.reminderPercent, s.timeoutAction, s.reminderEnabled, s.sameStage]), m: this.draftManagerApproval, r: this.draftRepeatReminder, k: this.draftSkipRequester, b: this.draftBusinessHours, d: this.draftWorkingDays });
  }

  detailTitle(row: WorkflowGridRow): string {
    return row.label;
  }

  detailSubtitle(row: WorkflowGridRow): string {
    const version = row.workflow?.version ? ` · v${row.workflow.version}` : '';
    return row.stepsCount ? `${row.stepsCount} approval step${row.stepsCount === 1 ? '' : 's'}${version}` : 'Not configured';
  }

  stepsOf(row: WorkflowGridRow): ApprovalStep[] {
    return [...(row.workflow?.steps ?? [])].sort((a, b) => a.order - b.order);
  }

  /** Builds the Start → (Manager) → Roles → End sequence for the journey chart. */
  journeyStages(row: WorkflowGridRow): ApprovalJourneyStage[] {
    const stages: ApprovalJourneyStage[] = [
      { key: 'start', variant: 'start', icon: 'send', title: 'Submitted', subtitle: 'Requester opens the request' },
    ];

    stages.push({ key: 'manager', variant: 'manager', icon: 'supervisor_account', stepNumber: 1, title: this.managerName, subtitle: 'Default approver · Stage 1' });

    // Roles sharing an order form one any-of stage; its first role drives the timing text.
    const groups: ApprovalStep[][] = [];
    this.stepsOf(row).forEach((s) => {
      const group = groups[groups.length - 1];
      if (group && group[0].order === s.order) group.push(s);
      else groups.push([s]);
    });
    const steps = groups.map((g) => g[0]);
    const clock = row.workflow?.businessHoursOnly ? ' (working days only)' : '';
    const unitLabel = (s: ApprovalStep) => ({ minute: 'm', hour: 'h', day: 'd' }[s.escalationUnit ?? 'hour']);
    if (steps.length) {
      steps.forEach((step, i) => {
        const last = i === steps.length - 1;
        const anyOf = groups[i].length > 1;
        const roleNames = groups[i].map((s) => this.roleLabel(s)).join(' or ');
        const hours = step.escalationHours;
        const unit = unitLabel(step);
        const extras = [
          anyOf ? 'any one of them can approve' : '',
          hours && step.reminderPercent ? `reminder at ${step.reminderPercent}% of the limit` : '',
        ].filter(Boolean).join(' · ');
        stages.push({
          key: `step-${i}`,
          variant: 'stage',
          initials: this.initials(this.roleLabel(step)),
          stepNumber: i + 2,
          title: roleNames,
          subtitle: (extras ? `${extras} — ` : '') + (hours && step.timeoutAction === 'notify'
            ? `Stage ${i + 2} · only notifies after ${hours}${unit}${clock} if not actioned`
            : hours && step.timeoutAction === 'reject'
            ? `Stage ${i + 2} · auto-rejects after ${hours}${unit}${clock} if not actioned`
            : i === 0
            ? hours
              ? `Stage 2 · escalates to ${this.managerName} (Stage 1) after ${hours}${unit}${clock} if not actioned`
              : `Stage 2 · no auto-escalation to ${this.managerName} configured`
            : last
            ? `Stage ${i + 2} · final sign-off before approval — does not escalate further`
            : hours
              ? `Stage ${i + 2} · escalates to the next role after ${hours}${unit}${clock} if not actioned`
              : `Stage ${i + 2} · no auto-escalation configured`),
        });
      });
    } else {
      stages.push({ key: 'empty', variant: 'empty', icon: 'help_outline', title: 'No approvers configured', subtitle: 'Requests currently have nothing to route through' });
    }

    stages.push({ key: 'end', variant: 'end', icon: 'verified', title: 'Approved', subtitle: 'Request is fully signed off' });
    return stages;
  }

  roleId(step: ApprovalStep): string {
    const role: any = step.role;
    return typeof role === 'string' ? role : role?._id ?? '';
  }

  roleLabel(step: ApprovalStep): string {
    const role: any = step.role;
    if (role && typeof role === 'object') return role.categoryName ?? '—';
    return this.categories.find((c) => c._id === role)?.categoryName ?? role ?? '—';
  }

  isEditing(row: WorkflowGridRow): boolean {
    return this.editingFeature === row.feature;
  }

  onGridRowAction(event: DataGridRowActionEvent<WorkflowGridRow>) {
    if (event.action.id === 'configure') {
      this.workflowGrid?.openRow(event.row);
      this.startEdit(event.row);
    }
  }

  startEdit(row: WorkflowGridRow): void {
    this.editingFeature = row.feature;
    this.draftSteps = this.stepsOf(row).map((s, i, all) => ({ roleId: this.roleId(s), roleName: this.roleLabel(s), escalationHours: s.escalationHours ?? 24, escalationUnit: s.escalationUnit ?? 'hour', minAmount: s.minAmount ?? null, reminderPercent: s.reminderPercent ?? 75, timeoutAction: s.timeoutAction ?? 'escalate', reminderEnabled: s.reminderEnabled !== false, sameStage: i > 0 && all[i - 1].order === s.order }));
    this.draftSkipRequester = row.workflow?.skipRequesterRole !== false;
    this.draftRepeatReminder = row.workflow?.repeatReminder !== false;
    this.draftBusinessHours = row.workflow?.businessHoursOnly === true;
    this.draftWorkingDays = row.workflow?.workingDays?.length ? [...row.workflow.workingDays] : [0, 1, 2, 3, 4];
    this.draftManagerApproval = true; // Super Admin is always the default first approver
    this.roleSearch = '';
    this.roleMenuOpen = false;
    this.draftSnapshot = this.snapshot();
  }

  cancelEdit(): void {
    this.editingFeature = null;
    this.draftSteps = [];
    this.roleSearch = '';
    this.roleMenuOpen = false;
  }

  addRole(role: GetCategory): void {
    if (!role?._id) return;
    this.draftSteps = [...this.draftSteps, { roleId: role._id, roleName: role.categoryName, escalationHours: 24, escalationUnit: 'hour', minAmount: null, reminderPercent: 75, timeoutAction: 'escalate', reminderEnabled: true, sameStage: false }];
  }

  /** Display number of the stage a draft row belongs to (the manager is Stage 1). */
  stageNumber(index: number): number {
    return 2 + this.draftSteps.slice(0, index + 1).filter((s, i) => i === 0 || !s.sameStage).length - 1;
  }

  /** Lets this role approve in the same stage as the row above — any one of them completes the stage. */
  toggleSameStage(index: number): void {
    if (index === 0) return;
    this.draftSteps[index].sameStage = !this.draftSteps[index].sameStage;
  }

  private fixFirstStage(): void {
    if (this.draftSteps[0]) this.draftSteps[0].sameStage = false;
  }

  /** conditionRules() builds new objects each check; tracking by index keeps the checkbox DOM alive so clicks land. */
  trackRule = (index: number): number => index;

  toggleRule(row: WorkflowGridRow, key: 'skip' | 'days'): void {
    if (!this.isEditing(row)) this.startEdit(row);
    if (key === 'skip') this.draftSkipRequester = !this.draftSkipRequester;
    else this.draftBusinessHours = !this.draftBusinessHours;
  }

  workingDaysOf(row: WorkflowGridRow): number[] {
    return this.isEditing(row) ? this.draftWorkingDays : (row.workflow?.workingDays?.length ? row.workflow.workingDays : [0, 1, 2, 3, 4]);
  }

  toggleWorkingDay(row: WorkflowGridRow, day: number): void {
    if (!this.isEditing(row)) this.startEdit(row);
    this.draftWorkingDays = this.draftWorkingDays.includes(day)
      ? this.draftWorkingDays.filter((d) => d !== day)
      : [...this.draftWorkingDays, day].sort();
  }

  removeStep(index: number): void {
    this.draftSteps = this.draftSteps.filter((_, i) => i !== index);
    this.fixFirstStage();
  }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.draftSteps.length) return;
    moveItemInArray(this.draftSteps, index, target);
    this.fixFirstStage();
  }

  onDrop(event: CdkDragDrop<DraftStep[]>): void {
    moveItemInArray(this.draftSteps, event.previousIndex, event.currentIndex);
    this.fixFirstStage();
  }

  saveFlow(row: WorkflowGridRow): void {
    if (!this.canSave) {
      this._toastr.error('Enable manager approval or add at least one approver');
      return;
    }
    const steps = this.draftSteps.map((s, i) => ({ role: s.roleId, order: this.stageNumber(i) - 1,...(s.escalationHours ? { escalationHours: s.escalationHours, escalationUnit: s.escalationUnit } : {}), ...(s.reminderPercent && s.escalationHours ? { reminderPercent: s.reminderPercent } : {}), timeoutAction: s.timeoutAction || 'escalate', reminderEnabled: s.reminderEnabled }));
    const timing = { businessHoursOnly: this.draftBusinessHours, workingDays: this.draftWorkingDays };
    const request$ = row.workflow?._id
      ? this._workflowService.updateWorkflow(row.workflow._id, { steps, needsManagerApproval: this.draftManagerApproval, skipRequesterRole: this.draftSkipRequester, repeatReminder: this.draftRepeatReminder, ...timing })
      : this._workflowService.createWorkflow({ feature: row.feature, steps, needsManagerApproval: this.draftManagerApproval, skipRequesterRole: this.draftSkipRequester, repeatReminder: this.draftRepeatReminder, ...timing });

    this.isSaving = true;
    this.subscriptions.add(
      request$.subscribe({
        next: (response) => {
          this.isSaving = false;
          if (!response.success) {
            this._toastr.error(response.message || 'Failed to save workflow');
            return;
          }
          this._toastr.success('Workflow saved');
          this.cancelEdit();
          this.loadWorkflows();
        },
        error: (err) => {
          this.isSaving = false;
          this._toastr.error(err?.error?.message || 'Failed to save workflow');
        },
      })
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.privileges = employee?.category?.privileges;
        this.categorySection = employee?.category.role == 'superAdmin';

        if (departmentPrivileges(this.privileges).view || this.categorySection) {
          this.loadWorkflows();
          this.subscriptions.add(this._employeeService.getCategory().subscribe((c) => (this.categories = c ?? [])));
        }
      })
    );
  }

  /** Claims routes are managed elsewhere; keep them out of this grid. */
  private static readonly HIDDEN_FEATURES = new Set<WorkflowFeature>([WorkflowFeature.CLAIM, WorkflowFeature.PROJECT_CLAIM]);

  loadWorkflows(): void {
    this.isWorkflowLoading = true;
    const workflows = Object.values(WorkflowFeature)
      .filter((feature) => !ApprovalWorkflowComponent.HIDDEN_FEATURES.has(feature))
      .map((feature) => ({ feature, workflow: null as Workflow | null }));

    this.subscriptions.add(
      this._workflowService.getWorkflows().subscribe({
        next: (response) => {
          if (response?.success && response.data) {
            response.data.forEach((workflow: Workflow) => {
              const entry = workflows.find((w) => w.feature === workflow.feature);
              if (entry) entry.workflow = workflow;
            });
          }
          this.workflows = workflows;
          this.isWorkflowLoading = false;
        },
        error: (error) => {
          console.error('Error loading workflows:', error);
          this.workflows = workflows;
          this.isWorkflowLoading = false;
        },
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}

