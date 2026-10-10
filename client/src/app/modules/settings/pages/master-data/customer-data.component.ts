import { Component, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, firstValueFrom, map } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { CreateCustomerTypeDialog } from './create-customer-type/create-customer-type.component';
import { MasterCustomRow, MasterDataGridComponent, MasterTab } from './master-data-grid.component';

const DIALOG_SIZE = { width: '480px', maxWidth: '95vw' };

@Component({
  selector: 'app-customer-data',
  standalone: true,
  imports: [MasterDataGridComponent],
  template: `
    <app-master-data-grid label="Customer Data" storageKey="customer" [tabs]="tabs"
      description="Commercial terms and classification lists used by customer records."></app-master-data-grid>
  `,
})
export class CustomerDataComponent implements OnInit {
  private dialog = inject(MatDialog);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);

  private employeeId = '';
  private customerTypesById: Record<string, getCustomerType> = {};

  tabs: MasterTab[] = [
    {
      id: 'customerType', label: 'Customer Type', title: 'Customer type', hint: 'Used by the Customer Type field on customer records, with an optional default discount.',
      custom: {
        load: () => this.loadCustomerTypes(),
        create: () => this.createCustomerType(),
        edit: (row) => this.editCustomerType(row),
        remove: (row) => this.removeCustomerType(row),
      },
    },
    { id: 'paymentTerms', label: 'Payment Terms', title: 'Payment term', list: 'paymentTerms', valueLabel: 'Days', hint: 'Used by the Payment Terms field on customer records.' },
    { id: 'source', label: 'Source', title: 'Source', list: 'source', hint: 'Options for how a customer found the company, used on customer records.' },
    { id: 'creditStatus', label: 'Credit Status', title: 'Credit status', list: 'creditStatus', hint: 'Used by the Credit Status field on customer records.' },
    { id: 'currency', label: 'Currency', title: 'Currency', list: 'currency', hint: 'Used by the Currency field on customer records.' },
  ];

  ngOnInit(): void {
    this.employeeService.employeeData$.subscribe((employee) => {
      this.employeeId = employee?._id ?? this.employeeId;
    });
  }

  private loadCustomerTypes(): Observable<MasterCustomRow[]> {
    return this.profileService.getCustomerTypes().pipe(
      map((list) => {
        this.customerTypesById = {};
        return (list ?? []).map((item) => {
          this.customerTypesById[item._id!] = item;
          return this.toRow(item);
        });
      }),
    );
  }

  private toRow(item: getCustomerType): MasterCustomRow {
    const parts: string[] = [];
    if (item.defaultDiscount) parts.push(`${item.defaultDiscount}% discount`);
    return {
      _id: item._id!,
      name: item.customerTypeName,
      createdBy: '',
      createdAt: item.createdDate ? new Date(item.createdDate).toISOString() : '',
      status: item.isActive !== false ? 'Active' : 'Inactive',
      source: item,
    };
  }

  private async createCustomerType(): Promise<boolean> {
    const ref = this.dialog.open(CreateCustomerTypeDialog, { ...DIALOG_SIZE, data: {} });
    const data = await firstValueFrom(ref.afterClosed());
    return !!data;
  }

  private async editCustomerType(row: MasterCustomRow): Promise<boolean> {
    const customerType = this.customerTypesById[row._id];
    if (!customerType) return false;
    const ref = this.dialog.open(CreateCustomerTypeDialog, { ...DIALOG_SIZE, data: { customerType } });
    const data = await firstValueFrom(ref.afterClosed());
    return !!data;
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
    try {
      await firstValueFrom(this.profileService.deleteCustomerType({ dataId: row._id, employee: this.employeeId }));
      this.toast.success('Customer Type deleted successfully');
      return true;
    } catch (e: any) {
      this.toast.error(e?.error?.message || 'Failed to delete customer type');
      return false;
    }
  }
}
