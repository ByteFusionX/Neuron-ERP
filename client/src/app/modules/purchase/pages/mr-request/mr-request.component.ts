import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { appNoLeadingSpace } from 'src/app/shared/directives/trim-validator.directive';

@Component({
  selector: 'app-mr-request',
  imports: [
    NgIcon,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    appNoLeadingSpace,
  ],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent implements OnInit {

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private purchaseService = inject(PurchaseService);
  private technicalService = inject(TechnicalService);
  isSubmitted = signal<boolean>(false);
  purchaseId!: string;
  jobMongoId?: string;
  hasMrRequest = signal<boolean>(false);

  engineerId: string | null = null;
  engineerDisplayName = ''

  mrForm: FormGroup = this.fb.group({
    message: ['', [Validators.required]],
    totalPurchase: [0]
  })

  constructor(@Inject(MAT_DIALOG_DATA) public data: {
    purchaseId?: string;
    jobMongoId?: string;
    assignedEngineer?: { _id: string; firstName?: string; lastName?: string } | null;
    technicalProjectId?: string | null;
  }, private dialogRef: MatDialogRef<MrRequestComponent>) {
    this.purchaseId = data.purchaseId || '';
    this.jobMongoId = data.jobMongoId;
  }

  ngOnInit(): void {
    if (this.data.assignedEngineer !== undefined) {
      this.applyEngineerFromData(this.data.assignedEngineer);
    } else if (this.jobMongoId) {
      this.technicalService.getMaterialRequestByJobId(this.jobMongoId).subscribe({
        next: (res: { assignedEngineer?: { _id: string; firstName?: string; lastName?: string } | null }) =>
          this.applyEngineerFromData(res.assignedEngineer),
        error: () => this.applyEngineerFromData(null)
      });
    } else {
      this.applyEngineerFromData(null);
    }
    if (this.purchaseId) {
      this.loadPurchaseData();
    }
  }

  private applyEngineerFromData(engineer: { _id: string; firstName?: string; lastName?: string } | null | undefined): void {
    if (engineer && engineer._id) {
      this.engineerId = String(engineer._id);
      const name = [engineer.firstName, engineer.lastName].filter(Boolean).join(' ').trim();
      this.engineerDisplayName = name || '—';
    } else {
      this.engineerId = null;
      this.engineerDisplayName = 'No engineer assigned';
    }
  }

  loadPurchaseData(): void {
    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (res) => {
        if (res.data?.mrRequest?.message != null || res.data?.mrRequest?.totalPurchase != null) {
          const mrRequest = res.data.mrRequest;
          this.hasMrRequest.set(true);
          this.mrForm.patchValue({
            message: mrRequest.message || '',
            totalPurchase: mrRequest.totalPurchase || 0,
          });
        } else {
          this.hasMrRequest.set(false);
        }
      },
      error: () => {
        this.hasMrRequest.set(false);
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
      return;
    }

    if (!this.purchaseId) {
      this.toaster.error('Purchase ID is required');
      return;
    }

    const mrRequest = {
      engineer: this.engineerId,
      message: this.mrForm.value.message,
      totalPurchase: this.mrForm.value.totalPurchase || 0,
      createdDate: new Date()
    };


    this.purchaseService.updatePurchaseMrRequest(this.purchaseId, mrRequest).subscribe({
      next: (res) => {
        if (res.success) {
          this.hasMrRequest.set(true);
          this.toaster.success('MR request updated successfully');
          this.dialogRef.close({ success: true });
        }
      },
      error: (error) => {
        console.error('Error updating MR request:', error);
        this.toaster.error('Failed to update MR request');
      }
    });
  }

  onClearClicks(){
    if (!this.purchaseId) {
      this.toaster.error('Purchase ID is required');
      return;
    }

    const mrRequest = {
      engineer: null,
      message: '',
      totalPurchase: 0,
      createdDate: new Date()
    };

    this.purchaseService.updatePurchaseMrRequest(this.purchaseId, mrRequest).subscribe({
      next: (res) => {
        if (res.success) {
          this.toaster.success('MR request cleared successfully');
          this.hasMrRequest.set(false);
          this.mrForm.reset();
          this.dialogRef.close({ success: true });
        }
      },
      error: (error) => {
        console.error('Error clearing MR request:', error);
        this.toaster.error('Failed to clear MR request');
      }
    });
  }

  get f() {
    return this.mrForm.controls;
  }
}
