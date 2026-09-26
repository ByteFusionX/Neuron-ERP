import { Component, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, firstValueFrom, forkJoin, map, of, catchError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { CreateDepartmentDialog } from 'src/app/modules/hr/pages/create-department/create-department.component';
import { CreateCustomerTypeDialog } from 'src/app/modules/hr/pages/create-customer-type/create-customer-type.component';
import { MasterCustomRow, MasterDataGridComponent, MasterTab } from './master-data-grid.component';

const MASTER_DIALOG_SIZE = { width: '560px', maxWidth: '95vw' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

@Component({
  selector: 'app-customer-data',
  standalone: true,
  imports: [MasterDataGridComponent],
  template: `
    <app-master-data-grid label="Customer Data" storageKey="customer" [tabs]="tabs"
      description="Customer-facing lists and shared classifications used by Customer and downstream sales documents."></app-master-data-grid>
  `,
})
export class CustomerDataComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);

  employeeId = '';

  tabs: MasterTab[] = [
    { id: 'paymentTerms', label: 'Payment Terms', title: 'Payment term', list: 'paymentTerms', valueLabel: 'Days', hint: 'Used on Customer now; also reused by Quotation and Deal approval checks.' },
    { id: 'source', label: 'Sources', title: 'Customer source', list: 'source', hint: 'Same source list used by Customer and Enquiry until separate customer-source settings are added.' },
    { id: 'industry', label: 'Industries', title: 'Industry', list: 'industry', hint: 'Shared with Enquiry to keep customer and lead classification consistent.' },
    {
      id: 'customerTypes', label: 'Customer Types', title: 'Customer type',
      hint: 'Used by Customer records for customer classification and default discount context.',
      custom: {
        load: () => this.loadCustomerTypes(),
        create: () => this.closedWithData(this.dialog.open(CreateCustomerTypeDialog, { ...MASTER_DIALOG_SIZE, data: {} })),
        edit: (row) => this.closedWithData(this.dialog.open(CreateCustomerTypeDialog, { ...MASTER_DIALOG_SIZE, data: { customerType: row.source } })),
        remove: (row) => this.removeCustomerType(row),
      },
    },
    {
      id: 'customerDepartments', label: 'Customer Departments', title: 'Customer department',
      hint: 'Used for customer contact departments, such as Procurement, Accounts or Engineering.',
      custom: {
        load: () => this.loadCustomerDepartments(),
        create: () => this.closedWithData(this.dialog.open(CreateDepartmentDialog, { ...MASTER_DIALOG_SIZE, data: { forCustomer: true } })),
        edit: (row) => this.closedWithData(this.dialog.open(CreateDepartmentDialog, { ...MASTER_DIALOG_SIZE, data: { forCustomer: true, department: row.source } })),
        remove: (row) => this.removeCustomerDepartment(row),
      },
    },
  ];

  ngOnInit(): void {
    this.employeeService.employeeData$.subscribe((employee) => {
      this.employeeId = employee?._id ?? this.employeeId;
    });
  }

  private async closedWithData(ref: { afterClosed: () => Observable<any> }): Promise<boolean> {
    return !!(await firstValueFrom(ref.afterClosed()));
  }

  private loadCustomerTypes(): Observable<MasterCustomRow[]> {
    return forkJoin({
      list: this.profileService.getCustomerTypes(),
      usage: this.profileService.getCustomerTypeUsage().pipe(catchError(() => of({} as Record<string, number>))),
    }).pipe(map(({ list, usage }) => (list ?? []).map((item: any) => {
      const parts: string[] = [];
      if (item.defaultDiscount) parts.push(`${item.defaultDiscount}% discount`);
      parts.push(plural(usage?.[item._id] ?? 0, 'customer'));
      return { _id: item._id, name: item.customerTypeName, detail: parts.join(' · '), status: item.isActive === false ? 'Inactive' : 'Active', source: item };
    })));
  }

  private loadCustomerDepartments(): Observable<MasterCustomRow[]> {
    return forkJoin({
      list: this.profileService.getCustomerDepartments(),
      usage: this.profileService.getDepartmentUsage().pipe(catchError(() => of(null as any))),
    }).pipe(map(({ list, usage }) => (list ?? []).map((item: any) => {
      const parts: string[] = [];
      if (item.code) parts.push(`Code ${item.code}`);
      parts.push(plural(usage?.contacts?.[item._id] ?? 0, 'contact'));
      return { _id: item._id, name: item.departmentName, detail: parts.join(' · '), status: item.isActive === false ? 'Inactive' : 'Active', source: item };
    })));
  }

  private async removeCustomerType(row: MasterCustomRow): Promise<boolean> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Customer Type?',
      message: `Delete "${row.name}"?`,
      consequence: 'This cannot be undone. Customers using this type may block the delete.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return false;
    return this.deleteCall(this.profileService.deleteCustomerType({ dataId: row._id, employee: this.employeeId }), 'Customer Type deleted successfully', 'Failed to delete customer type');
  }

  private async removeCustomerDepartment(row: MasterCustomRow): Promise<boolean> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Customer Department?',
      message: `Delete "${row.name}"?`,
      consequence: 'This cannot be undone. Customer contacts using this department may block the delete.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return false;
    return this.deleteCall(this.profileService.deleteCustomerDepartment({ dataId: row._id, employee: this.employeeId }), 'Customer department deleted successfully', 'Failed to delete customer department');
  }

  private deleteCall(call: Observable<any>, okMessage: string, failMessage: string): Promise<boolean> {
    return new Promise((resolve) => call.subscribe({
      next: () => { this.toast.success(okMessage); resolve(true); },
      error: (e) => { this.toast.error(e.error?.message || failMessage); resolve(false); },
    }));
  }
}
