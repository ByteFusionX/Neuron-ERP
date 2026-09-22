import { ChangeDetectionStrategy, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription, map } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

/**
 * Create or edit a department: internal ones have a head, customer-contact ones (forCustomer) only a name.
 * Closes with the saved department, or undefined on cancel.
 */
@Component({
    selector: 'app-create-department',
    templateUrl: './create-department.component.html',
    styleUrls: ['./create-department.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, NgIf, AsyncPipe, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent]
})
export class CreateDepartmentDialog implements OnInit, OnDestroy {

  employeeOptions$!: Observable<SfOption[]>
  newDepartment: boolean = true

  private subscriptions = new Subscription();

  constructor(
    public dialogRef: MatDialogRef<CreateDepartmentDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { forCustomer: boolean, department: getDepartment },
    private _employeeService: EmployeeService,
    private _profileService: ProfileService,
    private _toastr: ToastrService,
  ) { }

  name = new FormControl('', Validators.required);
  head = new FormControl<string | null>(null);

  ngOnInit(): void {
    if (!this.data.forCustomer) this.head.addValidators(Validators.required)
    if (this.data.department) {
      this.newDepartment = false
      this.name.setValue(this.data.department.departmentName)
      if (!this.data.forCustomer) this.head.setValue(<string>this.data.department.departmentHead[0]?._id ?? null)
    }
    this.employeeOptions$ = this._employeeService.getAllEmployees().pipe(
      map((employees) => employees.map((e) => ({ value: e._id as string, label: `${e.firstName} ${e.lastName}` })))
    )
  }

  onCloseClicked() {
    this.dialogRef.close();
  }

  save() {
    if (!this.name.value?.trim()) this.name.setErrors({ required: true })
    if (this.name.invalid || this.head.invalid) {
      this.name.markAsTouched()
      this.head.markAsTouched()
      return
    }
    this.newDepartment ? this.onSubmit() : this.onUpdate()
  }

  onSubmit() {
    const request = this.data.forCustomer
      ? { departmentName: this.name.value!, forCustomerContact: true, createdDate: Date.now() }
      : { departmentName: this.name.value!, forCustomerContact: false, departmentHead: this.head.value!, createdDate: Date.now() }
    this.subscriptions.add(this._profileService.setDepartment(request).subscribe({
      next: (data) => {
        if (data) {
          this._toastr.success('Successfully added department')
          this.dialogRef.close(data)
        }
      },
      error: () => {
        this._toastr.warning('The name already exists!')
      }
    }))
  }

  onUpdate() {
    const department = this.data.department
    const nameChanged = this.name.value?.trim() != department.departmentName

    if (this.data.forCustomer) {
      if (nameChanged) {
        this.subscriptions.add(this._profileService.updateCustomerDepartment(
          { _id: department._id, departmentName: this.name.value!, createdDate: department.createdDate, forCustomerContact: department.forCustomerContact })
          .subscribe({
            next: (data) => {
              if (data) {
                this._toastr.success('Successfully updated department')
                this.dialogRef.close(data)
              }
            },
            error: () => {
              this._toastr.warning('The name already exists!')
            }
          }))
      }
      return
    }

    if (nameChanged || this.head.value != department.departmentHead[0]?._id) {
      this.subscriptions.add(this._profileService.updateDepartment(
        { _id: department._id, departmentName: this.name.value!, departmentHead: this.head.value!, createdDate: department.createdDate, forCustomerContact: department.forCustomerContact })
        .subscribe({
          next: (data) => {
            if (data) {
              this._toastr.success('Successfully updated department')
              this.dialogRef.close(data)
            }
          },
          error: () => {
            this._toastr.warning('The name already exists!')
          }
        }))
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
