import { DatePipe, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getEmployee, getEmployeeDetails } from 'src/app/shared/interfaces/employee.interface';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { EmployeeFormDrawerComponent } from './employee-form-drawer/employee-form-drawer.component';

type EmployeeRow = any;

@Component({
  selector: 'app-employees',
  templateUrl: './employees.component.html',
  styleUrls: ['./employees.component.css'],
  providers: [DatePipe],
  imports: [DatePipe, NgIf, NgSwitch, NgSwitchCase, DataGridComponent, DetailOverviewComponent, DetailTimelineComponent, ActionButtonComponent, EmployeeFormDrawerComponent],
})
export class EmployeesComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<EmployeeRow>;

  rows: EmployeeRow[] = [];
  total = 0;
  page = 1;
  row = 10;
  searchQuery = '';
  isLoading = true;
  createEmployee: boolean | undefined = false;
  canEdit = false;
  currentUserId: string | undefined;

  private sortKey: string | null = null;
  private sortDir: 'asc' | 'desc' | null = null;
  private department: string | null = null;
  private status: 'active' | 'blocked' | null = null;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'HR' }];
  columns: DataGridColumn<EmployeeRow>[] = [];
  views: DataGridView<EmployeeRow>[] = [{ id: 'all', label: 'All' }];
  density: 'comfortable' | 'compact' = 'comfortable';
  rowAccent = (r: EmployeeRow): 'danger' | 'warning' | 'info' | null => (r.isBlocked ? 'danger' : null);
  private activeViewId = 'all';

  rowActions: DataGridRowAction<EmployeeRow>[] = [
    { id: 'view', label: 'Open profile', icon: 'eye', quick: true },
    { id: 'edit', label: 'Edit employee', icon: 'pencil', quick: true, hidden: (r) => !this.canEdit || r._id === this.currentUserId },
  ];

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'contract', label: 'Contract', icon: 'card' },
    { id: 'history', label: 'History', icon: 'activity' },
  ];
  employeeTitle = (r: EmployeeRow) => this.fullName(r);
  employeeSubtitle = (r: EmployeeRow) => [r.designation, r.department?.departmentName].filter(Boolean).join(' · ');

  readonly statusBadgeClasses: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    Blocked: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  };

  formOpen = false;
  formMode: 'create' | 'edit' = 'create';
  formEmployee: getEmployeeDetails | null = null;

  private departmentNames = new Map<string, string>();
  private employeeNames = new Map<string, string>();
  private subscriptions = new Subscription();

  constructor(
    private _employeeService: EmployeeService,
    private _profileService: ProfileService,
    private _router: Router,
    private datePipe: DatePipe,
  ) { }

  ngOnInit() {
    this.buildColumns();
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((data) => {
        this.createEmployee = data?.category.privileges.employee.create;
        this.canEdit = !!data;
        this.currentUserId = data?._id;
      })
    );
    this.loadLookups();
    this.getEmployees();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Departments feed the filter dropdown; both maps resolve the ids stored in employment history. */
  private loadLookups(): void {
    this.subscriptions.add(
      forkJoin({
        departments: this._profileService.getInternalDepartments(),
        employees: this._employeeService.getAllEmployees(),
      }).subscribe(({ departments, employees }) => {
        departments.forEach((d) => this.departmentNames.set(d._id as string, d.departmentName));
        employees.forEach((p) => this.employeeNames.set(p._id as string, this.fullName(p)));
        this.columns = this.columns.map((c) =>
          c.key === 'department' ? { ...c, editorOptions: departments.map((d) => ({ label: d.departmentName, value: d._id })) } : c);
      })
    );
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'employeeId', label: 'Employee ID', width: '140px', sortable: true },
      { key: 'firstName', label: 'Name', sortable: true, valueGetter: (r) => this.fullName(r) },
      { key: 'designation', label: 'Designation', sortable: true },
      { key: 'department', label: 'Department', valueGetter: (r) => r.department?.departmentName ?? '' },
      { key: 'email', label: 'Email', sortable: true },
      { key: 'contactNo', label: 'Contact No.' },
      { key: 'dateOfJoining', label: 'Joined', type: 'date', sortable: true, width: '120px' },
      {
        key: 'status', label: 'Status', type: 'badge', width: '110px',
        valueGetter: (r) => (r.isBlocked ? 'Blocked' : 'Active'),
        editorOptions: [{ label: 'Active', value: 'active' }, { label: 'Blocked', value: 'blocked' }],
        badgeClasses: this.statusBadgeClasses,
      },
    ];
  }

  fullName(p?: { firstName?: string; lastName?: string } | null): string {
    return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
  }

  private formatDate(v?: string | null): string {
    return v ? (this.datePipe.transform(v, 'dd MMM yyyy') ?? '—') : '—';
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;
    this.department = null;
    this.status = null;
    for (const f of query.filters) {
      if (f.key === 'department') this.department = f.value;
      if (f.key === 'status') this.status = f.value;
    }
    this.getEmployees();
  }

  onViewChange(view: DataGridView<EmployeeRow>): void {
    this.activeViewId = view.id;
    this.refreshViewCounts();
  }

  /** Only the active tab has a known total, since rows are server-paged. */
  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  getEmployees(): void {
    this.isLoading = true;
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.employee.viewReport;
      userId = employee?._id;
    }).unsubscribe();

    this.subscriptions.add(
      this._employeeService.getEmployees({
        page: this.page, row: this.row, search: this.searchQuery, access, userId,
        department: this.department, status: this.status, sortKey: this.sortKey, sortDir: this.sortDir,
      }).subscribe({
        next: (data: { total: number, employees: getEmployee[] }) => {
          this.rows = data ? [...data.employees] : [];
          this.total = data ? data.total : 0;
          this.refreshViewCounts();
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        }
      })
    );
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  onRowAction({ action, row }: DataGridRowActionEvent<EmployeeRow>): void {
    if (action.id === 'view') this.openProfile(row);
    if (action.id === 'edit') this.openEditDrawer(row);
  }

  openProfile(row: EmployeeRow): void {
    this._router.navigate(['/hr/employees', 'view', row.employeeId]);
  }

  openCreateDrawer(): void {
    this.formMode = 'create';
    this.formEmployee = null;
    this.formOpen = true;
  }

  openEditDrawer(row: EmployeeRow): void {
    this.formMode = 'edit';
    this.formEmployee = row as getEmployeeDetails;
    this.formOpen = true;
  }

  overviewSections(r: EmployeeRow): DetailOverviewSection[] {
    return [
      {
        title: 'Job',
        columns: '2',
        fields: [
          { type: 'field', label: 'Employee ID', value: r.employeeId, numeric: true, noHover: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Designation', value: r.designation, noHover: true },
          { type: 'field', label: 'Department', value: r.department?.departmentName, noHover: true },
          { type: 'field', label: 'Role', value: r.category ? `${r.category.categoryName} - ${r.category.role}` : '', noHover: true },
          { type: 'field', label: 'Reports to', value: this.fullName(r.reportingTo) || 'No one', noHover: true },
          { type: 'field', label: 'Joined', value: this.formatDate(r.dateOfJoining), noHover: true },
        ],
      },
      {
        title: 'Contact',
        columns: '2',
        fields: [
          { type: 'field', label: 'Email', value: r.email, noHover: true },
          { type: 'field', label: 'Phone', value: r.contactNo, noHover: true },
          { type: 'field', label: 'Date of birth', value: this.formatDate(r.dob), noHover: true },
        ],
      },
    ];
  }

  contractSections(r: EmployeeRow): DetailOverviewSection[] {
    const roles = [r.isTechnician && 'Technician', r.isDriver && 'Driver', r.isProjectManager && 'Project manager'].filter(Boolean).join(', ');
    return [
      {
        title: 'Contract',
        columns: '2',
        fields: [
          { type: 'field', label: 'Type', value: r.contractType ? r.contractType.replace(/^\w/, (c: string) => c.toUpperCase()) : '—', noHover: true },
          { type: 'field', label: 'Start', value: this.formatDate(r.contractStart), noHover: true },
          { type: 'field', label: 'End', value: this.formatDate(r.contractEnd), noHover: true },
          { type: 'field', label: 'Probation end', value: this.formatDate(r.probationEnd), noHover: true },
          { type: 'field', label: 'Work roles', value: roles || '—', noHover: true },
        ],
      },
      {
        title: 'Driver licence',
        columns: '2',
        visible: !!r.isDriver,
        fields: [
          { type: 'field', label: 'Number', value: r.driverLicense?.number || '—', noHover: true },
          { type: 'field', label: 'Class', value: r.driverLicense?.licenseClass || '—', noHover: true },
          { type: 'field', label: 'Expiry', value: this.formatDate(r.driverLicense?.expiry), noHover: true },
        ],
      },
    ];
  }

  historyEntries(r: EmployeeRow) {
    const dept = (id?: string | null) => (id ? this.departmentNames.get(String(id)) ?? '—' : '—');
    const person = (id?: string | null) => (id ? this.employeeNames.get(String(id)) ?? '—' : 'No one');
    return [...(r.employmentHistory ?? [])]
      .sort((a: any, b: any) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())
      .map((h: any) => {
        const changes: { label: string; from: string; to: string }[] = [];
        if ((h.fromDesignation ?? '') !== (h.toDesignation ?? '')) {
          changes.push({ label: 'Designation', from: h.fromDesignation || '—', to: h.toDesignation || '—' });
        }
        if (String(h.fromDepartment ?? '') !== String(h.toDepartment ?? '')) {
          changes.push({ label: 'Department', from: dept(h.fromDepartment), to: dept(h.toDepartment) });
        }
        if (String(h.fromReportingTo ?? '') !== String(h.toReportingTo ?? '')) {
          changes.push({ label: 'Reports to', from: person(h.fromReportingTo), to: person(h.toReportingTo) });
        }
        const by = h.changedBy ? this.employeeNames.get(String(h.changedBy)) : '';
        return {
          text: h.reason || 'Employment change',
          meta: [`Effective ${this.formatDate(h.effectiveDate)}`, by ? `Changed by ${by}` : ''].filter(Boolean).join(' · '),
          tone: 'active' as const,
          changes,
        };
      });
  }
}
