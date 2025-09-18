import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-mr-request',
  imports: [
    NgIcon,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
  ],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent implements OnInit {

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  isSubmitted = signal<boolean>(false);
  employees: getEmployee[] = [];

  mrForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    engineer: ['', [Validators.required]],
    message: ['', [Validators.required]]
  })

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private dialogRef: MatDialogRef<MrRequestComponent>) { }

  ngOnInit(): void {
    this.loadEmployees();
    if (this.data.job.jobId) {
      this.mrForm.patchValue({
        jobId: this.data.job.job || this.data.job.jobId,
        engineer: this.data.job?.mrRequest?.engineer._id || '',
        message: this.data.job?.mrRequest?.message || '',
      })
    }
  }

  loadEmployees(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employees = employees.map(emp => ({
          ...emp,
          fullName: `${emp.firstName} ${emp.lastName}`
        }));
      },
      error: (error) => {
        this.toaster.error('Failed to load employees');
        console.error('Error loading employees:', error);
      }
    });
  }

  onCloseClicks() {
    this.mrForm.reset()
    this.dialogRef.close()
  }

  onSubmit() {
    if (this.mrForm.invalid) {
      this.toaster.warning("Please fill all required fields correctly")
    } else {
      this.dialogRef.close(this.mrForm.value)
    }
  }

  onClearClicks(){
    this.mrForm.get('engineer')?.reset()
    this.mrForm.get('message')?.reset()
    this.dialogRef.close(this.mrForm.value)
  }

  get f() {
    return this.mrForm.controls;
  }
}
