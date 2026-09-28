import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { Comparisons, QuoteItem } from 'src/app/shared/interfaces/purchase.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import {
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

interface SummaryQuote extends Comparisons {
  cheapest: boolean;
}

interface SummaryRow {
  name: string;
  qty: number;
  quotes: SummaryQuote[];
  approved?: SummaryQuote;
  /** How much more the approved quote costs than the lowest one. */
  savings: number;
}

@Component({
  selector: 'app-comparison-summary',
  imports: [CommonModule, DetailViewShellComponent, ActionButtonComponent, DetailBadgeComponent],
  templateUrl: './comparison-summary.component.html',
  styleUrl: './comparison-summary.component.css'
})
export class ComparisonSummaryComponent implements OnInit {
  private purchaseService = inject(PurchaseService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  purchaseId!: string;
  isLoading = signal<boolean>(true);
  itemsList = signal<QuoteItem[]>([])
  currency = signal<string>('')
  purchaseNo = signal<string>('')

  rows = computed<SummaryRow[]>(() =>
    this.itemsList().flatMap((item) =>
      (item.itemDetails ?? []).map((detail: any) => {
        const comparisons: Comparisons[] = detail.comparisons ?? [];
        const min = comparisons.length ? Math.min(...comparisons.map((c) => Number(c.totalCost) || 0)) : 0;
        const quotes: SummaryQuote[] = comparisons.map((c) => ({ ...c, cheapest: comparisons.length > 1 && (Number(c.totalCost) || 0) === min }));
        const approved = quotes.find((q) => q.selected);
        return {
          name: detail.detail,
          qty: detail.quantity,
          quotes,
          approved,
          savings: approved ? (Number(approved.totalCost) || 0) - min : 0,
        };
      })
    )
  );

  breadcrumbs = computed<DetailViewBreadcrumb[]>(() => [
    { label: 'Home', link: '/' },
    { label: 'PR', link: '/purchase/pr' },
    { label: this.purchaseNo() || 'Purchase', link: ['/purchase/edit', this.purchaseId] },
    { label: 'Comparison summary' },
  ]);

  stats = computed<DetailViewStat[]>(() => {
    const rows = this.rows();
    const approved = rows.filter((r) => r.approved);
    const approvedTotal = approved.reduce((s, r) => s + (Number(r.approved!.totalCost) || 0), 0);
    const overLowest = approved.reduce((s, r) => s + r.savings, 0);
    const fmt = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim();
    return [
      { label: 'Items', value: String(rows.length) },
      { label: 'Supplier approved', value: `${approved.length} / ${rows.length}`, progress: rows.length ? (approved.length / rows.length) * 100 : 0 },
      { label: 'Approved total', value: fmt(approvedTotal) },
      { label: 'Above lowest quotes', value: fmt(overLowest), danger: overLowest > 0 },
    ];
  });

  ngOnInit(): void {
    this.purchaseId = this.route.snapshot.paramMap.get('purchaseId') || '';

    if (!this.purchaseId) {
      this.router.navigate(['/purchase/pr']);
      return;
    }

    this.loadPurchaseData();
  }

  loadPurchaseData(): void {
    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (res) => {
        if (res.data?.items) {
          this.itemsList.set(res.data.items);
        }
        if (res.data?.currency) {
          this.currency.set(res.data.currency);
        }
        this.purchaseNo.set(res.data?.purchaseNo || '');
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading purchase data:', error);
        this.router.navigate(['/purchase/pr']);
      }
    });
  }

  onBack(): void {
    this.router.navigate(['/purchase/edit', this.purchaseId]);
  }
}
