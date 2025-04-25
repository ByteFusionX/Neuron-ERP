import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { NgIf, NgFor, AsyncPipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';

@Component({
    selector: 'app-internal-department',
    templateUrl: './internal-department.component.html',
    styleUrls: ['./internal-department.component.css'],
    imports: [NgIf, NgIcon, FormsModule, appNoLeadingSpace, ReactiveFormsModule, NgSelectComponent, NgFor, NgOptionComponent, AsyncPipe]
})
export class InternalDepartmentComponent implements OnInit, OnDestroy {

  nameError: boolean = false
  headError: boolean = false
  employeesList$!: Observable<getEmployee[]>
  newDepartment: boolean = true
  private subscriptions = new Subscription();

  name = new FormControl('');
  head = new FormControl('');

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
    this.head.setValue(null)
    this.name.setValue(null)
    this.employeesList$ = this._employeeService.getAllEmployees()
    if(this.data){
      this.newDepartment = false
      let fullName = this.data.departmentHead[0].firstName + ' ' + this.data.departmentHead[0].lastName
      this.name.setValue(this.data.departmentName)
      this.head.setValue(fullName)
    }
  }

  onSubmit() {
    if (!this.name.value?.trim()) {
      this.nameError = true
      this.errorTimeout()
    }

    if (!this.head.value) {
      this.headError = true;
      this.errorTimeout();
      return
    }

    if (this.name.value && this.head.value) {
      // let department = { departmentName: this.name.value, departmentHead: this.head.value, createdDate: Date.now() }
      this.subscriptions.add(
        this._profileService.setInternalDepartment({ departmentName: this.name.value, departmentHead: this.head.value, createdDate: Date.now() }).subscribe({
          next: (data) => {
            if (data) {
              this.dialogRef.close(data)
            }
          }
        })
      )
    }
  }

  onUpdate(){
    if (!this.name.value?.trim()) {
      this.nameError = true
      this.errorTimeout()
    }

    if (!this.head.value) {
      this.headError = true;
      this.errorTimeout();
      return
    }

    let curName = this.data.departmentName
    let curHead = this.data.departmentHead[0].firstName + ' ' + this.data.departmentHead[0].lastName
    if (curHead == this.head.value) {
      this.head.setValue(<string>this.data.departmentHead[0]._id)
    }

    if((this.name.value && this.head.value) && (this.name.value != curName || this.head.value != curHead)){
      this.subscriptions.add(
        this._profileService.updateInternalDepartment({_id:this.data._id,departmentName: this.name.value, departmentHead: this.head.value, createdDate: Date.now()}).subscribe({
          next:(data)=>{
            if(data){
              this.dialogRef.close(data)
            }
          }
        })
      )
    }
  }

  errorTimeout() {
    setTimeout(() => {
      this.nameError = false
      this.headError = false
    }, 3000)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
