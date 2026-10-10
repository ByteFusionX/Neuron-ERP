import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { RfqCompareAward, RfqCompareMatrixComponent } from 'src/app/shared/components/rfq-compare-matrix/rfq-compare-matrix.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SalesRfqComparison, SalesRfqEnquiryAward } from 'src/app/shared/interfaces/sales-rfq.interface';

/**
 * Every supplier RFQ of one enquiry side by side. Awarding a product here closes it on the other
 * suppliers' RFQs; the quotation can be prepared once no product is left open.
 */
@Component({
  selector: 'app-sales-rfq-compare-drawer',
  standalone: true,
  imports: [SmartFormModule, ActionButtonComponent, RfqCompareMatrixComponent],
  templateUrl: './sales-rfq-compare-drawer.component.html',
})
export class SalesRfqCompareDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() enquiryId: string | null = null;

  /** Awards changed, so RFQ cards and badges should reload. */
  @Output() changed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() openRfq = new EventEmitter<string>();
  /** The quotation seed built from every awarded product. */
  @Output() prepared = new EventEmitter<any>();

  private service = inject(SalesRfqService);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);

  readonly data = signal<SalesRfqComparison | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['enquiryId']) && this.open && this.enquiryId) this.load();
    if (changes['open'] && !this.open) this.data.set(null);
  }

  get locked(): boolean {
    return !!this.data()?.quotationId;
  }

  get canPrepare(): boolean {
    const d = this.data();
    return !!d && !d.quotationId && d.coverage.total > 0 && d.coverage.open === 0 && d.coverage.awarded > 0;
  }

  load(): void {
    if (!this.enquiryId) return;
    this.loading.set(!this.data());
    this.loadError.set(null);
    this.service.compare(this.enquiryId).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.loading.set(false);
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
      consequence: 'The same products on the other suppliers\' RFQs are marked not selected. You can undo any of them until the quotation is made.',
      confirmLabel: 'Award group',
      cancelLabel: 'Cancel',
    });
    if (confirmed) this.save(event.awards);
  }

  private save(awards: RfqCompareAward[], reason?: string): void {
    if (!this.enquiryId) return;
    const body: SalesRfqEnquiryAward[] = awards.map((a) => ({ rfqId: a.cell.rfqId, lineKey: a.cell.lineKey, quoteId: a.quoteId, reason }));
    this.busy.set(true);
    this.service.awardAcross(this.enquiryId, body).subscribe({
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

  prepare(): void {
    if (!this.enquiryId || !this.canPrepare) return;
    this.busy.set(true);
    this.service.prepareEnquiryQuotation(this.enquiryId).subscribe({
      next: (res) => {
        this.busy.set(false);
        (res?.data?.warnings || []).forEach((w: string) => this.toaster.warning(w));
        this.prepared.emit(res.data);
      },
      error: (err) => {
        this.busy.set(false);
        this.toaster.error(err?.error?.message || 'Could not prepare the quotation.');
      },
    });
  }
}
