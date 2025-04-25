import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NgIcon } from '@ng-icons/core';
import { NgIf, NgFor } from '@angular/common';

@Component({
    selector: 'app-shared-with-list',
    templateUrl: './shared-with-list.component.html',
    styleUrls: ['./shared-with-list.component.css'],
    imports: [NgIcon, NgIf, NgFor]
})
export class SharedWithListComponent {

  userId!: string | undefined;
  constructor(
    private dialogRef: MatDialogRef<SharedWithListComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { sharedWith: getEmployee[], customerId: string },
    private dialog: MatDialog,
    private customerService: CustomerService,
    private _employeeService: EmployeeService,
    private toaster: ToastrService
  ) { }

  ngOnInit() {
    this._employeeService.employeeData$.subscribe((res) => {
      this.userId = res?._id
    })
  }

  stopSharing(employeeId?: string) {
    const confirmation = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `Are you absolutely sure?`,
        description: `This will remove all access with the customer for this employee.`,
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      }
    });

    confirmation.afterClosed().subscribe((approved: boolean) => {
      if (approved && employeeId) {
        const customerId = this.data.customerId;
        this.customerService.stopSharingCustomer({ customerId, employeeId }).subscribe(
          {
            next: response => {
              this.toaster.success('Sharing stopped successfully');
              this.data.sharedWith = this.data.sharedWith.filter(employee => employee._id !== employeeId)
            },
            error: error => {
              this.toaster.warning('Failed to stop sharing');
            }
          }
        );
      }
    });
  }

  onClose() {
    this.dialogRef.close(this.data.sharedWith);
  }
}
