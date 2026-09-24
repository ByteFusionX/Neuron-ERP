import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NgIf, NgFor, NgClass, NgTemplateOutlet, DatePipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { Subscription, filter, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { Privileges } from 'src/app/shared/interfaces/employee.interface';
import { MatTableDataSource } from '@angular/material/table';
import { CreateDepartmentDialog } from 'src/app/modules/hr/pages/create-department/create-department.component';
import { InternalDepartmentComponent } from 'src/app/modules/hr/pages/internal-department/internal-department.component';
import { CreateCustomerTypeDialog } from 'src/app/modules/hr/pages/create-customer-type/create-customer-type.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';

type DepartmentTab = 'department' | 'internal' | 'customerType' | 'customerDepartment' | 'activity';

/** Shared size for the department / internal department / customer type dialogs. */
const DEPARTMENT_DIALOG_SIZE = { width: '560px', maxWidth: '95vw' };

@Component({
  selector: 'app-hr-departments',
  standalone: true,
  templateUrl: './hr-departments.component.html',
  styleUrls: ['./hr-departments.component.css'],
  imports: [NgIf, NgFor, NgClass, NgTemplateOutlet, DatePipe, NgIcon, SkeltonLoadingComponent, ActionButtonComponent],
})
export class HrDepartmentsComponent implements OnInit, OnDestroy {
  privileges!: Privileges | undefined;
  employeeId!: string;
  categorySection: boolean = false;

  openCreateForm: boolean = false;
  isDepartmentLoading: boolean = true;
  isInternalDepartmentLoading: boolean = true;
  isCustomerDepartmentLoading: boolean = true;
  isCustomerTypeLoading: boolean = true;

  activeTab: DepartmentTab = 'internal';
  auditRows: any[] = [];
  isAuditLoading = false;

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
  customerDepartmentDataSource: any = new MatTableDataSource();
  customerTypeDataSource: any = new MatTableDataSource();

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
  typeUsage: Record<string, number> = {};

  loadUsage() {
    this.subscriptions.add(this._profileService.getDepartmentUsage().subscribe({ next: (u) => (this.deptUsage = u), error: () => {} }));
    this.subscriptions.add(this._profileService.getCustomerTypeUsage().subscribe({ next: (u) => (this.typeUsage = u), error: () => {} }));
  }

  ngOnInit(): void {
    this.loadUsage();
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.employeeId = employee?._id!;
        this.privileges = employee?.category?.privileges;
        this.categorySection = employee?.category.role == 'superAdmin';

        if (!this.privileges?.portalManagement?.department) this.activeTab = 'customerType';

        if (this.privileges?.portalManagement?.department) {
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

        if (this.privileges?.portalManagement?.customerType) {
          this.subscriptions.add(
            this._profileService.getCustomerDepartments().subscribe({
              next: (data) => {
                if (data) {
                  this.customerDepartmentDataSource.data = data;
                  this.isCustomerDepartmentLoading = false;
                }
              },
              error: () => {
                this.isCustomerDepartmentLoading = false;
              }
            })
          );

          this.subscriptions.add(
            this._profileService.getCustomerTypes().subscribe({
              next: (data) => {
                if (data) {
                  this.customerTypeDataSource.data = data;
                  this.isCustomerTypeLoading = false;
                }
              },
              error: () => {
                this.isCustomerTypeLoading = false;
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
      case 'customerType': return this.customerTypeDataSource.data;
      case 'customerDepartment': return this.customerDepartmentDataSource.data;
      default: return this.departmentDataSource.data;
    }
  }
  departmentTabLoading(tab: DepartmentTab): boolean {
    switch (tab) {
      case 'internal': return this.isInternalDepartmentLoading;
      case 'customerType': return this.isCustomerTypeLoading;
      case 'customerDepartment': return this.isCustomerDepartmentLoading;
      default: return this.isDepartmentLoading;
    }
  }
  departmentTabTitle(tab: DepartmentTab): string {
    switch (tab) {
      case 'internal': return 'Internal Department';
      case 'customerType': return 'Customer Type';
      case 'customerDepartment': return 'Customer Department';
      default: return 'Department';
    }
  }
  departmentTabCreateLabel(tab: DepartmentTab): string {
    switch (tab) {
      case 'internal': return '+ Add Internal Department';
      case 'customerType': return '+ Add Customer Type';
      case 'customerDepartment': return '+ Add Customer Department';
      default: return '+ Add Department';
    }
  }
  departmentTabEmptyMessage(tab: DepartmentTab): string {
    switch (tab) {
      case 'internal': return 'No internal departments found';
      case 'customerType': return 'No customer types found';
      case 'customerDepartment': return 'No customer departments found';
      default: return 'No departments found';
    }
  }
  onDepartmentTabCreate(tab: DepartmentTab) {
    switch (tab) {
      case 'internal': return this.onCreateInternalDepartment();
      case 'customerType': return this.onCreateCustomerType();
      case 'customerDepartment': return this.onCreateCustomerDepartment();
      default: return this.onCreateDepartment();
    }
  }

  departmentTabItemName(item: any): string {
    return item?.departmentName ?? item?.customerTypeName ?? '';
  }
  departmentTabItemMeta(item: any, tab: DepartmentTab): string {
    const id = item?._id;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const parts: string[] = [];
    if (item?.isActive === false) parts.push('Inactive');
    if (item?.code) parts.push(`Code ${item.code}`);
    if (item?.costCentre) parts.push(`CC ${item.costCentre}`);
    if (tab === 'department' && item?.salesTarget) parts.push(`Target ${Number(item.salesTarget).toLocaleString()}/mo`);
    if (tab === 'customerType' && item?.defaultDiscount) parts.push(`${item.defaultDiscount}% discount`);
    const head = item?.departmentHead?.[0];
    if ((tab === 'department' || tab === 'internal') && head) parts.push(`Head: ${head.firstName} ${head.lastName}`);
    if (tab === 'department') {
      parts.push(plural(this.deptUsage.customers[id] ?? 0, 'customer'), plural(this.deptUsage.enquiries[id] ?? 0, 'enquiry').replace('enquirys', 'enquiries'));
    } else if (tab === 'customerDepartment') {
      parts.push(plural(this.deptUsage.contacts[id] ?? 0, 'contact'));
    } else if (tab === 'internal') {
      parts.push(plural(this.deptUsage.employees[id] ?? 0, 'employee'));
    } else if (tab === 'customerType') {
      parts.push(plural(this.typeUsage[id] ?? 0, 'customer'));
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
      case 'customerType': return this.onEditCustomerTypeClick(index);
      case 'customerDepartment': return this.onEditCustomerClick(index);
      default: return this.onEditClick(index);
    }
  }
  onDepartmentTabItemDelete(index: number, tab: DepartmentTab) {
    switch (tab) {
      case 'internal': return this.onInternalDeleteClick(index);
      case 'customerType': return this.onCustomerTypeDeleteClick(index);
      case 'customerDepartment': return this.onCustomerDeleteClick(index);
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

  onCreateCustomerDepartment() {
    const dialogRef = this.dialog.open(CreateDepartmentDialog, { ...DEPARTMENT_DIALOG_SIZE,
      data: { forCustomer: true }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        data.departmentHead = [data.departmentHead];
        this.customerDepartmentDataSource.data = [...this.customerDepartmentDataSource.data, data];
        this.customerDepartmentDataSource._updateChangeSubscription();
      }
    });
  }

  onCreateCustomerType() {
    const dialogRef = this.dialog.open(CreateCustomerTypeDialog, { ...DEPARTMENT_DIALOG_SIZE,
      data: {}
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        this.customerTypeDataSource.data = [...this.customerTypeDataSource.data, data];
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

  onEditCustomerClick(index: number) {
    let department = this.customerDepartmentDataSource.data[index];
    if (department) {
      const dialogRef = this.dialog.open(CreateDepartmentDialog, { ...DEPARTMENT_DIALOG_SIZE, data: { forCustomer: true, department } });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          data.departmentHead = [data.departmentHead];
          this.customerDepartmentDataSource.data[index] = data;
          this.customerDepartmentDataSource._updateChangeSubscription();
        }
      });
    }
  }

  onEditCustomerTypeClick(index: number) {
    let customerType = this.customerTypeDataSource.data[index];
    if (customerType) {
      const dialogRef = this.dialog.open(CreateCustomerTypeDialog, { ...DEPARTMENT_DIALOG_SIZE, data: { customerType } });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          this.customerTypeDataSource.data[index] = data;
          this.customerTypeDataSource._updateChangeSubscription();
        }
      });
    }
  }

  async onCustomerTypeDeleteClick(index: number) {
    let customerType = this.customerTypeDataSource.data[index];
    if (customerType) {
      const { confirmed } = await this.confirm.open({
        tone: 'reject',
        title: 'Delete Customer Type?',
        message: `Are you sure you want to delete "${customerType.customerTypeName}" department?`,
        consequence: 'This cannot be undone.',
        confirmLabel: 'Delete',
      });
      if (confirmed) {
          this._profileService.deleteCustomerType({ dataId: customerType._id, employee: this.employeeId }).subscribe({
            next: () => {
              this.customerTypeDataSource.data.splice(index, 1);
              this.customerTypeDataSource._updateChangeSubscription();
              this._toast.success('Customer Type deleted successfully');
              this.loadUsage();
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete customer type');
            }
          });
      }
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

  async onCustomerDeleteClick(index: number) {
    let department = this.customerDepartmentDataSource.data[index];
    if (department) {
      const { confirmed } = await this.confirm.open({
        tone: 'reject',
        title: 'Delete Customer Department?',
        message: `Are you sure you want to delete "${department.departmentName}" department?`,
        consequence: 'This cannot be undone.',
        confirmLabel: 'Delete',
      });
      if (confirmed) {
          this._profileService.deleteCustomerDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
            next: () => {
              this.customerDepartmentDataSource.data.splice(index, 1);
              this.customerDepartmentDataSource._updateChangeSubscription();
              this._toast.success('Customer department deleted successfully'); this.loadUsage();
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete customer department');
            }
          });
      }
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
