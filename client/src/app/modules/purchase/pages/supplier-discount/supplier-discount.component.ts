import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AddSupplierDiscountComponent, AddSupplierDiscountResult } from '../add-supplier-discount/add-supplier-discount.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ModalService } from 'src/app/shared/components/modal';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailAvatarComponent } from 'src/app/shared/components/detail-panel/detail-avatar.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import {
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

@Component({
  selector: 'app-supplier-discount',
  imports: [CommonModule, ReactiveFormsModule, DetailViewShellComponent, ActionButtonComponent, DetailAvatarComponent, DetailPanelIconComponent],
  templateUrl: './supplier-discount.component.html',
  styleUrl: './supplier-discount.component.css'
})
export class SupplierDiscountComponent implements OnInit, OnDestroy {
  private modal = inject(ModalService)
  private confirmDialog = inject(ConfirmDialogService)
  private fb = inject(FormBuilder)
  private purchaseService = inject(PurchaseService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private toaster = inject(ToastrService)
  private subscriptions = new Subscription()
  private supplierService = inject(SupplierService)

  purchaseId!: string;
  isLoading = signal<boolean>(true);
  isExist: boolean = false;
  currency = signal<string>('')

  breadcrumbs: DetailViewBreadcrumb[] = [];
  subtitle = '';
  stats: DetailViewStat[] = [];

  supplierForm: FormGroup = this.fb.group({
    jobId: [''],
    purchaseNo: ['', [Validators.required]],
    suppliers: this.fb.array([]),
    totalDiscount: [0],
  })

  ngOnInit(): void {
    this.purchaseId = this.route.snapshot.paramMap.get('purchaseId') || '';

    if (!this.purchaseId) {
      this.toaster.error('Invalid purchase ID');
      this.router.navigate(['/purchase/pr']);
      return;
    }

    this.loadPurchaseData();

    this.supplierDiscount.valueChanges.subscribe(() => {
      const total = this.calculateTotalDiscount();
      this.supplierForm.get('totalDiscount')?.setValue(total, { emitEvent: false });
      this.buildHeader();
    });
  }

  private buildHeader(): void {
    const { purchaseNo, jobId } = this.supplierForm.getRawValue();
    this.breadcrumbs = [
      { label: 'Home', link: '/' },
      { label: 'PR', link: '/purchase/pr' },
      { label: purchaseNo || 'Purchase', link: ['/purchase/edit', this.purchaseId] },
      { label: 'Supplier discounts' },
    ];
    this.subtitle = [purchaseNo, jobId ? `Job ${jobId}` : ''].filter(Boolean).join(' · ');
    const total = this.calculateTotalDiscount();
    this.stats = [
      { label: 'PR No', value: purchaseNo || '-' },
      { label: 'Job ID', value: jobId || '-' },
      { label: 'Suppliers', value: String(this.supplierDiscount.length) },
      { label: 'Total discount', value: `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim() },
    ];
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
          this.buildHeader();
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading purchase data:', error);
          this.toaster.error('Failed to load purchase data');
          this.router.navigate(['/purchase/pr']);
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
    this.supplierDiscount.removeAt(index);
  }

  calculateTotalDiscount(): number {
    return this.supplierDiscount.controls.reduce((sum, ctrl) => sum + (parseFloat(ctrl.get('discount')?.value) || 0), 0);
  }

  async onClearClicks() {
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

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
