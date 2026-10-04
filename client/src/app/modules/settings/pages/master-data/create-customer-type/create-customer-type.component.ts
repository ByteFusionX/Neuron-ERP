import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

/** Create or rename a customer type. Closes with the saved customer type, or undefined on cancel. */
@Component({
    selector: 'app-create-customer-type',
    templateUrl: './create-customer-type.component.html',
    styleUrls: ['./create-customer-type.component.css'],
    imports: [ReactiveFormsModule, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent]
})
export class CreateCustomerTypeDialog implements OnInit, OnDestroy {

  newCustomerType: boolean = true

  private subscriptions = new Subscription();

  constructor(
    public dialogRef: MatDialogRef<CreateCustomerTypeDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { customerType: getCustomerType },
    private _profileService: ProfileService,
    private _toastr: ToastrService
  ) { }

  name = new FormControl('', Validators.required);
  defaultDiscount = new FormControl<number | null>(null);
  isActive = new FormControl(true);

  ngOnInit(): void {
    if(this.data.customerType){
      this.newCustomerType = false
      this.name.setValue(this.data.customerType.customerTypeName)
      this.defaultDiscount.setValue(this.data.customerType.defaultDiscount ?? null)
      this.isActive.setValue(this.data.customerType.isActive !== false)
    }
  }

  onCloseClicked() {
    this.dialogRef.close();
  }

  save() {
    if (!this.name.value?.trim()) {
      this.name.setErrors({ required: true })
      this.name.markAsTouched()
      return
    }
    this.newCustomerType ? this.onSubmit() : this.onUpdate()
  }

  private extras() {
    return { defaultDiscount: this.defaultDiscount.value ?? undefined, isActive: this.isActive.value! }
  }

  onSubmit(){
    this.subscriptions.add(this._profileService.setCustomerType(
      { customerTypeName: this.name.value!, createdDate: Date.now(), ...this.extras() })
      .subscribe({next:(data:any) => {
        if(data){
          this._toastr.success("Successfully added customer type")
          this.dialogRef.close(data)
        }
      },error:()=>{
       this._toastr.warning("The name already exists!")
      }}))
  }

  onUpdate() {
    let curName = this.data.customerType.customerTypeName
    if(this.name.value?.trim() != curName || this.defaultDiscount.dirty || this.isActive.dirty){
      this.subscriptions.add(this._profileService.updateCustomerType(
        {_id: this.data.customerType._id, customerTypeName: this.name.value!, createdDate: this.data.customerType.createdDate, ...this.extras()})
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
