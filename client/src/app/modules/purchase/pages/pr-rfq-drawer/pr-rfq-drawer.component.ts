import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import {
  PurchaseRfq,
  PurchaseRfqData,
  PurchaseRfqLine,
  SALES_RFQ_DECLINE_REASONS,
  SalesRfqReplyPrice,
  SalesRfqSupplierStatus,
} from 'src/app/shared/interfaces/sales-rfq.interface';

/** What the buyer types in for one line of a supplier's reply. */
interface ReplyRow {
  unitPrice: number | null;
  leadTimeDays: number | null;
  unavailable: boolean;
  remarks: string;
}

/** The reply form of one RFQ while it is open. */
interface ReplyDraft {
  currency: string;
  paymentTerms: string;
  deliveryTerms: string;
  rows: Record<string, ReplyRow>;
}

const SUPPLIER_STATUS_CLASSES: Record<SalesRfqSupplierStatus, string> = {
  'Not Sent': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'Sent': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'Replied': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  'Declined': 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

/**
 * The supplier RFQs of one purchase request. The buyer picks the product lines and the suppliers to ask,
 * marks each request as sent, enters the prices the supplier gives back, then compares and awards.
 * A request can be sent for approval once every product is awarded.
 */
@Component({
  selector: 'app-pr-rfq-drawer',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, SmartFormModule, ActionButtonComponent],
  templateUrl: './pr-rfq-drawer.component.html',
})
export class PrRfqDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() purchaseId: string | null = null;

  /** Prices or awards changed, so the PR form should reload its lines. */
  @Output() changed = new EventEmitter<void>();
  @Output() compare = new EventEmitter<void>();
  /** Raise RFQs for these line ids: the host opens the same supplier RFQ form used on enquiries. */
  @Output() create = new EventEmitter<string[]>();
  /** Open one supplier's RFQ in the shared form to edit its lines and prices. */
  @Output() edit = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  private service = inject(SalesRfqService);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);

  readonly data = signal<PurchaseRfqData | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly currencyOptions: SfOption[] = ['QAR', 'USD', 'EUR', 'AED', 'SAR', 'GBP'].map((c) => ({ label: c, value: c }));

  /** The RFQ whose reply form is open, and its draft. */
  replyFor: string | null = null;
  draft: ReplyDraft | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['purchaseId']) && this.open && this.purchaseId) this.load();
    if (changes['open'] && !this.open) {
      this.data.set(null);
      this.replyFor = null;
      this.draft = null;
    }
  }

  get editable(): boolean {
    return !!this.data()?.purchase.editable;
  }

  get awardedCount(): number {
    return (this.data()?.lines || []).filter((l) => !!l.awardedSupplier).length;
  }

  statusClass(status: SalesRfqSupplierStatus): string {
    return SUPPLIER_STATUS_CLASSES[status] || SUPPLIER_STATUS_CLASSES['Not Sent'];
  }

  load(): void {
    if (!this.purchaseId) return;
    this.loading.set(!this.data());
    this.loadError.set(null);
    this.service.forPurchase(this.purchaseId).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(err?.error?.message || 'Could not load the RFQs.');
        this.loading.set(false);
      },
    });
  }

  /** Products no live RFQ carries yet: nobody has been asked for a price on them. */
  get notAsked(): PurchaseRfqLine[] {
    const d = this.data();
    if (!d) return [];
    const asked = new Set(d.rfqs.flatMap((r) => r.suppliers?.[0]?.lineKeys || []));
    return d.lines.filter((l) => !asked.has(l.itemDetailKey));
  }

  lineLabel(line: PurchaseRfqLine): string {
    return line.detail.length > 70 ? `${line.detail.slice(0, 70)}…` : line.detail;
  }

  /** Lines of an RFQ in the request's order, with the supplier's own price when it gave one. */
  rfqLines(rfq: PurchaseRfq): { line: PurchaseRfqLine; asked: boolean; quote?: PurchaseRfq['quotes'][number] }[] {
    const invite = rfq.suppliers?.[0];
    const keys = new Set(invite?.lineKeys || []);
    return (this.data()?.lines || [])
      .filter((line) => keys.has(line.itemDetailKey))
      .map((line) => ({
        line,
        asked: true,
        quote: (rfq.quotes || []).find((q) => q.itemDetailKey === line.itemDetailKey && String(q.inviteId || '') === String(invite?._id || '')),
      }));
  }

  // --- new RFQ -----------------------------------------------------------------

  /** Opens the shared supplier RFQ form with every product that still needs a price; the buyer adds a tab per supplier. */
  startCreate(): void {
    const lines = this.data()?.lines || [];
    const open = lines.filter((l) => !l.awardedSupplier);
    this.create.emit((open.length ? open : lines).map((l) => l.itemDetailKey));
  }

  /** Copies the supplier prices from the enquiry's sales RFQs onto this request's lines. */
  importFromEnquiry(): void {
    if (!this.purchaseId || this.busy()) return;
    this.busy.set(true);
    this.service.importSalesRfqs(this.purchaseId).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (res.data?.created) this.toaster.success(res.message || 'Prices brought in');
        else this.toaster.info(res.message || 'Nothing new to bring in');
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.toaster.error(err?.error?.message || 'Could not bring in the enquiry prices.');
      },
    });
  }

  // --- one RFQ -----------------------------------------------------------------

  private run(request: Observable<unknown>, success: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toaster.success(success);
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.toaster.error(err?.error?.message || 'Could not update the RFQ.');
      },
    });
  }

  async markSent(rfq: PurchaseRfq): Promise<void> {
    const invite = rfq.suppliers?.[0];
    if (!invite) return;
    const { confirmed, choice } = await this.confirm.open({
      tone: 'approve',
      title: 'Mark RFQ as sent',
      message: `Record that ${rfq.rfqNo} was sent to ${invite.supplierName}? A chase is booked for the prices-needed-by date.`,
      choices: ['Email', 'Phone', 'WhatsApp', 'Portal', 'In person'].map((v) => ({ value: v, label: v })),
      confirmLabel: 'Mark as sent',
    });
    if (!confirmed) return;
    this.run(this.service.updateSupplier(rfq._id, invite._id, { status: 'Sent', sentVia: choice }), 'RFQ marked as sent');
  }

  async decline(rfq: PurchaseRfq): Promise<void> {
    const invite = rfq.suppliers?.[0];
    if (!invite) return;
    const { confirmed, choice, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Supplier declined',
      message: `${invite.supplierName} will not quote on ${rfq.rfqNo}.`,
      choices: SALES_RFQ_DECLINE_REASONS.map((v) => ({ value: v, label: v })),
      reason: 'optional',
      reasonLabel: 'Note',
      confirmLabel: 'Mark declined',
    });
    if (!confirmed) return;
    this.run(this.service.updateSupplier(rfq._id, invite._id, { status: 'Declined', declineReason: choice, declineNote: reason }), 'Marked as declined');
  }

  async withdraw(rfq: PurchaseRfq): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Withdraw this RFQ?',
      message: `${rfq.rfqNo}${rfq.suppliers?.[0]?.supplierName ? ' to ' + rfq.suppliers[0].supplierName : ''} is withdrawn. Its prices no longer count, and any product awarded to it is reopened.`,
      confirmLabel: 'Withdraw RFQ',
      cancelLabel: 'Keep RFQ',
      reason: 'optional',
      reasonLabel: 'Reason',
    });
    if (!confirmed) return;
    this.run(this.service.cancel(rfq._id, reason?.trim()), `${rfq.rfqNo} withdrawn`);
  }

  // --- reply -------------------------------------------------------------------

  openReply(rfq: PurchaseRfq): void {
    const invite = rfq.suppliers?.[0];
    if (!invite) return;
    const rows: Record<string, ReplyRow> = {};
    this.rfqLines(rfq).forEach(({ line, quote }) => {
      rows[line.itemDetailKey] = {
        unitPrice: quote?.unitPrice ?? null,
        leadTimeDays: quote?.leadTimeDays ?? null,
        unavailable: quote?.availability === 'Unavailable',
        remarks: quote?.remarks || '',
      };
    });
    const first = (rfq.quotes || []).find((q) => String(q.inviteId || '') === String(invite._id));
    this.draft = {
      currency: invite.replyTerms?.currency || first?.currency || 'QAR',
      paymentTerms: invite.replyTerms?.paymentTerms || first?.paymentTerms || '',
      deliveryTerms: invite.replyTerms?.deliveryTerms || '',
      rows,
    };
    this.replyFor = rfq._id;
  }

  closeReply(): void {
    this.replyFor = null;
    this.draft = null;
  }

  saveReply(rfq: PurchaseRfq): void {
    const invite = rfq.suppliers?.[0];
    const draft = this.draft;
    if (!invite || !draft || this.busy()) return;
    const prices: SalesRfqReplyPrice[] = this.rfqLines(rfq).map(({ line }) => {
      const row = draft.rows[line.itemDetailKey];
      return {
        itemDetailKey: line.itemDetailKey,
        unitPrice: row.unavailable || row.unitPrice == null ? null : Number(row.unitPrice),
        availability: row.unavailable ? 'Unavailable' : undefined,
        leadTimeDays: row.leadTimeDays ?? null,
        quantity: line.quantity,
        remarks: row.remarks,
      };
    });
    if (!prices.some((p) => p.unitPrice != null || p.availability === 'Unavailable')) {
      this.toaster.warning('Enter at least one price, or mark a product unavailable.');
      return;
    }
    this.busy.set(true);
    this.service.submitReply(rfq._id, invite._id, {
      terms: { currency: draft.currency, paymentTerms: draft.paymentTerms || undefined, deliveryTerms: draft.deliveryTerms || undefined },
      prices,
      markReplied: true,
    }).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.toaster.success(res.message || 'Prices saved');
        this.closeReply();
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.toaster.error(err?.error?.message || 'Could not save the prices.');
      },
    });
  }
}
