import { SettingsSectionHeaderComponent } from 'src/app/modules/settings/pages/settings-section-header.component';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { Subscription, filter, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridColumn, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { RoleFormDrawerComponent } from '../role-form-drawer/role-form-drawer.component';

@Component({
  selector: 'app-hr-roles-privileges',
  standalone: true,
  templateUrl: './hr-roles-privileges.component.html',
  styleUrls: ['./hr-roles-privileges.component.css'],
  imports: [SettingsSectionHeaderComponent, NgIf, DataGridComponent, RoleFormDrawerComponent],
})
export class HrRolesPrivilegesComponent implements OnInit, OnDestroy {
  employeeId!: string;
  categorySection: boolean = false;
  formOpen = false;
  formMode: 'create' | 'edit' | 'view' = 'create';
  formCategory: GetCategory | null = null;
  isCategoryLoading: boolean = true;
  roles: GetCategory[] = [];

  columns: DataGridColumn<GetCategory>[] = [
    { key: 'categoryName', label: 'Role Name', sortable: true, locked: true },
    { key: 'role', label: 'Role', sortable: true, valueGetter: (r) => this.titleCase(r.role) },
    { key: 'employeeCount', label: 'No. of Employees', type: 'number', sortable: true },
  ];
  rowActions: DataGridRowAction<GetCategory>[] = [
    { id: 'edit', label: 'Edit', icon: 'pencil', quick: true },
    { id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger', quick: true },
  ];

  private subscriptions = new Subscription();

  constructor(
    private _confirm: ConfirmDialogService,
    private _employeeService: EmployeeService,
    private _toast: ToastrService,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.employeeId = employee?._id!;
        this.categorySection = employee?.category.role == 'superAdmin';

        if (this.categorySection) this.loadCategories();
      })
    );
  }

  private loadCategories(): void {
    this.subscriptions.add(
      this._employeeService.getCategory().subscribe({
        next: (data) => {
          this.roles = data ?? [];
          this.isCategoryLoading = false;
        },
        error: () => {
          this.isCategoryLoading = false;
        },
      })
    );
  }

  createCategory() {
    this.formMode = 'create';
    this.formCategory = null;
    this.formOpen = true;
  }

  onFormSaved(): void {
    this.formOpen = false;
    this.loadCategories();
  }

  viewCategory(data: GetCategory) {
    this.formMode = 'view';
    this.formCategory = data;
    this.formOpen = true;
  }

  editCategory(data: GetCategory) {
    this.formMode = 'edit';
    this.formCategory = data;
    this.formOpen = true;
  }

  onRowAction(e: DataGridRowActionEvent<GetCategory>): void {
    if (e.action.id === 'edit') this.editCategory(e.row);
    else if (e.action.id === 'delete') this.deleteCategory(e.row);
  }

  private titleCase(v: string): string {
    return (v ?? '').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  async deleteCategory(category: GetCategory): Promise<void> {
    const { confirmed } = await this._confirm.open({
      tone: 'reject',
      title: 'Delete role?',
      message: `Delete "${category.categoryName}"?`,
      confirmLabel: 'Delete',
    });
    if (!confirmed || !category._id) return;
    this._employeeService.deleteCategory({ dataId: category._id, employee: this.employeeId }).subscribe({
      next: () => {
        this.roles = this.roles.filter((r) => r !== category);
        this._toast.success('Category deleted successfully');
      },
      error: (error) => this._toast.error(error.error?.message || 'Failed to delete category'),
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
