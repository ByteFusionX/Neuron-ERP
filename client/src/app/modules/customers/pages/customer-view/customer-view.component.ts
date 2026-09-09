import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ModalLayoutComponent, ModalFooterButton } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { FormatStringPipe } from '../../../../shared/pipes/formatString.pipe';
import { ShareTransferCustomerComponent } from '../share-transfer-customer/share-transfer-customer.component';
import { SharedWithListComponent } from '../shared-with-list/shared-with-list.component';
import { NgIcon } from '@ng-icons/core';
import { MatTooltip } from '@angular/material/tooltip';

export interface CustomerViewModalData {
  customerId: string;
}

@Component({
  selector: 'app-customer-view',
  standalone: true,
  templateUrl: './customer-view.component.html',
  styleUrls: ['./customer-view.component.css'],
  imports: [CommonModule, FormatStringPipe, ModalLayoutComponent, NgIcon, MatTooltip]
})
export class CustomerViewComponent implements OnInit {
  customerData!: getCustomer;
  isLoading: boolean = true;
  footerButtons: ModalFooterButton[] = [];

  userId: string | undefined;
  shareAccess: boolean | undefined = false;
  transferAccess: boolean | undefined = false;
  wasUpdated: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<CustomerViewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CustomerViewModalData,
    private _router: Router,
    private _employeeService: EmployeeService,
    private _customerService: CustomerService,
    public _toast: ToastrService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    let access;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.customer.viewReport;
      this.shareAccess = employee?.category.privileges.customer.share;
      this.transferAccess = employee?.category.privileges.customer.transfer;
      this.userId = employee?._id;
    });

    this._customerService.getCustomerByClientRef(this.data.customerId, access, this.userId).subscribe((res) => {
      this.isLoading = false;
      if (res && res.access) {
        this.customerData = res.customerData;
        this.footerButtons = [
          { label: 'Edit', theme: 'primary', icon: 'heroPencilSquare', onClick: () => this.onCustomerEdit() },
          { label: 'Delete', theme: 'danger', icon: 'heroTrash', onClick: () => this.deleteCustomer() }
        ];
      } else {
        this._toast.warning('This user detail cannot be displayed to you due to the permissions assigned');
        this.dialogRef.close();
      }
    });
  }

  onShareOrTransfer(type: string) {
    const shareDialog = this.dialog.open(ShareTransferCustomerComponent, {
      data: {
        type: type,
        customerId: this.customerData._id
      },
      width: '500px'
    });

    shareDialog.afterClosed().subscribe((res) => {
      if (res) {
        this._customerService.shareOrTransferCustomer({
          customerId: this.customerData._id,
          employees: res.employees,
          type: res.type
        }).subscribe((result) => {
          this.customerData.createdBy = result.createdBy;
          this.customerData.sharedWith = result.sharedWith;
          this.wasUpdated = true;
        });
      }
    });
  }

  onSharedList() {
    const shareDialog = this.dialog.open(SharedWithListComponent, {
      data: {
        sharedWith: this.customerData.sharedWith,
        customerId: this.customerData._id
      },
      disableClose: true,
      width: '500px'
    });

    shareDialog.afterClosed().subscribe((res) => {
      this.customerData.sharedWith = res;
      this.wasUpdated = true;
    });
  }

  onCustomerEdit() {
    this.dialogRef.close();
    this._router.navigate(['/customers/edit'], { state: this.customerData });
  }

  deleteCustomer() {
    const employee = this._employeeService.employeeToken();
    const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Customer',
        description: `Are you sure you want to delete "${this.customerData.companyName}"?`,
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    confirmDialog.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this._customerService.deleteCustomer({ dataId: this.customerData._id, employeeId: employee.id }).subscribe({
          next: () => {
            this._toast.success('Customer deleted successfully');
            this.dialogRef.close('deleted');
          },
          error: (error) => {
            this._toast.error(error.error.message || 'Failed to delete customer');
          }
        });
      }
    });
  }

  onClose() {
    this.dialogRef.close(this.wasUpdated ? 'updated' : undefined);
  }
}
