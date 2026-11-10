import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SmartFormModule } from 'src/app/shared/components/smart-form';

import { DEFAULT_CURRENCY } from '../../../../shared/constants/currency';
export interface InvoiceLine {
  description: string;
  partNo?: string;
  qty: number;
  unitPrice: number;
  amount: number;
  /** Position of the line on its delivery note (used when lines can be chosen). */
  index?: number;
  /** Whether the line is billed; only meaningful when the entry is `selectable`. */
  included?: boolean;
  /** A job item that is not on this delivery note: shown muted, never billed. */
  outside?: boolean;
  /** Shown dimmed: not received yet, or already invoiced. */
  muted?: boolean;
  /** Why the line is muted. */
  note?: string;
}

export interface InvoiceSummary {
  jobPrice: number;
  jobDiscount: number;
  jobNet: number;
  dnDiscount: number;
  dnNet: number;
}

/**
 * Read-only item-entry for an invoice, laid out like `app-grn-item-entry`: a work toolbar (search, collapse,
 * density), one card with a row per billed line (item, qty, unit price, amount), and a sticky totals bar.
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
    <div class="flex flex-col gap-4">
      <p *ngIf="!items.length" class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-erp-border-dark">No items to bill.</p>

      <div *ngIf="items.length" class="sticky top-0 z-20 -mx-1 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div class="flex flex-wrap items-center gap-2">
          <app-sf-input class="block w-full sm:w-56" type="search" placeholder="Search lines…" clearable
            [ngModel]="search" (ngModelChange)="search = $event ?? ''"></app-sf-input>
          <button *ngIf="search.trim()" type="button" (click)="search = ''" class="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-400">Clear</button>
          <div class="ml-auto flex items-center gap-1">
            <ng-container *ngIf="selectable">
              <button type="button" (click)="setAll(true)" class="rounded-lg px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-gray-800">Select all</button>
              <button type="button" (click)="setAll(false)" class="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Clear</button>
            </ng-container>
            <button type="button" title="Collapse item" aria-label="Collapse item" (click)="collapsed = true"
              class="grid h-8 w-8 place-content-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><ng-icon name="heroChevronUp" class="h-4 w-4"></ng-icon></button>
            <button type="button" title="Expand item" aria-label="Expand item" (click)="collapsed = false"
              class="grid h-8 w-8 place-content-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><ng-icon name="heroChevronDown" class="h-4 w-4"></ng-icon></button>
            <button type="button" [title]="compact ? 'Comfortable rows' : 'Compact rows'" (click)="compact = !compact"
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              [ngClass]="compact ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' : ''">
              <ng-icon [name]="compact ? 'heroTableCells' : 'heroListBullet'" class="h-4 w-4"></ng-icon> {{ compact ? 'Compact' : 'Comfortable' }}
            </button>
          </div>
        </div>
      </div>

      <p *ngIf="items.length && search.trim() && !visibleCount" class="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-500 dark:border-erp-border-dark">
        No lines match. <button type="button" (click)="search = ''" class="font-medium text-violet-700 hover:underline dark:text-violet-400">Clear filters</button>
      </p>

      <div *ngIf="items.length" class="rounded-xl border border-gray-200 bg-white dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div class="flex flex-wrap items-center gap-2 border-gray-100 px-3 py-2 dark:border-erp-border-dark" [class.border-b]="!collapsed">
          <button type="button" (click)="collapsed = !collapsed" [attr.aria-label]="collapsed ? 'Expand item' : 'Collapse item'" [attr.aria-expanded]="!collapsed"
            class="grid h-6 w-6 shrink-0 place-content-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
            <ng-icon [name]="collapsed ? 'heroChevronRight' : 'heroChevronDown'" class="h-4 w-4"></ng-icon>
          </button>
          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{{ title }}</span>
          <span class="shrink-0 text-[11px] tabular-nums text-gray-500">{{ selectable ? includedCount + ' of ' : '' }}{{ items.length }} line{{ items.length === 1 ? '' : 's' }} · {{ currency }}</span>
        </div>

        <ng-container *ngIf="!collapsed">
          <div class="flex items-start gap-2 px-3 pt-2">
            <span *ngIf="selectable" class="w-5 shrink-0"></span>
            <span class="w-6 shrink-0"></span>
            <div class="ie-strip ie-labels min-w-0 flex-1">
              <span>Item</span><span class="text-right">Qty</span><span class="text-right">Unit price</span><span class="text-right">Amount</span>
            </div>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-erp-border-dark">
            <ng-container *ngFor="let line of items; let i = index">
              <div *ngIf="visible(line)" class="flex items-start gap-2 px-3" [ngClass]="compact ? 'py-1.5' : 'py-2.5'">
                <div *ngIf="selectable" class="mt-1.5 w-5 shrink-0">
                  <app-sf-checkbox [ngModelOptions]="{ standalone: true }" [ngModel]="line.included !== false && !line.outside" (ngModelChange)="toggle(line, $event)"
                    [disabled]="line.qty <= 0 || !!line.outside" [attr.aria-label]="'Bill line ' + (i + 1)"></app-sf-checkbox>
                </div>
                <span class="mt-1 grid h-6 w-6 shrink-0 place-content-center rounded-md bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">{{ i + 1 }}</span>
                <div class="ie-strip min-w-0 flex-1" [class.opacity-40]="line.muted" [attr.title]="line.note || (line.outside ? 'Not on this delivery note' : null)">
                  <div class="min-w-0 py-1">
                    <p [title]="line.description" class="line-clamp-2 whitespace-pre-line text-xs text-gray-900 dark:text-gray-100">{{ line.description || '-' }}</p>
                    <p *ngIf="line.note" class="text-[11px] text-amber-600 dark:text-amber-400">{{ line.note }}</p>
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

      <div *ngIf="items.length" class="sticky bottom-0 z-20 rounded-xl border border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur dark:border-erp-border-dark dark:bg-gray-900/85">
        <div class="flex flex-wrap items-end justify-between gap-5">
          <div class="flex flex-wrap items-end gap-5" [ngClass]="footerStats?.length ? 'flex-1 justify-between' : ''">
            <div *ngIf="!footerStats?.length"><p class="text-[11px] uppercase tracking-wide text-gray-500">Total qty</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ totalQty }}</p></div>
            <ng-container *ngIf="footerStats?.length; else defaultTotal">
              <div class="flex flex-wrap items-end gap-8">
                <ng-container *ngFor="let s of footerStats"><div *ngIf="!s.right"><p class="text-[11px] uppercase tracking-wide text-gray-500">{{ s.label }}</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ s.value | number:'1.2-2' }}</p></div></ng-container>
              </div>
              <div class="flex flex-wrap items-end gap-8">
                <ng-container *ngFor="let s of footerStats"><div *ngIf="s.right" class="text-right"><p class="text-[11px] uppercase tracking-wide text-gray-500">{{ s.label }}</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ s.value | number:'1.2-2' }}</p></div></ng-container>
              </div>
            </ng-container>
            <ng-template #defaultTotal>
            <div><p class="text-[11px] uppercase tracking-wide text-gray-500">{{ summary ? 'DN price' : 'Total' }}</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ total | number:'1.2-2' }}</p></div>
            </ng-template>
            <ng-container *ngIf="summary">
              <div><p class="text-[11px] uppercase tracking-wide text-gray-500">DN discount</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ summary.dnDiscount | number:'1.2-2' }}</p></div>
              <div><p class="text-[11px] uppercase tracking-wide text-gray-500">DN net total</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ summary.dnNet | number:'1.2-2' }}</p></div>
            </ng-container>
          </div>
          <div *ngIf="summary" class="ml-auto flex flex-wrap items-end justify-end gap-5 text-right" aria-label="Job totals">
            <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Job price</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ summary.jobPrice | number:'1.2-2' }}</p></div>
            <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Job discount</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ summary.jobDiscount | number:'1.2-2' }}</p></div>
            <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Job net total</p><p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ summary.jobNet | number:'1.2-2' }}</p></div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class InvoiceItemEntryComponent {
  @Input() items: InvoiceLine[] = [];
  @Input() title = 'Items to bill';
  @Input() currency = DEFAULT_CURRENCY;
  /** Job and delivery-note totals (delivery-note invoices only). */
  @Input() summary: InvoiceSummary | null = null;

  /** Replaces the single "Total" figure in the footer banner with these figures. */
  @Input() footerStats: { label: string; value: number; right?: boolean }[] | null = null;

  search = '';
  collapsed = false;
  compact = false;

  /** Lets the user tick which lines are billed (edit invoice from a delivery note). */
  @Input() selectable = false;

  private get billed(): InvoiceLine[] {
    return this.selectable ? this.items.filter(l => l.included !== false) : this.items;
  }

  get includedCount(): number { return this.billed.length; }

  toggle(line: InvoiceLine, on: boolean): void { line.included = on; }

  setAll(on: boolean): void {
    for (const l of this.items) l.included = on && l.qty > 0 && !l.outside;
  }

  get total(): number {
    return Math.round(this.billed.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  }

  get totalQty(): number {
    return this.billed.reduce((sum, l) => sum + l.qty, 0);
  }

  get visibleCount(): number {
    return this.items.filter(l => this.visible(l)).length;
  }

  visible(l: InvoiceLine): boolean {
    const term = this.search.trim().toLowerCase();
    return !term || `${l.description} ${l.partNo || ''}`.toLowerCase().includes(term);
  }
}
