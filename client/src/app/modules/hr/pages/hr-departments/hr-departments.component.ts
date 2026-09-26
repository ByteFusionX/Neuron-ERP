import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NgIf, NgFor, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Subscription, filter, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { Privileges } from 'src/app/shared/interfaces/employee.interface';
import { departmentPrivileges } from 'src/app/shared/utils/privilege-fallback';
import { MatTableDataSource } from '@angular/material/table';
import { CreateDepartmentDialog } from 'src/app/modules/hr/pages/create-department/create-department.component';
import { InternalDepartmentComponent } from 'src/app/modules/hr/pages/internal-department/internal-department.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';

type DepartmentTab = 'department' | 'internal' | 'activity';
type DepartmentGridRow = {
  _id: string;
  kind: DepartmentTab;
  name: string;
  description?: string;
  parent?: string;
  head?: string;
  headcount?: number;
  usage?: string;
  status?: string;
  createdAt?: string | Date;
  source: any;
};

/** Shared size for the department / internal department / customer type dialogs. */
const DEPARTMENT_DIALOG_SIZE = { width: '560px', maxWidth: '95vw' };

@Component({
  selector: 'app-hr-departments',
  standalone: true,
  templateUrl: './hr-departments.component.html',
  styleUrls: ['./hr-departments.component.css'],
  imports: [NgIf, NgFor, NgTemplateOutlet, DatePipe, SkeltonLoadingComponent, DataGridComponent],
})
export class HrDepartmentsComponent implements OnInit, OnDestroy {
  privileges!: Privileges | undefined;
  employeeId!: string;
  categorySection: boolean = false;

  openCreateForm: boolean = false;
  isDepartmentLoading: boolean = true;
  isInternalDepartmentLoading: boolean = true;

