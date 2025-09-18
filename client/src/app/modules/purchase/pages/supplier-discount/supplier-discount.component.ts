import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { AddSupplierDiscountComponent } from '../add-supplier-discount/add-supplier-discount.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { NgIcon } from '@ng-icons/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { Observable, map } from 'rxjs';

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
export class SupplierDiscountComponent implements OnInit, OnDestroy {
  private _dialog = inject(MatDialog)
  private fb = inject(FormBuilder)
  private purchaseService = inject(PurchaseService)
  private router = inject(Router)
  private toaster = inject(ToastrService)
  private subscriptions = new Subscription()
  private supplierService = inject(SupplierService)

  selectedJob!: getJob;
  isSubmitted = signal<boolean>(false);
  suppliers = signal<{ supplierId: string, discount: string }[]>([])
  isExist: boolean = false;

  supplierForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    purchaseNo: ['', [Validators.required]],
    suppliers: this.fb.array([]),
    totalDiscount: [''],
  })

  ngOnInit(): void {
    this.subscriptions.add(
      this.purchaseService.selectedJob$.subscribe((job: any) => {
        if (job) {
          this.selectedJob = job
          this.supplierForm.patchValue({
            jobId: job.jobId,
            purchaseNo: job.purchaseNo,
          })

          if (job.supplierDiscounts) {
            this.isExist = true
            job.supplierDiscounts.suppliers.map((s: any) => {
              this.pushSupplierData(s.supplierId, s.discount)
            })
          }
        } else {
          this.navigate()
        }
      })
    )

    const suppliersArray = this.supplierForm.get('suppliers') as FormArray;
    suppliersArray.valueChanges.subscribe(() => {
      const total = this.calculateTotalDiscount();
      this.supplierForm.get('totalDiscount')?.setValue(total, { emitEvent: false });
    });
  }

  getSupplierName(id: string): Observable<string> {
    return this.supplierService.getSupplierById(id).pipe(
      map((res: any) => res.data?.supplierName || '')
    )
  }

  getSuppliers(): any[] {
    const suppliersArray = this.supplierDiscount;
    return suppliersArray?.value;
  }

  pushSupplierData(supplierId: string, discount: string) {
    this.supplierService.getSupplierById(supplierId).subscribe((res: any) => {
      this.supplierDiscount.push(
        this.fb.group({
          supplierId: [res.data || '', Validators.required],
          discount: [discount || '', Validators.required],
        })
      )
    })
  }

  supplierDiscounts(data?: any): FormGroup {
    return this.fb.group({
      supplierId: [data?.supplierId || '', Validators.required],
      discount: [data?.discount || '', Validators.required],
      // discountType: [data?.discountType || '', Validators.required]
    });
  }

  onAddFieldClicks() {
    const dialogRef = this._dialog.open(AddSupplierDiscountComponent, {
      width: '500px',
      disableClose: true,
      maxHeight: '90vh',
      autoFocus: false
    })

    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        this.pushSupplierData(data.supplierId, data.discount)
        const total = this.calculateTotalDiscount();
        this.supplierForm.get('totalDiscount')?.setValue(total);
      }
    })
  }

  onSubmit() {
    if (this.supplierForm.valid && this.supplierDiscount.length > 0) {
      this.purchaseService.setSupplierDiscount(this.supplierForm.value)
      this.purchaseService.setPurchaseFormData(this.selectedJob)
      this.navigate()
    } else {
      this.toaster.warning("Please add supplier and discount value")
    }
  }

  onClose() {
    this.purchaseService.setPurchaseFormData(this.selectedJob)
    this.navigate()
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

  onClearClicks() {
    this.isExist = false
    this.suppliers.set([])
    this.supplierForm.removeControl('suppliers')
    this.purchaseService.setSupplierDiscount(this.supplierForm.value)
    this.purchaseService.setPurchaseFormData(this.selectedJob)
    this.navigate()
  }

  navigate() {
    this.purchaseService.editMode$.subscribe((isEdit) => {
      if (isEdit) {
        this.purchaseService.purchaseId$.subscribe((id) => {
          if (id) {
            this.router.navigate(['/purchase/edit', id]);
          }
        })
      } else {
        this.router.navigate(['/purchase/create']);
      }
    })
  }

  get f() {
    return this.supplierForm.controls;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
