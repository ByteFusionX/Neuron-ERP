import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';
import { FormModalShellComponent } from 'src/app/shared/components/modal/form-modal-shell/form-modal-shell.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-resolve-dispute',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormModalShellComponent,
    SmartFormModule
  ],
  templateUrl: './resolve-dispute.component.html',
  styleUrl: './resolve-dispute.component.css'
})
export class ResolveDisputeComponent {
  private fb = inject(FormBuilder);
  private stockHoldService = inject(StockHoldService);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<ResolveDisputeComponent>);
  private data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;
  formSubmitted = false;

  resolveForm: FormGroup = this.fb.group({
    disputeNote: ['', [Validators.required, Validators.minLength(3)]]
  });

  get stockHold() {
    return this.data?.stockHold;
  }

  onSubmit(): void {
    this.formSubmitted = true;

    if (this.resolveForm.invalid) {
      this.resolveForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const payload = { disputeStatus: 'DisputeResolved' as const, disputeNote: this.resolveForm.value.disputeNote };

    this.stockHoldService.disputeStockHold(this.stockHold._id, payload).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Dispute resolved');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to resolve dispute');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
