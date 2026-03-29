import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { appFileValidator } from 'src/app/shared/directives/file-validator.directive';
import { appFileSizeValidator } from 'src/app/shared/directives/file-size.directive';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { PurchaseRequestModalComponent } from '../purchase-request-modal/purchase-request-modal.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { MaterialRequest, MaterialRequestAttachment } from 'src/app/core/services/technical.service';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

interface MaterialRequestFormItem {
  _id?: string;
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
  remarks: string;
  status?: 'pending' | 'approved' | 'rejected';
  statusHistory?: any[];
}

@Component({
  selector: 'app-material-request-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IconsModule,
    MatTooltipModule,
    appFileValidator,
    appFileSizeValidator,
    ButtonComponent,
    NumberFormatterPipe,
    ModalLayoutComponent
  ],
  templateUrl: './material-request-modal.component.html',
  styleUrl: './material-request-modal.component.css'
})
export class MaterialRequestModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private technicalService = inject(TechnicalService);
  private purchaseService = inject(PurchaseService);
  private toaster = inject(ToastrService);
  private dialog = inject(MatDialog);
  
  materialForm: FormGroup;
  isSubmitted = false;
  selectedFiles: File[] = [];
  materialRequestFiles: Array<{ fileName: string; originalname: string }> = [];
  existingAttachments: MaterialRequestAttachment[] = [];
  originalMaterialRequests: MaterialRequest[] = [];
  technicalId: string = '';
  jobId: string = '';
  isLoading = false;
  isSaving = false;
  purchaseRequests: any[] = [];
  hasPurchaseRequests = false;
  totalPurchaseAmount = 0;

  constructor() {
    this.materialForm = this.fb.group({
      materialRequests: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.technicalId = params['id'];
      if (this.technicalId) {
        this.loadMaterialRequests();
      } else {
        this.addMaterialRequest();
      }
    });
  }

  loadMaterialRequests(): void {
    this.isLoading = true;
    this.technicalService.getTechnicalProjectById(this.technicalId).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success && res.data) {
          if (res.data?.materialRequest) {
            const materialRequests = res.data.materialRequest;
            this.originalMaterialRequests = materialRequests;
            if (materialRequests && materialRequests.length > 0) {
              materialRequests.forEach((item: MaterialRequest) => {
                this.addMaterialRequest(item);
              });
            } else {
              this.addMaterialRequest();
            }
          } else {
            this.addMaterialRequest();
          }
          
          if (res.data?.materialRequestAttachements) {
            this.existingAttachments = (res.data.materialRequestAttachements || []).map((file: any) => ({
              fileName: file.fileName,
              originalname: file.originalname,
              status: file.status || 'pending',
              statusHistory: file.statusHistory || []
            }));
          }
          
          if (res.data?.jobId?._id || res.data?.jobId) {
            this.jobId = res.data.jobId._id || res.data.jobId;
            this.checkPurchaseRequests();
          }
        } else {
          this.addMaterialRequest();
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error loading material requests:', error);
        this.toaster.error('Failed to load material requests');
        this.addMaterialRequest();
      }
    });
  }

  checkPurchaseRequests(): void {
    if (this.jobId) {
      this.purchaseService.getPurchaseRequestsByJobId(this.jobId).subscribe({
        next: (response) => {
          this.purchaseRequests = response.data || [];
          const requestsWithMr = this.purchaseRequests.filter((purchase: any) => purchase.mrRequest);
          this.hasPurchaseRequests = requestsWithMr.length > 0;
          
          this.totalPurchaseAmount = requestsWithMr.reduce((total: number, purchase: any) => {
            return total + (purchase.totalLpo || 0);
          }, 0);
        },
        error: (error) => {
          console.error('Error fetching purchase requests:', error);
          this.purchaseRequests = [];
          this.hasPurchaseRequests = false;
          this.totalPurchaseAmount = 0;
        }
      });
    } else {
      this.purchaseRequests = [];
      this.hasPurchaseRequests = false;
      this.totalPurchaseAmount = 0;
    }
  }

  openPurchaseRequestModal(): void {
    const dialogRef = this.dialog.open(PurchaseRequestModalComponent, {
      width: '800px',
      data: { purchaseRequests: this.purchaseRequests }
    });

    dialogRef.afterClosed().subscribe(() => {
    });
  }

  get materialRequestsArray() {
    return this.materialForm.get('materialRequests') as FormArray;
  }

  addMaterialRequest(item?: MaterialRequest): void {
    let formattedDate = '';
    if (item?.requiredOn) {
      const date = new Date(item.requiredOn);
      formattedDate = date.toISOString().split('T')[0];
    }

    const isApproved = item?.status === 'approved';
    const validators = isApproved ? [] : [Validators.required];

    const materialRequest = this.fb.group({
      _id: [item?._id || null],
      itemName: [{ value: item?.itemName || '', disabled: isApproved }, validators],
      quantity: [{ value: item?.quantity || 1, disabled: isApproved }, validators.length > 0 ? [Validators.required, Validators.min(1)] : []],
      estimatedCost: [{ value: item?.estimatedCost || 0, disabled: isApproved }, validators.length > 0 ? [Validators.required, Validators.min(0)] : []],
      requiredOn: [{ value: formattedDate, disabled: isApproved }, validators],
      remarks: [{ value: item?.remarks || '', disabled: isApproved }],
      status: [item?.status || 'pending'],
      statusHistory: [item?.statusHistory || []]
    });

    this.materialRequestsArray.push(materialRequest);
  }

  removeMaterialRequest(index: number): void {
    const control = this.materialRequestsArray.at(index);
    if (control?.get('status')?.value === 'approved') {
      this.toaster.warning('Cannot remove approved items');
      return;
    }
    if (this.materialRequestsArray.length > 1) {
      this.materialRequestsArray.removeAt(index);
    }
  }

  isItemApproved(index: number): boolean {
    const control = this.materialRequestsArray.at(index);
    return control?.get('status')?.value === 'approved';
  }

  getItemStatus(index: number): string {
    const control = this.materialRequestsArray.at(index);
    return control?.get('status')?.value || 'pending';
  }

  getStatusClass(status?: string): string {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border border-red-200';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-700 border border-amber-200';
    }
  }

  showItemStatusHistory(index: number): void {
    const control = this.materialRequestsArray.at(index);
    const statusHistory = control?.get('statusHistory')?.value || [];
    const status = control?.get('status')?.value || 'pending';

    if (statusHistory.length === 0) {
      this.toaster.info('No status history available');
      return;
    }

    const history = statusHistory.map((item: any) => {
      const isApproved = item.status === 'approved';
      return {
        comment: item.comment || '',
        type: isApproved ? 'approval' : 'rejection',
        approvedBy: isApproved && item.changedBy ? item.changedBy : undefined,
        rejectedBy: !isApproved && item.changedBy ? item.changedBy : undefined,
        approvedAt: isApproved && item.changedDate ? new Date(item.changedDate).toISOString() : undefined,
        rejectedAt: !isApproved && item.changedDate ? new Date(item.changedDate).toISOString() : undefined,
        _id: item._id || Math.random().toString()
      };
    });

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: 'Material Request Item Status History',
        history: history
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }

  getFileStatusClass(file: MaterialRequestAttachment): string {
    return this.getStatusClass(file.status || 'pending');
  }

  showFileStatusHistory(file: MaterialRequestAttachment): void {
    const statusHistory = file.statusHistory || [];

    if (statusHistory.length === 0) {
      this.toaster.info('No status history available for this file');
      return;
    }

    const history = statusHistory.map((item: any) => {
      const isApproved = item.status === 'approved';
      return {
        comment: item.comment || '',
        type: isApproved ? 'approval' : 'rejection',
        approvedBy: isApproved && item.changedBy ? item.changedBy : undefined,
        rejectedBy: !isApproved && item.changedBy ? item.changedBy : undefined,
        approvedAt: isApproved && item.changedDate ? new Date(item.changedDate).toISOString() : undefined,
        rejectedAt: !isApproved && item.changedDate ? new Date(item.changedDate).toISOString() : undefined,
        _id: item._id || Math.random().toString()
      };
    });

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: 'File Status History',
        history: history
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }

  calculateTotalCost(quantity: number, estimatedCost: number): number {
    return quantity * estimatedCost;
  }

  calculateGrandTotal(): number {
    let total = 0;
    this.materialRequestsArray.controls.forEach(control => {
      const quantity = control.get('quantity')?.value || 0;
      const estimatedCost = control.get('estimatedCost')?.value || 0;
      total += quantity * estimatedCost;
    });
    return total;
  }

  onSubmit(): void {
    this.isSubmitted = true;
    
    const hasInvalidPendingItems = this.materialRequestsArray.controls.some((control, index) => {
      const originalItem = this.originalMaterialRequests[index];
      const isApproved = originalItem?.status === 'approved';
      if (isApproved) return false;
      control.markAllAsTouched();
      return control.invalid;
    });
    
    if (hasInvalidPendingItems) {
      this.toaster.error('Please fill in all required fields for pending items');
      return;
    }

    if (!this.technicalId) {
      this.toaster.error('Technical project ID is required');
      return;
    }

    this.isSaving = true;
    const materialRequests = this.materialRequestsArray.controls.map((control, index) => {
      const originalItem = this.originalMaterialRequests[index];
      const isApproved = originalItem?.status === 'approved';
      
      if (isApproved) {
        return {
          _id: originalItem._id,
          itemName: originalItem.itemName,
          quantity: originalItem.quantity,
          estimatedCost: originalItem.estimatedCost,
          requiredOn: originalItem.requiredOn instanceof Date ? originalItem.requiredOn : new Date(originalItem.requiredOn),
          remarks: originalItem.remarks || '',
          status: originalItem.status,
          statusHistory: originalItem.statusHistory || []
        };
      } else {
        const formGroup = control as FormGroup;
        const itemName = formGroup.get('itemName')?.value || '';
        const quantity = formGroup.get('quantity')?.value || 1;
        const estimatedCost = formGroup.get('estimatedCost')?.value || 0;
        const requiredOn = formGroup.get('requiredOn')?.value || '';
        const remarks = formGroup.get('remarks')?.value || '';
        
        return {
          _id: formGroup.get('_id')?.value || originalItem?._id,
          itemName: itemName,
          quantity: Number(quantity),
          estimatedCost: Number(estimatedCost),
          requiredOn: requiredOn ? new Date(requiredOn) : new Date(),
          remarks: remarks,
          status: originalItem?.status || 'pending',
          statusHistory: originalItem?.statusHistory || []
        };
      }
    });

    const formData = new FormData();
    formData.append('materialRequest', JSON.stringify(materialRequests));
    formData.append('existingAttachments', JSON.stringify(this.existingAttachments));
    
    if (this.selectedFiles.length > 0) {
      this.selectedFiles.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    this.technicalService.updateMaterialRequest(this.technicalId, formData).subscribe({
      next: (response) => {
        this.isSaving = false;
        if (response.success) {
          this.toaster.success(response.message || 'Material request updated successfully');
          this.router.navigate(['/technical/project/edit', this.technicalId]);
        } else {
          this.toaster.error(response.message || 'Failed to update material request');
        }
      },
      error: (error) => {
        this.isSaving = false;
        console.error('Error updating material request:', error);
        this.toaster.error('Failed to update material request');
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/technical/project/edit', this.technicalId]);
  }

  getFooterButtons(): any[] {
    return [
      { label: 'Cancel', onClick: this.onCancel.bind(this), theme: 'cancel' },
      { 
        label: 'Save Material Request', 
        onClick: this.onSubmit.bind(this), 
        theme: 'primary', 
        loading: this.isSaving, 
        type: 'submit', 
        disabled: this.materialForm.invalid || this.isSaving
      }
    ];
  }

  getFieldError(control: any, fieldName: string): string {
    if (control?.errors && control?.touched) {
      if (control.errors['required']) {
        return `${this.getFieldLabel(fieldName)} is required`;
      }
      if (control.errors['min']) {
        return `${this.getFieldLabel(fieldName)} must be greater than ${control.errors['min'].min}`;
      }
    }
    return '';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      itemName: 'Item Name',
      quantity: 'Quantity',
      estimatedCost: 'Estimated Cost',
      requiredOn: 'Required On',
      remarks: 'Remarks'
    };
    return labels[fieldName] || fieldName;
  }

  onFileSelected(event: any): void {
    const files = event.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file: any) => {
        if (!this.selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
          this.selectedFiles.push(file);
        }
      });
    }
    event.target.value = '';
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  removeExistingAttachment(index: number): void {
    const file = this.existingAttachments[index];
    if (file.status === 'approved') {
      this.toaster.warning('Cannot remove approved files');
      return;
    }
    this.existingAttachments.splice(index, 1);
  }

  triggerFileInput(fileInput: HTMLInputElement): void {
    fileInput.click();
  }
} 