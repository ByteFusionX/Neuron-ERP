import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroCheckCircle, heroClock, heroExclamationTriangle, heroMagnifyingGlass, heroTrophy, heroXMark } from '@ng-icons/heroicons/outline';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfCheckboxComponent } from 'src/app/shared/components/smart-form/sf-checkbox.component';
import { SfComboboxComponent } from 'src/app/shared/components/smart-form/sf-combobox.component';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { PurchaseLineAward } from 'src/app/shared/interfaces/purchase.interface';

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
  /** The supplier's availability on the line (the line's availability label, e.g. "Ex-Stock"). */
  availability?: string;
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
}

export interface ReviewColumn { id: string; name: string }

/** A supplier chosen for (a share of) a line, at the price shown for it. */
export type ReviewAward = PurchaseLineAward;

/** Step 2 of the purchase request: one card per product, one column per supplier from step 1, award per cell. */
@Component({
  selector: 'app-pr-review-step',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule, NgIconComponent, ActionButtonComponent, SfCheckboxComponent, SfComboboxComponent],
  providers: [provideIcons({ heroCheckCircle, heroClock, heroExclamationTriangle, heroMagnifyingGlass, heroTrophy, heroXMark })],
  template: `
    <div class="space-y-2">
      <!-- Work toolbar: search and filters. Becomes the bulk bar while lines are selected; each action fills only what is still open on a line. -->
      <div *ngIf="rows.length" class="sticky top-0 z-20 -mx-1 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div *ngIf="locked || !selectedRows().length" class="flex flex-wrap items-center gap-2">
          <app-sf-checkbox *ngIf="!locked" aria-label="Select shown items" [ngModel]="allShownSelected()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="toggleShown()"></app-sf-checkbox>
          <div class="relative w-full sm:w-56">
            <ng-icon name="heroMagnifyingGlass" class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"></ng-icon>
            <input type="text" [(ngModel)]="search" [ngModelOptions]="{ standalone: true }" placeholder="Search items…" aria-label="Search items"
              class="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-2 text-xs text-gray-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-erp-border-dark dark:bg-gray-800/60 dark:text-gray-100" />
          </div>
          <button *ngFor="let f of filters" type="button" (click)="filter = filter === f.id ? 'all' : f.id"
            class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors"
            [ngClass]="filter === f.id
              ? 'border-violet-600 bg-violet-600 text-white'
              : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-erp-border-dark dark:text-gray-300 dark:hover:bg-gray-800'">
            {{ f.label }}
            <span class="rounded-full px-1.5 tabular-nums" [ngClass]="filter === f.id ? 'bg-white/20' : f.id === 'waiting' && filterCount(f.id) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-800'">{{ filterCount(f.id) }}</span>
          </button>
          <button *ngIf="search.trim() || filter !== 'all'" type="button" (click)="search = ''; filter = 'all'" class="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-400">Clear</button>
          <span *ngIf="visibleRows().length !== rows.length" class="ml-auto text-[11px] text-gray-500">{{ visibleRows().length }} of {{ rows.length }} shown</span>
        </div>

        <div *ngIf="!locked && selectedRows().length" class="flex flex-wrap items-center gap-2">
          <span class="rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white tabular-nums">{{ selectedRows().length }} selected</span>
          <button *ngIf="!allShownSelected()" type="button" (click)="toggleShown()" class="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-400">Select all{{ visibleRows().length !== rows.length ? ' matching' : '' }}</button>
          <span class="mx-1 h-5 w-px bg-gray-200 dark:bg-erp-border-dark"></span>

          <app-sf-combobox class="w-56" [(ngModel)]="bulkSupplier" [ngModelOptions]="{ standalone: true }"
            [options]="bulkSupplierOptions()" placeholder="Award to supplier…"></app-sf-combobox>
          <app-action-button *ngIf="bulkSupplier" variant="secondary" [disabled]="busy || !supplierAwards(bulkSupplier).length" (click)="bulkToSupplier()">Award</app-action-button>
          <app-action-button variant="primary" [disabled]="busy || !bulkAwards('price').length" (click)="bulkFill('price')">
            Award lowest price ({{ bulkLines('price') }})
          </app-action-button>
          <app-action-button variant="secondary" [disabled]="busy || !unawardAwards().length" (click)="bulkUnaward()">
            Unaward ({{ unawardAwards().length }})
          </app-action-button>

          <div class="ml-auto flex items-center gap-1">
            <button type="button" aria-label="Clear selection" (click)="selected.clear(); bulkSupplier = ''"
              class="grid h-8 w-8 place-content-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><ng-icon name="heroXMark" class="h-4 w-4"></ng-icon></button>
          </div>
        </div>
      </div>

      <ng-container *ngIf="view === 'line'">
      <article *ngFor="let r of visibleRows(); trackBy: trackRow" class="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-erp-surface-dark"
        [ngClass]="kind(r) === 'open' || kind(r) === 'partial' ? 'border-amber-200 dark:border-amber-900/50' : 'border-gray-200 dark:border-erp-border-dark'">
        <div class="flex flex-col lg:flex-row">
          <!-- Product -->
          <div class="flex w-full shrink-0 flex-col gap-1.5 border-b border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-erp-border-dark dark:bg-gray-900/30 lg:w-64 lg:border-b-0 lg:border-r">
            <div class="min-w-0">
              <div class="flex items-start justify-between gap-2">
                <app-sf-checkbox *ngIf="!locked" class="shrink-0" [ngModel]="selected.has(r.key)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="toggle(r.key)"></app-sf-checkbox>
                <p #desc class="line-clamp-2 min-w-0 flex-1 text-xs font-semibold text-gray-900 dark:text-gray-100" [matTooltip]="desc.scrollHeight > desc.clientHeight ? (r.detail || r.itemName) : ''">{{ r.detail || r.itemName }}</p>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" [ngClass]="rowChip(r)">{{ rowLabel(r) }}</span>
              </div>
              <p class="truncate text-[11px] text-gray-500">{{ r.itemName }}</p>
            </div>
            <dl class="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] leading-tight">
              <div><dt class="text-gray-500">Deal qty</dt>
                <dd class="font-semibold tabular-nums" [ngClass]="mismatch(r) ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'">{{ r.dealQty != null ? r.dealQty : 'Not in deal' }}</dd></div>
              <div><dt class="text-gray-500">Sell price</dt><dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ r.sellPrice != null ? (r.sellPrice | number: '1.2-2') : '-' }}</dd></div>
              <div><dt class="text-gray-500">Awarded</dt>
                <dd class="font-semibold tabular-nums" [ngClass]="open(r) > 0 ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'">{{ awardedQty(r) }}/{{ awardedQty(r) + open(r) }}</dd></div>
              <div><dt class="text-gray-500">Margin</dt>
                <dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ margin(r) != null ? (marginValue(r) | number: '1.2-2') : '-' }}</dd></div>
              <div><dt class="text-gray-500">Margin %</dt>
                <dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ margin(r) != null ? (margin(r) | number: '1.1-1') + '%' : '-' }}</dd></div>
            </dl>
            <p *ngIf="r.remaining > 0 && r.allocated > 0" class="text-[11px] font-medium text-amber-600">{{ r.remaining }} still to award</p>

            <p *ngIf="r.short" class="rounded-lg bg-orange-50 px-2 py-1 text-[11px] text-orange-800 dark:bg-orange-950/30 dark:text-orange-200"><b>Short:</b> {{ r.shortReason }}</p>

          </div>

          <!-- Supplier columns -->
          <div class="flex min-w-0 flex-1 flex-col overflow-x-auto p-2">
            <div class="grid flex-1 gap-2"[style.grid-template-columns]="'repeat(' + (orderedColumns(r).length || 1) + ', minmax(15rem, 1fr))'">
              <div *ngFor="let c of orderedColumns(r)" class="relative flex flex-col gap-1.5 rounded-lg px-2.5 py-2 transition-shadow"
                [ngClass]="cellClass(r, cell(r, c))">
                <ng-container *ngIf="cell(r, c) as s; else notAsked">
                  <div class="min-w-0">
                    <div class="flex items-start justify-between gap-2 pr-6">
                      <p #sup class="min-w-0 flex-1 truncate text-xs font-semibold text-gray-900 dark:text-gray-100" [matTooltip]="sup.scrollWidth > sup.clientWidth ? c.name : ''">{{ c.name }}</p>
                      <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" [ngClass]="statusChip(s)">{{ statusLabel(s) }}</span>
                    </div>
                    <p class="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      {{ s.state === 'default' ? 'Default supplier' : s.state === 'option' ? 'From deal sheet' : s.state === 'waiting' ? 'No price yet' : 'Price compared' }}
                      <span *ngIf="best(r) === s" class="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <ng-icon name="heroTrophy" class="h-3 w-3"></ng-icon> Best
                      </span>
                    </p>
                  </div>
                  <dl class="flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-tight [&>div]:max-w-full [&>div]:shrink-0 [&>div]:grow">
                    <div><dt class="text-gray-500">Price</dt>
                      <dd class="font-semibold tabular-nums" [ngClass]="priceTone(r, s)" [matTooltip]="r.dealCost != null ? 'Deal sheet cost: ' + (r.dealCost | number: '1.2-2') : ''">{{ s.price != null ? (s.price | number: '1.2-2') : '-' }}</dd></div>
                    <div><dt class="text-gray-500">Qty</dt>
                      <dd class="font-semibold tabular-nums" [ngClass]="partial(r, s) ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'">
                        {{ (s.state === 'awarded' ? s.qty : s.offerQty) ?? '-' }} / {{ r.prQty }}
                      </dd></div>
                    <div><dt class="text-gray-500">Margin</dt>
                      <dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ supplierMargin(r, s) != null ? (supplierMargin(r, s)! | number: '1.2-2') : '-' }}</dd></div>
                    <div><dt class="text-gray-500">Margin %</dt>
                      <dd class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ supplierMarginPct(r, s) != null ? (supplierMarginPct(r, s)! | number: '1.1-1') + '%' : '-' }}</dd></div>
                    <div><dt class="text-gray-500">Availability</dt>
                      <dd #avail class="truncate font-semibold text-gray-900 dark:text-gray-100" [matTooltip]="avail.scrollWidth > avail.clientWidth ? (s.availability ?? '') : ''">{{ s.availability || '-' }}</dd></div>
                  </dl>
                  <input *ngIf="s.state === 'awarded' ? (s.supplierId && !locked) : canAward(s)" type="radio" [checked]="s.state === 'awarded'" [disabled]="busy"
                    class="absolute right-2 top-2 h-4 w-4 cursor-pointer accent-emerald-600"
                    [matTooltip]="s.state === 'awarded' ? 'Awarded: click to unaward' : 'Award to ' + s.name"
                    (click)="$event.preventDefault(); s.state === 'awarded' ? unaward(r, s) : award(r, s)" />
                </ng-container>
                <ng-template #notAsked>
                  <p #sup2 class="truncate text-xs font-semibold text-gray-400" [matTooltip]="sup2.scrollWidth > sup2.clientWidth ? c.name : ''">{{ c.name }}</p>
                  <p class="my-auto py-3 text-center text-xs text-gray-400">Not asked for this item</p>
                </ng-template>
              </div>
            </div>
            <p *ngIf="!orderedColumns(r).length" class="py-2 text-center text-xs text-gray-400">No supplier added for this item. Add one in Items to compare prices.</p>
          </div>
        </div>
      </article>

      <p *ngIf="rows.length && !visibleRows().length" class="py-6 text-center text-xs text-gray-500">No items match.</p>
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
  @Output() awarded = new EventEmitter<ReviewAward>();
  /** Several awards saved together (Fill remaining), in order. */
  @Output() awardedMany = new EventEmitter<ReviewAward[]>();

  view: 'line' | 'supplier' = 'line';
  /** Order Fill remaining takes the quotes in. */
  fillBy: 'price' | 'lead' = 'price';
  private static readonly MAX_CHIPS = 5;

  /** Lines picked for a bulk action, by row key. */
  selected = new Set<string>();
  filter: 'all' | 'todo' | 'done' | 'waiting' | 'nosupplier' = 'all';
  search = '';
  bulkSupplier = '';
  readonly filters = [
    { id: 'nosupplier' as const, label: 'No supplier' },
    { id: 'waiting' as const, label: 'Waiting' },
    { id: 'done' as const, label: 'Covered' },
    { id: 'todo' as const, label: 'To award' },
  ];

  trackRow = (_: number, r: ReviewRow) => r.key;

  /** Waiting: a supplier on the line has not quoted yet, so the comparison is incomplete. */
  isWaiting(r: ReviewRow): boolean {
    return r.suppliers.some((s) => s.state === 'waiting');
  }

  /** Covered: every supplier on the line has its comparison details. To award: the line's full qty is not awarded yet. */
  matches(r: ReviewRow, id: 'waiting' | 'done' | 'todo' | 'nosupplier'): boolean {
    if (id === 'nosupplier') return this.noSupplier(r);
    if (id === 'waiting') return this.isWaiting(r);
    if (id === 'done') return !this.isWaiting(r);
    return r.remaining > 0;
  }

  /** No supplier: the deal sheet picked none for the line and none is awarded yet. */
  noSupplier(r: ReviewRow): boolean {
    return !r.suppliers.some((s) => s.state === 'default' || s.state === 'awarded');
  }

  filterCount(id: 'waiting' | 'done' | 'todo' | 'nosupplier'): number {
    return this.rows.filter((r) => this.matches(r, id)).length;
  }

  visibleRows(): ReviewRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((r) => {
      if (this.filter !== 'all' && !this.matches(r, this.filter)) return false;
      return !q || `${r.detail} ${r.itemName}`.toLowerCase().includes(q);
    });
  }

  /** Selected lines still on the page (rows may change after a save). */
  selectedRows(): ReviewRow[] {
    return this.rows.filter((r) => this.selected.has(r.key));
  }

  toggle(key: string): void {
    this.selected.has(key) ? this.selected.delete(key) : this.selected.add(key);
  }

  allShownSelected(): boolean {
    const shown = this.visibleRows();
    return shown.length > 0 && shown.every((r) => this.selected.has(r.key));
  }

  someShownSelected(): boolean {
    return !this.allShownSelected() && this.visibleRows().some((r) => this.selected.has(r.key));
  }

  toggleShown(): void {
    const all = this.allShownSelected();
    this.visibleRows().forEach((r) => (all ? this.selected.delete(r.key) : this.selected.add(r.key)));
  }

  bulkAwards(by: 'price' | 'lead'): ReviewAward[] {
    const keep = this.fillBy;
    this.fillBy = by;
    const out = this.selectedRows().flatMap((r) => this.fillAwards(r));
    this.fillBy = keep;
    return out;
  }

  /** How many selected lines the action would award. */
  bulkLines(by: 'price' | 'lead'): number {
    return new Set(this.bulkAwards(by).map((a) => a.lineKey)).size;
  }

  bulkFill(by: 'price' | 'lead'): void {
    const awards = this.bulkAwards(by);
    if (awards.length) this.awardedMany.emit(awards);
  }

  /** Every award on the selected lines, as removals. */
  unawardAwards(): ReviewAward[] {
    return this.selectedRows().flatMap((r) => r.suppliers
      .filter((s) => s.state === 'awarded' && !!s.supplierId)
      .map((s) => ({ lineKey: r.key, supplierId: s.supplierId!, supplierName: s.name, clear: true })));
  }

  bulkUnaward(): void {
    const awards = this.unawardAwards();
    if (awards.length) this.awardedMany.emit(awards);
  }

  /** Suppliers that have quoted at least one selected line. */
  bulkSuppliers(): ReviewColumn[] {
    return this.columns.filter((c) => this.supplierAwards(c.id).length);
  }

  private supplierOptionsKey = '';
  private supplierOptions: SfOption<string>[] = [];

  /** Combobox options for the bulk supplier, rebuilt only when they change so the dropdown keeps its state. */
  bulkSupplierOptions(): SfOption<string>[] {
    const next = this.bulkSuppliers().map((c) => {
      const n = this.supplierAwards(c.id).length;
      return { value: c.id, label: c.name, description: `${n} line${n === 1 ? '' : 's'} to award`, disabled: !n };
    });
    const key = JSON.stringify(next);
    if (key !== this.supplierOptionsKey) {
      this.supplierOptionsKey = key;
      this.supplierOptions = next;
    }
    return this.supplierOptions;
  }

  /** What is open on each selected line goes to this supplier, up to what it quoted. */
  supplierAwards(supplierId: string): ReviewAward[] {
    return this.selectedRows().flatMap((r) => {
      const s = this.quotes(r).find((q) => q.supplierId === supplierId && q.state !== 'awarded');
      const room = this.open(r);
      if (!s || r.short || !(room > 0)) return [];
      const qty = Math.min(s.offerQty ?? room, room);
      return qty > 0 ? [this.awardOf(r, s, qty)] : [];
    });
  }

  bulkToSupplier(): void {
    const awards = this.supplierAwards(this.bulkSupplier);
    if (awards.length) this.awardedMany.emit(awards);
    this.bulkSupplier = '';
  }

  /** Priced suppliers of the line: the chips. */
  quotes(r: ReviewRow): ReviewSupplier[] {
    return r.suppliers
      .filter((s) => !!s.supplierId && s.price != null && s.state !== 'waiting')
      .slice(0, PrReviewStepComponent.MAX_CHIPS);
  }

  /** Quantity chosen (the deal sheet default does not count: a choice replaces it). */
  awardedQty(r: ReviewRow): number {
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
    if (this.locked || !s.supplierId || s.state === 'awarded') return;
    const room = this.open(r) || r.prQty;
    const qty = Math.min(s.offerQty ?? room, room);
    if (!(qty > 0)) return;
    this.awarded.emit(this.awardOf(r, s, qty));
  }

  /** Takes the supplier off the line; its quantity goes back to unawarded. */
  unaward(r: ReviewRow, s: ReviewSupplier): void {
    if (this.locked || !s.supplierId) return;
    this.awarded.emit({ lineKey: r.key, supplierId: s.supplierId, supplierName: s.name, clear: true });
  }

  private awardOf(r: ReviewRow, s: ReviewSupplier, qty: number): ReviewAward {
    return { lineKey: r.key, supplierId: s.supplierId!, unitPrice: s.price ?? undefined, supplierName: s.name, ...(qty < r.prQty ? { qty } : {}) };
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
      out.push(this.awardOf(r, s, qty));
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
      const g = groups.get(key) ?? { key, name: s.name, defaultOnly: true, lines: [], total: 0 };
      const total = (s.price ?? 0) * s.qty;
      g.lines.push({ key: r.key, detail: r.detail, itemName: r.itemName, qty: s.qty, uom: r.uom, price: s.price, total });
      g.total += total;
      if (s.state === 'awarded') g.defaultOnly = false;
      groups.set(key, g);
    }));
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

  /** Only the suppliers added against this item, with the deal sheet's default supplier first. */
  orderedColumns(r: ReviewRow): ReviewColumn[] {
    const rank = (c: ReviewColumn) => {
      const st = this.cell(r, c)?.state;
      return st === 'default' ? 0 : st === 'awarded' ? 1 : 2;
    };
    return this.columns.filter((c) => !!this.cell(r, c)).sort((a, b) => rank(a) - rank(b));
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

  /** Margin per unit if this supplier's price were the cost. */
  supplierMargin(r: ReviewRow, s: ReviewSupplier): number | null {
    if (!r.sellPrice || s.price == null) return null;
    return r.sellPrice - s.price;
  }

  supplierMarginPct(r: ReviewRow, s: ReviewSupplier): number | null {
    const m = this.supplierMargin(r, s);
    return m == null || !r.sellPrice ? null : (m / r.sellPrice) * 100;
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

  /** A supplier's price against the deal sheet's default cost: at or under it is green, over it is orange. */
  priceTone(r: ReviewRow, s: ReviewSupplier): string {
    if (s.price == null || r.dealCost == null) return 'text-gray-900 dark:text-gray-100';
    return s.price <= r.dealCost ? 'text-emerald-600' : 'text-amber-600';
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
    return !this.locked && !!s.supplierId && s.price != null && (s.state === 'priced' || s.state === 'default' || s.state === 'option');
  }

  /** The supplier can only cover part of what the request needs. */
  partial(r: ReviewRow, s: ReviewSupplier): boolean {
    return s.offerQty != null && s.offerQty < r.prQty;
  }

  qtyFor(r: ReviewRow, s: ReviewSupplier): number {
    if (s.state === 'awarded') return s.qty;
    const room = r.allocated > 0 && r.remaining > 0 ? r.remaining : r.prQty;
    return Math.min(s.offerQty ?? r.prQty, room);
  }

  award(r: ReviewRow, s: ReviewSupplier): void {
    const qty = Number(this.qtyFor(r, s));
    if (!s.supplierId || !(qty > 0)) return;
    // Taking the whole line is a plain award; a smaller share splits it.
    this.awarded.emit(this.awardOf(r, s, qty));
  }
}
