import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Observable, forkJoin } from 'rxjs';

// Services
import { TechnicalService } from 'src/app/core/services/technical.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';

// Components
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

// Interfaces
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { AssignEngineer } from 'src/app/core/services/technical.service';


interface DialogData {
  isEditMode: boolean;
  projectData?: any;
}

@Component({
  selector: 'app-create-project',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ButtonComponent
  ],
  templateUrl: './create-project.component.html',
  styleUrl: './create-project.component.css'
})
export class CreateProjectComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<CreateProjectComponent>);
  private data = inject(MAT_DIALOG_DATA) as DialogData;
  private technicalService = inject(TechnicalService);
  private customerService = inject(CustomerService);
  private employeeService = inject(EmployeeService);
  private toastr = inject(ToastrService);

  projectForm!: FormGroup;

  // Loading states
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);

  // Data arrays
  customers = signal<getCustomer[]>([]);
  engineers = signal<getEmployee[]>([]);

  // Options
  projectTypeOptions = [
    { label: 'Project', value: 'project' },
    { label: 'AMC', value: 'amc' },
  ];

  priorityOptions = [
    { label: 'High', value: 'High' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Low', value: 'Low' }
  ];

  ngOnInit(): void {
    this.initializeForm();
    this.loadInitialData();
    this.setupFormSubscriptions();
  }

  private initializeForm(): void {
    this.projectForm = this.fb.group({
      customerId: ['', [Validators.required]],
      projectType: ['', [Validators.required]],
      engineerId: ['', [Validators.required]],
      priority: ['Medium', [Validators.required]],
      comment: [''] // Optional field - no validators
    });
  }

  private loadInitialData(): void {
    this.isLoading.set(true);

    // Get current user data
    this.employeeService.employeeData$.subscribe((userData) => {
      if (userData?._id) {
        const requests = [
          this.customerService.getAllCustomers(userData._id),
          this.technicalService.getEngineers()
        ];

        forkJoin(requests).subscribe({
          next: ([customersData, engineersData]) => {
            this.customers.set(customersData);
            this.engineers.set(engineersData.data || []);
            this.isLoading.set(false);
          },
          error: (error) => {
            console.error('Error loading initial data:', error);
            this.toastr.error('Failed to load form data');
            this.isLoading.set(false);
          }
        });
      }
    });
  }

  private setupFormSubscriptions(): void {
    // Can add any form value change subscriptions here if needed in the future
  }

  onCustomerChange(customerId: string | string[]): void {
    // Handle both single and multiple selection (though we expect single for customer)
    const customerIdValue = Array.isArray(customerId) ? customerId[0] : customerId;
    // Customer selection can be used for future functionality if needed
  }

  onSubmit(): void {
    this.isSubmitted.set(true);

    if (this.projectForm.invalid) {
      this.toastr.error('Please fill all required fields correctly');
      return;
    }

    this.isSaving.set(true);

    const formValue = this.projectForm.value;

    const projectData: AssignEngineer = {
      jobId: '', // Will be set to empty or handled differently since job is removed
      engineerId: formValue.engineerId,
      comment: formValue.comment || 'Project created via dialog', // Use form comment or default
      projectType: formValue.projectType,
      customerId: formValue.customerId,
      priority: formValue.priority
    };

    this.technicalService.createProject(projectData).subscribe({
      next: (response) => {
        this.toastr.success('Project created successfully');
        this.dialogRef.close(true);
      },
      error: (error) => {
        console.error('Error creating project:', error);
        this.toastr.error('Failed to create project');
        this.isSaving.set(false);
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  // Getters for form controls
  get f(): { [key: string]: FormControl } {
    return this.projectForm.controls as { [key: string]: FormControl };
  }

  // Helper methods for template
  getCustomerOptions() {
    return this.customers().map(customer => ({
      label: customer.companyName,
      value: customer._id
    }));
  }


  getEngineerOptions() {
    return this.engineers().map(engineer => ({
      label: `${engineer.firstName} ${engineer.lastName}`,
      value: engineer._id
    }));
  }

  isEditMode(): boolean {
    return this.data?.isEditMode || false;
  }
}