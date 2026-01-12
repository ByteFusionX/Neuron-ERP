import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { QuoteItemDetails, Comparisons } from 'src/app/shared/interfaces/purchase.interface';

interface ComparisonFormData {
  itemDetail?: QuoteItemDetails;
  existingComparison?: Comparisons;
  isEditMode?: boolean;
  quantity?: number;
}

@Component({
  selector: 'app-comparison-form',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    IconsModule,
    SelectDropdownComponent
  ],
  templateUrl: './comparison-form.component.html',
  styleUrl: './comparison-form.component.css'
})
export class ComparisonFormComponent implements OnInit {

  private fb = inject(FormBuilder)
  private dialogRef = inject(MatDialogRef<ComparisonFormComponent>)
  private supplierService = inject(SupplierService)
  private toaster = inject(ToastrService)
  private data = inject<ComparisonFormData>(MAT_DIALOG_DATA, { optional: true })

  isSubmitted = signal<boolean>(false);
  suppliers = signal<any[]>([])
  isEditMode = signal<boolean>(false);

  comparisonForm: FormGroup = this.fb.group({
    supplierName: [''],
    supplierId: [''],
    quantity: [null, Validators.required],
    unitPrice: [null, Validators.required],
    etaTerms: ['', Validators.required],
    paymentTerms: ['', Validators.required],
    totalCost: [''],
    selected: [false],
  });

  constructor() {
    this.setupAutoTotalCostCalculation();
  }

  ngOnInit(): void {
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliers.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })

    if (this.data) {
      if (this.data.isEditMode && this.data.existingComparison) {
        this.isEditMode.set(true);
        this.populateFormForEdit(this.data.existingComparison);
      } else if (this.data.quantity !== undefined) {
        this.comparisonForm.patchValue({
          quantity: this.data.quantity
        });
      } else if (this.data.itemDetail?.quantity !== undefined) {
        this.comparisonForm.patchValue({
          quantity: this.data.itemDetail.quantity
        });
      }
    }
  }

  populateFormForEdit(comparison: Comparisons): void {
    this.comparisonForm.patchValue({
      supplierId: comparison.supplierId || '',
      supplierName: comparison.supplierName || '',
      quantity: comparison.quantity || null,
      unitPrice: comparison.unitPrice || null,
      etaTerms: comparison.etaTerms || '',
      paymentTerms: comparison.paymentTerms || '',
      totalCost: comparison.totalCost || '',
      selected: comparison.selected || false
    });
    this.updateTotalCost();
  }

  setupAutoTotalCostCalculation() {
    this.comparisonForm.get('quantity')?.valueChanges.subscribe(() => this.updateTotalCost());
    this.comparisonForm.get('unitPrice')?.valueChanges.subscribe(() => this.updateTotalCost());
  }

  updateTotalCost() {
    const quantity = this.comparisonForm.get('quantity')?.value || 0;
    const unitPrice = this.comparisonForm.get('unitPrice')?.value || 0;
    const total = quantity * unitPrice;
    this.comparisonForm.get('totalCost')?.setValue(total.toFixed(2), { emitEvent: false });
  }

  onSubmit() {
    if (this.comparisonForm.invalid) {
      this.toaster.warning('Please fill all required fields')
      return;
    } else {
      const supplierId = this.comparisonForm.value.supplierId;
      const supplier = this.suppliers().find((item) => supplierId == item._id)
      if (supplier) {
        this.comparisonForm.patchValue({ supplierName: supplier.supplierName })
      } else if (this.isEditMode() && this.comparisonForm.value.supplierName) {
        // Keep existing supplier name if supplier not found in list (shouldn't happen, but safety check)
      } else {
        this.toaster.error('Supplier not found');
        return;
      }
      const data = this.comparisonForm.value
      this.dialogRef.close(data)
    }
  }

  onCancel() {
    this.comparisonForm.reset();
    this.dialogRef.close()
  }

  get f() {
    return this.comparisonForm.controls;
  }

}
