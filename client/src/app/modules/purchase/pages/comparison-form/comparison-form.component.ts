import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { QuoteItemDetails, Comparisons } from 'src/app/shared/interfaces/purchase.interface';

export interface ComparisonFormData {
  itemDetail?: QuoteItemDetails;
  existingComparison?: Comparisons;
  isEditMode?: boolean;
  quantity?: number;
}

@Component({
  selector: 'app-comparison-form',
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent],
  templateUrl: './comparison-form.component.html',
  styleUrl: './comparison-form.component.css'
})
export class ComparisonFormComponent implements OnInit {

  private fb = inject(FormBuilder)
  private modalRef = inject<ModalRef<any>>(ModalRef)
  private supplierService = inject(SupplierService)
  private toaster = inject(ToastrService)
  private data = inject(MODAL_DATA, { optional: true }) as ComparisonFormData | null

  suppliers = signal<any[]>([])
  supplierOptions = computed<SfOption[]>(() => this.suppliers().map((s) => ({ label: s.supplierName, value: s._id })));
  isEditMode = signal<boolean>(false);
  itemName = (this.data?.itemDetail as any)?.detail || '';

  comparisonForm: FormGroup = this.fb.group({
    supplierName: [''],
    supplierId: ['', Validators.required],
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
      this.comparisonForm.markAllAsTouched();
      return;
    }
    const supplierId = this.comparisonForm.value.supplierId;
    const supplier = this.suppliers().find((item) => supplierId == item._id)
    if (supplier) {
      this.comparisonForm.patchValue({ supplierName: supplier.supplierName })
    } else if (!(this.isEditMode() && this.comparisonForm.value.supplierName)) {
      this.toaster.error('Supplier not found');
      return;
    }
    this.modalRef.close(this.comparisonForm.value)
  }

  onCancel() {
    this.modalRef.close()
  }

  get f() {
    return this.comparisonForm.controls;
  }
}
