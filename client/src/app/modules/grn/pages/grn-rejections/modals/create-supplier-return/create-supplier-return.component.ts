import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SupplierReturnService } from 'src/app/core/services/supplier-return/supplier-return.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-create-supplier-return',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ModalLayoutComponent
  ],
  templateUrl: './create-supplier-return.component.html'
})
export class CreateSupplierReturnComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supplierReturnService = inject(SupplierReturnService);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<CreateSupplierReturnComponent>);
  data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;

  logisticsOptions = [
    { label: 'Supplier Pickup', value: 'SupplierPickup' },
    { label: 'Courier / 3rd Party', value: 'Courier' },
    { label: 'No Physical Return (waived/disposed)', value: 'NoPhysicalReturn' }
  ];

  returnForm: FormGroup = this.fb.group({
    logisticsType: ['', [Validators.required]],
    trackingRef: [''],
    courierName: [''],
    dispatchDate: [''],
    qty: ['', [Validators.required, Validators.min(1)]]
  });

  ngOnInit(): void {
    this.returnForm.patchValue({ qty: this.data?.rejectedQty || 1 });

    this.returnForm.get('logisticsType')?.valueChanges.subscribe((value) => {
      const trackingRef = this.returnForm.get('trackingRef');
      const courierName = this.returnForm.get('courierName');
      if (value === 'Courier') {
        trackingRef?.setValidators([Validators.required]);
        courierName?.setValidators([Validators.required]);
      } else {
        trackingRef?.clearValidators();
        courierName?.clearValidators();
      }
      trackingRef?.updateValueAndValidity();
      courierName?.updateValueAndValidity();
    });
  }

  onSubmit(): void {
    if (this.returnForm.invalid) {
      this.returnForm.markAllAsTouched();
      return;
    }
    if (!this.data?.grnId || this.data?.itemIndex === undefined) {
      this.toastr.error('Missing GRN item context');
      return;
    }

    const qty = Number(this.returnForm.value.qty);
    if (qty > (this.data?.rejectedQty || 0)) {
      this.toastr.error(`Quantity cannot exceed the unresolved rejected qty (${this.data?.rejectedQty})`);
      return;
    }

    this.isSubmitting = true;
    this.supplierReturnService.createSupplierReturn({
      grnId: this.data.grnId,
      itemIndex: this.data.itemIndex,
      qty,
      logisticsType: this.returnForm.value.logisticsType,
      trackingRef: this.returnForm.value.trackingRef || undefined,
      courierName: this.returnForm.value.courierName || undefined,
      dispatchDate: this.returnForm.value.dispatchDate || undefined
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Supplier return initiated');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to initiate supplier return');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
