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

type DraftStep = { roleId: string; roleName: string; escalationHours: number | null };

const FEATURE_LABELS: Record<WorkflowFeature, string> = {
  [WorkflowFeature.PRESALE]: 'Presale Assignment',
  [WorkflowFeature.PURCHASE_APPROVAL]: 'Purchase Approval',
  [WorkflowFeature.PROJECT_CLAIM]: 'Project Claim',
  [WorkflowFeature.CLAIM]: 'Claim',
};

@Component({
  selector: 'app-approval-workflow',
  standalone: true,
  imports: [NgIf, NgFor, NgClass,FormsModule, DragDropModule,SettingsSectionHeaderComponent, DataGridComponent, ActionButtonComponent, ApprovalJourneyComponent],
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
  roleSearch = '';
  roleMenuOpen = false;
  isSaving = false;
  private draftSnapshot = '';

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Settings' }];
  detailTabs: DataGridDetailTab[] = [{ id: 'flow', label: 'Flow', icon: 'account_tree' }];

  columns: DataGridColumn<WorkflowGridRow>[] = [
    { key: 'label', label: 'Feature', sortable: true, locked: true, valueGetter: (row) => row.label },
    { key: 'stepsCount', label: 'Steps', type: 'number', width: '100px', sortable: true, valueGetter: (row) => row.stepsCount },
    { key: 'managerApproval', label: 'Manager', width: '130px', sortable: true, valueGetter: (row) => row.managerApproval },
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
    { id: 'configure', label: 'Edit Flow', icon: 'edit', quick: true, panel: true, hidden: () => !this.canEdit },
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

  /** Roles not yet used in the draft — a role can only appear once per flow. */
  get availableRoles(): GetCategory[] {
    const used = new Set(this.draftSteps.map((s) => s.roleId));
    return this.categories.filter((c) => c._id && !used.has(c._id));
  }

  /** Role library filtered by the search box. */
  get filteredRoles(): GetCategory[] {
    const q = this.roleSearch.trim().toLowerCase();
    return q ? this.availableRoles.filter((c) => c.categoryName?.toLowerCase().includes(q)) : this.availableRoles;
  }

  get isDirty(): boolean {
    return this.snapshot() !== this.draftSnapshot;
  }

  /** Manager (Super Admin) is mandatory as the first step; it can only be turned off once a second step exists. */
  get canDisableManagerApproval(): boolean {
    return this.draftSteps.length > 0;
  }

  initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Plain-language description of the route for the read-only view. */
  flowSentence(row: WorkflowGridRow): string {
    const names = this.stepsOf(row).map((s) => this.roleLabel(s));
    if (row.workflow?.needsManagerApproval) names.unshift("the requester's manager");
    if (!names.length) return 'Requests are not routed to anyone yet.';
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and then ${names[names.length - 1]}` : names[0];
    return `Each ${row.label.toLowerCase()} is reviewed by ${list}, one after another. Any rejection stops the request.`;
  }

  private snapshot(): string {
    return JSON.stringify({ s: this.draftSteps.map((s) => [s.roleId, s.escalationHours]), m: this.draftManagerApproval });
  }

  detailTitle(row: WorkflowGridRow): string {
    return row.label;
  }

  detailSubtitle(row: WorkflowGridRow): string {
    return row.stepsCount ? `${row.stepsCount} approval step${row.stepsCount === 1 ? '' : 's'}` : 'No approval steps configured yet';
  }

  stepsOf(row: WorkflowGridRow): ApprovalStep[] {
    return [...(row.workflow?.steps ?? [])].sort((a, b) => a.order - b.order);
  }

  /** Builds the Start → (Manager) → Roles → End sequence for the journey chart. */
  journeyStages(row: WorkflowGridRow): ApprovalJourneyStage[] {
    const stages: ApprovalJourneyStage[] = [
      { key: 'start', variant: 'start', icon: 'send', title: 'Submitted', subtitle: 'Requester opens the request' },
    ];

    if (row.workflow?.needsManagerApproval) {
      stages.push({ key: 'manager', variant: 'manager', icon: 'supervisor_account', title: 'Manager', subtitle: "Requester's direct report reviews first" });
    }

    const steps = this.stepsOf(row);
    if (steps.length) {
      steps.forEach((step, i) => {
        const last = i === steps.length - 1;
        const hours = step.escalationHours;
        stages.push({
          key: `step-${i}`,
          variant: 'stage',
          initials: this.initials(this.roleLabel(step)),
          stepNumber: i + 1,
          title: this.roleLabel(step),
          subtitle: last
            ? `Stage ${i + 1} · final sign-off before approval — does not escalate further`
            : hours
              ? `Stage ${i + 1} · escalates to the next role after ${hours}h if not actioned`
              : `Stage ${i + 1} · no auto-escalation configured`,
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
    this.draftSteps = this.stepsOf(row).map((s) => ({ roleId: this.roleId(s), roleName: this.roleLabel(s), escalationHours: s.escalationHours ?? null }));
    this.draftManagerApproval = this.canDisableManagerApproval ? (row.workflow ? !!row.workflow.needsManagerApproval : true) : true;
    this.roleSearch = '';
    this.roleMenuOpen = false;
    this.draftSnapshot = this.snapshot();
  }

  toggleManagerApproval(): void {
    if (!this.canDisableManagerApproval) {
      this.draftManagerApproval = true;
      return;
    }
    this.draftManagerApproval = !this.draftManagerApproval;
  }

  cancelEdit(): void {
    this.editingFeature = null;
    this.draftSteps = [];
    this.roleSearch = '';
    this.roleMenuOpen = false;
  }

  addRole(role: GetCategory): void {
    if (!role?._id) return;
    this.draftSteps = [...this.draftSteps, { roleId: role._id, roleName: role.categoryName, escalationHours: null }];
  }

  removeStep(index: number): void {
    this.draftSteps = this.draftSteps.filter((_, i) => i !== index);
    if (!this.canDisableManagerApproval) this.draftManagerApproval = true;
  }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.draftSteps.length) return;
    moveItemInArray(this.draftSteps, index, target);
  }

  onDrop(event: CdkDragDrop<DraftStep[]>): void {
    moveItemInArray(this.draftSteps, event.previousIndex, event.currentIndex);
  }

  saveFlow(row: WorkflowGridRow): void {
    if (!this.draftSteps.length) {
      this._toastr.error('Add at least one approver');
      return;
    }
    const steps = this.draftSteps.map((s, i) => ({ role: s.roleId, order: i + 1, ...(s.escalationHours ? { escalationHours: s.escalationHours } : {}) }));
    const request$ = row.workflow?._id
      ? this._workflowService.updateWorkflow(row.workflow._id, { steps, needsManagerApproval: this.draftManagerApproval })
      : this._workflowService.createWorkflow({ feature: row.feature, steps, needsManagerApproval: this.draftManagerApproval });

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
        error: () => {
          this.isSaving = false;
          this._toastr.error('Failed to save workflow');
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
