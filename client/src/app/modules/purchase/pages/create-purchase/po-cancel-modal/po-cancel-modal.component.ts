import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface PoCancelModalData {
  poId: string;
  poNo: string;
}

interface CancelLine {
  index: number;
  detail: string;
  uom?: string;
  quantity: number;
  receivedQty: number;
  cancelledQty: number;
  openQty: number;
  qty: number;
}

/** Cancels a PO in whole or by line; the cancelled quantity goes back to the request. */
@Component({
  selector: 'app-po-cancel-modal',
  imports: [CommonModule, FormsModule, SmartFormModule, ActionButtonComponent],
  templateUrl: './po-cancel-modal.component.html',
})
export class PoCancelModalComponent implements OnInit {
  private ref = inject<ModalRef<{ success: boolean }>>(ModalRef);
  readonly data = inject(MODAL_DATA) as PoCancelModalData;
  private purchaseOrderService = inject(PurchaseOrderService);
  private toaster = inject(ToastrService);

  loading = true;
  saving = false;
  lines: CancelLine[] = [];
  reason = '';

  ngOnInit(): void {
    this.purchaseOrderService.getCancellable(this.data.poId).subscribe({
      next: (res) => {
        this.lines = (res?.data?.lines || []).map((l: any) => ({ ...l, qty: l.openQty }));
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toaster.error(err?.error?.message || 'Could not load the PO.');
        this.ref.close();
      },
    });
  }

  get cancelTotal(): number {
    return this.lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  }

  /** Every open unit is cancelled: the PO itself becomes Cancelled when nothing was received. */
  get whole(): boolean {
    return this.lines.every((l) => (Number(l.qty) || 0) >= l.openQty);
  }

  lineError(l: CancelLine): string | null {
    const qty = Number(l.qty) || 0;
    if (qty < 0) return 'Cannot be negative';
    if (qty > l.openQty) return `At most ${l.openQty}`;
    return null;
  }

  get invalid(): boolean {
    return !this.reason.trim() || !(this.cancelTotal > 0) || this.lines.some((l) => !!this.lineError(l));
  }

  setAll(full: boolean): void {
    this.lines.forEach((l) => (l.qty = full ? l.openQty : 0));
  }

  submit(): void {
    if (this.invalid || this.saving) return;
    this.saving = true;
    const lines = this.lines.filter((l) => (Number(l.qty) || 0) > 0).map((l) => ({ index: l.index, qty: Number(l.qty) }));
    this.purchaseOrderService.cancelPurchaseOrder(this.data.poId, this.reason.trim(), lines).subscribe({
      next: (res) => {
        this.saving = false;
        this.toaster.success(res?.message || `${this.data.poNo} cancelled`);
        this.ref.close({ success: true });
      },
      error: (err) => {
        this.saving = false;
        this.toaster.error(err?.error?.message || 'Could not cancel the PO.');
      },
    });
  }

  close(): void {
    this.ref.close();
  }
}
