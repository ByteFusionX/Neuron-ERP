import { ChangeDetectionStrategy, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription, map } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

/** Create or edit an internal department. Closes with the saved department, or undefined on cancel. */
@Component({
    selector: 'app-internal-department',
    templateUrl: './internal-department.component.html',
    styleUrls: ['./internal-department.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, AsyncPipe, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent]
})
export class InternalDepartmentComponent implements OnInit, OnDestroy {

  employeeOptions$!: Observable<SfOption[]>
  newDepartment: boolean = true
  private subscriptions = new Subscription();

  name = new FormControl('', Validators.required);
  head = new FormControl<string | null>(null, Validators.required);
  parent = new FormControl<string | null>(null);
  description = new FormControl('');
  code = new FormControl('');
  costCentre = new FormControl('');
  isActive = new FormControl(true);
  parentOptions$!: Observable<SfOption[]>

  constructor(
    public dialogRef: MatDialogRef<InternalDepartmentComponent>,
    @Inject(MAT_DIALOG_DATA) public data: getDepartment,
    private _employeeService: EmployeeService,
    private _profileService: ProfileService,
  ) { }

  onCloseClicked() {
    this.dialogRef.close();
  }

  ngOnInit(): void {
    this.employeeOptions$ = this._employeeService.getAllEmployees().pipe(
      map((employees) => employees.map((e) => ({ value: e._id as string, label: `${e.firstName} ${e.lastName}` })))
    )
    this.parentOptions$ = this._profileService.getInternalDepartments().pipe(
      map((deps) => deps.filter((d) => d._id !== this.data?._id).map((d) => ({ value: d._id as string, label: d.departmentName })))
    )
    if (this.data) {
      this.parent.setValue((this.data as any).parentDepartment ?? null)
      this.description.setValue((this.data as any).description ?? '')
      this.code.setValue((this.data as any).code ?? '')
      this.costCentre.setValue((this.data as any).costCentre ?? '')
      this.isActive.setValue((this.data as any).isActive !== false)
      this.newDepartment = false
      this.name.setValue(this.data.departmentName)
      this.head.setValue(<string>this.data.departmentHead[0]?._id ?? null)
    }
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

  private extras() {
    return { code: this.code.value?.trim() ?? '', costCentre: this.costCentre.value?.trim() ?? '', isActive: this.isActive.value! }
  }

  onSubmit() {
    this.subscriptions.add(
      this._profileService.setInternalDepartment({ departmentName: this.name.value!, departmentHead: this.head.value!, createdDate: Date.now(), parentDepartment: this.parent.value, description: this.description.value ?? '', ...this.extras() }).subscribe({
        next: (data) => {
          if (data) {
            this.dialogRef.close(data)
          }
        }
      })
    )
  }

  onUpdate() {
    if (this.name.value != this.data.departmentName || this.head.value != this.data.departmentHead[0]?._id || this.parent.dirty || this.description.dirty || this.code.dirty || this.costCentre.dirty || this.isActive.dirty) {
      this.subscriptions.add(
        this._profileService.updateInternalDepartment({ _id: this.data._id, departmentName: this.name.value!, departmentHead: this.head.value!, createdDate: Date.now(), parentDepartment: this.parent.value, description: this.description.value ?? '', ...this.extras() }).subscribe({
          next: (data) => {
            if (data) {
              this.dialogRef.close(data)
            }
          }
        })
      )
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
