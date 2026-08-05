
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';

@Component({
    selector: 'app-create-category',
    templateUrl: './create-category.component.html',
    styleUrls: ['./create-category.component.css'],
    standalone: false
})

export class CreateCategoryComponent {
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
    public dialogRef: MatDialogRef<CreateCategoryComponent>,
    private _fb: FormBuilder,
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
        deleteOrEdit: [false],
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
    const dashboardGroup = this.categoryForm.get('privileges.dashboard') as FormGroup;
    dashboardGroup.get('compareAgainst')?.disable();

    this.categoryForm.get('isSalespersonWithTarget')?.valueChanges.subscribe((isSalesperson) => {
      if (!isSalesperson) {
        dashboardGroup.get('compareAgainst')?.setValue('company');
        dashboardGroup.get('compareAgainst')?.disable();
      } else {
        dashboardGroup.get('compareAgainst')?.enable();
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onCheckboxChange(event: Event, formControlName: string, checkedVariable: keyof CreateCategoryComponent): void {
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

      const categoryData = this.categoryForm.getRawValue() ;

      this._employeeService.createCategory(categoryData as unknown as GetCategory).subscribe({
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
