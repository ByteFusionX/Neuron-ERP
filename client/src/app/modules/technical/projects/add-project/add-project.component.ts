import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { TechnicalService, MaterialRequest, TechnicalProject } from 'src/app/core/services/technical.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { JobService } from 'src/app/core/services/job/job.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MaterialRequestModalComponent } from './material-request-modal/material-request-modal.component';
import { PurchaseRequestModalComponent } from './purchase-request-modal/purchase-request-modal.component';

@Component({
  selector: 'app-add-project',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IconsModule,
    ButtonComponent,
    RouterLink,
    FormFieldComponent,
    SelectDropdownComponent
  ],
  templateUrl: './add-project.component.html',
  styleUrl: './add-project.component.css'
})
export class AddProjectComponent implements OnInit {
  private fb = inject(FormBuilder);
  private technicalService = inject(TechnicalService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private jobService = inject(JobService);
  private purchaseService = inject(PurchaseService);
  private dialog = inject(MatDialog);
  
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  jobIds: any[] = [];
  materialRequests: MaterialRequest[] = [];
  purchaseRequests: any[] = [];
  hasPurchaseRequests = signal<boolean>(false);
  projectTypes = [
    { id: 'Supply Only', name: 'Supply Only' },
    { id: 'Project With Supply', name: 'Project With Supply' },
    { id: 'Projects With Out Supply', name: 'Projects With Out Supply' },
    { id: 'AMC', name: 'AMC' }
  ];

  statusOptions = [
    { id: 'Pending', name: 'Pending' },
    { id: 'Approved', name: 'Approved' },
    { id: 'Rejected', name: 'Rejected' }
  ];

  projectForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    projectType: ['', [Validators.required]],
    status: ['', [Validators.required]],
    assignedTo: ['', [Validators.required]],
    materialRequest: [[]],
  });

  ngOnInit(): void {
    this.getJobIds();
  }

  openMaterialRequestModal(): void {
    const dialogRef = this.dialog.open(MaterialRequestModalComponent, {
      data: { materialRequests: this.materialRequests }
    });

    dialogRef.afterClosed().subscribe((result: MaterialRequest[]) => {
      if (result) {
        this.materialRequests = result;
        this.projectForm.patchValue({ materialRequest: result });
        this.isEditMode.set(true);
      }
    });
  }

  openPurchaseRequestModal(): void {
    const dialogRef = this.dialog.open(PurchaseRequestModalComponent, {
      width: '800px',
      data: { purchaseRequests: this.purchaseRequests }
    });

    dialogRef.afterClosed().subscribe(() => {
    });
  }

  checkPurchaseRequests(jobId: string): void {
    if (jobId) {
      this.purchaseService.getPurchaseRequestsByJobId(jobId).subscribe({
        next: (response) => {
          this.purchaseRequests = response.data || [];
          this.hasPurchaseRequests.set(this.purchaseRequests.some((purchase: any) => purchase.mrRequest));
        },
        error: (error) => {
          console.error('Error fetching purchase requests:', error);
          this.purchaseRequests = [];
          this.hasPurchaseRequests.set(false);
        }
      });
    } else {
      this.purchaseRequests = [];
      this.hasPurchaseRequests.set(false);
    }
  }

  calculateTotalCost(): number {
    return this.materialRequests.reduce((total, item) => {
      return total + (item.quantity * item.estimatedCost);
    }, 0);
  }

  onSubmit(): void {
    this.isSubmitted.set(true);
    
    if (this.projectForm.invalid) {
      this.notificationService.error('Please fill all required fields correctly');
      return;
    }
    
    this.isSaving.set(true);
    
    const technicalData: TechnicalProject = {
      jobId: this.projectForm.value.jobId,
      projectType: this.projectForm.value.projectType,
      status: this.projectForm.value.status,
      assignedTo: this.projectForm.value.assignedTo,
      materialRequest: this.materialRequests
    };

    this.technicalService.createTechnicalProject(technicalData).subscribe({
      next: (response) => {
        this.notificationService.success('Technical project created successfully');
        this.router.navigate(['/technical/projects']);
      },
      error: (error) => {
        this.isSaving.set(false);
        this.notificationService.error('Failed to create technical project');
        console.error('Error creating technical project:', error);
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/technical/projects']);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.projectForm.controls).forEach(key => {
      const control = this.projectForm.get(key);
      control?.markAsTouched();
    });
  }

  getFieldError(fieldName: string): string {
    const field = this.projectForm.get(fieldName);
    if (field?.errors && field?.touched) {
      if (field.errors['required']) {
        return `${this.getFieldLabel(fieldName)} is required`;
      }
    }
    return '';
  }

  getJobIds(): void {
    this.jobService.getTechnicalDropdownList().subscribe((response: any) => {
      console.log(response);
      this.jobIds = response.data;
    });
  }

  getSalesPersonNameFromJobId(): string {
    const jobId = this.projectForm.get('jobId')?.value;
    const job = this.jobIds.find((job: any) => job._id === jobId);
    return job?.salesPersonName || '';
  }

  onJobIdChange(jobId: string): void {
    this.checkPurchaseRequests(jobId);
  }

  onJobSelected(jobId: any): void {
    const jobIdString = Array.isArray(jobId) ? jobId[0] : jobId;
    this.projectForm.get('jobId')?.setValue(jobIdString);
    this.onJobIdChange(jobIdString);
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      projectName: 'Project Name',
      assignedEngineer: 'Assigned Engineer',
      projectType: 'Project Type',
      jobId: 'Job ID',
      status: 'Status',
      assignedTo: 'Assigned To',
      allocatedDate: 'Allocated Date'
    };
    return labels[fieldName] || fieldName;
  }

  get f() {
    return this.projectForm.controls;
  }
} 