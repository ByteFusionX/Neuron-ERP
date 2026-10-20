import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal, viewChild } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { RfqCompareAward, RfqCompareMatrixComponent } from 'src/app/shared/components/rfq-compare-matrix/rfq-compare-matrix.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SalesRfqComparison, SalesRfqEnquiryAward } from 'src/app/shared/interfaces/sales-rfq.interface';

/** Statuses in which a purchase request still takes awards (it freezes once it is with the approvers). */
const EDITABLE_STATUSES = ['New', 'In Progress', 'Drafted', 'Rejected'];

/**
 * Every supplier RFQ of one purchase request side by side. Each product is awarded to one supplier;
 * the request can be sent for approval once every product has a winner, and the awarded price
 * becomes the line's cost.
 */
@Component({
  selector: 'app-pr-compare-drawer',
  standalone: true,
  imports: [SmartFormModule, ActionButtonComponent, RfqCompareMatrixComponent],
  templateUrl: './pr-compare-drawer.component.html',
})
export class PrCompareDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() purchaseId: string | null = null;
  /** View only: the comparison is shown for understanding (the PO side), with no awarding. */
  @Input() readOnly = false;

  /** Awards changed, so the PR form should reload its lines. */
  @Output() changed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  /** Ask suppliers about products that have no RFQ yet: the host opens the RFQ drawer for these line ids. */
  @Output() createRfq = new EventEmitter<string[]>();

  private readonly matrix = viewChild(RfqCompareMatrixComponent);
  /** The grid opens on the products that still need a supplier, once per time the drawer is opened. */
  private firstLoad = true;

  private service = inject(SalesRfqService);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);

  readonly data = signal<SalesRfqComparison | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['purchaseId']) && this.open && this.purchaseId) this.load();
    if (changes['open'] && this.open) this.firstLoad = true;
    if (changes['open'] && !this.open) this.data.set(null);
  }

  get locked(): boolean {
    if (this.readOnly) return true;
    const status = this.data()?.enquiry?.status;
    return !!status && !EDITABLE_STATUSES.includes(status);
  }

  get unaskedKeys(): string[] {
    return (this.data()?.unasked || []).map((u) => u.itemDetailKey);
  }

  get allAwarded(): boolean {
    const d = this.data();
    return !!d && d.coverage.total > 0 && d.coverage.awarded === d.coverage.total;
  }

  load(): void {
    if (!this.purchaseId) return;
    this.loading.set(!this.data());
    this.loadError.set(null);
    this.service.comparePurchase(this.purchaseId).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.loading.set(false);
        if (this.firstLoad) {
          this.firstLoad = false;
          // The grid renders after this tick.
          setTimeout(() => this.matrix()?.filter.set(res.data.coverage.open > 0 ? 'open' : 'all'));
        }
      },
      error: (err) => {
        this.loadError.set(err?.error?.message || 'Could not load the comparison.');
        this.loading.set(false);
      },
    });
  }

  onAward(award: RfqCompareAward): void {
    this.save([award]);
  }

  async onAwardGroup(event: { group: string; column: { supplierName: string }; awards: RfqCompareAward[] }): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: `Award ${event.group} to ${event.column.supplierName}?`,
      message: `${event.awards.length} open product${event.awards.length === 1 ? '' : 's'} go to ${event.column.supplierName}.`,
      consequence: 'The same products on the other suppliers\' RFQs are marked not selected. You can change any award until the request is sent for approval.',
      confirmLabel: 'Award group',
      cancelLabel: 'Cancel',
    });
    if (confirmed) this.save(event.awards);
  }

  async onAwardSupplier(event: { column: { supplierName: string }; awards: RfqCompareAward[]; skipped: number }): Promise<void> {
    const n = event.awards.length;
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: `Award all to ${event.column.supplierName}?`,
      message: `${n} open product${n === 1 ? '' : 's'} go to ${event.column.supplierName}.`
        + (event.skipped ? ` ${event.skipped} open product${event.skipped === 1 ? '' : 's'} they can't supply stay open.` : ''),
      consequence: 'The same products on the other suppliers\' RFQs are marked not selected. You can change any award until the request is sent for approval.',
      confirmLabel: 'Award all',
      cancelLabel: 'Cancel',
    });
    if (confirmed) this.save(event.awards);
  }

  async onAwardCheapest(event: { awards: RfqCompareAward[]; skipped: number }): Promise<void> {
    const n = event.awards.length;
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Award cheapest for all?',
      message: `${n} open product${n === 1 ? '' : 's'} go to the supplier with the lowest price.`
        + (event.skipped ? ` ${event.skipped} open product${event.skipped === 1 ? '' : 's'} with no awardable lowest price stay open.` : ''),
      consequence: 'Part-awarded products are left as they are. You can change any award until the request is sent for approval.',
      confirmLabel: 'Award cheapest',
      cancelLabel: 'Cancel',
    });
    if (confirmed) this.save(event.awards);
  }

  private save(awards: RfqCompareAward[], reason?: string): void {
    if (!this.purchaseId) return;
    const body: SalesRfqEnquiryAward[] = awards.map((a) => ({ rfqId: a.cell.rfqId, lineKey: a.cell.lineKey, quoteId: a.quoteId, reason, ...(a.qty != null ? { qty: a.qty } : {}) }));
    this.busy.set(true);
    this.service.awardPurchase(this.purchaseId, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
        this.changed.emit();
      },
      error: async (err) => {
        this.busy.set(false);
        if (err?.error?.reasonRequired && !reason) {
          const result = await this.confirm.open({
            tone: 'approve',
            title: 'Not the lowest price',
            message: err.error.message || 'Another supplier offered a lower price.',
            reason: true,
            reasonLabel: 'Why this supplier?',
            confirmLabel: 'Award anyway',
            cancelLabel: 'Cancel',
          });
          if (result.confirmed && result.reason?.trim()) this.save(awards, result.reason.trim());
          return;
        }
        this.toaster.error(err?.error?.message || 'Could not save the award.');
      },
    });
  }
}
