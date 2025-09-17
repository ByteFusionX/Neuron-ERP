import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, HostListener } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CanDeactivate } from '@angular/router';
import { Observable } from 'rxjs';
import { getProject } from 'src/app/shared/interfaces/project.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { AccordionModule } from 'primeng/accordion';

@Component({
  selector: 'app-add-project',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IconsModule,
    ButtonComponent,
    SelectDropdownComponent,
    FormFieldComponent,
    AccordionModule,
  ],
  templateUrl: './add-project.component.html',
  styleUrl: './add-project.component.css'
})
export class AddProjectComponent implements OnInit, CanDeactivate<AddProjectComponent> {
  private fb = inject(FormBuilder);
  private technicalService = inject(TechnicalService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private jobService = inject(JobService);
  private purchaseService = inject(PurchaseService);
  private dialog = inject(MatDialog);
  private employeeService = inject(EmployeeService);

  projectId: string = '';
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  hasPurchaseRequests = signal<boolean>(false);
  selectedJobId = signal<any>(null);
  originalFormData: any = null;
  hasUnsavedChanges = signal(false);
  private isNavigatingAway = false;
  projectDetails = signal<getProject | null>(null);
  projectStatus = [
    { id: 'Pending', name: 'Pending' },
    { id: 'Approved', name: 'Approved' },
    { id: 'Rejected', name: 'Rejected' }
  ];

  priority = [
    { id: 'Low', name: 'Low' },
    { id: 'Medium', name: 'Medium' },
    { id: 'High', name: 'High' }
  ];

  jobIds: any[] = [];
  materialRequests: MaterialRequest[] = [];
  purchaseRequests: any[] = [];
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

  createEstimationGroup(type: string, value: number): FormGroup {
    return this.fb.group({
      type: [type, [Validators.required]],
      value: [value, [Validators.required, Validators.min(0)]]
    });
  }

  createPersonGroup(name: string = '', designation: string = ''): FormGroup {
    return this.fb.group({
      name: [name, [Validators.required]],
      designation: [designation, [Validators.required]]
    });
  }

  projectForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    projectType: ['', [Validators.required]],
    status: ['', [Validators.required]],
    assignedTo: ['', [Validators.required]],
    materialRequest: [[]],
    supervisors: [[]],
    notes: [''],
    involvedPersons: this.fb.array([
      this.createPersonGroup()
    ]),
    estimations: this.fb.array([
      this.createEstimationGroup('manpower', 0)
    ])
  });

  supervisorOptions: { id: string; name: string }[] = [];

  costingDetails = {
    estimatedCostForProject: 1500,
    totalLPOValue: 1500,
    professionalServiceCharge: 300,
    totalAmountClaimedForManpower: 120
  };

  ngOnInit(): void {
    this.getJobIds();
    this.isEditMode.set(this.router.url.includes('edit'));
    this.projectId = this.router.url.split('/').pop() || '';
    if (this.isEditMode()) {
      this.getProjectDetails();
    }
    this.setupFormChangeDetection();
    this.setupBrowserNavigation();
    this.loadSupervisors();    
  }

  loadCostingDetails(): void {
    this.technicalService.getCostingDetails(this.projectId).subscribe({
      next: (response) => {
        if(response && response.data){
          this.costingDetails = response.data;
        }
      }
    });
  }

  getProjectDetails(): void {
    this.technicalService.getTechnicalProjectById(this.projectId).subscribe({
      next: (response) => {
        console.log(response);
        this.patchProjectDetails(response.data);
        this.projectDetails.set(response.data);
      },
      error: (error) => {
        console.error('Error fetching project details:', error);
        this.notificationService.error('Failed to fetch project details');
        this.router.navigate(['/technical/project']);
      }
    });
  }

  patchProjectDetails(project: any): void {
    this.projectForm.patchValue({
      jobId: project.jobId._id,
      projectType: project.projectType,
      status: project.status,
      assignedTo: project.assignedTo._id,
      materialRequest: project.materialRequest,
      supervisors: project.supervisors || [],
      notes: project.notes || ''
    });

    this.selectedJobId.set(project.jobId);
    
    this.materialRequests = project.materialRequest || [];
    const persons = Array.isArray(project.involvedPersons) ? project.involvedPersons : [];
    const array = this.involvedPersonsArray;
    while (array.length) {
      array.removeAt(0);
    }
    if (persons.length) {
      persons.forEach((p: any) => array.push(this.createPersonGroup(p.name, p.designation)));
    } else {
      array.push(this.createPersonGroup());
    }

    // Handle estimations
    const estimations = Array.isArray(project.estimations) ? project.estimations : [];
    const estimationsArray = this.estimationsArray;
    while (estimationsArray.length) {
      estimationsArray.removeAt(0);
    }
    if (estimations.length) {
      estimations.forEach((e: any) => estimationsArray.push(this.createEstimationGroup(e.type, e.value)));
    } else {
      estimationsArray.push(this.createEstimationGroup('manpower', 0));
    }

    this.originalFormData = {
      ...this.projectForm.value,
      materialRequest: [...this.materialRequests]
    };
    
    if(this.projectForm.get('jobId')?.value){
      this.loadCostingDetails();
    }
  }

  getJobIdDisplayValue(): string {
    const jobId = this.projectForm.get('jobId')?.value;
    const job = this.jobIds.find((job: any) => job._id === jobId);
    return job?.jobId || this.selectedJobId() ? this.selectedJobId().jobId : '';
  }

  openMaterialRequestModal(): void {
    const dialogRef = this.dialog.open(MaterialRequestModalComponent, {
      data: { materialRequests: this.materialRequests }
    });

    dialogRef.afterClosed().subscribe((result: MaterialRequest[]) => {
      if (result) {
        this.materialRequests = result;
        this.technicalService.updateMaterialRequest(this.projectId, result).subscribe((response) => {
          if(response.success){
            this.notificationService.success(response.message);
            this.projectForm.patchValue({ materialRequest: result });
          }else{
            this.notificationService.error(response.message);
          }
        });
        this.originalFormData.materialRequest = result;
        this.checkForUnsavedChanges();
      }
    });
  }

  openPage(route: string): void {
    this.router.navigate([`/technical/project/${route}`, this.projectId]);
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
      supervisors: this.projectForm.value.supervisors,
      notes: this.projectForm.value.notes,
      involvedPersons: this.projectForm.value.involvedPersons,
      estimationCost: this.estimationsArray.value
    };

    console.log(technicalData);

    // if(this.isEditMode()){
    //   this.updateTechnicalProject(this.projectId, technicalData);
    // }else{
    //   this.createTechnicalProject(technicalData);
    // }
  }

  createTechnicalProject(technicalData: TechnicalProject): void {
    this.technicalService.createTechnicalProject(technicalData).subscribe({
      next: (response) => {
        this.notificationService.success('Technical project created successfully');
        this.resetUnsavedChanges();
        this.router.navigate(['/technical/project']);
      },
      error: (error) => {
        this.isSaving.set(false);
        this.notificationService.error('Failed to create technical project');
        console.error('Error creating technical project:', error);
      }
    });
  }

  updateTechnicalProject(projectId: string, technicalData: TechnicalProject): void {
    this.technicalService.updateTechnicalProject(projectId, technicalData).subscribe({
      next: (response) => {
        this.notificationService.success('Technical project updated successfully');
        this.resetUnsavedChanges();
        this.originalFormData = {
          ...this.projectForm.value,
          materialRequest: [...this.materialRequests]
        };
        this.router.navigate(['/technical/project']);
      },
      error: (error) => {
        this.isSaving.set(false);
        this.notificationService.error('Failed to update technical project');
        console.error('Error updating technical project:', error);
      }
    });
  }

  // For navigation block
  setupBrowserNavigation(): void {
    window.history.pushState(null, '', window.location.href);
  }

  setupFormChangeDetection(): void {
    this.projectForm.valueChanges.subscribe(() => {
      if (this.isEditMode() && this.originalFormData) {
        const currentFormData = this.projectForm.value;
        const hasChanges = JSON.stringify(currentFormData) !== JSON.stringify(this.originalFormData) ||
                          JSON.stringify(this.materialRequests) !== JSON.stringify(this.originalFormData.materialRequest);
        this.hasUnsavedChanges.set(hasChanges);
      }
    });
  }

  canDeactivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.isEditMode() && this.hasUnsavedChanges() && !this.isNavigatingAway) {
      return new Promise<boolean>((resolve) => {
        const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          data: {
            title: 'Unsaved Changes',
            description: 'You have unsaved changes. Are you sure you want to leave without saving?',
            icon: 'warning',
            IconColor: 'warn'
          }
        });

        dialogRef.afterClosed().subscribe((result: boolean) => {
          if (result) {
            this.hasUnsavedChanges.set(false);
          }
          resolve(result);
        });
      });
    }
    return true;
  }

  onCancel(): void {
    this.isNavigatingAway = true;
    if (this.isEditMode() && this.hasUnsavedChanges()) {
      this.showUnsavedChangesDialog();
    } else {
      this.router.navigate(['/technical/project']);
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isEditMode() && this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    if (this.isEditMode() && this.hasUnsavedChanges()) {
      event.preventDefault();
      this.handleBrowserNavigation();
    }
  }

  private handleBrowserNavigation(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Unsaved Changes',
        description: 'You have unsaved changes. Are you sure you want to leave without saving?',
        icon: 'warning',
        IconColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.hasUnsavedChanges.set(false);
        window.history.back();
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    });
  }

  private checkForUnsavedChanges(): void {
    if (this.isEditMode() && this.originalFormData) {
      const currentFormData = this.projectForm.value;
      const hasChanges = JSON.stringify(currentFormData) !== JSON.stringify(this.originalFormData) ||
                        JSON.stringify(this.materialRequests) !== JSON.stringify(this.originalFormData.materialRequest);
      this.hasUnsavedChanges.set(hasChanges);
    }
  }

  private showUnsavedChangesDialog(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Unsaved Changes',
        description: 'You have unsaved changes. Are you sure you want to leave without saving?',
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.hasUnsavedChanges.set(false);
        this.router.navigate(['/technical/project']);
      }
      this.isNavigatingAway = false;
    });
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
      this.jobIds = response.data;
    });
  }

  getSalesPersonNameFromJobId(): string {
    const jobId = this.projectForm.get('jobId')?.value;
    const job = this.jobIds.find((job: any) => job._id === jobId);
    return job?.salesPersonName || this.selectedJobId() ? this.selectedJobId().quotation.createdBy.fullName : '';
  }

  getProjectName(): string {
    return this.projectDetails()?.customer.companyName || '';
  }

  getExpectedStartDate(): Date | null {
    return this.projectDetails()?.activityPlan.reduce((acc,current)=>{
      return acc.startDate < current.startDate ? acc : current;
    }).startDate || null;
  }

  getExpectedEndDate(): Date | null {
    return this.projectDetails()?.activityPlan.reduce((acc,current)=>{
      return acc.endDate > current.endDate ? acc : current;
    }).endDate || null;
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
      allocatedDate: 'Allocated Date',
      estimatedCost: 'Estimated Cost',
      estimatedDuration: 'Estimated Duration',
      actualCost: 'Actual Cost',
      actualDuration: 'Actual Duration',
    };
    return labels[fieldName] || fieldName;
  }

  get f() {
    return this.projectForm.controls;
  }

  private resetUnsavedChanges(): void {
    this.hasUnsavedChanges.set(false);
    this.isNavigatingAway = false;
  }

  // Progress Bar Methods
  getProjectProgress(): number {
    const totalActivities = this.getTotalActivities();
    const completedActivities = this.getCompletedActivities();
    
    if (totalActivities === 0) return 0;
    return Math.round((completedActivities / totalActivities) * 100);
  }

  getTotalActivities(): number {
    if (!this.projectDetails()?.activityPlan) return 0;
    return this.projectDetails()!.activityPlan.length;
  }

  getCompletedActivities(): number {
    if (!this.projectDetails()?.activityPlan) return 0;
    return this.projectDetails()!.activityPlan.filter(activity => activity.status === 'Closed').length;
  }

  getProgressIcon(): string {
    const progress = this.getProjectProgress();
    
    if (progress >= 100) return 'heroCheckCircle';
    if (progress >= 75) return 'heroClock';
    if (progress >= 50) return 'heroPlayCircle';
    return 'heroPauseCircle';
  }

  getProgressIconClass(): string {
    const progress = this.getProjectProgress();
    
    if (progress >= 100) return 'text-green-600';
    if (progress >= 75) return 'text-blue-600';
    if (progress >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  }

  get involvedPersonsArray(): FormArray {
    return this.projectForm.get('involvedPersons') as FormArray;
  }

  addPersonRow(): void {
    this.involvedPersonsArray.push(this.createPersonGroup());
    this.checkForUnsavedChanges();
  }

  removePersonRow(index: number): void {
    if (this.involvedPersonsArray.length > 1) {
      this.involvedPersonsArray.removeAt(index);
      this.checkForUnsavedChanges();
    }
  }

  loadSupervisors(): void {
    this.employeeService.getAllEmployees().subscribe((employees) => {
      this.supervisorOptions = employees.map((e: any) => ({ id: e._id, name: `${e.firstName} ${e.lastName}` }));
    });
  }

  // Costing calculation methods
  getTotalEstimatedCost(): number {
    return this.estimationsArray.controls.reduce((total, control) => {
      return total + (control.get('value')?.value || 0);
    }, 0);
  }

  getBalanceAmount(): number {
    const totalClaimed = this.costingDetails.totalAmountClaimedForManpower;
    const totalEstimated = this.getManpowerEstimation();
    return  Number(totalClaimed) - Number(totalEstimated);
  }

  getManpowerEstimation(): number {
    const manpowerControl = this.estimationsArray.controls.find(control => 
      control.get('type')?.value === 'manpower'
    );
    return manpowerControl?.get('value')?.value || 0;
  }

  setManpowerEstimation(value: number): void {
    const manpowerControl = this.estimationsArray.controls.find(control => 
      control.get('type')?.value === 'manpower'
    );
    if (manpowerControl) {
      manpowerControl.get('value')?.setValue(value);
    }
  }

  get estimationsArray(): FormArray {
    return this.projectForm.get('estimations') as FormArray;
  }

  addEstimationRow(): void {
    this.estimationsArray.push(this.createEstimationGroup('', 0));
    this.checkForUnsavedChanges();
  }

  removeEstimationRow(index: number): void {
    const estimation = this.estimationsArray.at(index);
    const isManpower = estimation?.get('type')?.value === 'manpower';
    
    if (this.estimationsArray.length > 1 && !isManpower) {
      this.estimationsArray.removeAt(index);
      this.checkForUnsavedChanges();
    }
  }
} 