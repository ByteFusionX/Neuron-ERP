import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroCheckCircle, heroClock, heroExclamationTriangle, heroTrophy } from '@ng-icons/heroicons/outline';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { proratedRfqDiscount, RfqTotalDiscount } from 'src/app/shared/utils/rfq-discount.util';

export type ReviewSupplierState = 'awarded' | 'default' | 'priced' | 'waiting' | 'option';

export interface ReviewSupplier {
  supplierId?: string;
  name: string;
  state: ReviewSupplierState;
  price: number | null;
  /** What this supplier covers of the line: its awarded share, or the whole quantity for the default supplier. */
  qty: number;
  /** How much of the line the supplier can supply, from its quote; null when it has not priced the line. */
  offerQty?: number | null;
  rfqId?: string;
  quoteId?: string;
  leadTimeDays?: number | null;
}

export interface ReviewRow {
  key: string;
  itemName: string;
  detail: string;
  uom?: string;
  prQty: number;
  /** Quantity on the deal sheet, or null when the deal sheet has no such line. */
  dealQty: number | null;
  allocated: number;
  remaining: number;
  suppliers: ReviewSupplier[];
  /** Deal sheet selling price per unit, for the margin. */
  sellPrice?: number | null;
  /** Deal sheet cost per unit and its supplier. */
  dealCost?: number | null;
  dealSupplier?: string;
  /** Accepted as not fully covered, with a reason. */
  short?: boolean;
  shortReason?: string;
}

/** One supplier's awarded lines: what its PO will hold. */
export interface ReviewSupplierGroup {
  key: string;
  name: string;
  /** Only the deal sheet default, no RFQ award yet. */
  defaultOnly: boolean;
  lines: { key: string; detail: string; itemName: string; qty: number; uom?: string; price: number | null; total: number }[];
  total: number;
  /** The supplier's total RFQ discount, pro-rated to what is awarded. */
  discount: number;
}

export interface ReviewColumn { id: string; name: string }

export interface ReviewAward { rfqId: string; lineKey: string; quoteId: string; qty?: number }

