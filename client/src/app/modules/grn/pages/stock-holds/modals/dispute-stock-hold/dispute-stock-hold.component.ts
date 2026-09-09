import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-dispute-stock-hold',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ModalLayoutComponent
  ],
  templateUrl: './dispute-stock-hold.component.html'
})
export class DisputeStockHoldComponent {
  private fb = inject(FormBuilder);
  private stockHoldService = inject(StockHoldService);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<DisputeStockHoldComponent>);
  private data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;
  formSubmitted = false;

  disputeForm: FormGroup = this.fb.group({
    disputeNote: ['', [Validators.required, Validators.minLength(3)]]
  });

  get stockHold() {
    return this.data?.stockHold;
  }

  onSubmit(): void {
    this.formSubmitted = true;

    if (this.disputeForm.invalid) {
      this.disputeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const payload = { disputeStatus: 'SupplierDisputed' as const, disputeNote: this.disputeForm.value.disputeNote };

    this.stockHoldService.disputeStockHold(this.stockHold._id, payload).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Stock hold marked as disputed');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to mark as disputed');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
