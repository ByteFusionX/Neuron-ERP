import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { AddSupplierDiscountComponent } from '../add-supplier-discount/add-supplier-discount.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { NgIcon } from '@ng-icons/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  private route = inject(ActivatedRoute)
  private toaster = inject(ToastrService)
  private subscriptions = new Subscription()
  private supplierService = inject(SupplierService)

  purchaseId!: string;
  isSubmitted = signal<boolean>(false);
  suppliers = signal<{ supplierId: string, discount: string }[]>([])
  isExist: boolean = false;
  currency = signal<string>('')

  supplierForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    purchaseNo: ['', [Validators.required]],
    suppliers: this.fb.array([]),
    totalDiscount: [''],
  })

  ngOnInit(): void {
    this.purchaseId = this.route.snapshot.paramMap.get('purchaseId') || '';
    
    if (!this.purchaseId) {
      this.toaster.error('Invalid purchase ID');
      this.router.navigate(['/purchase/pendings']);
      return;
    }

    this.loadPurchaseData();

    const suppliersArray = this.supplierForm.get('suppliers') as FormArray;
    suppliersArray.valueChanges.subscribe(() => {
      const total = this.calculateTotalDiscount();
      this.supplierForm.get('totalDiscount')?.setValue(total, { emitEvent: false });
    });
  }

  loadPurchaseData(): void {
    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (res) => {
          if (res.data) {
            const purchase = res.data;
            if (purchase.currency) {
              this.currency.set(purchase.currency);
            }
            this.supplierForm.patchValue({
              jobId: purchase.jobId?.jobId || purchase.jobId,
              purchaseNo: purchase.purchaseNo,
            });

            if (purchase.supplierDiscounts?.suppliers) {
              this.isExist = true;
              purchase.supplierDiscounts.suppliers.forEach((s: any) => {
                const supplierId = typeof s.supplierId === 'object' ? s.supplierId._id : s.supplierId;
                this.pushSupplierData(supplierId, s.discount);
              });
            }
          }
        },
        error: (error) => {
          console.error('Error loading purchase data:', error);
          this.toaster.error('Failed to load purchase data');
          this.router.navigate(['/purchase/pendings']);
        }
      })
    );
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
      const supplierDiscounts = {
        suppliers: this.supplierDiscount.value.map((supplier: any) => ({
          supplierId: typeof supplier.supplierId === 'object' ? supplier.supplierId._id : supplier.supplierId,
          discount: supplier.discount
        })),
        totalDiscount: this.calculateTotalDiscount()
      };

      this.subscriptions.add(
        this.purchaseService.updatePurchaseSupplierDiscounts(this.purchaseId, supplierDiscounts).subscribe({
          next: (res) => {
            if (res.success) {
              this.toaster.success('Supplier discounts updated successfully');
              this.router.navigate(['/purchase/edit', this.purchaseId]);
            }
          },
          error: (error) => {
            console.error('Error updating supplier discounts:', error);
            this.toaster.error('Failed to update supplier discounts');
          }
        })
      );
    } else {
      this.toaster.warning("Please add supplier and discount value")
    }
  }

  onClose() {
    this.router.navigate(['/purchase/edit', this.purchaseId]);
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
    const supplierDiscounts = {
      suppliers: [],
      totalDiscount: 0
    };

    this.subscriptions.add(
      this.purchaseService.updatePurchaseSupplierDiscounts(this.purchaseId, supplierDiscounts).subscribe({
        next: (res) => {
          if (res.success) {
            this.isExist = false;
            this.suppliers.set([]);
            const suppliersArray = this.supplierForm.get('suppliers') as FormArray;
            while (suppliersArray.length !== 0) {
              suppliersArray.removeAt(0);
            }
            this.supplierForm.get('totalDiscount')?.setValue(0);
            this.toaster.success('Supplier discounts cleared successfully');
            this.router.navigate(['/purchase/edit', this.purchaseId]);
          }
        },
        error: (error) => {
          console.error('Error clearing supplier discounts:', error);
          this.toaster.error('Failed to clear supplier discounts');
        }
      })
    );
  }

  get f() {
    return this.supplierForm.controls;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
