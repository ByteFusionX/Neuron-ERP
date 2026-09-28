import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';

export interface AddSupplierDiscountResult {
  supplierId: string;
  discount: number;
}

/** Pick a supplier and a discount amount. Closes with the form value, or undefined on cancel. */
@Component({
  selector: 'app-add-supplier-discount',
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent],
  templateUrl: './add-supplier-discount.component.html',
  styleUrl: './add-supplier-discount.component.css'
})
export class AddSupplierDiscountComponent implements OnInit {
  private fb = inject(FormBuilder)
  private supplierService = inject(SupplierService)
  private modalRef = inject<ModalRef<AddSupplierDiscountResult>>(ModalRef);

  suppliers = signal<any[]>([])
  supplierOptions = computed<SfOption[]>(() => this.suppliers().map((s) => ({ label: s.supplierName, value: s._id })));

  supplierForm: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    discount: [null, [Validators.required, Validators.min(0)]],
  })

  ngOnInit(): void {
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliers.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  onCloseClicks() {
    this.modalRef.close()
  }

  onSubmit() {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }
    this.modalRef.close(this.supplierForm.value)
  }

  get f() {
    return this.supplierForm.controls;
  }
}