/** Step 2 of the purchase request: one card per product, one column per supplier from step 1, award per cell. */
@Component({
  selector: 'app-pr-review-step',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, ActionButtonComponent],
  providers: [provideIcons({ heroCheckCircle, heroClock, heroExclamationTriangle, heroTrophy })],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ rows.length }} item{{ rows.length === 1 ? '' : 's' }}</span>
        <span class="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ columns.length }} supplier{{ columns.length === 1 ? '' : 's' }}</span>
        <span class="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{{ count('awarded') }} awarded</span>
        <span class="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{{ count('default') }} on deal sheet supplier</span>
        <span *ngIf="count('open') + count('partial') > 0" class="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{{ count('open') + count('partial') }} need award</span>
        <span *ngIf="count('short') > 0" class="rounded-full bg-orange-50 px-3 py-1 font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{{ count('short') }} short</span>
        <span class="ml-auto font-medium text-gray-500 dark:text-gray-400">Total cost <b class="tabular-nums text-gray-900 dark:text-gray-100">{{ totalCost | number: '1.2-2' }} {{ currency }}</b>
          <ng-container *ngIf="totalMargin != null"> · margin <b class="tabular-nums" [ngClass]="marginTone(totalMargin)">{{ totalMargin | number: '1.1-1' }}%</b></ng-container>
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <div class="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-erp-border-dark">
          <button type="button" class="rounded-md px-3 py-1 font-medium" [ngClass]="view === 'line' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'" (click)="view = 'line'">By line</button>
          <button type="button" class="rounded-md px-3 py-1 font-medium" [ngClass]="view === 'supplier' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'" (click)="view = 'supplier'">By supplier (PO preview)</button>
        </div>
        <ng-container *ngIf="!locked && view === 'line'">
          <span class="ml-auto text-gray-500 dark:text-gray-400">Fill remaining by</span>
          <div class="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-erp-border-dark">
            <button type="button" class="rounded-md px-2.5 py-1 font-medium" [ngClass]="fillBy === 'price' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'" (click)="fillBy = 'price'">Cheapest</button>
            <button type="button" class="rounded-md px-2.5 py-1 font-medium" [ngClass]="fillBy === 'lead' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'" (click)="fillBy = 'lead'">Fastest lead time</button>
          </div>
          <app-action-button variant="secondary" [disabled]="busy || !fillAllAwards().length" (click)="fillAll()">Fill all remaining</app-action-button>
        </ng-container>
      </div>

      <!-- By supplier: the awards grouped per supplier, i.e. the POs this request will produce -->
      <ng-container *ngIf="view === 'supplier'">
        <article *ngFor="let g of supplierGroups()" class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-erp-border-dark dark:bg-erp-surface-dark">
          <header class="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 dark:border-erp-border-dark dark:bg-gray-900/30">
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ g.name }}</p>
            <span *ngIf="g.defaultOnly" class="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Deal sheet supplier</span>
            <span class="text-xs text-gray-500">{{ g.lines.length }} line{{ g.lines.length === 1 ? '' : 's' }}</span>
            <span class="ml-auto text-xs font-medium text-gray-500">
              <ng-container *ngIf="g.discount > 0">{{ g.total | number: '1.2-2' }} − discount <span class="tabular-nums text-emerald-700 dark:text-emerald-400">{{ g.discount | number: '1.2-2' }}</span> · </ng-container>
              PO value <b class="tabular-nums text-gray-900 dark:text-gray-100">{{ g.total - g.discount | number: '1.2-2' }} {{ currency }}</b>
            </span>
          </header>
          <table class="w-full text-xs">
            <thead class="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <tr><th class="px-4 py-2 font-medium">Item</th><th class="px-4 py-2 text-right font-medium">Qty</th><th class="px-4 py-2 text-right font-medium">Unit price</th><th class="px-4 py-2 text-right font-medium">Total</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let l of g.lines" class="border-t border-gray-100 dark:border-erp-border-dark">
                <td class="px-4 py-2"><p class="font-medium text-gray-900 dark:text-gray-100">{{ l.detail || l.itemName }}</p><p class="text-gray-500">{{ l.itemName }}</p></td>
                <td class="px-4 py-2 text-right tabular-nums">{{ l.qty }} {{ l.uom || '' }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ l.price != null ? (l.price | number: '1.2-2') : '-' }}</td>
                <td class="px-4 py-2 text-right font-semibold tabular-nums">{{ l.total | number: '1.2-2' }}</td>
              </tr>
            </tbody>
          </table>
        </article>
        <div *ngIf="uncovered().length" class="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          <p class="font-semibold">Not on any PO yet</p>
          <p *ngFor="let r of uncovered()" class="mt-0.5">{{ r.detail || r.itemName }} · {{ r.remaining }} of {{ r.prQty }} open<ng-container *ngIf="r.short"> · short: {{ r.shortReason }}</ng-container></p>
        </div>
        <p *ngIf="!supplierGroups().length" class="rounded-2xl border border-dashed border-gray-200 px-3 py-10 text-center text-sm text-gray-500 dark:border-erp-border-dark">Nothing awarded yet.</p>
      </ng-container>

      <ng-container *ngIf="view === 'line'">
      <div *ngIf="missingFromPr.length" class="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
        <ng-icon name="heroExclamationTriangle" class="mt-0.5 h-4 w-4 shrink-0"></ng-icon>
        <div>
          <p class="font-semibold">{{ missingFromPr.length }} deal sheet item{{ missingFromPr.length === 1 ? '' : 's' }} not in this request</p>
          <p *ngFor="let m of missingFromPr" class="mt-0.5">{{ m.itemName }} · {{ m.detail }} · qty {{ m.quantity }}</p>
        </div>
      </div>

      <article *ngFor="let r of rows" class="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-erp-surface-dark"
        [ngClass]="kind(r) === 'open' || kind(r) === 'partial' ? 'border-amber-200 dark:border-amber-900/50' : 'border-gray-200 dark:border-erp-border-dark'">
        <div class="flex flex-col lg:flex-row">
          <!-- Product -->
          <div class="flex w-full shrink-0 flex-col gap-3 border-b border-gray-100 bg-gray-50/70 p-4 dark:border-erp-border-dark dark:bg-gray-900/30 lg:w-72 lg:border-b-0 lg:border-r">
            <div class="min-w-0">
              <div class="flex items-start justify-between gap-2">
                <p class="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100" [title]="r.detail || r.itemName">{{ r.detail || r.itemName }}</p>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" [ngClass]="rowChip(r)">{{ rowLabel(r) }}</span>
              </div>
              <p class="mt-0.5 truncate text-xs text-gray-500" [title]="r.itemName">{{ r.itemName }}</p>
            </div>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div><dt class="text-gray-500">Deal qty</dt>
                <dd class="font-semibold tabular-nums" [ngClass]="mismatch(r) ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'">{{ r.dealQty != null ? r.dealQty : 'Not in deal' }}</dd></div>
              <div><dt class="text-gray-500">Sell price</dt><dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ r.sellPrice != null ? (r.sellPrice | number: '1.2-2') : '-' }}</dd></div>
              <div><dt class="text-gray-500">Margin</dt>
                <dd class="font-semibold tabular-nums" [ngClass]="margin(r) != null ? marginTone(margin(r)!) : 'text-gray-400'">{{ margin(r) != null ? (margin(r) | number: '1.1-1') + '%' : '-' }}</dd></div>
              <div><dt class="text-gray-500">Margin value</dt>
                <dd class="font-semibold tabular-nums" [ngClass]="margin(r) != null ? marginTone(margin(r)!) : 'text-gray-400'">{{ margin(r) != null ? (marginValue(r) | number: '1.2-2') : '-' }}</dd></div>
            </dl>
            <p *ngIf="r.remaining > 0 && r.allocated > 0" class="text-[11px] font-medium text-amber-600">{{ r.remaining }} still to award</p>

            <!-- Quote chips: click one to award what is left of the line from that quote -->
            <div *ngIf="quotes(r).length" class="flex flex-wrap gap-1.5">
              <button *ngFor="let s of quotes(r)" type="button"
                class="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-default"
                [ngClass]="s.state === 'awarded'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-gray-200 text-gray-700 hover:border-violet-400 hover:bg-violet-50 dark:border-erp-border-dark dark:text-gray-300 dark:hover:bg-violet-950/30'"
                [disabled]="locked || busy || s.state === 'awarded'"
                [title]="chipTitle(r, s)"
                (click)="chipAward(r, s)">
                <span class="max-w-[6rem] truncate">{{ s.name }}</span>
                <span class="tabular-nums">{{ s.price | number: '1.2-2' }}</span>
                <span *ngIf="s.state === 'awarded'" class="tabular-nums">×{{ s.qty }}</span>
                <span *ngIf="s.leadTimeDays != null" class="text-gray-400">{{ s.leadTimeDays }}d</span>
              </button>
            </div>

            <p *ngIf="r.short" class="rounded-lg bg-orange-50 px-2 py-1 text-[11px] text-orange-800 dark:bg-orange-950/30 dark:text-orange-200"><b>Short:</b> {{ r.shortReason }}</p>

            <div *ngIf="!locked" class="mt-auto flex flex-wrap gap-1.5">
              <app-action-button *ngIf="fillAwards(r).length && !r.short" variant="secondary" [disabled]="busy" (click)="fill(r)">Fill remaining</app-action-button>
              <app-action-button *ngIf="!r.short && r.remaining > 0" variant="ghost" [disabled]="busy" (click)="shortToggled.emit({ key: r.key, detail: r.detail || r.itemName, short: true })">Mark short</app-action-button>
              <app-action-button *ngIf="r.short" variant="ghost" [disabled]="busy" (click)="shortToggled.emit({ key: r.key, detail: r.detail || r.itemName, short: false })">Clear short</app-action-button>
            </div>
          </div>

          <!-- Supplier columns -->
          <div class="min-w-0 flex-1 overflow-x-auto p-3">
            <div class="grid gap-3" [style.grid-template-columns]="'repeat(' + (columns.length || 1) + ', minmax(13rem, 1fr))'">
              <div *ngFor="let c of orderedColumns(r)" class="flex flex-col gap-3 rounded-xl p-3 transition-shadow"
                [ngClass]="cellClass(r, cell(r, c))">
                <ng-container *ngIf="cell(r, c) as s; else notAsked">
                  <div class="min-w-0">
                    <div class="flex items-start justify-between gap-2">
                      <p class="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100" [title]="c.name">{{ c.name }}</p>
                      <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" [ngClass]="statusChip(s)">{{ statusLabel(s) }}</span>
                    </div>
                    <p class="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      {{ s.state === 'default' || s.state === 'option' ? 'From deal sheet' : s.state === 'waiting' ? 'Waiting for quote' : 'From RFQ' }}
                      <span *ngIf="best(r) === s" class="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <ng-icon name="heroTrophy" class="h-3 w-3"></ng-icon> Best
                      </span>
                    </p>
                  </div>
                  <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div><dt class="text-gray-500">Price</dt>
                      <dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ s.price != null ? (s.price | number: '1.2-2') + ' ' + currency : '-' }}</dd></div>
                    <div><dt class="text-gray-500">Qty</dt>
                      <dd class="font-semibold tabular-nums" [ngClass]="partial(r, s) ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'">{{ s.offerQty != null ? s.offerQty : '-' }} / {{ r.prQty }}</dd></div>
                    <div><dt class="text-gray-500">Availability</dt>
                      <dd class="font-semibold" [ngClass]="availability(r, s) === 'Partial' ? 'text-amber-600' : availability(r, s) === 'Full' ? 'text-emerald-600' : 'text-gray-400'">{{ availability(r, s) }}</dd></div>
                    <div><dt class="text-gray-500">Awarded qty</dt>
                      <dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ s.state === 'awarded' || s.state === 'default' ? s.qty : '-' }}</dd></div>
                  </dl>
                  <div class="mt-auto flex items-center gap-1.5">
                    <ng-container *ngIf="s.state !== 'awarded'">
                      <input *ngIf="canAward(s) && partial(r, s)" type="number" min="1" [max]="r.prQty"
                        class="h-8 w-14 rounded-lg border border-gray-300 px-1.5 text-right text-xs tabular-nums dark:border-gray-700 dark:bg-transparent"
                        [ngModel]="qtyFor(r, s)" (ngModelChange)="qtyDraft[r.key + '|' + s.rfqId] = $event" [ngModelOptions]="{ standalone: true }" />
                      <app-action-button *ngIf="canAward(s)" class="flex-1" variant="primary" [disabled]="busy" (click)="award(r, s)">Award</app-action-button>
                    </ng-container>
                  </div>
                </ng-container>
                <ng-template #notAsked>
                  <p class="truncate text-sm font-semibold text-gray-400" [title]="c.name">{{ c.name }}</p>
                  <p class="my-auto py-3 text-center text-xs text-gray-400">Not asked for this item</p>
                </ng-template>
              </div>
            </div>
            <p *ngIf="!columns.length" class="py-6 text-center text-xs text-gray-400">Add a supplier in step 1 to compare prices.</p>
          </div>
        </div>
      </article>

      <p *ngIf="!rows.length" class="rounded-2xl border border-dashed border-gray-200 px-3 py-10 text-center text-sm text-gray-500 dark:border-erp-border-dark">No items to compare.</p>
      </ng-container>
    </div>
  `,
})
export class PrReviewStepComponent {
  @Input() rows: ReviewRow[] = [];
  @Input() columns: ReviewColumn[] = [];
  @Input() missingFromPr: { itemName: string; detail: string; quantity: number }[] = [];
  @Input() currency = 'QAR';
  @Input() busy = false;
  @Input() locked = false;
  /** Each supplier's total RFQ discount, keyed by supplier id. */
  @Input() discounts: Record<string, RfqTotalDiscount> = {};
  @Output() awarded = new EventEmitter<ReviewAward>();
  /** Several awards saved together (Fill remaining), in order. */
  @Output() awardedMany = new EventEmitter<ReviewAward[]>();
  @Output() shortToggled = new EventEmitter<{ key: string; detail: string; short: boolean }>();

  qtyDraft: Record<string, number> = {};
  view: 'line' | 'supplier' = 'line';
  /** Order Fill remaining takes the quotes in. */
  fillBy: 'price' | 'lead' = 'price';
  private static readonly MAX_CHIPS = 5;

  /** Priced quotes of the line (at most 5 suppliers ask per line): the chips. */
  quotes(r: ReviewRow): ReviewSupplier[] {
    return r.suppliers
      .filter((s) => !!s.rfqId && !!s.quoteId && s.price != null && s.state !== 'waiting')
      .slice(0, PrReviewStepComponent.MAX_CHIPS);
  }

  /** Quantity awarded through RFQs (the deal sheet default does not count: an award replaces it). */
  private awardedQty(r: ReviewRow): number {
    return r.suppliers.filter((s) => s.state === 'awarded').reduce((n, s) => n + s.qty, 0);
  }

  /** Quantity of the line with no RFQ award yet. */
  open(r: ReviewRow): number {
    return Math.max(0, r.prQty - this.awardedQty(r));
  }

  chipTitle(r: ReviewRow, s: ReviewSupplier): string {
    if (s.state === 'awarded') return `${s.name}: ${s.qty} awarded`;
    const room = this.open(r) || r.prQty;
    const qty = Math.min(s.offerQty ?? room, room);
    return `Award ${qty} to ${s.name}` + (s.offerQty != null && s.offerQty < r.prQty ? ` (quoted ${s.offerQty})` : '');
  }

  /** What is left of the line (or the whole line, when it is already covered) goes to this quote, up to what it offers. */
  chipAward(r: ReviewRow, s: ReviewSupplier): void {
    if (this.locked || !s.rfqId || !s.quoteId || s.state === 'awarded') return;
    const room = this.open(r) || r.prQty;
    const qty = Math.min(s.offerQty ?? room, room);
    if (!(qty > 0)) return;
    this.awarded.emit({ rfqId: s.rfqId, lineKey: r.key, quoteId: s.quoteId, ...(qty < r.prQty ? { qty } : {}) });
  }

  /** The open quantity split over the line's unawarded quotes, cheapest (or fastest) first, each up to what it offers. */
  fillAwards(r: ReviewRow): ReviewAward[] {
    let room = this.open(r);
    if (!(room > 0) || r.short) return [];
    const lead = (s: ReviewSupplier) => s.leadTimeDays ?? Number.MAX_SAFE_INTEGER;
    const candidates = this.quotes(r)
      .filter((s) => s.state !== 'awarded')
      .sort((a, b) => this.fillBy === 'lead'
        ? lead(a) - lead(b) || a.price! - b.price!
        : a.price! - b.price! || lead(a) - lead(b));
    const out: ReviewAward[] = [];
    for (const s of candidates) {
      if (!(room > 0)) break;
      const qty = Math.min(s.offerQty ?? room, room);
      if (!(qty > 0)) continue;
      out.push({ rfqId: s.rfqId!, lineKey: r.key, quoteId: s.quoteId!, ...(qty < r.prQty ? { qty } : {}) });
      room -= qty;
    }
    return out;
  }

  fill(r: ReviewRow): void {
    const awards = this.fillAwards(r);
    if (awards.length) this.awardedMany.emit(awards);
  }

  fillAllAwards(): ReviewAward[] {
    return this.rows.flatMap((r) => this.fillAwards(r));
  }

  fillAll(): void {
    const awards = this.fillAllAwards();
    if (awards.length) this.awardedMany.emit(awards);
  }

  /** The awards grouped per supplier: one PO each. */
  supplierGroups(): ReviewSupplierGroup[] {
    const groups = new Map<string, ReviewSupplierGroup>();
    this.rows.forEach((r) => this.chosen(r).forEach((s) => {
      if (!(s.qty > 0)) return;
      const key = s.supplierId || s.name;
      const g = groups.get(key) ?? { key, name: s.name, defaultOnly: true, lines: [], total: 0, discount: 0 };
      const total = (s.price ?? 0) * s.qty;
      g.lines.push({ key: r.key, detail: r.detail, itemName: r.itemName, qty: s.qty, uom: r.uom, price: s.price, total });
      g.total += total;
      if (s.state === 'awarded') g.defaultOnly = false;
      groups.set(key, g);
    }));
    groups.forEach((g) => { g.discount = proratedRfqDiscount(this.discounts[g.key], g.total); });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Lines (or parts of lines) no supplier will deliver. */
  uncovered(): ReviewRow[] {
    return this.rows.filter((r) => r.remaining > 0);
  }

  mismatch(r: ReviewRow): boolean {
    return r.dealQty == null || Math.abs(r.dealQty - r.prQty) > 0.0001;
  }

  /** This supplier's offer on the line, matched by id and then by name. */
  cell(r: ReviewRow, c: ReviewColumn): ReviewSupplier | undefined {
    return r.suppliers.find((s) => s.supplierId === c.id) ?? r.suppliers.find((s) => s.name === c.name);
  }

  /** Columns for the row, with the deal sheet's default supplier first. */
  orderedColumns(r: ReviewRow): ReviewColumn[] {
    const rank = (c: ReviewColumn) => {
      const st = this.cell(r, c)?.state;
      return st === 'default' ? 0 : st === 'awarded' ? 1 : 2;
    };
    return [...this.columns].sort((a, b) => rank(a) - rank(b));
  }

  statusLabel(s: ReviewSupplier): string {
    return { awarded: 'Awarded', default: 'Default', priced: 'Not awarded', option: 'Not awarded', waiting: 'Waiting' }[s.state];
  }

  statusChip(s: ReviewSupplier): string {
    return {
      awarded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      default: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
      priced: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      option: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      waiting: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    }[s.state];
  }

  availability(r: ReviewRow, s: ReviewSupplier): string {
    if (s.offerQty == null) return '-';
    return s.offerQty >= r.prQty ? 'Full' : 'Partial';
  }

  /** Cheapest priced supplier on the line. */
  best(r: ReviewRow): ReviewSupplier | undefined {
    const priced = r.suppliers.filter((s) => s.price != null && s.state !== 'waiting');
    return priced.length > 1 ? priced.reduce((a, b) => (b.price! < a.price! ? b : a)) : undefined;
  }

  /** Suppliers that will supply the line: the awarded ones, else the deal sheet's default supplier. */
  chosen(r: ReviewRow): ReviewSupplier[] {
    const awarded = r.suppliers.filter((s) => s.state === 'awarded');
    return awarded.length ? awarded : r.suppliers.filter((s) => s.state === 'default');
  }

  /** Unit cost of what is chosen, weighted by each supplier's share. */
  private unitCost(r: ReviewRow): number | null {
    const picked = this.chosen(r).filter((s) => s.price != null && s.qty > 0);
    const qty = picked.reduce((n, s) => n + s.qty, 0);
    if (!qty) return r.dealCost ?? null;
    return picked.reduce((n, s) => n + s.price! * s.qty, 0) / qty;
  }

  /** Margin per unit: sell price minus unit cost. */
  marginValue(r: ReviewRow): number {
    return (r.sellPrice ?? 0) - (this.unitCost(r) ?? 0);
  }

  margin(r: ReviewRow): number | null {
    const cost = this.unitCost(r);
    if (!r.sellPrice || cost == null) return null;
    return ((r.sellPrice - cost) / r.sellPrice) * 100;
  }

  dealValue(r: ReviewRow): number | null {
    return r.dealCost != null ? r.dealCost * (r.dealQty ?? r.prQty) : null;
  }

  get totalCost(): number {
    return this.rows.reduce((n, r) => n + (this.unitCost(r) ?? 0) * r.prQty, 0);
  }

  get totalMargin(): number | null {
    const sell = this.rows.reduce((n, r) => n + (r.sellPrice ?? 0) * r.prQty, 0);
    return sell ? ((sell - this.totalCost) / sell) * 100 : null;
  }

  marginTone(m: number): string {
    return m < 0 ? 'text-red-600' : m < 10 ? 'text-amber-600' : 'text-emerald-600';
  }

  count(kind: 'awarded' | 'default' | 'partial' | 'open' | 'short'): number {
    return this.rows.filter((r) => this.kind(r) === kind).length;
  }

  kind(r: ReviewRow): 'awarded' | 'default' | 'partial' | 'open' | 'short' {
    if (r.remaining > 0) return r.short ? 'short' : r.allocated > 0 ? 'partial' : 'open';
    return r.suppliers.some((s) => s.state === 'awarded') ? 'awarded' : 'default';
  }

  rowLabel(r: ReviewRow): string {
    return { awarded: 'Awarded', default: 'Deal supplier', partial: 'Part awarded', open: 'Not awarded', short: 'Short' }[this.kind(r)];
  }

  rowChip(r: ReviewRow): string {
    return {
      short: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      awarded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      default: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
      partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      open: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    }[this.kind(r)];
  }

  cellClass(r: ReviewRow, s: ReviewSupplier | undefined): string {
    if (!s) return 'border border-dashed border-gray-200 dark:border-erp-border-dark';
    if (s.state === 'awarded') return 'border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20';
    if (s.state === 'default') return 'border border-violet-200 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20';
    return 'border border-gray-200 hover:shadow-md dark:border-erp-border-dark';
  }

  /** A quoted supplier (or the deal sheet's, when it has quoted) can be awarded the line. */
  canAward(s: ReviewSupplier): boolean {
    return !this.locked && !!s.rfqId && !!s.quoteId && (s.state === 'priced' || s.state === 'default');
  }

  /** The supplier can only cover part of what the request needs. */
  partial(r: ReviewRow, s: ReviewSupplier): boolean {
    return s.offerQty != null && s.offerQty < r.prQty;
  }

  qtyFor(r: ReviewRow, s: ReviewSupplier): number {
    const draft = this.qtyDraft[r.key + '|' + s.rfqId];
    if (draft != null) return draft;
    const room = r.allocated > 0 && r.remaining > 0 ? r.remaining : r.prQty;
    return Math.min(s.offerQty ?? r.prQty, room);
  }

  award(r: ReviewRow, s: ReviewSupplier): void {
    const qty = Number(this.qtyFor(r, s));
    if (!s.rfqId || !s.quoteId || !(qty > 0)) return;
    // Taking the whole line is a plain award; a smaller share splits it.
    this.awarded.emit({ rfqId: s.rfqId, lineKey: r.key, quoteId: s.quoteId, ...(qty < r.prQty ? { qty } : {}) });
  }
}
