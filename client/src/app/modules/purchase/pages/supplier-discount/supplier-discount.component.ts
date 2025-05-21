import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { AddSupplierDiscountComponent } from '../add-supplier-discount/add-supplier-discount.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { NgIcon } from '@ng-icons/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-supplier-discount',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    NgIcon,
  ],
  templateUrl: './supplier-discount.component.html',
  styleUrl: './supplier-discount.component.css'
})
export class SupplierDiscountComponent {
  private _dialog = inject(MatDialog)
  private fb = inject(FormBuilder)
  private purchaseService = inject(PurchaseService)
  private router = inject(Router)
  private toaster = inject(ToastrService)

  selectedJob!: getJob;
  isSubmitted = signal<boolean>(false);
  suppliers = signal<{ supplier: string, discount: string }[]>([])

  supplierForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    prNo: ['', [Validators.required]],
    suppliers: this.fb.array([this.supplierDiscounts()]),
    totalDiscount: [''],
  })

  ngOnInit(): void {
    this.purchaseService.selectedJob$.subscribe((job) => {
      if (job) {
        this.selectedJob = job
        this.supplierForm.patchValue({
          jobId: job.jobId,
          prNo: job.prNo,
        })
      } else {
        this.router.navigate(['/purchase/create'])
      }
    })

    const suppliersArray = this.supplierForm.get('suppliers') as FormArray;

    suppliersArray.valueChanges.subscribe(() => {
      const total = this.calculateTotalDiscount();
      this.supplierForm.get('totalDiscount')?.setValue(total, { emitEvent: false });
    });

  }

  supplierDiscounts(data?: any): FormGroup {
    return this.fb.group({
      supplier: [data?.supplier || '', Validators.required],
      discount: [data?.discount || '', Validators.required],
      // discountType: [data?.discountType || '', Validators.required]
    });
  }

  onAddFieldClicks() {
    const dialogRef = this._dialog.open(AddSupplierDiscountComponent, {
      width: '500px'
    })

    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        const suppliers = this.suppliers()
        suppliers.push(data)
        this.suppliers.set(suppliers)
        this.patchSupplierData()
        const total = this.calculateTotalDiscount();
        this.supplierForm.get('totalDiscount')?.setValue(total);
      }
    })
  }

  patchSupplierData() {
    const supplierArray = this.fb.array(
      this.suppliers().map(s => this.supplierDiscounts(s))
    );
    this.supplierForm.setControl('suppliers', supplierArray);
  }

  onSubmit() {
    if (this.supplierForm.valid && this.suppliers().length > 0) {
      this.purchaseService.setSupplierDiscount(this.supplierForm.value)
      this.purchaseService.setPurchaseFormData(this.selectedJob)
      this.router.navigate(['/purchase/create'])
    } else {
      this.toaster.warning("Please add supplier and discount value")
    }
  }

  onClose() {
    this.purchaseService.setPurchaseFormData(this.selectedJob)
    this.router.navigate(['/purchase/create'])
  }

  get supplierDiscount(): FormArray {
    return this.supplierForm.get('suppliers') as FormArray;
  }

  onDeleteSupplier(index: number) {
    this.suppliers().splice(index, 1)
    this.supplierDiscount.removeAt(index);
    const total = this.calculateTotalDiscount();
    this.supplierForm.get('totalDiscount')?.setValue(total);
  }

  calculateTotalDiscount(): number {
    const suppliers = this.supplierForm.get('suppliers') as FormArray;
    const total = suppliers.controls.reduce((sum, ctrl) => {
      const discount = ctrl.get('discount')?.value || 0;
      return sum + parseFloat(discount);
    }, 0);
    return total;
  }

  get f() {
    return this.supplierForm.controls;
  }
}
