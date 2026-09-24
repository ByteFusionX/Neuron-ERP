import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf, NgSwitch, NgSwitchCase, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subscription, filter, forkJoin, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getEmployeeDetails, Target } from 'src/app/shared/interfaces/employee.interface';
import { SetTargetComponent } from 'src/app/shared/components/set-target/set-target.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import {
  DetailViewBadge, DetailViewBreadcrumb, DetailViewShellComponent, DetailViewStat, DetailViewTab,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { EmployeeFormDrawerComponent } from '../employee-form-drawer/employee-form-drawer.component';

type Tab = 'overview' | 'history' | 'targets';

@Component({
  selector: 'app-view-employee',
  templateUrl: './view-employee.component.html',
  styleUrls: ['./view-employee.component.css'],
  imports: [
    NgIf, NgFor, NgSwitch, NgSwitchCase, DatePipe, DecimalPipe, TitleCasePipe,
    DetailViewShellComponent, DetailSectionComponent, DetailFieldComponent,
    DetailTableComponent, DetailTimelineComponent, ActionButtonComponent, EmployeeFormDrawerComponent,
  ],
})
export class ViewEmployeeComponent implements OnInit, OnDestroy {

  employeeData: getEmployeeDetails | null = null;
  loading = true;
  editOpen = false;
  tab: Tab = 'overview';

  isSuperAdmin = false;
  currentEmployeeId?: string;

  targets: Target[] = [];
  historyEntries: DetailTimelineEntry[] = [];

