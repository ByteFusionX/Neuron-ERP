import { Component } from '@angular/core';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { NgIcon } from '@ng-icons/core';
import { NgFor } from '@angular/common';
import { FormatStringPipe } from '../../../../shared/pipes/formatString.pipe';

@Component({
    selector: 'app-customer-view',
    templateUrl: './customer-view.component.html',
    styleUrls: ['./customer-view.component.css'],
    imports: [NgIcon, NgFor, FormatStringPipe]
})
export class CustomerViewComponent {
  customerData!: getCustomer;

  constructor(
    private _router: Router,
    private _employeeService: EmployeeService,
    private _customerService: CustomerService,
    private route: ActivatedRoute,
    public _toast: ToastrService,
    private dialog: MatDialog
  ) {
    const navigation = this._router.getCurrentNavigation();
    if (navigation && navigation.extras.state) {
      this.customerData = navigation.extras.state as getCustomer
    } else {
      const customerId = this.route.snapshot.paramMap.get('customerId');
      if (customerId) {
        let access;
        let userId;
        this._employeeService.employeeData$.subscribe((employee) => {
          access = employee?.category.privileges.customer.viewReport
          userId = employee?._id
        })
        this._customerService.getCustomerByClientRef(customerId, access, userId).subscribe((res) => {
          if (res) {
            if (res.access) {
              this.customerData = res.customerData;
            } else {
              this._toast.warning('This user detail cannot be displayed to you due to the permissions assigned')
              this._router.navigate(['/customers'])
            }
          } else {
            this._router.navigate(['/customers'])
          }
        })
      } else {
        this._router.navigate(['/customers'])
      }
    }
  }

  onCustomerEdit() {
    const navigationExtras: NavigationExtras = {
      state: this.customerData
    };
    this._router.navigate(['/customers/edit'], navigationExtras);

  }

  deleteCustomer() {
    const employee = this._employeeService.employeeToken()
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Customer',
        description: `Are you sure you want to delete "${this.customerData.companyName}"?`,
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this._customerService.deleteCustomer({ dataId: this.customerData._id, employeeId: employee.id }).subscribe({
          next: () => {
            this._toast.success('Customer deleted successfully');
            this._router.navigate(['/customers']);
          },
          error: (error) => {
            this._toast.error(error.error.message || 'Failed to delete customer');
          }
        });
      }
    });
  }

}
