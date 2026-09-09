import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-resolve-stock-hold',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ModalLayoutComponent
  ],
  templateUrl: './resolve-stock-hold.component.html',
  styleUrl: './resolve-stock-hold.component.css'
})
export class ResolveStockHoldComponent implements OnInit {
  private fb = inject(FormBuilder);
  private stockHoldService = inject(StockHoldService);
  private employeeService = inject(EmployeeService);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<ResolveStockHoldComponent>);
  private data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;
  canIssueCreditNote = false;

  resolutionOptions = [
    { label: 'Replacement (same supplier)', value: 'Replacement' },
    { label: 'Alternate Supplier Sourcing', value: 'AlternateSupplierSourcing' },
    { label: 'Credit Only (no replacement)', value: 'CreditOnly' },
    { label: 'Disposed (write-off)', value: 'Disposed' }
  ];

  resolveForm: FormGroup = this.fb.group({
    qty: ['', [Validators.required, Validators.min(1)]],
    resolutionType: ['', [Validators.required]],
    replacementPoId: [''],
    invoiced: [false],
    poId: [''],
    note: ['']
  });

  get stockHold() {
    return this.data?.stockHold;
  }

  ngOnInit(): void {
    this.resolveForm.patchValue({ qty: this.stockHold?.unresolvedQty || 1 });

    this.employeeService.employeeData$.subscribe((employee) => {
      const privileges = employee?.category?.privileges as any;
      const hasGrnView = privileges?.grn?.viewReport && privileges.grn.viewReport !== 'none';
      this.canIssueCreditNote = privileges?.stockHold?.canIssueCreditNote || hasGrnView || false;
    });
  }

  get isPhysicalResolution(): boolean {
    const type = this.resolveForm.get('resolutionType')?.value;
    return type === 'Replacement' || type === 'AlternateSupplierSourcing';
  }

  get isFinancialResolution(): boolean {
    const type = this.resolveForm.get('resolutionType')?.value;
    return type === 'CreditOnly' || type === 'Disposed';
  }

  onSubmit(): void {
    if (this.resolveForm.invalid) {
      this.resolveForm.markAllAsTouched();
      return;
    }

    const qty = Number(this.resolveForm.value.qty);
    if (qty > (this.stockHold?.unresolvedQty || 0)) {
      this.toastr.error(`Quantity cannot exceed the unresolved qty (${this.stockHold?.unresolvedQty})`);
      return;
    }

    const invoiced = !!this.resolveForm.value.invoiced;
    if (invoiced && !this.resolveForm.value.poId) {
      this.toastr.error('A Purchase Order ID is required to issue a credit note against an invoiced PO');
      return;
    }

    this.isSubmitting = true;

    this.stockHoldService.resolveStockHold(this.stockHold._id, {
      qty,
      resolutionType: this.resolveForm.value.resolutionType,
      replacementPoId: this.resolveForm.value.replacementPoId || undefined,
      note: this.resolveForm.value.note || undefined,
      invoiced,
      poId: this.resolveForm.value.poId || undefined
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Stock hold resolved');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to resolve');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
