import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';

@Component({
  selector: 'app-create-stock-hold',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-stock-hold.component.html',
  styleUrl: './create-stock-hold.component.css'
})
export class CreateStockHoldComponent implements OnInit {
  private fb = inject(FormBuilder);
  private stockHoldService = inject(StockHoldService);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<CreateStockHoldComponent>);
  data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;

  logisticsOptions = [
    { label: 'Physical Return', value: 'PhysicalReturn' },
    { label: 'Supplier Pickup', value: 'SupplierPickup' },
    { label: 'Courier / 3rd Party', value: 'Courier' },
    { label: 'No Physical Return (waived/disposed)', value: 'NoPhysicalReturn' }
  ];

  holdForm: FormGroup = this.fb.group({
    vendorAuthorizationNo: [''],
    returnReason: [''],
    returnNotes: [''],
    logisticsType: ['', [Validators.required]],
    trackingRef: [''],
    courierName: [''],
    dispatchDate: [''],
    qty: ['', [Validators.required, Validators.min(1)]]
  });

  ngOnInit(): void {
    this.holdForm.patchValue({
      qty: this.data?.rejectedQty || 1,
      returnReason: this.data?.rejectionReason || ''
    });

    this.holdForm.get('logisticsType')?.valueChanges.subscribe((value) => {
      const trackingRef = this.holdForm.get('trackingRef');
      const courierName = this.holdForm.get('courierName');
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
    if (this.holdForm.invalid) {
      this.holdForm.markAllAsTouched();
      return;
    }
    if (!this.data?.grnId || this.data?.itemIndex === undefined) {
      this.toastr.error('Missing GRN item context');
      return;
    }

    const qty = Number(this.holdForm.value.qty);
    if (qty > (this.data?.rejectedQty || 0)) {
      this.toastr.error(`Quantity cannot exceed the unresolved rejected qty (${this.data?.rejectedQty})`);
      return;
    }

    this.isSubmitting = true;
    this.stockHoldService.createStockHold({
      grnId: this.data.grnId,
      itemIndex: this.data.itemIndex,
      qty,
      logisticsType: this.holdForm.value.logisticsType,
      trackingRef: this.holdForm.value.trackingRef || undefined,
      courierName: this.holdForm.value.courierName || undefined,
      dispatchDate: this.holdForm.value.dispatchDate || undefined,
      vendorAuthorizationNo: this.holdForm.value.vendorAuthorizationNo || undefined,
      returnReason: this.holdForm.value.returnReason || undefined,
      returnNotes: this.holdForm.value.returnNotes || undefined
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Purchase return created');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to initiate stock hold');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
