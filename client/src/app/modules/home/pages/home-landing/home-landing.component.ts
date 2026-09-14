import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { SfDraftDirective, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridFieldComponent } from 'src/app/shared/components/data-grid/data-grid-field.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridCellEditEvent,
  DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';

import { RouterLink } from '@angular/router';
import {
  CLOSED_STATUSES, CURRENT_USER, CUSTOMERS, MANAGERS, PRIORITIES, STATUSES, STATUS_CLASSES, TYPES,
  SampleProject, getSampleProjects, setSampleProjects,
} from '../../sample-projects';

const toOptions = (list: string[]): SfOption<string>[] => list.map((v) => ({ label: v, value: v }));
const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function dueAfterStart(c: AbstractControl): ValidationErrors | null {
  const start = c.parent?.get('startDate')?.value;
  return start && c.value && c.value < start ? { dateOrder: 'Due date must be on or after the start date' } : null;
}

@Component({
  selector: 'app-home-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, SmartFormModule, DataGridComponent, DataGridFieldComponent, DetailFieldComponent, DetailSectionComponent, DetailPanelIconComponent],
  templateUrl: './home-landing.component.html',
  styleUrls: ['./home-landing.component.css'],
})
export class HomeLandingComponent implements OnInit {
  private _projects: SampleProject[] = [];
  /** Writes through to the shared store so the project detail page sees creates/deletes. */
  get projects(): SampleProject[] { return this._projects; }
  set projects(list: SampleProject[]) {
    this._projects = list;
    setSampleProjects(list);
  }
  loading = true;
  detailLoading = false;
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];

  views: DataGridView<SampleProject>[] = [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'My projects', predicate: (p) => p.manager === CURRENT_USER },
    { id: 'overdue', label: 'Overdue', predicate: (p) => this.isOverdue(p),
      sort: { key: 'dueDate', direction: 'asc' } },
    { id: 'hold', label: 'On Hold', predicate: (p) => p.status === 'On Hold' },
  ];

  columns: DataGridColumn<SampleProject>[] = [
    { key: 'id', label: 'Project #', sortable: true, locked: true, width: '110px' },
    { key: 'name', label: 'Project', sortable: true, editable: true, editor: 'text' },
    { key: 'customer', label: 'Customer', sortable: true },
    { key: 'manager', label: 'Manager', sortable: true, editable: true, editor: 'select',
      editorOptions: MANAGERS.map((m) => ({ label: m, value: m })) },
    { key: 'status', label: 'Status', type: 'badge', sortable: true, editable: true, editor: 'select',
      editorOptions: STATUSES.map((s) => ({ label: s, value: s })),
      badgeClasses: {
        Planning: 'bg-sky-50 text-sky-700',
        'In Progress': 'bg-violet-50 text-violet-700',
        'On Hold': 'bg-amber-50 text-amber-700',
        Completed: 'bg-emerald-50 text-emerald-700',
        Cancelled: 'bg-red-50 text-red-700',
      } },
    { key: 'priority', label: 'Priority', sortable: true, editable: true, editor: 'select',
      editorOptions: PRIORITIES.map((p) => ({ label: p, value: p })) },
    { key: 'dueDate', label: 'Due Date', type: 'date', sortable: true, editable: true, editor: 'date',
      cellClass: (p) => (this.isOverdue(p) ? '!text-red-600 font-medium' : null) },
    { key: 'budget', label: 'Budget', type: 'currency', sortable: true, editable: true, editor: 'number', aggregate: 'sum' },
    { key: 'progress', label: 'Progress %', type: 'number', align: 'right', sortable: true, visible: false },
  ];

  bulkActions: DataGridBulkAction[] = [
    { id: 'export', label: 'Export' },
    { id: 'hold', label: 'Put on Hold' },
    { id: 'complete', label: 'Mark Completed', variant: 'primary' },
    { id: 'delete', label: 'Delete', variant: 'danger' },
  ];

  rowActions: DataGridRowAction<SampleProject>[] = [
    { id: 'complete', label: 'Mark Completed', quick: true, icon: 'check', hidden: (p) => CLOSED_STATUSES.includes(p.status) },
    { id: 'hold', label: 'Put on Hold', quick: true, icon: 'pause', hidden: (p) => p.status === 'On Hold' || CLOSED_STATUSES.includes(p.status) },
    { id: 'duplicate', label: 'Duplicate', quick: true, icon: 'copy' },
    { id: 'delete', label: 'Delete', variant: 'danger', divider: true, icon: 'trash' },
  ];

  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'financials', label: 'Financials', icon: 'wallet' },
    { id: 'activity', label: 'Activities', icon: 'activity' },
  ];

  projectTitle = (p: SampleProject) => p.name;
  projectSubtitle = (p: SampleProject) => p.id;

  readonly statusClasses = STATUS_CLASSES;

  // ---- New project form (smart-form showcase) ----
  private fb = inject(FormBuilder);
  private confirm = inject(ConfirmDialogService);
  private qar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'QAR', maximumFractionDigits: 0 });
  formOpen = false;
  saving = false;

  readonly customerOptions: SfOption<string>[] = CUSTOMERS.map((c, i) => ({ label: c, value: c, description: `CUS-${2001 + i}` }));
  readonly typeOptions = toOptions(TYPES);
  readonly managerOptions = toOptions(MANAGERS);
  readonly priorityOptions = toOptions(PRIORITIES);
  readonly billingOptions: SfOption<string>[] = [
    { label: 'Fixed price', value: 'fixed', description: 'One agreed amount' },
    { label: 'Time & material', value: 'tm', description: 'Billed on actual hours' },
    { label: 'Milestones', value: 'milestone', description: 'Split into payments' },
  ];
  readonly serviceOptions = toOptions(['Design', 'Supply', 'Installation', 'Commissioning', 'Training', 'AMC']);

  projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    customer: [null as string | null, Validators.required],
    type: [null as string | null, Validators.required],
    reference: [''],
    manager: [CURRENT_USER as string | null, Validators.required],
    team: [[] as string[]],
    contactEmail: ['', Validators.email],
    contactPhone: ['', Validators.pattern(/^\+?[0-9\s-]{7,15}$/)],
    startDate: [isoDate(new Date()) as string | null, Validators.required],
    dueDate: [null as string | null, [Validators.required, dueAfterStart]],
    kickoffTime: ['09:00' as string | null],
    budget: [null as number | null, [Validators.required, Validators.min(1000)]],
    contingency: [10 as number | null, [Validators.min(0), Validators.max(50)]],
    billing: ['fixed'],
    milestones: [{ value: 3 as number | null, disabled: true }, [Validators.required, Validators.min(2), Validators.max(12)]],
    priority: ['Medium'],
    risk: [30 as number | null],
    services: [[] as string[]],
    tags: [[] as string[]],
    siteSurvey: [false as boolean | null],
    surveyDate: [{ value: null as string | null, disabled: true }, Validators.required],
    notifyCustomer: [true as boolean | null],
    description: ['', Validators.maxLength(500)],
    attachments: [[] as File[] | null],
  });
  private readonly formDefaults = this.projectForm.getRawValue();

  constructor() {
    const f = this.projectForm.controls;
    f.billing.valueChanges.subscribe((b) => (b === 'milestone' ? f.milestones.enable() : f.milestones.disable()));
    f.siteSurvey.valueChanges.subscribe((on) => (on ? f.surveyDate.enable() : f.surveyDate.disable()));
    f.startDate.valueChanges.subscribe(() => f.dueDate.updateValueAndValidity());
  }

  get contingencyAmount(): number {
    const { budget, contingency } = this.projectForm.controls;
    return ((budget.value ?? 0) * (contingency.value ?? 0)) / 100;
  }

  /** Route guard: leaving the page with an open, dirty form asks first (the draft is kept either way). */
  async canDeactivate(): Promise<boolean> {
    if (!this.formOpen || !this.projectForm.dirty) return true;
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Leave without creating the project?',
      message: 'Your entries stay saved as a draft and can be restored next time you open the form.',
      confirmLabel: 'Leave page',
      cancelLabel: 'Stay',
    });
    return confirmed;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.formOpen && this.projectForm.dirty) e.preventDefault();
  }

  closeForm(discarded: boolean, draft: SfDraftDirective): void {
    this.formOpen = false;
    if (discarded) {
      draft.clear();
      this.projectForm.reset(this.formDefaults);
    }
  }

  async submitProject(grid: DataGridComponent<SampleProject>, draft: SfDraftDirective): Promise<void> {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      setTimeout(() => document.querySelector('app-sf-drawer [formcontrolname].ng-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const v = this.projectForm.getRawValue();
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Create this project?',
      message: `A project will be opened for ${v.customer} and the budget reserved against it.`,
      details: [
        { label: 'Project', value: v.name! },
        { label: 'Manager', value: v.manager! },
        { label: 'Approved budget', value: this.qar.format(v.budget!) },
        { label: 'Due', value: new Date(v.dueDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
      ],
      consequence: v.notifyCustomer && v.contactEmail ? `${v.contactEmail} will be emailed immediately.` : undefined,
      confirmLabel: 'Create project',
      cancelLabel: 'Back to form',
    });
    if (!confirmed) return;
    this.saving = true;
    // simulates the create API call
    setTimeout(() => {
      const project: SampleProject = {
        id: `PRJ-${1001 + this.projects.length + Math.floor(Math.random() * 9000)}`,
        name: v.name!,
        customer: v.customer!,
        manager: v.manager!,
        status: 'Planning',
        priority: v.priority!,
        startDate: new Date(v.startDate!).toISOString(),
        dueDate: new Date(v.dueDate!).toISOString(),
        budget: v.budget!,
        spent: 0,
        progress: 0,
        activity: [{ text: 'Project created', by: CURRENT_USER, date: new Date().toISOString() }],
      };
      this.projects = [project, ...this.projects];
      this.saving = false;
      this.formOpen = false;
      draft.clear();
      this.projectForm.reset(this.formDefaults);
      grid.notify(`${project.id} created`);
    }, 600);
  }

  ngOnInit(): void {
    // simulates the API call so the loading skeleton can be reviewed
    setTimeout(() => {
      this.projects = getSampleProjects();
      this.loading = false;
    }, 900);
  }

  /** Real modules fetch the full record here (items, attachments, history) while the panel shows a skeleton. */
  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  budgetUsed(p: SampleProject): number {
    return p.budget ? Math.round((p.spent / p.budget) * 100) : 0;
  }

  rowAccent = (p: SampleProject) => (this.isOverdue(p) ? ('danger' as const) : null);

  isOverdue(p: SampleProject): boolean {
    return !CLOSED_STATUSES.includes(p.status) && this.daysToDue(p) < 0;
  }

  daysToDue(p: SampleProject): number {
    return Math.round((new Date(p.dueDate).getTime() - Date.now()) / 86400000);
  }

  onCellEdit(e: DataGridCellEditEvent<SampleProject>): void {
    if (e.column.editor === 'date' && e.newValue) e.row.dueDate = new Date(e.newValue).toISOString();
  }

  async onRowAction({ action, row }: DataGridRowActionEvent<SampleProject>, grid: DataGridComponent<SampleProject>): Promise<void> {
    const project = [{ label: 'Project', value: `${row.id} · ${row.name}` }, { label: 'Customer', value: row.customer }];
    switch (action.id) {
      case 'duplicate': {
        const { confirmed } = await this.confirm.open({
          tone: 'note',
          title: 'Duplicate project',
          message: 'The copy starts in Planning with the same customer, manager and budget. Activity history and attachments are not copied.',
          details: project,
          confirmLabel: 'Duplicate',
        });
        if (!confirmed) return;
        const copy = { ...row, id: `PRJ-${1001 + this.projects.length + Math.floor(Math.random() * 9000)}`, name: `${row.name} (copy)` };
        this.projects = [copy, ...this.projects];
        grid.notify(`${row.id} duplicated`);
        break;
      }
      case 'complete': {
        const open = row.budget - row.spent;
        const { confirmed } = await this.confirm.open({
          tone: 'approve',
          title: 'Mark project completed?',
          message: 'The final invoice will be raised and the project closed for further time and material entries.',
          details: [...project, { label: 'Spent / budget', value: `${this.qar.format(row.spent)} / ${this.qar.format(row.budget)}` }, { label: 'Progress', value: `${row.progress}%` }],
          consequence: open > 0 ? `${this.qar.format(open)} of unused budget will be released.` : undefined,
          confirmLabel: 'Mark completed',
        });
        if (!confirmed) return;
        row.status = 'Completed';
        this.projects = [...this.projects];
        grid.notify(`${row.id} marked Completed`);
        break;
      }
      case 'hold': {
        const { confirmed, reason } = await this.confirm.open({
          tone: 'warning',
          title: 'Put project on hold?',
          message: 'Scheduled shipments and site visits for this project will be paused until it is resumed.',
          details: [...project, { label: 'Manager', value: row.manager }],
          reason: true,
          reasonLabel: 'Why is it on hold?',
          confirmLabel: 'Put on hold',
        });
        if (!confirmed) return;
        row.status = 'On Hold';
        row.activity = [{ text: `Put on hold: ${reason}`, by: CURRENT_USER, date: new Date().toISOString() }, ...row.activity];
        this.projects = [...this.projects];
        grid.notify(`${row.id} marked On Hold`);
        break;
      }
      case 'delete': {
        const { confirmed } = await this.confirm.open({
          tone: 'reject',
          title: 'Delete project?',
          message: 'The project, its activity history and linked documents will be removed for everyone.',
          details: [...project, { label: 'Budget', value: this.qar.format(row.budget) }],
          consequence: 'This cannot be undone.',
          typeToConfirm: row.id,
          confirmLabel: 'Delete project',
        });
        if (!confirmed) return;
        this.projects = this.projects.filter((p) => p.id !== row.id);
        grid.notify(`${row.id} deleted`);
        break;
      }
    }
  }

  async onBulkAction({ action, rows }: DataGridBulkActionEvent<SampleProject>, grid: DataGridComponent<SampleProject>): Promise<void> {
    const ids = new Set(rows.map((r) => r.id));
    const count = `${rows.length} project${rows.length === 1 ? '' : 's'}`;
    if (action.id === 'delete') {
      const { confirmed } = await this.confirm.open({
        tone: 'reject',
        title: `Delete ${count}?`,
        message: 'The selected projects and their history will be removed for everyone.',
        details: [{ label: 'Selected', value: count }, { label: 'Combined budget', value: this.qar.format(rows.reduce((s, r) => s + r.budget, 0)) }],
        consequence: 'This cannot be undone.',
        confirmLabel: `Delete ${count}`,
      });
      if (!confirmed) return;
      this.projects = this.projects.filter((p) => !ids.has(p.id));
      grid.clearSelection();
      grid.notify(`${count} deleted`);
    } else if (action.id === 'hold' || action.id === 'complete') {
      const status = action.id === 'hold' ? 'On Hold' : 'Completed';
      rows.forEach((r) => (r.status = status));
      this.projects = [...this.projects];
      grid.clearSelection();
      grid.notify(`${count} marked ${status}`);
    } else if (action.id === 'export') {
      await grid.exportToExcel(rows);
    }
  }
}
