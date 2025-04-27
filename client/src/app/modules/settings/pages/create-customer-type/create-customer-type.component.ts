import { Component } from '@angular/core';

import { IfStmt } from '@angular/compiler';
import { ChangeDetectionStrategy, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { ToastrService } from 'ngx-toastr';


@Component({
    selector: 'app-create-customer-type',
    templateUrl: './create-customer-type.component.html',
    styleUrls: ['./create-customer-type.component.css'],
    standalone: false
})

export class CreateCustomerTypeDialog implements OnInit, OnDestroy {

  enableSubmit: boolean = false
  newCustomerType: boolean = true
  nameError: boolean = false
 

  private subscriptions = new Subscription();


  constructor(
    public dialogRef: MatDialogRef<CreateCustomerTypeDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { customerType: getCustomerType },
    private _profileService: ProfileService,
    private _toastr: ToastrService
  ) { }

  name = new FormControl('');

  ngOnInit(): void {
    if(this.data.customerType){
      this.newCustomerType = false
      this.name.setValue(this.data.customerType.customerTypeName)
    }
  }

  onCloseClicked() {
    this.dialogRef.close();
  }

  errorTimeout() {
    setTimeout(() => {
      this.nameError = false
    }, 3000)
  }

  onSubmit(){
    if(!this.name.value){
      this.nameError = true
      this.errorTimeout()
    }

    if(this.name.value){
      this.subscriptions.add(this._profileService.setCustomerType(
        { customerTypeName: this.name.value, createdDate: Date.now() })
        .subscribe({next:(data:any) => {
          if(data){
            this._toastr.success("Successfully added customer type")
            this.dialogRef.close(data)
          }
        },error:()=>{
         this._toastr.warning("The name already exists!")
        }}))
    }
  }

  onUpdate() {
    if (!this.name.value?.trim()) {
      this.nameError = true
      this.errorTimeout()
      return
    }

    let curName = this.data.customerType.customerTypeName
    if(this.name.value?.trim() != curName ){
      this.subscriptions.add(this._profileService.updateCustomerType(
        {_id: this.data.customerType._id, customerTypeName: this.name.value, createdDate: this.data.customerType.createdDate})
        .subscribe({next:(data:any) => {
          if(data){
            this._toastr.success("Successfully updated customer type")
            this.dialogRef.close(data)
          }
        },error:()=>{
         this._toastr.warning("The name already exists!")
        }})
      )
    }
  }


  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

}
