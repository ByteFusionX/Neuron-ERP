import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { BillingSummary, TechnicalService } from 'src/app/core/services/technical.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';

@Component({
  selector: 'app-invoice-form',
  imports: [
    CommonModule,
    FormFieldComponent,
    ReactiveFormsModule,
    ButtonComponent
  ],
  templateUrl: './invoice-form.component.html',
  styleUrl: './invoice-form.component.css',
})
export class InvoiceFormComponent {

  private fb = inject(FormBuilder);
  private technicalService = inject(TechnicalService);
  private notificationService = inject(ToastrService);
  
  isSubmitting = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  billingId = signal<string>('');

  constructor(
    private dialogRef: MatDialogRef<InvoiceFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { projectId: string, billingSummary: BillingSummary, totalBalance: number },
  ) { }

  ngOnInit(): void {
    if(this.data.billingSummary) {
      const billingSummaryData: any = { ...this.data.billingSummary };
      
      if (billingSummaryData.invoicedDate) {
        billingSummaryData.invoicedDate = new Date(billingSummaryData.invoicedDate).toISOString().split('T')[0];
      }
      
      this.invoiceForm.patchValue({
        invoicedAmount: billingSummaryData.invoicedAmount,
        invoicedAgainst: billingSummaryData.invoicedAgainst,
        invoicedDate: billingSummaryData.invoicedDate
      });

      this.billingId.set(this.data.billingSummary._id!);
    }
  }

  private balanceValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null;
    
    let availableBalance = this.data.totalBalance;
    
    if (this.data.billingSummary) {
      availableBalance += this.data.billingSummary.invoicedAmount;
    }
    
    if (value > availableBalance) {
      return { 
        exceedsBalance: { 
          max: availableBalance, 
          actual: value 
        } 
      };
    }
    
    return null;
  };

  invoiceForm: FormGroup = this.fb.group({
    invoicedAmount: ['', [Validators.required, Validators.min(0.01), this.balanceValidator]],
    invoicedAgainst: ['', [Validators.required]],
    invoicedDate: ['']
  });

  getAvailableBalance(): number {
    let availableBalance = this.data.totalBalance;
    if (this.data.billingSummary) {
      availableBalance += this.data.billingSummary.invoicedAmount;
    }
    return availableBalance;
  }

  getBalanceError(): string | null {
    const control = this.invoiceForm.get('invoicedAmount');
    if (control?.errors?.['exceedsBalance']) {
      const availableBalance = this.getAvailableBalance();
      return `Amount cannot exceed available balance of ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR`;
    }
    return null;
  }

  closeModal(isUpdated: boolean = false): void {
    this.dialogRef.close(isUpdated);
  }

  onSubmit(): void {
    this.isSubmitted.set(true);

    if (this.invoiceForm.invalid) {
      this.notificationService.error('Please fill all required fields correctly');
      return;
    }

    const formData = this.invoiceForm.value;
    this.isSubmitting.set(true);

    const request = this.billingId() 
      ? this.technicalService.updateBillingSummary(this.data.projectId, this.billingId(), formData)
      : this.technicalService.createBillingSummary(this.data.projectId, formData);

    request.subscribe({
      next: () => {
        const message = this.billingId() 
          ? 'Billing summary updated successfully' 
          : 'Billing summary created successfully';
        this.notificationService.success(message);
        this.closeModal(true);
        this.isSubmitting.set(false);
      },
      error: (error) => {
        this.isSubmitting.set(false);
        const message = this.billingId() 
          ? 'Failed to update billing summary' 
          : 'Failed to create billing summary';
        this.notificationService.error(message);
        console.error('Error saving billing summary:', error);
      }
    });
  }

  // Helper for template form access
  get f() {
    return this.invoiceForm.controls;
  }
}
