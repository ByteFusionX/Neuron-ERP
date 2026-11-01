import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SmartFormModule } from 'src/app/shared/components/smart-form';

export interface InvoiceLine {
  description: string;
  partNo?: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

/**
 * Read-only item-entry card for an invoice: search, collapse, density, and one row per billed line
 * (item, qty, unit price, amount) with a total — the same shape as `app-pod-item-entry`.
 */
@Component({
  selector: 'app-invoice-item-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon, SmartFormModule],
  styles: [SF_STYLES + `
    :host { display: block; }
    .ie-strip { display: grid; gap: 0.375rem; grid-template-columns: minmax(0, 1fr) repeat(3, 5.5rem); }
    .ie-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    :host-context(html.dark) .ie-labels { color: #6b7280; }
    .ie-cell { display: flex; align-items: center; justify-content: flex-end; font-size: 0.75rem; font-variant-numeric: tabular-nums; color: #111827; }
    :host-context(html.dark) .ie-cell { color: #f3f4f6; }
  `],
  template: `
    <div class="flex flex-col gap-3">
      <p *ngIf="!items.length" class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-erp-border-dark">No items to bill.</p>

      <div *ngIf="items.length" class="rounded-xl border border-gray-200 bg-white dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div class="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-erp-border-dark">
          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{{ title }}</span>
          <span class="shrink-0 text-[11px] tabular-nums text-gray-500">{{ items.length }} line{{ items.length === 1 ? '' : 's' }} · {{ currency }}</span>
        </div>

        <ng-container>
          <div class="flex items-start gap-2 px-3 pt-2">
            <span class="w-6 shrink-0"></span>
            <div class="ie-strip ie-labels min-w-0 flex-1">
              <span>Item</span><span class="text-right">Qty</span><span class="text-right">Unit price</span><span class="text-right">Amount</span>
            </div>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-erp-border-dark">
            <ng-container *ngFor="let line of items; let i = index">
              <div *ngIf="visible(line)" class="flex items-start gap-2 px-3" [ngClass]="compact ? 'py-1.5' : 'py-2.5'">
                <span class="mt-1 grid h-6 w-6 shrink-0 place-content-center rounded-md bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">{{ i + 1 }}</span>
                <div class="ie-strip min-w-0 flex-1">
                  <div class="min-w-0 py-1">
                    <p [title]="line.description" class="line-clamp-2 whitespace-pre-line text-xs text-gray-900 dark:text-gray-100">{{ line.description || '-' }}</p>
                    <p *ngIf="line.partNo && line.partNo !== '-'" class="text-xs text-gray-500">{{ line.partNo }}</p>
                  </div>
                  <div class="ie-cell">{{ line.qty }}</div>
                  <div class="ie-cell">{{ line.unitPrice | number:'1.2-2' }}</div>
                  <div class="ie-cell font-medium">{{ line.amount | number:'1.2-2' }}</div>
                </div>
              </div>
            </ng-container>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class InvoiceItemEntryComponent {
  @Input() items: InvoiceLine[] = [];
  @Input() title = 'Items to bill';
  @Input() currency = 'QAR';

  search = '';
  collapsed = false;
  compact = false;

  get total(): number {
    return Math.round(this.items.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  }

  visible(l: InvoiceLine): boolean {
    const term = this.search.trim().toLowerCase();
    return !term || `${l.description} ${l.partNo || ''}`.toLowerCase().includes(term);
  }
}
