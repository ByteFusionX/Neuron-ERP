import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { RfqCompareMatrixComponent } from 'src/app/shared/components/rfq-compare-matrix/rfq-compare-matrix.component';
import { SalesRfqComparison } from 'src/app/shared/interfaces/sales-rfq.interface';

/** Read-only supplier price grid for a procurement RFQ, using the same matrix the sales compare drawer uses. */
@Component({
  selector: 'app-rfq-compare-tab',
  standalone: true,
  imports: [RfqCompareMatrixComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <p class="text-sm text-gray-500">Loading…</p> }
    @if (error(); as message) { <p class="text-sm text-red-600">{{ message }}</p> }
    @if (data(); as d) {
      <app-rfq-compare-matrix [data]="d" [locked]="true"></app-rfq-compare-matrix>
      <p class="mt-3 text-xs text-gray-500">Awards are made in Manage Offers.</p>
    }
  `,
})
export class RfqCompareTabComponent {
  readonly rfqId = input.required<string>();

  private purchaseService = inject(PurchaseService);
  private destroyRef = inject(DestroyRef);

  readonly data = signal<SalesRfqComparison | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.rfqId();
      this.loading.set(true);
      this.error.set(null);
      this.data.set(null);
      this.purchaseService.getRfqComparison(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          this.data.set(res.data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Could not load the comparison.');
          this.loading.set(false);
        },
      });
    });
  }
}
