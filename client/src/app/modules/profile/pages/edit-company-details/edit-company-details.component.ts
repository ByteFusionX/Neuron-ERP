import { Component } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getCompanyDetails } from 'src/app/shared/interfaces/company.interface';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { NgIf } from '@angular/common';

@Component({
    selector: 'app-edit-company-details',
    templateUrl: './edit-company-details.component.html',
    styleUrls: ['./edit-company-details.component.css'],
    imports: [NgIcon, FormsModule, ReactiveFormsModule, appNoLeadingSpace, NgIf]
})
export class EditCompanyDetailsComponent {
  isSaving:boolean=false
  constructor(private _fb: FormBuilder,
    private dialogRef:MatDialogRef<EditCompanyDetailsComponent>,
    private _profileService:ProfileService  
  ){}

  companyDetailsForm = this._fb.group({
    companyName: ['', Validators.required],
    description: ['', Validators.required],
    street: ['', [Validators.required]],
    area: ['', Validators.required],
    city: ['', Validators.required],
    country: ['', Validators.required],
  })

  ngOnInit() {
    this._profileService.getCompanyDetails().subscribe((res:getCompanyDetails)=>{
      if(res){
        this.companyDetailsForm.patchValue({
          companyName:res.name,
          description:res.description,
          street:res.address.street,
          area:res.address.area,
          city:res.address.city,
          country:res.address.country
        })
      }
    })
  }

  onClose(): void {
    this.dialogRef.close();
  }


  onSubmit() {
    if(this.companyDetailsForm.valid){
      this.isSaving = true;

          const companyData = this.companyDetailsForm.value as getCompanyDetails
          this._profileService.updateCompanyDetails(companyData).subscribe((res)=>{
            this.isSaving = false;
            this.dialogRef.close(res)
          })
    }
 

  }
}
