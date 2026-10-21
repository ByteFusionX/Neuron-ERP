import { DetailSectionComponent } from '../../../../shared/components/detail-panel/detail-section.component';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgClass, NgFor, NgIf, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { Subscription, filter, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';
import { departmentPrivileges } from 'src/app/shared/utils/privilege-fallback';
import { ApprovalStep, ConditionDefaults, ConditionFlags, Workflow, WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { SfSelectComponent } from 'src/app/shared/components/smart-form/sf-select.component';
import { SfNumberComponent } from 'src/app/shared/components/smart-form/sf-number.component';
import { SfCheckboxComponent } from 'src/app/shared/components/smart-form/sf-checkbox.component';
import { SfSwitchComponent } from 'src/app/shared/components/smart-form/sf-switch.component';
import { SfInputComponent } from 'src/app/shared/components/smart-form/sf-input.component';
import { SfDateComponent } from 'src/app/shared/components/smart-form/sf-date.component';
import { SfFieldComponent } from 'src/app/shared/components/smart-form/sf-field.component';
import { ApprovalJourneyComponent } from 'src/app/shared/components/approval-journey/approval-journey.component';
import { ApprovalJourneyStage } from 'src/app/shared/components/approval-journey/approval-journey.model';
import { dealSheetPrivileges } from 'src/app/shared/utils/privilege-fallback';

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
type DraftStep = { roleId: string; roleName: string; escalationHours: number | null; escalationUnit: LimitUnit; maxAmount: number | null; maxDiscount: number | null; reminderPercent: number | null; timeoutAction: TimeoutAction; reminderEnabled: boolean; sameStage: boolean; enabled: boolean; hasTime: boolean; hasAmount: boolean; hasDiscount: boolean };
type ConditionKey = 'time' | 'amount' | 'discount';

/** Conditions each module can use. Presale only has a time limit; amounts and discounts belong to purchases and deals. */
const FEATURE_CONDITIONS: Record<string, ConditionKey[]> = {
  [WorkflowFeature.PRESALE]: ['time'],
  [WorkflowFeature.PURCHASE_APPROVAL]: ['time', 'amount'],
  [WorkflowFeature.PO_APPROVAL]: ['time', 'amount'],
  [WorkflowFeature.DEAL_SHEET]: ['time', 'amount', 'discount'],
  [WorkflowFeature.PROJECT_CLAIM]: ['time', 'amount'],
  [WorkflowFeature.CLAIM]: ['time', 'amount'],
};

const CONDITION_INFO: Record<ConditionKey, { icon: string; title: string; text: string }> = {
  time: { icon: 'schedule', title: 'Time limit', text: '' },
  amount: { icon: 'payments', title: 'Amount limit', text: '' },
  discount: { icon: 'percent', title: 'Discount limit', text: '' },
};

const FEATURE_LABELS: Record<WorkflowFeature, string> = {
  [WorkflowFeature.PRESALE]: 'Presale Assignment',
  [WorkflowFeature.PURCHASE_APPROVAL]: 'Purchase Approval',
  [WorkflowFeature.PO_APPROVAL]: 'PO Approval',
  [WorkflowFeature.DEAL_SHEET]: 'Deal Sheet Approval',
  [WorkflowFeature.PROJECT_CLAIM]: 'Project Assignment',
  [WorkflowFeature.CLAIM]: 'Claim Approval',
};

const WORKFLOW_FEATURE_ORDER: WorkflowFeature[] = [
  WorkflowFeature.PRESALE,
  WorkflowFeature.DEAL_SHEET,
  WorkflowFeature.PURCHASE_APPROVAL,
  WorkflowFeature.PO_APPROVAL,
  WorkflowFeature.PROJECT_CLAIM,
  WorkflowFeature.CLAIM,
];

@Component({
  selector: 'app-approval-workflow',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, NgStyle,FormsModule, DragDropModule,SettingsSectionHeaderComponent, DataGridComponent, ActionButtonComponent, ApprovalJourneyComponent, SfSelectComponent, SfNumberComponent, SfCheckboxComponent, SfSwitchComponent, SfInputComponent, SfDateComponent, SfFieldComponent, DetailSectionComponent],
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
  draftWorkDayStart = '08:00';
  draftWorkDayEnd = '17:00';
  draftWorkingDays: number[] = [0, 1, 2, 3, 4];
  draftFlags: ConditionFlags = { time: true, amount: false, discount: false };
  draftDefaults: ConditionDefaults = {};
  /** Detail panel tab: the route itself or the conditions it uses. */
  readonly conditionInfo = CONDITION_INFO;
  readonly weekdays = [
    { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  ];
  /** Number-only field: stops e, +, - and . from being typed. */

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
  /** Super Admin is pinned on top of every workflow: no limits, and the final authority. */
  managerName = 'Super Admin';
  /** Where the role dropdown opens: fixed to the viewport so the detail panel can't clip it. */
  roleMenuStyle: Record<string, string> = {};
  /** Notes shown in their own section of the Conditions tab. */
  readonly conditionNotes = [
    { icon: 'info', text: 'Turning a condition on or off applies to every step. Defaults only fill steps that have no value yet.' },
    { icon: 'person_off', text: "Always on: if the requester is in the workflow, their step and every step below it are skipped, and the request goes to the next step above them. Super Admin's own requests need no approval." },
    { icon: 'checklist', text: 'Conditions are checked together on every step, in this order: time limit, then amount, then discount. A request moves up as soon as any condition on its step is not met (timed out, over the amount, or over the discount).' },
    { icon: 'schedule', text: 'Time limits count working time only, inside the working days and hours set below.' },
  ];
  roleSearch = '';
  roleMenuOpen = false;
  isSaving = false;
  private draftSnapshot = '';

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Settings' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'workflow', label: 'Workflow', icon: 'activity' },
    { id: 'conditions', label: 'Conditions', icon: 'settings' },
  ];

  columns: DataGridColumn<WorkflowGridRow>[] = [
    { key: 'label', label: 'Feature', sortable: true, locked: true, valueGetter: (row) => row.label },
    { key: 'stepsCount', label: 'Steps', type: 'number', width: '100px', sortable: true, valueGetter: (row) => row.stepsCount },
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
    { id: 'configure', label: 'New Step', icon: 'plus', quick: true, panel: true, hidden: () => !this.canEdit },
  ];

  private subscriptions = new Subscription();

  constructor(
    private _workflowService: WorkflowService,
    private _employeeService: EmployeeService,
    private _toastr: ToastrService,
    private confirm: ConfirmDialogService,
  ) {}

  /** Closing the panel with unsaved route changes asks first. */
  closeGuard = async (): Promise<boolean> => {
    if (!this.editingFeature || !this.isDirty) return true;
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Discard changes?',
      message: 'You have unsaved changes to this route. Closing now will lose them.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
    if (confirmed) this.cancelEdit();
    return confirmed;
  };

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

  /** Roles not yet used in the draft — a role can only appear once per flow. Super Admin roles are listed but cannot be picked. */
  get availableRoles(): GetCategory[] {
    const used = new Set(this.draftSteps.map((s) => s.roleId));
    // Presale steps assign jobs and deal sheet steps approve deals, so only roles holding that privilege can be picked.
    return this.categories.filter((c) => c._id && !used.has(c._id) && (this.isSuperAdminRole(c) || this.holdsRequiredPrivilege(c)));
  }

  /** Privilege a role needs to act in the feature being edited (none for other features). */
  private holdsRequiredPrivilege(category: GetCategory): boolean {
    if (this.editingFeature === WorkflowFeature.PRESALE) return !!category.privileges?.assignedJob?.assign;
    if (this.editingFeature === WorkflowFeature.DEAL_SHEET) return dealSheetPrivileges(category.privileges).approve;
    return true;
  }

  isSuperAdminRole(category: GetCategory): boolean {
    return category.role?.toLowerCase() === 'superadmin';
  }

  /** Account type of a category: Super Admin, Admin or User. */
  roleTypeLabel(category: GetCategory): string {
    const role = category.role?.toLowerCase();
    return role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'User';
  }

  /** Opens the dropdown below the button, or above it when there is no room, and caps its height to the space left. */
  toggleRoleMenu(event: MouseEvent): void {
    if (this.roleMenuOpen) { this.roleMenuOpen = false; return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const gap = 8;
    const below = window.innerHeight - rect.bottom - gap - 12;
    const above = rect.top - gap - 12;
    const openUp = below < 260 && above > below;
    const width = Math.min(Math.max(rect.width, 288), window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    this.roleMenuStyle = {
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.max(160, openUp ? above : below)}px`,
      ...(openUp ? { bottom: `${window.innerHeight - rect.top + gap}px` } : { top: `${rect.bottom + gap}px` }),
    };
    this.roleMenuOpen = true;
  }

  /** Role library filtered by the search box. */
  get filteredRoles(): GetCategory[] {
    const q = (this.roleSearch || '').trim().toLowerCase();
    return q ? this.availableRoles.filter((c) => c.categoryName?.toLowerCase().includes(q)) : this.availableRoles;
  }

  get isDirty(): boolean {
    return this.snapshot() !== this.draftSnapshot;
  }

  /** Super Admin is always on top, so a workflow with no other steps is still valid. */
  get canSave(): boolean {
    return !this.problem;
  }

  /** First reason the draft cannot be saved, or ''. */
  get problem(): string {
    const steps = this.draftSteps;
    if (steps.some((st) => st.hasTime && (!st.escalationHours || st.escalationHours < 1))) return 'Every timed step needs a time limit';
    if (steps.some((st) => st.hasAmount && !(st.maxAmount != null && st.maxAmount > 0))) return 'Every amount step needs a maximum amount';
    if (steps.some((st) => st.hasDiscount && !(st.maxDiscount != null && st.maxDiscount > 0 && st.maxDiscount <= 100))) return 'Discount limits must be between 0% and 100%';
    if (this.draftFlags.time && !this.draftDefaults.timeLimit) return 'Set a default time limit';
    if (this.draftFlags.amount && !this.draftDefaults.maxAmount) return 'Set a default maximum amount';
    if (this.draftFlags.discount && !this.draftDefaults.maxDiscount) return 'Set a default maximum discount';
    if (this.draftWorkDayEnd <= this.draftWorkDayStart) return 'The work day must end after it starts';
    if (!this.draftWorkingDays.length) return 'Pick at least one working day';
    return '';
  }

  /** Super Admin's repeat reminder only matters when some step is timed. */
  get anyTimed(): boolean {
    return this.draftSteps.some((st) => st.hasTime);
  }

  /** Presale / deal sheet: a role that lost the needed privilege cannot act, so its stage is off and locked. */
  lacksPrivilege(step: DraftStep): boolean {
    if (this.editingFeature !== WorkflowFeature.PRESALE && this.editingFeature !== WorkflowFeature.DEAL_SHEET) return false;
    const role = this.categories.find((c) => c._id === step.roleId);
    return !!role && !this.holdsRequiredPrivilege(role);
  }

  stepEnabled(step: DraftStep): boolean {
    return step.enabled && !this.lacksPrivilege(step);
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
    return `Each ${row.label.toLowerCase()} is reviewed by ${list}, one after another. A rejection ends the request.`;
  }

  /** Conditions this module can use. */
  conditionKeysOf(row: WorkflowGridRow): ConditionKey[] {
    return FEATURE_CONDITIONS[row.feature] ?? ['time'];
  }

  flagsOf(row: WorkflowGridRow): ConditionFlags {
    return this.isEditing(row) ? this.draftFlags : { time: true, amount: false, discount: false, ...(row.workflow?.conditionFlags ?? {}) };
  }

  defaultsOf(row: WorkflowGridRow): ConditionDefaults {
    return this.isEditing(row) ? this.draftDefaults : (row.workflow?.conditionDefaults ?? {});
  }

  /** A condition only shapes steps added from now on; existing steps keep what they have. */
  toggleCondition(row: WorkflowGridRow, key: ConditionKey): void {
    if (!this.canEdit) return;
    if (!this.isEditing(row)) this.startEdit(row);
    const on = !this.draftFlags[key];
    this.draftFlags = { ...this.draftFlags, [key]: on };
    const d = this.draftDefaults;
    for (const st of this.draftSteps) {
      if (key === 'time') { st.hasTime = on; if (on && !st.escalationHours) st.escalationHours = d.timeLimit ?? null; }
      if (key === 'amount') { st.hasAmount = on; if (on && !st.maxAmount) st.maxAmount = d.maxAmount ?? null; }
      if (key === 'discount') { st.hasDiscount = on; if (on && !st.maxDiscount) st.maxDiscount = d.maxDiscount ?? null; }
    }
  }

  private snapshot(): string {
    return JSON.stringify({ s: this.draftSteps.map((s) => [s.roleId, s.escalationHours, s.escalationUnit, s.maxAmount, s.maxDiscount, s.reminderPercent, s.timeoutAction, s.reminderEnabled, s.sameStage, s.enabled]), r: this.draftRepeatReminder, f: this.draftFlags, df: this.draftDefaults, a: this.draftWorkDayStart, z: this.draftWorkDayEnd, d: this.draftWorkingDays });
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

  /** Top-to-bottom: Admin (pinned), then the rows from the top down; the bottom row acts first. */
  journeyStages(row: WorkflowGridRow): ApprovalJourneyStage[] {
    const stages: ApprovalJourneyStage[] = [
      { key: 'manager', variant: 'manager', icon: 'supervisor_account', stepNumber: 1, title: this.managerName, subtitle: 'Final authority · no limits or conditions · Stage 1' },
    ];

    // Roles sharing an order form one any-of stage; its first role drives the timing text.
    const groups: ApprovalStep[][] = [];
    this.stepsOf(row).forEach((s) => {
      const group = groups[groups.length - 1];
      if (group && group[0].order === s.order) group.push(s);
      else groups.push([s]);
    });
    const unitLabel = (s: ApprovalStep) => ({ minute: 'm', hour: 'h', day: 'd' }[s.escalationUnit ?? 'hour']);
    groups.forEach((group, i) => {
      const step = group[0];
      const above = i === 0 ? this.managerName : groups[i - 1].map((s) => this.roleLabel(s)).join(' or ');
      const parts: string[] = [`Stage ${i + 2}`, i === groups.length - 1 ? 'acts first' : ''];
      if (group.every((s) => s.enabled === false)) parts.push('switched off');
      if (group.length > 1) parts.push('any one of them can approve');
      if (step.maxAmount != null) parts.push(`approves up to ${step.maxAmount}`);
      if (step.maxDiscount != null) parts.push(`discount up to ${step.maxDiscount}%`);
      if (step.escalationHours) {
        const limit = `${step.escalationHours}${unitLabel(step)}`;
        parts.push(step.timeoutAction === 'notify' ? `only reminds after ${limit} (working time)`
          : step.timeoutAction === 'reject' ? `rejects back to the requester after ${limit} (working time)`
          : `escalates to ${above} after ${limit} (working time)`);
      }
      stages.push({
        key: `step-${i}`,
        variant: 'stage',
        initials: this.initials(this.roleLabel(step)),
        stepNumber: i + 2,
        title: group.map((s) => this.roleLabel(s)).join(' or '),
        subtitle: parts.filter(Boolean).join(' · '),
      });
    });

    stages.push({ key: 'start', variant: 'start', icon: 'send', title: 'Submitted', subtitle: groups.length ? 'The request starts at the bottom row and climbs up' : 'The request goes straight to Super Admin' });
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
    this.draftFlags = { time: true, amount: false, discount: false, ...(row.workflow?.conditionFlags ?? {}) };
    this.draftDefaults = { ...(row.workflow?.conditionDefaults ?? {}) };
    const d = this.draftDefaults;
    this.draftSteps = this.stepsOf(row).map((s, i, all) => ({
      roleId: this.roleId(s), roleName: this.roleLabel(s),
      escalationHours: s.escalationHours ?? null, escalationUnit: s.escalationUnit ?? 'hour',
      maxAmount: s.maxAmount ?? null, maxDiscount: s.maxDiscount ?? null,
      reminderPercent: s.reminderPercent ?? d.reminderPercent ?? 75, timeoutAction: s.timeoutAction ?? 'escalate',
      reminderEnabled: s.reminderEnabled !== false, sameStage: i > 0 && all[i - 1].order === s.order,
      enabled: s.enabled !== false, hasTime: s.escalationHours != null, hasAmount: s.maxAmount != null, hasDiscount: s.maxDiscount != null,
    }));
    this.draftRepeatReminder = row.workflow?.repeatReminder !== false;
    this.draftWorkDayStart = row.workflow?.workDayStart || '08:00';
    this.draftWorkDayEnd = row.workflow?.workDayEnd || '17:00';
    this.draftWorkingDays = row.workflow?.workingDays?.length ? [...row.workflow.workingDays] : [0, 1, 2, 3, 4];
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
    const d = this.draftDefaults;
    const f = this.draftFlags;
    this.draftSteps = [...this.draftSteps, {
      roleId: role._id, roleName: role.categoryName,
      escalationHours: f.time ? d.timeLimit ?? null : null, escalationUnit: d.timeUnit ?? 'hour',
      maxAmount: f.amount ? d.maxAmount ?? null : null, maxDiscount: f.discount ? d.maxDiscount ?? null : null,
      reminderPercent: d.reminderPercent ?? 75, timeoutAction: d.timeoutAction ?? 'escalate', reminderEnabled: true, sameStage: false,
      enabled: true, hasTime: f.time, hasAmount: f.amount, hasDiscount: f.discount,
    }];
  }

  /** Display number of the stage a draft row belongs to (Admin is Stage 1, the rows below start at Stage 2). */
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

  workingDaysOf(row: WorkflowGridRow): number[] {
    return this.isEditing(row) ? this.draftWorkingDays : (row.workflow?.workingDays?.length ? row.workflow.workingDays : [0, 1, 2, 3, 4]);
  }

  setDefault(row: WorkflowGridRow, key: keyof ConditionDefaults, value: any): void {
    if (!this.canEdit) return;
    if (!this.isEditing(row)) this.startEdit(row);
    const numeric = key !== 'timeUnit' && key !== 'timeoutAction';
    const parsed = numeric ? (value === null || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value)) : value;
    this.draftDefaults = { ...this.draftDefaults, [key]: parsed };
    if (parsed === undefined) return;
    for (const st of this.draftSteps) {
      if (key === 'timeLimit' && st.hasTime && !st.escalationHours) st.escalationHours = parsed;
      if (key === 'maxAmount' && st.hasAmount && !st.maxAmount) st.maxAmount = parsed;
      if (key === 'maxDiscount' && st.hasDiscount && !st.maxDiscount) st.maxDiscount = parsed;
    }
  }

  setWorkHours(row: WorkflowGridRow, which: 'start' | 'end', value: string): void {
    if (!this.canEdit) return;
    if (!this.isEditing(row)) this.startEdit(row);
    if (which === 'start') this.draftWorkDayStart = value;
    else this.draftWorkDayEnd = value;
  }

  workHoursOf(row: WorkflowGridRow): { start: string; end: string } {
    return this.isEditing(row) ? { start: this.draftWorkDayStart, end: this.draftWorkDayEnd } : { start: row.workflow?.workDayStart || '08:00', end: row.workflow?.workDayEnd || '17:00' };
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
      this._toastr.error(this.problem);
      return;
    }
    const steps = this.draftSteps.map((s, i) => ({
      role: s.roleId,
      order: this.stageNumber(i),
      enabled: s.enabled,
      ...(s.hasTime ? { escalationHours: s.escalationHours ?? undefined, escalationUnit: s.escalationUnit, ...(s.reminderPercent ? { reminderPercent: s.reminderPercent } : {}), timeoutAction: s.timeoutAction || 'escalate', reminderEnabled: s.reminderEnabled } : {}),
      ...(s.hasAmount && s.maxAmount ? { maxAmount: s.maxAmount } : {}),
      ...(s.hasDiscount && s.maxDiscount ? { maxDiscount: s.maxDiscount } : {}),
    }));
    const body = {
      steps,
      repeatReminder: this.draftRepeatReminder,
      workingDays: this.draftWorkingDays,
      workDayStart: this.draftWorkDayStart,
      workDayEnd: this.draftWorkDayEnd,
      conditionFlags: this.draftFlags,
      conditionDefaults: this.draftDefaults,
    };
    const request$ = row.workflow?._id
      ? this._workflowService.updateWorkflow(row.workflow._id, body)
      : this._workflowService.createWorkflow({ feature: row.feature, needsManagerApproval: false, ...body });

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
        this.categorySection = /^superadmin$/i.test(String(employee?.category.role ?? ''));

        if (departmentPrivileges(this.privileges).view || this.categorySection) {
          this.loadWorkflows();
          this.subscriptions.add(this._employeeService.getCategory().subscribe((c) => (this.categories = c ?? [])));
        }
      })
    );
  }

  loadWorkflows(): void {
    this.isWorkflowLoading = true;
    const workflows = WORKFLOW_FEATURE_ORDER
      .filter((feature) => Object.values(WorkflowFeature).includes(feature))
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

