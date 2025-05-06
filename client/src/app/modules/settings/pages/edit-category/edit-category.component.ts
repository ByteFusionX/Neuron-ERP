import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { NgIf } from '@angular/common';

@Component({
    selector: 'app-edit-category',
    templateUrl: './edit-category.component.html',
    styleUrls: ['./edit-category.component.css'],
    imports: [NgIcon, FormsModule, ReactiveFormsModule, appNoLeadingSpace, NgIf]
})
export class EditCategoryComponent {

  isSaving: boolean = false;
  error!: string;

  dashboardChecked: boolean = false;
  employeeChecked: boolean = false;
  announcementChecked: boolean = false;
  customerChecked: boolean = false;
  enquiryChecked: boolean = false;
  assignedJobsChecked: boolean = false;
  quotationChecked: boolean = false;
  jobSheetChecked: boolean = false;
  portalChecked: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<EditCategoryComponent>,
    private _fb: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public data: GetCategory,
    private _employeeService: EmployeeService,
  ) { }

  categoryForm = this._fb.group({
    categoryName: ['', Validators.required],
    role: ['', Validators.required],
    isSalespersonWithTarget: [false],
    privileges: this._fb.group({
      dashboard: this._fb.group({
        viewReport: 'all',
        compareAgainst: 'company',
      }),
      employee: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      announcement: this._fb.group({
        viewReport: 'none',
        create: [false],
        deleteOrEdit: [false]
      }),
      customer: this._fb.group({
        viewReport: 'none',
        create: [false],
        share: [false],
        transfer: [false],
      }),
      enquiry: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      assignedJob: this._fb.group({
        viewReport: 'none'
      }),
      quotation: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      dealSheet: [false],
      jobSheet: this._fb.group({
        viewReport: 'none',
      }),
      portalManagement: this._fb.group({
        department: [false],
        notesAndTerms: [false],
        companyTarget: [false],
        customerType: [false]
      })
    })
  })

  ngOnInit() {
    this.updateChecks(this.data.privileges)
    const dashboardGroup = this.categoryForm.get('privileges.dashboard') as FormGroup;

    if (!this.data.isSalespersonWithTarget) {
      dashboardGroup.get('compareAgainst')?.disable();
    }
    this.categoryForm.get('isSalespersonWithTarget')?.valueChanges.subscribe((isSalesperson) => {
      if (!isSalesperson) {
        dashboardGroup.get('compareAgainst')?.setValue('company');
        dashboardGroup.get('compareAgainst')?.disable();
      } else {
        dashboardGroup.get('compareAgainst')?.enable();
      }
    });
    this.categoryForm.patchValue(this.data)
  }

  updateChecks(privileges: Privileges) {
    this.dashboardChecked = privileges.dashboard.viewReport !== 'none',
      this.employeeChecked = privileges.employee.viewReport !== 'none',
      this.announcementChecked = privileges.announcement.viewReport !== 'none',
      this.customerChecked = privileges.customer.viewReport !== 'none',
      this.enquiryChecked = privileges.enquiry.viewReport !== 'none',
      this.assignedJobsChecked = privileges.assignedJob.viewReport !== 'none',
      this.quotationChecked = privileges.quotation.viewReport !== 'none',
      this.jobSheetChecked = privileges.jobSheet.viewReport !== 'none',
      this.portalChecked = privileges.portalManagement
        ? Object.values(privileges.portalManagement).some(value => value)
        : false;
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onCheckboxChange(event: Event, formControlName: string, checkedVariable: keyof EditCategoryComponent): void {
    const eventTarget = event.target as HTMLInputElement;
    const checked = eventTarget.checked;

    if (checked) {
      this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', create: false } } });
    } else {
      this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', create: false } } });
    }

    this[checkedVariable] = checked as never;

  }

  onSubmit() {
    if (this.categoryForm.valid) {
      this.isSaving = true;

      const categoryData = this.categoryForm.getRawValue();

      this._employeeService.updateCategory(categoryData as unknown as GetCategory, this.data._id).subscribe({
        next: (data) => {
          this.isSaving = false;
          this.dialogRef.close(data)
        },
        error: ((error) => {
          this.isSaving = false;
          this.error = error.error;
        })
      })

    }
  }
}
