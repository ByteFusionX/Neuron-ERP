import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AddSupplierDiscountComponent, AddSupplierDiscountResult } from '../add-supplier-discount/add-supplier-discount.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ModalService } from 'src/app/shared/components/modal';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailAvatarComponent } from 'src/app/shared/components/detail-panel/detail-avatar.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

/** Discounts suppliers gave on one purchase request, edited in a drawer over the request. */
@Component({
  selector: 'app-supplier-discount',
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, DetailAvatarComponent, DetailPanelIconComponent],
  templateUrl: './supplier-discount.component.html',
  styleUrl: './supplier-discount.component.css'
})
export class SupplierDiscountComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() purchaseId: string | null = null;

  /** Discounts were saved or cleared, so the host can reload the request. */
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private modal = inject(ModalService)
  private confirmDialog = inject(ConfirmDialogService)
  private fb = inject(FormBuilder)
  private purchaseService = inject(PurchaseService)
  private toaster = inject(ToastrService)
  private supplierService = inject(SupplierService)
  private subscriptions = new Subscription()

  isLoading = signal<boolean>(false);
  isExist = false;
  currency = signal<string>('')
  purchaseNo = '';
  jobId = '';

  supplierForm: FormGroup = this.fb.group({
    suppliers: this.fb.array([]),
    totalDiscount: [0],
  })

  constructor() {
    this.supplierDiscount.valueChanges.subscribe(() => {
      this.supplierForm.get('totalDiscount')?.setValue(this.calculateTotalDiscount(), { emitEvent: false });
    });
  }

  get supplierDiscount(): FormArray {
    return this.supplierForm.get('suppliers') as FormArray;
  }

  get subtitle(): string {
    return [this.purchaseNo, this.jobId ? `Job ${this.jobId}` : ''].filter(Boolean).join(' · ');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['purchaseId']) && this.open && this.purchaseId) this.loadPurchaseData();
  }

  loadPurchaseData(): void {
    if (!this.purchaseId) return;
    this.isLoading.set(true);
    this.supplierDiscount.clear();
    this.isExist = false;
    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (res) => {
          const purchase = res.data;
          if (purchase) {
            this.currency.set(purchase.currency || '');
            this.purchaseNo = purchase.purchaseNo || '';
            this.jobId = purchase.jobId?.jobId || purchase.jobId || '';
            if (purchase.supplierDiscounts?.suppliers) {
              this.isExist = true;
              purchase.supplierDiscounts.suppliers.forEach((s: any) => {
                const supplierId = typeof s.supplierId === 'object' ? s.supplierId._id : s.supplierId;
                this.pushSupplierData(supplierId, s.discount);
              });
            }
          }
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading purchase data:', error);
          this.toaster.error('Failed to load purchase data');
          this.isLoading.set(false);
          this.closed.emit();
        }
      })
    );
  }

  getSuppliers(): any[] {
    return this.supplierDiscount?.value;
  }

  pushSupplierData(supplierId: string, discount: string | number) {
    this.supplierService.getSupplierById(supplierId).subscribe((res: any) => {
      this.supplierDiscount.push(
        this.fb.group({
          supplierId: [res.data || '', Validators.required],
          discount: [discount || '', Validators.required],
        })
      )
    })
  }

  onAddFieldClicks() {
    this.modal.open<AddSupplierDiscountResult>(AddSupplierDiscountComponent, { width: '480px' })
      .afterClosed()
      .subscribe((data) => {
        if (data) this.pushSupplierData(data.supplierId, data.discount);
      });
  }

  onSubmit() {
    if (!this.purchaseId) return;
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
              this.saved.emit();
              this.closed.emit();
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

  onDeleteSupplier(index: number) {
    this.supplierDiscount.removeAt(index);
  }

  calculateTotalDiscount(): number {
    return this.supplierDiscount.controls.reduce((sum, ctrl) => sum + (parseFloat(ctrl.get('discount')?.value) || 0), 0);
  }

  async onClearClicks() {
    if (!this.purchaseId) return;
    const { confirmed } = await this.confirmDialog.open({
      tone: 'warning',
      title: 'Clear supplier discounts',
      message: 'All saved supplier discounts on this purchase request will be removed.',
      confirmLabel: 'Clear all',
    });
    if (!confirmed) return;

    this.subscriptions.add(
      this.purchaseService.updatePurchaseSupplierDiscounts(this.purchaseId, { suppliers: [], totalDiscount: 0 }).subscribe({
        next: (res) => {
          if (res.success) {
            this.isExist = false;
            this.supplierDiscount.clear();
            this.toaster.success('Supplier discounts cleared successfully');
            this.saved.emit();
            this.closed.emit();
          }
        },
        error: (error) => {
          console.error('Error clearing supplier discounts:', error);
          this.toaster.error('Failed to clear supplier discounts');
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