  breadcrumbs: DetailViewBreadcrumb[] = [];
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  tabs: DetailViewTab[] = [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'Employment history' }];

  readonly targetColumns: DetailTableColumn[] = [
    { key: 'year', label: 'Year' },
    { key: 'type', label: 'Target type' },
    { key: 'target', label: 'Target value', type: 'currency' },
    { key: 'critical', label: 'Critical', type: 'currency' },
    { key: 'moderate', label: 'Moderate', type: 'currency' },
  ];
  targetRows: Record<string, any>[] = [];

  private subscriptions = new Subscription();
  private departmentNames = new Map<string, string>();
  private employeeNames = new Map<string, string>();

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private _toast: ToastrService,
    private employeeService: EmployeeService,
    private profileService: ProfileService,
    private route: ActivatedRoute,
    private confirm: ConfirmDialogService,
  ) { }

  ngOnInit() {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((employee) => {
        this.currentEmployeeId = employee?._id;
        this.isSuperAdmin = employee?.category?.role === 'superAdmin';
        if (!this.employeeData && employee) this.load();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get isOwnProfile(): boolean {
    return !!this.employeeData && !!this.currentEmployeeId && this.currentEmployeeId === this.employeeData._id;
  }

  get canDelete(): boolean { return this.isSuperAdmin && !this.isOwnProfile; }

  private load(): void {
    const employeeId = this.route.snapshot.paramMap.get('employeeId');
    if (!employeeId) {
      this.navigateToEmployeeList();
      return;
    }

    this.subscriptions.add(
      this.employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        const access = employee?.category?.privileges?.employee?.viewReport;
        this.employeeService.getEmployeeByEmployeeId(employeeId, access, employee?._id).subscribe({
          next: (res) => {
            if (res?.access) {
              this.setEmployee(res.employeeData);
            } else {
              this.loading = false;
              this._toast.warning('You do not have permission to view this employee’s details.');
              this.navigateToEmployeeList();
            }
          },
          error: () => this.navigateToEmployeeList(),
        });
      })
    );
  }

  private navigateToEmployeeList(): void {
    this.router.navigateByUrl('/hr/employees');
  }

  private setEmployee(e: getEmployeeDetails): void {
    this.employeeData = e;
    this.loading = false;
    this.targets = e.targets ?? [];
    this.buildHeader(e);
    this.buildTabs(e);
    this.buildTargetRows();
    this.loadHistoryNames(e);
  }

  // --- header ----------------------------------------------------------------

  fullName(p?: { firstName?: string; lastName?: string } | null): string {
    return ((p?.firstName || '') + ' ' + (p?.lastName || '')).trim();
  }

  private initials(name: string): string {
    return name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  get headerAvatarText(): string { return this.initials(this.fullName(this.employeeData)); }
  get headerTitle(): string { return this.fullName(this.employeeData); }
  get headerSubtitle(): string {
    const e = this.employeeData;
    if (!e) return '';
    return [e.designation, e.department?.departmentName, e.employeeId].filter(Boolean).join(' · ');
  }

  private buildHeader(e: getEmployeeDetails): void {
    this.breadcrumbs = [
      { label: 'Home', link: ['/home'] },
      { label: 'Employees', link: ['/hr/employees'] },
      { label: this.fullName(e) || e.employeeId },
    ];

    const badges: DetailViewBadge[] = [];
    if (e.isBlocked) badges.push({ label: 'Blocked', tone: 'bad' });
    if (e.isTechnician) badges.push({ label: 'Technician', tone: 'info' });
    if (e.isDriver) badges.push({ label: 'Driver', tone: 'info' });
    if (e.isProjectManager) badges.push({ label: 'Project manager', tone: 'info' });
    this.badges = badges;

    this.stats = [
      { label: 'Joined', value: this.formatDate(e.dateOfJoining) },
      { label: 'Tenure', value: this.tenure(e.dateOfJoining) },
      { label: 'Contract', value: e.contractType ? this.titleCase(e.contractType) : '—' },
      { label: 'Reports to', value: this.fullName(e.reportingTo) || 'No one' },
    ];
  }

  private buildTabs(e: getEmployeeDetails): void {
    const tabs: DetailViewTab[] = [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'Employment history' }];
    if (e.category?.isSalespersonWithTarget) tabs.push({ id: 'targets', label: 'Targets' });
    this.tabs = tabs;
    if (!tabs.some((t) => t.id === this.tab)) this.tab = 'overview';
  }

  onTabChange(id: string): void {
    this.tab = id as Tab;
  }

  private titleCase(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  private formatDate(v?: string): string {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private tenure(from?: string): string {
    if (!from) return '—';
    const start = new Date(from);
    if (Number.isNaN(start.getTime())) return '—';
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months--;
    if (months < 1) return 'Under a month';
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');
  }

  // --- employment history ------------------------------------------------------

  /** History stores ids; department and manager names are resolved once for the timeline. */
  private loadHistoryNames(e: getEmployeeDetails): void {
    if (!e.employmentHistory?.length) {
      this.historyEntries = [];
      return;
    }
    this.subscriptions.add(
      forkJoin({
        departments: this.profileService.getInternalDepartments(),
        employees: this.employeeService.getAllEmployees(),
      }).subscribe({
        next: ({ departments, employees }) => {
          departments.forEach((d) => this.departmentNames.set(d._id as string, d.departmentName));
          employees.forEach((p) => this.employeeNames.set(p._id as string, this.fullName(p)));
          this.buildHistory(e);
        },
        error: () => this.buildHistory(e),
      })
    );
  }

  private buildHistory(e: getEmployeeDetails): void {
    const dept = (id?: string | null) => (id ? this.departmentNames.get(String(id)) ?? '—' : '—');
    const person = (id?: string | null) => (id ? this.employeeNames.get(String(id)) ?? '—' : 'No one');

    this.historyEntries = [...(e.employmentHistory ?? [])]
      .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())
      .map((h) => {
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

  // --- targets -------------------------------------------------------------------

  private buildTargetRows(): void {
    this.targetRows = this.targets.flatMap((t) => [
      { year: t.year, type: 'Sales Revenue', target: t.salesRevenue.targetValue, critical: t.salesRevenue.criticalRange, moderate: t.salesRevenue.moderateRange, id: t._id },
      { year: '', type: 'Gross Profit', target: t.grossProfit.targetValue, critical: t.grossProfit.criticalRange, moderate: t.grossProfit.moderateRange, id: t._id },
    ]);
  }

  addCompanyTarget(): void {
    this.dialog.open(SetTargetComponent).afterClosed().subscribe((data: Target) => {
      if (!data || !this.employeeData) return;
      this.employeeService.setTarget(data, this.employeeData._id).subscribe({
        next: (res) => this.applyTargets(res),
        error: (error) => this._toast.warning(error.error.message),
      });
    });
  }

  editTarget(id: string): void {
    const target = this.targets.find((t) => t._id === id);
    this.dialog.open(SetTargetComponent, { data: target }).afterClosed().subscribe((data: Target) => {
      if (!data || !this.employeeData) return;
      this.employeeService.updateTarget(data, id, this.employeeData._id).subscribe({
        next: (res) => this.applyTargets(res),
        error: (error) => this._toast.warning(error.error.message),
      });
    });
  }

  private applyTargets(res: Target[]): void {
    this.targets = res ?? [];
    if (this.employeeData) this.employeeData.targets = this.targets;
    this.buildTargetRows();
  }

  // --- actions ---------------------------------------------------------------------

  onEmployeeEdit(): void {
    this.editOpen = true;
  }

  /** The list and view APIs shape a record differently from the save response, so re-read it. */
  onEmployeeSaved(): void {
    this.editOpen = false;
    this.employeeData = null;
    this.loading = true;
    this.load();
  }

  async toggleBlockStatus(): Promise<void> {
    const e = this.employeeData;
    if (!e) return;
    const wasBlocked = !!e.isBlocked;
    const { confirmed } = await this.confirm.open({
      tone: wasBlocked ? 'approve' : 'warning',
      title: wasBlocked ? 'Unblock employee' : 'Block employee',
      message: wasBlocked ? 'This person will be able to sign in again.' : 'This person will no longer be able to sign in.',
      details: [{ label: 'Employee', value: `${this.fullName(e)} (${e.employeeId})` }],
      confirmLabel: wasBlocked ? 'Unblock' : 'Block',
    });
    if (!confirmed) return;

    this.employeeService.blockEmployee(e._id!).subscribe({
      next: () => {
        e.isBlocked = !wasBlocked;
        this.buildHeader(e);
        this._toast.success(wasBlocked ? 'Employee Unblocked Successfully' : 'Employee Blocked Successfully');
      },
      error: (error) => this._toast.error(error.error?.message || 'Failed to update block status'),
    });
  }

  async deleteEmployee(): Promise<void> {
    const e = this.employeeData;
    if (!e) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete employee',
      message: `Are you sure you want to delete ${this.fullName(e)}?`,
      details: [{ label: 'Employee', value: e.employeeId }],
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    this.employeeService.deleteEmployee({ dataId: e._id!, employeeId: this.currentEmployeeId! }).subscribe({
      next: () => {
        this._toast.success('Employee deleted successfully');
        this.navigateToEmployeeList();
      },
      error: (error) => this._toast.error(error.error?.message || 'Failed to delete employee'),
    });
  }
}
