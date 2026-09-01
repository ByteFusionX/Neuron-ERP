import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SupplierReturnService } from 'src/app/core/services/supplier-return/supplier-return.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-dispute-supplier-return',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ModalLayoutComponent
  ],
  templateUrl: './dispute-supplier-return.component.html'
})
export class DisputeSupplierReturnComponent {
  private fb = inject(FormBuilder);
  private supplierReturnService = inject(SupplierReturnService);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<DisputeSupplierReturnComponent>);
  private data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;
  formSubmitted = false;

  disputeForm: FormGroup = this.fb.group({
    disputeNote: ['', [Validators.required, Validators.minLength(3)]]
  });

  get supplierReturn() {
    return this.data?.supplierReturn;
  }

  onSubmit(): void {
    this.formSubmitted = true;

    if (this.disputeForm.invalid) {
      this.disputeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.supplierReturnService.disputeSupplierReturn(this.supplierReturn._id, {
      disputeStatus: 'SupplierDisputed',
      disputeNote: this.disputeForm.value.disputeNote
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Supplier return marked as disputed');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to mark supplier return as disputed');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
