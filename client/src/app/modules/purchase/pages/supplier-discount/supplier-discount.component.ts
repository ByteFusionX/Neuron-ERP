import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { AddSupplierDiscountComponent } from '../add-supplier-discount/add-supplier-discount.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { NgIcon } from '@ng-icons/core';
import { Router } from '@angular/router';

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

  selectedJob!: getJob;
  isSubmitted = signal<boolean>(false);
  suppliers = signal<{ supplier: string, discount: string }[]>([])

  supplierForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    prNo: ['', [Validators.required]],
    suppliers: this.fb.array([this.supplierDiscounts()]),
    totalDiscount: ['', [Validators.required]]
  })

  ngOnInit(): void {
    this.purchaseService.selectedJob$.subscribe((job) => {
      if (job) {
        this.selectedJob = job
        this.supplierForm.patchValue({
          jobId: job.jobId,
          prNo: job.prNo,
          suppliers: this.suppliers(),
          totalDiscount: ''
        })
      }else{
        this.router.navigate(['/purchase/create'])
      }
    })
  }

  supplierDiscounts(): FormGroup {
    return this.fb.group({
      supplier: ['', Validators.required],
      discount: ['', Validators.required],
    });
  }

  onAddFieldClicks() {
    const dialogRef = this._dialog.open(AddSupplierDiscountComponent, {
      width: '500px'
    })

    dialogRef.afterClosed().subscribe((res) => {
      if (res.supplier) {
        const suppliers = this.suppliers()
        suppliers.push(res.supplier)
        this.suppliers.set(suppliers)
      }
    })
  }

  onSubmit() {
    if (this.supplierForm.valid) {
      this.purchaseService.setSupplierDiscount(this.supplierForm.value)
      this.purchaseService.setPurchaseFormData(this.selectedJob)
      this.router.navigate(['/purchase/create'])
    }
  }

  onClose() {
    this.purchaseService.setPurchaseFormData(this.selectedJob)
    this.router.navigate(['/purchase/create'])
  }

  onDeleteSuppler(index: number) {
    this.suppliers().splice(index, 1)
  }

  get f() {
    return this.supplierForm.controls;
  }
}