  activeTab: DepartmentTab = 'internal';
  auditRows: any[] = [];
  isAuditLoading = false;
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'HR' }];
  detailTabs: DataGridDetailTab[] = [{ id: 'details', label: 'Details', icon: 'info' }];
  departmentColumns: DataGridColumn<DepartmentGridRow>[] = [
    { key: 'name', label: 'Name', sortable: true, locked: true, valueGetter: (row) => row.name },
    {
      key: 'kind',
      label: 'Type',
      type: 'badge',
      sortable: true,
      width: '150px',
      badgeLabel: (value) => value === 'internal' ? 'Internal' : value === 'department' ? 'Sales' : 'Activity',
      badgeClasses: {
        internal: 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30',
        department: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
        activity: 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      },
      valueGetter: (row) => row.kind,
    },
    { key: 'head', label: 'Head / Actor', sortable: true, valueGetter: (row) => row.head || '—' },
    { key: 'usage', label: 'Usage / Details', sortable: false, valueGetter: (row) => row.usage || row.description || '—' },
    { key: 'status', label: 'Status', sortable: true, width: '120px', valueGetter: (row) => row.status || 'Active' },
    { key: 'createdAt', label: 'Created / Time', type: 'date', sortable: true, width: '150px', valueGetter: (row) => row.createdAt },
  ];
  departmentViews: DataGridView<DepartmentGridRow>[] = [
    { id: 'internal', label: 'Internal Departments', predicate: (row) => row.kind === 'internal' },
    { id: 'department', label: 'Sales Departments', predicate: (row) => row.kind === 'department' },
    { id: 'activity', label: 'Activity', predicate: (row) => row.kind === 'activity' },
  ];
  rowActions: DataGridRowAction<DepartmentGridRow>[] = [
    { id: 'edit', label: 'Edit', icon: 'edit', quick: true, panel: true, hidden: (row) => row.kind === 'activity' || !this.deptPrivileges.edit },
    { id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger', hidden: (row) => row.kind === 'activity' || !this.deptPrivileges.delete },
  ];

  openActivity() {
    this.activeTab = 'activity';
    this.isAuditLoading = true;
    this.subscriptions.add(this._profileService.getMasterDataAudit().subscribe({
      next: (rows) => { this.auditRows = rows ?? []; this.isAuditLoading = false; },
      error: () => { this.isAuditLoading = false; }
    }));
  }

  // Internal tab: headcount table + org chart of the selected department (read-only endpoints)
  overviewRows: any[] = [];
  isOverviewLoading: boolean = true;
  selectedOverview: any = null;

  departmentDataSource: any = new MatTableDataSource();
  internalDepartmentDataSource: any = new MatTableDataSource();

  private subscriptions = new Subscription();
  private confirm = inject(ConfirmDialogService);

  constructor(
    private _profileService: ProfileService,
    public dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _toast: ToastrService,
  ) {}

  // Live usage counts (records referencing each item), used for the "in use" hints and delete warnings.
  deptUsage: { customers: Record<string, number>, enquiries: Record<string, number>, contacts: Record<string, number>, employees: Record<string, number> } =
    { customers: {}, enquiries: {}, contacts: {}, employees: {} };

  loadUsage() {
    this.subscriptions.add(this._profileService.getDepartmentUsage().subscribe({ next: (u) => (this.deptUsage = u), error: () => {} }));
  }

  get gridRows(): DepartmentGridRow[] {
    const internalRows = (this.overviewRows ?? []).map((d) => ({
      _id: d._id,
      kind: 'internal' as DepartmentTab,
      name: d.departmentName,
      description: d.description,
      parent: this.overviewParentName(d),
      head: d.departmentHead ? `${d.departmentHead.firstName} ${d.departmentHead.lastName}` : '—',
      headcount: d.headcount ?? 0,
      usage: `${d.headcount ?? 0} employee${(d.headcount ?? 0) === 1 ? '' : 's'} · Parent: ${this.overviewParentName(d)}`,
      status: d.isActive === false ? 'Inactive' : 'Active',
      createdAt: d.createdDate ?? d.createdAt,
      source: d,
    }));
    const salesRows = (this.departmentDataSource.data ?? []).map((d: any) => {
      const id = d?._id;
      const customerCount = this.deptUsage.customers[id] ?? 0;
      const enquiryCount = this.deptUsage.enquiries[id] ?? 0;
      return {
        _id: id,
        kind: 'department' as DepartmentTab,
        name: d.departmentName,
        description: d.description,
        head: d.departmentHead?.[0] ? `${d.departmentHead[0].firstName} ${d.departmentHead[0].lastName}` : '—',
        usage: `${customerCount} customer${customerCount === 1 ? '' : 's'} · ${enquiryCount} ${enquiryCount === 1 ? 'enquiry' : 'enquiries'}`,
        status: d.isActive === false ? 'Inactive' : 'Active',
        createdAt: d.createdDate ?? d.createdAt,
        source: d,
      };
    });
    const activityRows = (this.auditRows ?? []).map((a, index) => ({
      _id: a._id ?? `activity-${index}`,
      kind: 'activity' as DepartmentTab,
      name: `${a.action ?? 'Change'} · ${a.entity ?? 'Record'}`,
      description: a.summary,
      head: a.actorName || 'Unknown user',
      usage: a.summary || '—',
      status: a.action ?? 'Activity',
      createdAt: a.at,
      source: a,
    }));
    return [...internalRows, ...salesRows, ...activityRows];
  }

  get gridLoading(): boolean {
    return this.isOverviewLoading || this.isDepartmentLoading || (this.activeTab === 'activity' && this.isAuditLoading);
  }

  get deptPrivileges() {
    return departmentPrivileges(this.privileges);
  }

  get gridCreateLabel(): string {
    if (!this.deptPrivileges.create) return '';
    if (this.activeTab === 'internal') return 'Add Internal Department';
    if (this.activeTab === 'department') return 'Add Sales Department';
    return '';
  }

  onGridViewChange(view: DataGridView<DepartmentGridRow>) {
    const next = view.id as DepartmentTab;
    this.activeTab = next;
    if (next === 'activity' && !this.auditRows.length && !this.isAuditLoading) this.openActivity();
  }

  onGridCreate() {
    if (this.activeTab === 'internal') this.onCreateInternalDepartment();
    else if (this.activeTab === 'department') this.onCreateDepartment();
  }

  onGridRowOpen(row: DepartmentGridRow) {
    this.activeTab = row.kind;
    if (row.kind === 'internal') this.selectOverview(row._id);
  }

  onGridRowAction(event: DataGridRowActionEvent<DepartmentGridRow>) {
    const index = event.row.kind === 'internal'
      ? this.internalIndex(event.row._id)
      : this.departmentDataSource.data.findIndex((d: any) => d._id === event.row._id);
    if (index < 0) return;
    if (event.action.id === 'edit') this.onDepartmentTabItemEdit(index, event.row.kind);
    if (event.action.id === 'delete') this.onDepartmentTabItemDelete(index, event.row.kind);
  }

  detailTitle(row: DepartmentGridRow): string {
    return row.name;
  }

  detailSubtitle(row: DepartmentGridRow): string {
    if (row.kind === 'internal') return 'Internal department org chart and reporting view';
    if (row.kind === 'department') return 'Sales department usage and ownership';
    return 'Department master-data audit activity';
  }

  ngOnInit(): void {
    this.loadUsage();
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.employeeId = employee?._id!;
        this.privileges = employee?.category?.privileges;
        this.categorySection = this.deptPrivileges.view;

        if (this.deptPrivileges.view) {
          this.loadOverview();
          this.subscriptions.add(
            this._profileService.getDepartments().subscribe({
              next: (data) => {
                if (data) {
                  this.departmentDataSource.data = data;
                  this.isDepartmentLoading = false;
                }
              },
              error: () => {
                this.isDepartmentLoading = false;
              }
            })
          );

          this.subscriptions.add(
            this._profileService.getInternalDepartments().subscribe({
              next: (data) => {
                if (data) {
                  this.internalDepartmentDataSource.data = data;
                  this.isInternalDepartmentLoading = false;
                }
              },
              error: () => {
                this.isInternalDepartmentLoading = false;
              }
            })
          );
        }
      })
    );
  }

  loadOverview(keepSelection = false) {
    const selectedId = keepSelection ? this.selectedOverview?._id : null;
    this.subscriptions.add(
      this._profileService.getInternalDepartmentHeadcount().subscribe({
        next: (data) => {
          this.overviewRows = data ?? [];
          this.isOverviewLoading = false;
          if (selectedId && this.overviewRows.some((r) => r._id === selectedId)) this.selectOverview(selectedId);
          else this.selectedOverview = null;
        },
        error: () => { this.isOverviewLoading = false; },
      })
    );
  }
  selectOverview(id: string) {
    this.subscriptions.add(this._profileService.getInternalDepartmentOrgChart(id).subscribe((d) => (this.selectedOverview = d)));
  }
  overviewParentName(row: any): string {
    const p = this.overviewRows.find((x) => x._id === row.parentDepartment);
    return p ? p.departmentName : '—';
  }
  private internalIndex(id: string): number {
    return this.internalDepartmentDataSource.data.findIndex((d: any) => d._id === id);
  }
  onOverviewEdit(id: string) {
    const i = this.internalIndex(id);
    if (i >= 0) this.onInternalEditClick(i);
  }
  onOverviewDelete(id: string) {
    const i = this.internalIndex(id);
    if (i >= 0) this.onInternalDeleteClick(i);
  }

  departmentTabData(tab: DepartmentTab): any[] {
    switch (tab) {
      case 'internal': return this.internalDepartmentDataSource.data;
      default: return this.departmentDataSource.data;
    }
  }
  departmentTabLoading(tab: DepartmentTab): boolean {
    switch (tab) {
      case 'internal': return this.isInternalDepartmentLoading;
      default: return this.isDepartmentLoading;
    }
  }
  departmentTabTitle(tab: DepartmentTab): string {
    switch (tab) {
      case 'internal': return 'Internal Department';
      default: return 'Sales Department';
    }
  }
  departmentTabCreateLabel(tab: DepartmentTab): string {
    switch (tab) {
      case 'internal': return '+ Add Internal Department';
      default: return '+ Add Sales Department';
    }
  }
  departmentTabEmptyMessage(tab: DepartmentTab): string {
    switch (tab) {
      case 'internal': return 'No internal departments found';
      default: return 'No sales departments found';
    }
  }
  onDepartmentTabCreate(tab: DepartmentTab) {
    switch (tab) {
      case 'internal': return this.onCreateInternalDepartment();
      default: return this.onCreateDepartment();
    }
  }

  departmentTabItemName(item: any): string {
    return item?.departmentName ?? '';
  }
  departmentTabItemMeta(item: any, tab: DepartmentTab): string {
    const id = item?._id;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const parts: string[] = [];
    if (item?.isActive === false) parts.push('Inactive');
    if (item?.code) parts.push(`Code ${item.code}`);
    if (item?.costCentre) parts.push(`CC ${item.costCentre}`);
    if (tab === 'department' && item?.salesTarget) parts.push(`Target ${Number(item.salesTarget).toLocaleString()}/mo`);
    const head = item?.departmentHead?.[0];
    if ((tab === 'department' || tab === 'internal') && head) parts.push(`Head: ${head.firstName} ${head.lastName}`);
    if (tab === 'department') {
      parts.push(plural(this.deptUsage.customers[id] ?? 0, 'customer'), plural(this.deptUsage.enquiries[id] ?? 0, 'enquiry').replace('enquirys', 'enquiries'));
    } else if (tab === 'internal') {
      parts.push(plural(this.deptUsage.employees[id] ?? 0, 'employee'));
    }
    return parts.join(' · ');
  }
  departmentTabItemCreated(item: any): string {
    const raw = item?.createdDate ?? item?.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  onDepartmentTabItemEdit(index: number, tab: DepartmentTab) {
    switch (tab) {
      case 'internal': return this.onInternalEditClick(index);
      default: return this.onEditClick(index);
    }
  }
  onDepartmentTabItemDelete(index: number, tab: DepartmentTab) {
    switch (tab) {
      case 'internal': return this.onInternalDeleteClick(index);
      default: return this.onDeleteClick(index);
    }
  }

  onCreateDepartment() {
    const dialogRef = this.dialog.open(CreateDepartmentDialog, { ...DEPARTMENT_DIALOG_SIZE,
      data: { forCustomer: false }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        data.departmentHead = [data.departmentHead];
        this.departmentDataSource.data = [...this.departmentDataSource.data, data];
      }
    });
  }

  onCreateInternalDepartment() {
    const dialogRef = this.dialog.open(InternalDepartmentComponent, { ...DEPARTMENT_DIALOG_SIZE });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        data.departmentHead = [data.departmentHead];
        this.internalDepartmentDataSource.data = [...this.internalDepartmentDataSource.data, data];
        this.loadOverview(true);
      }
    });
  }

  onEditClick(index: number) {
    let department = this.departmentDataSource.data[index];
    if (department) {
      const dialogRef = this.dialog.open(CreateDepartmentDialog, { ...DEPARTMENT_DIALOG_SIZE, data: { forCustomer: false, department } });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          data.departmentHead = [data.departmentHead];
          this.departmentDataSource.data[index] = data;
          this.departmentDataSource.data = [...this.departmentDataSource.data];
        }
      });
    }
  }

  onInternalEditClick(index: number) {
    let department = this.internalDepartmentDataSource.data[index];
    if (department) {
      const dialogRef = this.dialog.open(InternalDepartmentComponent, { ...DEPARTMENT_DIALOG_SIZE, data: department });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          data.departmentHead = [data.departmentHead];
          this.internalDepartmentDataSource.data[index] = data;
          this.internalDepartmentDataSource.data = [...this.internalDepartmentDataSource.data];
          this.loadOverview(true);
        }
      });
    }
  }

  async onDeleteClick(index: number) {
    let department = this.departmentDataSource.data[index];
    if (department) {
      const { confirmed } = await this.confirm.open({
        tone: 'reject',
        title: 'Delete Department?',
        message: `Are you sure you want to delete "${department.departmentName}" department?`,
        consequence: 'This cannot be undone.',
        confirmLabel: 'Delete',
      });
      if (confirmed) {
        this._profileService.deleteDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
          next: () => {
            this.departmentDataSource.data.splice(index, 1);
            this.departmentDataSource._updateChangeSubscription();
            this._toast.success('Department deleted successfully'); this.loadUsage();
          },
          error: (error) => {
            this._toast.error(error.error.message || 'Failed to delete department');
          }
        });
      }
    }
  }

  async onInternalDeleteClick(index: number) {
    let department = this.internalDepartmentDataSource.data[index];
    if (department) {
      const { confirmed } = await this.confirm.open({
        tone: 'reject',
        title: 'Delete Internal Department?',
        message: `Are you sure you want to delete "${department.departmentName}" department?`,
        consequence: 'This cannot be undone.',
        confirmLabel: 'Delete',
      });
      if (confirmed) {
          this._profileService.deleteInternalDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
            next: () => {
              this.internalDepartmentDataSource.data.splice(index, 1);
              this.internalDepartmentDataSource._updateChangeSubscription();
              this._toast.success('Internal department deleted successfully'); this.loadUsage();
              this.loadOverview();
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete internal department');
            }
          });
      }
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
