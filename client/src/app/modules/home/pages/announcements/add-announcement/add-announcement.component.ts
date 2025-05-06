import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, Inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { AnnouncementService } from 'src/app/core/services/announcement/announcement.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CreateCustomerDialog } from 'src/app/modules/customers/pages/create-customer/create-customer.component';

import { announcementGetData, announcementPostData } from 'src/app/shared/interfaces/announcement.interface';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { NgSelectModule } from '@ng-select/ng-select';
import { appNoLeadingSpace } from '../../../../../shared/directives/trim-validator.directive';
import { datePastDirective } from '../../../../../shared/directives/date-validator.directive';


@Component({
    selector: 'app-add-announcement',
    templateUrl: './add-announcement.component.html',
    styleUrls: ['./add-announcement.component.css'],
    imports: [CommonModule, IconsModule, appNoLeadingSpace, datePastDirective, ReactiveFormsModule, FormsModule, NgSelectModule]
})
export class AddAnnouncementComponent implements OnDestroy, OnInit {
  submit: boolean = false;
  isSaving: boolean = false;
  userId!: any;
  categories: GetCategory[] = [];
  isEdit: boolean = false;


  private mySubscription!: Subscription;

  constructor(
    public dialogRef: MatDialogRef<CreateCustomerDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { data?: announcementGetData },
    private fb: FormBuilder,
    private _service: AnnouncementService,
    private toastr: ToastrService,
    private _employeeService: EmployeeService
  ) { }

  ngOnInit(): void {
    this._employeeService.employeeData$.subscribe((res) => {
      this.userId = res;
    });

    this.getCategory();

    if (this.data?.data) {
      this.isEdit = true;
      this.formData.patchValue({
        title: this.data.data.title,
        description: this.data.data.description,
        date: this.data.data.date,
        category: this.data.data.category
      });
    }
  }

  getCategory(){
      this._employeeService.getCategory().subscribe((res)=>{
      this.categories = res;
    })
  }

  formData = this.fb.group({
    title: ['', Validators.required],
    description: ['', Validators.required],
    date: [new Date(), Validators.required],
    category: [['all']]
  });

  onSubmit() {
    this.submit = true;
    this.isSaving = true;
    
    if (this.formData.valid) {
      const data: announcementPostData = {
        title: this.formData.value.title as string,
        description: this.formData.value.description as string,
        date: this.formData.value.date as Date | null,
        userId: this.userId._id,
        isEdit: this.isEdit,
        _id: this.isEdit ? this.data.data?._id : undefined,
        category: this.formData.value.category as string[]   
      };
    
      this.mySubscription = this._service.createAnnouncement(data).subscribe({
        next: (res: any) => {
          if (res.success) {
            this.toastr.success(res.message);
            this.dialogRef.close(true);
          }
        },
        error: (error) => {
          this.isSaving = false;
          this.toastr.error('Failed to save announcement');
        }
      });
    } else {
      this.isSaving = false;
      this.toastr.warning('Check the fields properly!', 'Warning !');
    }
  }

  get f() {
    return this.formData.controls;
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onCategoryChange(event: any) {
    const selectedValues = this.formData.get('category')?.value || [];
    const previousValues = event.previousValue || [];
    
    // Case 1: If user selects 'all', remove all other categories
    if (selectedValues.includes('all') && !previousValues.includes('all')) {
      this.formData.patchValue({
        category: ['all']
      });
      return;
    }

    // Case 2: If 'all' was previously selected and user selects other categories, remove 'all'
    if (previousValues.includes('all') && selectedValues.length > 1) {
      const filteredValues = selectedValues.filter((value: string) => value !== 'all');
      this.formData.patchValue({
        category: filteredValues
      });
      return;
    }
  }

  ngOnDestroy(): void {
    this.mySubscription.unsubscribe()
  }

}
