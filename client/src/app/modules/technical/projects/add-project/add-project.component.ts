import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, HostListener } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
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
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CanDeactivate } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { getProject } from 'src/app/shared/interfaces/project.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MatExpansionModule } from '@angular/material/expansion';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { HttpEventType } from '@angular/common/http';
import { saveAs } from 'file-saver';
import { MatTooltip } from '@angular/material/tooltip';
import { MatProgressBar } from '@angular/material/progress-bar';
import { getQuotatation } from 'src/app/shared/interfaces/quotation.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

@Component({
  selector: 'app-add-project',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    IconsModule,
    ButtonComponent,
    SelectDropdownComponent,
    FormFieldComponent,
    MatExpansionModule,
    MatTooltip,
    MatProgressBar,
    NumberFormatterPipe,
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
  private quotationService = inject(QuotationService);
  private loadingBar = inject(LoadingBarService);
  loader = inject(LoadingBarService).useRef();

  selectedFile!: string | undefined;
  progress: number = 0;
  private subscriptions = new Subscription();

  projectId: string = '';
  selectedJobId = signal<any>(null);
  projectDetails = signal<getProject | null>(null);
  jobIds: any[] = [];
  unassignedJobOptions: any[] = [];
  materialRequests: MaterialRequest[] = [];
  purchaseRequests: any[] = [];
  
  hasPurchaseRequests = signal<boolean>(false);

  originalFormData: any = null;
  hasUnsavedChanges = signal(false);
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  private isNavigatingAway = false;
  
  priority = [
    { id: 'Low', name: 'Low' },
    { id: 'Medium', name: 'Medium' },
    { id: 'High', name: 'High' }
  ];

  statusOptions = [
    { id: 'Pending', name: 'Pending' },
    { id: 'Approved', name: 'Approved' },
    { id: 'Rejected', name: 'Rejected' }
  ];

  supervisorOptions: { id: string; name: string }[] = [];

  costingDetails = {
    estimatedCostForProject: 0,
    totalLPOValue: 0,
    professionalServiceCharge: 0,
    totalAmountClaimedForManpower: 0
  };

  projectForm: FormGroup = this.fb.group({
    status: ['', [Validators.required]],
    supervisors: [[]],
    notes: [''],
    involvedPersons: this.fb.array([]),
    priority: ['', [Validators.required]],
    estimations: this.fb.array([
      this.createEstimationGroup('manpower', 0)
    ]),
    jobId: ['']
  });

  ngOnInit(): void {
    this.getJobIds();
    this.loadUnassignedJobs();
    this.projectId = this.router.url.split('/').pop() || '';
      this.getProjectDetails();
    this.setupFormChangeDetection();
    this.setupBrowserNavigation();
    this.loadSupervisors();    
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

  loadCostingDetails(): void {
    this.technicalService.getCostingDetails(this.projectId).subscribe({
      next: (response) => {
        if(response && response.data){
          this.costingDetails = {
            estimatedCostForProject: response.data.estimatedCostForProject || 0,
            totalLPOValue: response.data.totalLPOValue || 0,
            professionalServiceCharge: response.data.professionalServiceCharge || 0,
            totalAmountClaimedForManpower: response.data.totalAmountClaimedForManpower || 0
          };
        }
      },
      error: (error) => {
        console.error('Error fetching costing details:', error);
      }
    });
  }

  createEstimationGroup(type: string, value: number): FormGroup {
    return this.fb.group({
      type: [type, [Validators.required]],
      value: [value, [Validators.required]]
    });
  }

  createPersonGroup(name: string = '', designation: string = ''): FormGroup {
    return this.fb.group({
      name: [name, [Validators.required]],
      designation: [designation, [Validators.required]]
    });
  }
  
  patchProjectDetails(project: any): void {
    this.projectForm.patchValue({
      status: project.status,
      materialRequest: project.materialRequest,
      supervisors: project.supervisors || [],
      notes: project.notes || '',
      priority: project.priority,
      estimations: project.estimations || [],
      involvedPersons: project.involvedPersons || [],
      jobId: project.jobId?._id || ''
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
    }

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

    if (project.estimatedCostForProject !== undefined && project.estimatedCostForProject !== null) {
      this.costingDetails.estimatedCostForProject = parseFloat(project.estimatedCostForProject.toString()) || 0;
    }

    this.originalFormData = {
      ...this.projectForm.value,
      materialRequest: [...this.materialRequests]
    };
    
    this.loadCostingDetails();
  }



  openMaterialRequestModal(): void {
    this.router.navigate([`/technical/project/material-request`, this.projectId]);
  }

  openPage(route: string): void {
    this.router.navigate([`/technical/project/${route}`, this.projectId]);
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

    console.log(this.projectForm.value);

    if (this.projectForm.invalid) {
      this.notificationService.error('Please fill all required fields correctly');
      return;
    }

    this.isSaving.set(true);

    console.log('Costing Details:', this.costingDetails);
    console.log('Estimated Cost Value:', this.costingDetails.estimatedCostForProject);
    console.log('Type:', typeof this.costingDetails.estimatedCostForProject);

    const estimatedCost = this.costingDetails.estimatedCostForProject !== undefined && this.costingDetails.estimatedCostForProject !== null
      ? Number(this.costingDetails.estimatedCostForProject) || 0
      : 0;

    console.log('Parsed Estimated Cost:', estimatedCost);

    const technicalData: TechnicalProject = {
      status: this.projectForm.value.status,
      supervisors: this.projectForm.value.supervisors,
      notes: this.projectForm.value.notes,
      involvedPersons: this.projectForm.value.involvedPersons,
      estimations: this.projectForm.value.estimations,
      priority: this.projectForm.value.priority,
      jobId: this.projectForm.value.jobId,
      estimatedCostForProject: estimatedCost
    };

    if(this.projectId){
      this.updateTechnicalProject(this.projectId, technicalData);
    }
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
        this.router.navigate([`/technical/${this.projectDetails()?.projectType}`]);
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
      if (this.originalFormData) {
        const currentFormData = this.projectForm.value;
        const hasChanges = JSON.stringify(currentFormData) !== JSON.stringify(this.originalFormData) ||
                          JSON.stringify(this.materialRequests) !== JSON.stringify(this.originalFormData.materialRequest);
        this.hasUnsavedChanges.set(hasChanges);
      }
    });
  }

  canDeactivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.hasUnsavedChanges() && !this.isNavigatingAway) {
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
    if (this.hasUnsavedChanges()) {
      this.showUnsavedChangesDialog();
    } else {
      this.router.navigate(['/technical/project']);
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    if (this.hasUnsavedChanges()) {
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
    if (this.originalFormData) {
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

  loadUnassignedJobs(): void {
    const filterParams = {
      page: 1,
      row: 100
    };
    
    this.jobService.getUnassignedToTechnical(filterParams).subscribe({
      next: (response) => {
        if (response && response.data) {
          this.unassignedJobOptions = response.data.map((job: any) => ({
            id: job._id,
            name: `${job.jobId} - ${job.clientDetails.companyName}`,
            fullData: job
          }));
        }
      },
      error: (error) => {
        console.error('Error fetching unassigned jobs:', error);
      }
    });
  }

  getSalesPersonNameFromJobId(): string {
    const jobId = this.projectDetails()?.jobId._id;
    const job = this.jobIds.find((job: any) => job._id === jobId);
    return job?.salesPersonName || this.selectedJobId() ? this.selectedJobId().quotation.createdBy.fullName : '';
  }

  getProjectName(): string {
    return this.projectDetails()?.customer.companyName || '';
  }

  getExpectedStartDate(): Date | null {
    if(!this.projectDetails()?.activityPlan.length) return null;
    return this.projectDetails()?.activityPlan.reduce((acc,current)=>{
      return acc.startDate < current.startDate ? acc : current;
    }).startDate || null;
  }

  getExpectedEndDate(): Date | null {
    if(!this.projectDetails()?.activityPlan.length            ) return null;
    return this.projectDetails()?.activityPlan.reduce((acc,current)=>{
      return acc.endDate > current.endDate ? acc : current;
    }).endDate || null;
  }

  onJobIdChange(jobId: string): void {
    this.checkPurchaseRequests(jobId);
  }

  onJobSelected(jobId: any): void {
    const jobIdString = Array.isArray(jobId) ? jobId[0] : jobId;
    this.onJobIdChange(jobIdString);
  }

  onJobIdSelected(jobId: string | string[]): void {
    const selectedJobId = Array.isArray(jobId) ? jobId[0] : jobId;
    
    if (selectedJobId) {
      const selectedJob = this.unassignedJobOptions.find(job => job.id === selectedJobId);
      if (selectedJob) {
        this.selectedJobId.set(selectedJob.fullData);
        this.checkPurchaseRequests(selectedJobId);
      }
    } else {
      this.selectedJobId.set(null);
      this.purchaseRequests = [];
      this.hasPurchaseRequests.set(false);
    }
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

  getJobIdDisplayValue(): string {
    // First check if there's a saved/existing job in project details
    if (this.projectDetails()?.jobId?._id) {
      const jobId = this.projectDetails()?.jobId._id;
      const job = this.jobIds.find((job: any) => job._id === jobId);
      return job?.jobId || this.projectDetails()?.jobId?.jobId || '';
    }
    
    // If no saved job, check if there's a selected job that hasn't been saved yet
    // Only show this as attached after saving, so return empty for unsaved selections
    return '';
  }

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

  onEstimatedCostChange(value: any): void {
    const numValue = value === null || value === undefined || value === '' ? 0 : parseFloat(value);
    this.costingDetails.estimatedCostForProject = isNaN(numValue) ? 0 : numValue;
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

  onPreviewPdf(quotedData: getQuotatation, salesPerson: any, customer: any, attention: any) {
    this.loader.start();
    quotedData.createdBy = salesPerson;
    quotedData.client = customer;
    quotedData.attention = attention;
    let quoteData: getQuotatation = quotedData;
    const pdfDoc = this.quotationService.generatePDF(quoteData, true);
    pdfDoc.then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);

        let dialogRef = this.dialog.open(PdfPreviewComponent,
          { data: { url: url, formatedQuote: quoteData } });
        this.loader.complete();
      });
    });
  }

  onViewPDF(file: any) {
    if (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) {
      this.subscriptions.add(
        this.jobService.downloadFile(file.fileName)
          .subscribe({
            next: (event) => {
              if (event.type === HttpEventType.Response) {
                const fileContent: Blob = new Blob([event['body']], { type: 'application/pdf' });
                const fileURL = URL.createObjectURL(fileContent);
                window.open(fileURL, '_blank');
                setTimeout(() => {
                  URL.revokeObjectURL(fileURL);
                }, 10000);
              }
            },
            error: (error) => {
              if (error.status === 404) {
                this.notificationService.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.');
              } else {
                this.notificationService.error('An error occurred while trying to view the PDF. Please try again later.');
              }
            }
          })
      );
    } else {
      this.notificationService.warning('This file type is not supported for viewing. Please download and view the file.');
    }
  }

  onDownloadClicks(file: any) {
    this.selectedFile = file.fileName;
    this.subscriptions.add(
      this.jobService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.DownloadProgress) {
              this.progress = Math.round(100 * event.loaded / event.total);
            } else if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']]);
              saveAs(fileContent, file.originalname);
              this.clearProgress();
            }
          },
          error: (error) => {
            if (error.status == 404) {
              this.selectedFile = undefined;
              this.notificationService.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.');
            }
          }
        })
    );
  }

  clearProgress() {
    setTimeout(() => {
      this.selectedFile = undefined;
      this.progress = 0;
    }, 1000);
  }

  getQuotationData(): any {
    return this.projectDetails()?.jobId?.quotation || null;
  }

  getLpoFiles(): any[] {
    return this.projectDetails()?.jobId?.quotation?.lpoFiles || [];
  }

  getQuotationId(): string {
    return this.projectDetails()?.jobId?.quotation?.quoteId || '';
  }

  getSalesPersonData(): any {
    return this.projectDetails()?.jobId?.quotation?.createdBy || null;
  }

  getCustomerData(): any {
    return this.projectDetails()?.customer || null;
  }

  getAttentionData(): any {
    return this.projectDetails()?.jobId?.quotation?.attention || null;
  }
} 