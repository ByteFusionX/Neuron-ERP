import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

export interface PoReassignModalData {
  purchaseId: string;
  lineKey: string;
  detail: string;
  uom?: string;
  currency: string;
  from: { supplierId: string; supplierName: string; freeQty: number; unitPrice: number | null };
  /** Suppliers that already priced this line (comparisons), by id. */
  quoted: Record<string, number>;
  suppliers: SfOption[];
}

/** Moves quantity no PO holds from the awarded supplier to another one, on an approved request. */
@Component({
  selector: 'app-po-reassign-modal',
  imports: [CommonModule, FormsModule, SmartFormModule, ActionButtonComponent],
  templateUrl: './po-reassign-modal.component.html',
})
export class PoReassignModalComponent {
  private ref = inject<ModalRef<{ success: boolean }>>(ModalRef);
  readonly data = inject(MODAL_DATA) as PoReassignModalData;
  private salesRfqService = inject(SalesRfqService);
  private toaster = inject(ToastrService);

  readonly options: SfOption[] = this.data.suppliers
    .filter((o) => String(o.value) !== this.data.from.supplierId)
    .map((o) => {
      const price = this.data.quoted[String(o.value)];
      return price != null ? { ...o, label: `${o.label} · quoted ${price}` } : o;
    });

  toSupplierId = '';
  qty: number | null = this.data.from.freeQty;
  price: number | null = null;
  reason = '';
  saving = false;

  /** The picked supplier's comparison price, when it has one: that price is used and cannot be changed here. */
  get quotedPrice(): number | null {
    return this.toSupplierId ? (this.data.quoted[this.toSupplierId] ?? null) : null;
  }

  get qtyError(): string | null {
    const q = Number(this.qty) || 0;
    if (!(q > 0)) return 'Enter a quantity';
    if (q > this.data.from.freeQty) return `At most ${this.data.from.freeQty}`;
    return null;
  }

  get invalid(): boolean {
    return !this.toSupplierId || !!this.qtyError || !this.reason.trim() || (this.quotedPrice == null && !(Number(this.price) >= 0 && this.price != null));
  }

  submit(): void {
    if (this.invalid || this.saving) return;
    this.saving = true;
    this.salesRfqService.reassignPurchaseLine(this.data.purchaseId, {
      lineKey: this.data.lineKey,
      fromSupplierId: this.data.from.supplierId,
      toSupplierId: this.toSupplierId,
      qty: Number(this.qty),
      unitPrice: this.quotedPrice == null ? Number(this.price) : null,
      reason: this.reason.trim(),
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.toaster.success(res?.message || 'Quantity moved');
        this.ref.close({ success: true });
      },
      error: (err) => {
        this.saving = false;
        this.toaster.error(err?.error?.message || 'Could not move the quantity.');
      },
    });
  }

  close(): void {
    this.ref.close();
  }
}
