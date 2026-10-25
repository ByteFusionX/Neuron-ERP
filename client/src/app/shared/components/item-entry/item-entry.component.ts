import { MatTooltipModule } from '@angular/material/tooltip';
import { Component, ElementRef, EventEmitter, HostListener, Inject, Input, OnChanges, OnDestroy, OnInit, Optional, Output, SimpleChanges, TemplateRef, ViewChild } from '@angular/core';
import { CommandPaletteService } from '../../../core/services/command-palette.service';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AlertService } from 'src/app/core/services/alert.service';
import { Subject, Subscription, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { LoadMoreOnScrollDirective } from '../../directives/load-more-on-scroll.directive';
import type { SalesRfqPastQuote } from 'src/app/shared/interfaces/sales-rfq.interface';
import type { SupplierLastPrice } from 'src/app/shared/interfaces/purchase.interface';

/** Catalogue palette page size: rows fetched first, and per scroll to the end. */
const PALETTE_PAGE = 10;
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgIcon } from '@ng-icons/core';
import { MasterListService } from 'src/app/core/services/master-list.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ParseBoldTextPipe } from 'src/app/shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from 'src/app/shared/pipes/highlightParse.pipe';
import { SF_STYLES, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import {
  CreateProductRequest,
  DEFAULT_AVAILABILITY_OPTIONS,
  ITEM_SUGGESTION_SOURCE,
  ItemEntryItemValue,
  ItemEntryLineValue,
  ItemEntryOptionValue,
  ItemEntryTotals,
  ItemSuggestion,
  ItemSuggestionSource,
} from './item-entry.model';
import { ItemSheetMeta, downloadItemsTemplate, exportItemsSheet, itemSheetColumns, readItemsSheet } from './item-entry-excel';
import { ActiveItemEntryService } from 'src/app/core/services/active-item-entry.service';
import { ModalService } from 'src/app/shared/components/modal';
import { QuickAddDialogComponent, QuickAddDialogData } from 'src/app/modules/products/modals/quick-add-dialog/quick-add-dialog.component';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ImageViewerComponent } from 'src/app/shared/components/image-viewer/image-viewer.component';

type LineFilter = 'missingPrice' | 'notInCatalogue' | 'notAwarded' | 'errors';

/**
 * Reusable "enter items" editor: options → items → detail lines, with cost/margin/price derivation,
 * catalogue suggestions, drag-reordering, undo and a totals bar.
 *
 * It owns no domain knowledge. The host passes in the FormArray it wants mutated and, optionally, a
 * suggestion source (`[suggestionSource]` or the `ITEM_SUGGESTION_SOURCE` token) — anything module
 * specific, such as opening a create-product modal, is raised as an output instead.
 *
 * Control shape (kept identical to `OptionalItemsComponent` so saved payloads cannot drift):
 *   optionalItems: [{ totalDiscount, items: [{ itemName, isOptional, includeInTotal,
 *                     itemDetails: [{ itemCode, detail, quantity, unitCost, profit,
 *                                     unitSellingPrice, availability, supplierId, uom }] }] }]
 */
/** A supplier pill under a purchase line: 'awarded' won it, 'priced' quoted, 'waiting' has an RFQ with no price yet, 'none' has no RFQ. */
export interface LineSupplierOffer {
  supplierId?: string;
  supplierName: string;
  state: 'awarded' | 'priced' | 'waiting' | 'none';
  price?: number | null;
  rfqId?: string;
  quoteId?: string;
  /** Latest quote for this product on another request, offered as a hint on the supplier's tab. */
  previous?: SalesRfqPastQuote;
  /** Known only from another request: it does not put the line under this supplier's tab. */
  pastOnly?: boolean;
  /** Awarded offers only: the part of the line's quantity this supplier won (blank = all of it). */
  qty?: number;
  /** The supplier's last price for the product (last PO, else last comparison); seeds an empty price. */
  last?: SupplierLastPrice;
}

/** What one supplier won of a purchase line. */
export interface LineShare {
  supplierId: string;
  qty: number;
  cost: number;
}

@Component({
  selector: 'app-item-entry',
  standalone: true,
  templateUrl: './item-entry.component.html',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatTooltipModule, NgIcon, DragDropModule, SmartFormModule, ActionButtonComponent, ImageViewerComponent, ParseBoldTextPipe, ParseBracketsTextPipe, LoadMoreOnScrollDirective],
  styles: [SF_STYLES + `
    :host { display: block; }
    /* The numeric strip is dense on purpose: seven fields per line have to fit without a horizontal scrollbar. */
    .ie-strip { display: grid; gap: 0.375rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (min-width: 640px) {
      .ie-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      /* Item code and part no are the long values on an RFQ line; give them twice the room of qty / unit. */
      .ie-strip.ie-strip-rfq { grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); }
    }
    @media (min-width: 1400px) {
      .ie-strip { grid-template-columns: minmax(0, 7.5fr) minmax(0, 7.5fr) minmax(0, 5fr) minmax(0, 5fr) minmax(0, 6.5fr) minmax(0, 5.5fr) minmax(0, 6.5fr) minmax(0, 8.5fr) minmax(0, 9fr) minmax(0, 10fr) minmax(0, 9fr); }
      /* Purchase drops the margin column (no customer-facing margin for supplier lines), so it's one column short of the default strip. */
      .ie-strip.ie-strip-purchase { grid-template-columns: minmax(0, 7.5fr) minmax(0, 7.5fr) minmax(0, 5fr) minmax(0, 5fr) minmax(0, 6.5fr) minmax(0, 6.5fr) minmax(0, 8.5fr) minmax(0, 9fr) minmax(0, 10fr) minmax(0, 9fr); }
      /* RFQ asks suppliers for prices: identifiers, quantity and unit; the supplier's price only once it replies. */
      .ie-strip.ie-strip-rfq { grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); }
      .ie-strip.ie-strip-rfq.ie-strip-rfq-priced { grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1fr); }
    }
    .ie-short { display: grid; gap: 0.375rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    @media (min-width: 900px) { .ie-short { grid-template-columns: minmax(0, 6fr) minmax(0, 1.4fr) minmax(0, 1.6fr) minmax(0, 1.6fr) minmax(0, 1.6fr); } }
    .ie-num { justify-content: flex-end; font-variant-numeric: tabular-nums; }
    .ie-short.ie-labels > span:nth-child(2), .ie-short.ie-labels > span:nth-child(4), .ie-short.ie-labels > span:nth-child(5) { text-align: right; }
    .ie-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    .ie-labels > span:nth-child(n+3):nth-child(-n+7), .ie-labels > span:nth-child(n+10) { text-align: right; }
    .ie-labels.ie-strip-purchase > span:nth-child(n+3):nth-child(-n+6), .ie-labels.ie-strip-purchase > span:nth-child(n+9) { text-align: right; }
    .ie-labels.ie-strip-rfq > span:nth-child(4), .ie-labels.ie-strip-rfq > span:nth-child(6) { text-align: left; }
    .ie-cell { display: flex; align-items: center; min-height: 2.25rem; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .ie-cell { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
    .ie-total { display: flex; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; align-items: center; justify-content: flex-end; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; font-variant-numeric: tabular-nums; font-weight: 500; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .ie-total { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
    :host-context(html.dark) .ie-labels { color: #6b7280; }
  `],
})
export class ItemEntryComponent implements OnInit, OnChanges, OnDestroy {
  /** The host form's items FormArray. Owned by the host, mutated here. */
  @Input({ required: true }) optionalItems!: FormArray;
  /** Existing options to patch in (enquiry estimations, or an edited record). */
  @Input() seedOptionalItems: ItemEntryOptionValue[] | null = null;
  @Input() currency = 'QAR';

  /**
   * 'quote' authors items. 'deal' converts an existing quote: the structure is fixed, every line gets
   * an "include in deal" tick, and only ticked lines are priced, validated and totalled. The seed
   * (`seedOptionalItems`) supplies the quoted numbers; unticking a line restores them.
   * 'purchase' is a single flat list: no options or optional items, cost and price are independent,
   * each line carries a host-owned `lineKey`.
   * 'rfq' lists what suppliers are asked to price: a flat list of identifiers, quantity and unit, each
   * line with a `lineKey`. With `rfqPriced` the supplier's unit price and availability are entered too.
   */
  @Input() mode: 'quote' | 'deal' | 'purchase' | 'rfq' = 'quote';
  @Input() quoteReference = '';
  /** RFQ mode: show the supplier's unit price (stored in `unitCost`) and availability on each line. */
  @Input() rfqPriced = false;
  /** RFQ mode: show the unit price and availability columns while the RFQ is being raised (the lines are still added, not filled in). */
  @Input() rfqAskPrice = false;
  get rfqQuoted(): boolean {
    return this.rfqPriced || this.rfqAskPrice;
  }
  /** Rendered under each line; context `{ $implicit: lineGroup, i, j, k }`. For host-specific status (stock, suppliers asked). */
  @Input() lineExtraTemplate: TemplateRef<any> | null = null;
  /** Rendered in the bulk bar while lines are selected; context `{ $implicit: selectedLineGroups }`. */
  @Input() bulkExtraTemplate: TemplateRef<any> | null = null;
  /** The sticky totals bar. A host that shows its own summary (deal adjustments, say) turns it off. */
  @Input() showTotalsBar = true;
  /** Keeps the totals bar but drops the option tabs and item cards, for a host step that only needs the summary. */
  @Input() itemsHidden = false;
  /** Deal mode: net extra cost from the host's adjustments (additional costs less supplier discounts), added to Total cost. */
  @Input() costAdjustment = 0;
  /** Deal mode: customer discount from the host's adjustments, shown read-only and taken off the Final total. */
  @Input() discountAdjustment = 0;

  /** Alternatives the customer chooses between. Turn off where a module quotes a single list. */
  @Input() allowOptions = true;
  /** The per-item "Optional" / "Include in total" affordances. */
  @Input() allowOptionalItems = true;
  /** The "+ Create product" row under the suggestion dropdown; emits `createProductRequested`. */
  @Input() allowCreateProduct = true;
  /** The host renders Add item / Add optional item itself (e.g. in a drawer footer), so the toolbar omits them. */
  @Input() externalAddButtons = false;
  /** Plain list of lines: no item group header (name, category, collapse), the lines just stack. Bulk actions stay. */
  @Input() flat = false;

  /** Shown as the "add from previous jobs" affordance; the host owns the fetch. */
  @Input() previousJobItemsCount = 0;
  @Input() previousJobsLabel = 'Previous jobs';

  /** Leave null to use the Availability master-data list; pass a list to override it. */
  @Input() availabilityOptions: SfOption[] | null = null;
  /** Fixed options appended after the master list (the RFQ's "Unavailable" drives its own logic, so it is not a managed option). */
  @Input() extraAvailabilityOptions: SfOption[] = [];
  /** What the template binds: the master list, plus any saved value no longer on it. */
  resolvedAvailabilityOptions: SfOption[] = DEFAULT_AVAILABILITY_OPTIONS;
  /** Units of measure from the master list, plus any saved or suggested value not on it. */
  resolvedUomOptions: SfOption[] = [];
  /** Leave null to load the supplier list here; pass a list to supply it from the host instead. */
  @Input() supplierOptions: SfOption[] | null = null;
  /** Overrides the `ITEM_SUGGESTION_SOURCE` provider for this usage. Null in both: no suggestions. */
  @Input() suggestionSource: ItemSuggestionSource | null = null;
  /** Department/segment ids to narrow suggestions to. Falls back to the host form's `departments`. */
  @Input() suggestionScopeIds: string[] | null = null;

  /** Purchase mode: linked part numbers for the part-no picker. */
  /** Purchase mode: the cost is not typed here (it comes from the awarded supplier RFQ), so the field is read-only. */
  @Input() readonlyCost = false;
  /** Purchase: says whether a line (its raw value) has an awarded supplier; adds a "Not awarded" filter and count. */
  @Input() lineAwarded: ((line: any) => boolean) | null = null;
  /** Purchase mode: a per-line "Compare" button; emits `compareClicked`. */
  @Input() showCompareButton = false;
  /** Purchase mode: the Compare button's text for a line (e.g. a quote count). Null: "Compare". */
  @Input() compareLabel: ((i: number, j: number, k: number) => string) | null = null;
  /** Purchase mode: lines the host has frozen (already committed upstream) render read-only. */
  @Input() lineLocked: ((i: number, j: number, k: number) => boolean) | null = null;
  /** Purchase mode: a short badge shown beside a line's description. */
  @Input() lineBadge: ((i: number, j: number, k: number) => string | null) | null = null;
  /** Purchase mode: the suppliers to show as pills under a line (its RFQ suppliers and the current one). */
  @Input() lineOffers: ((line: any) => LineSupplierOffer[]) | null = null;
  /** Purchase: the supplier tabs each line is listed under, shown as pills on the line. */
  @Input() linePills: ((line: any) => { id: string; name: string }[]) | null = null;
  /** A supplier pill was clicked: the line is now that supplier's, at the price it offered (null when it has none yet). */
  @Output() pillClicked = new EventEmitter<{ lineKey: string; supplierId: string; price: number | null }>();

  pillAwarded(i: number, j: number, k: number, supplierId: string): boolean {
    const d = this.detailsAt(i, j)?.at(k);
    if (!d) return false;
    const won = this.sharesOf(d);
    return won.length ? won.some((s) => s.supplierId === supplierId) : String(d.get('supplierId')?.value || '') === supplierId;
  }

  /** The pill's tooltip: the supplier and its last price, with the change to the price it has on this line. */
  pillTitle(i: number, j: number, k: number, pill: { id: string; name: string }): string {
    const d = this.detailsAt(i, j)?.at(k);
    const last = d ? this.lastOffer(d, pill.id) : undefined;
    if (!d || !last) return pill.name;
    // The line's own supplier is priced by the line's cost; another by its tab or offer.
    const ownCost = String(d.get('supplierId')?.value || '') === pill.id && !this.sharesOf(d).length ? Number(d.get('unitCost')?.value) : 0;
    const now = ownCost > 0 ? ownCost : this.supplierCost(d, pill.id);
    const diff = now != null ? this.priceChange(now, last.lastPrice) : null;
    return `${pill.name} · last ${last.source} ${last.sourceNo || ''} ${last.lastPrice.toFixed(2)} ${last.currency}`.replace(/\s+/g, ' ')
      + (diff != null ? ` · now ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '');
  }

  private lastOffer(d: AbstractControl, supplierId: string | null): SupplierLastPrice | undefined {
    if (!supplierId) return undefined;
    return this.lineOffers?.(d.getRawValue())?.find((o) => o.supplierId === supplierId)?.last;
  }

  /** Percent change from the last price, or null when unchanged or unknown. */
  private priceChange(now: number, last: number): number | null {
    if (!(last > 0) || !(now > 0) || Math.abs(now - last) < 0.005) return null;
    return ((now - last) / last) * 100;
  }

  /** Supplier tab: this supplier's last price for the product, and the change to the price typed here. */
  lastPrice(i: number, j: number, k: number): { last: SupplierLastPrice; diff: number | null } | null {
    const d = this.detailsAt(i, j)?.at(k);
    const last = d ? this.lastOffer(d, this.supplierScope ?? String(d.get('supplierId')?.value || '')) : undefined;
    if (!d || !last) return null;
    return { last, diff: this.priceChange(this.shownUnitCost(i, j, k), last.lastPrice) };
  }

  /** What each supplier supplies of a line, once chosen in this form (null = unchanged since it was loaded). */
  lineShares(lineKey: string): LineShare[] | null {
    return this.shares.get(lineKey) ?? null;
  }

  /** The price shown for a supplier on a line under its tab (typed, offered or suggested), or null. */
  scopePrice(lineKey: string, supplierId: string): number | null {
    const v = this.scopeCosts.get(`${lineKey}|${supplierId}`)?.value;
    return v != null && Number(v) > 0 ? Number(v) : null;
  }

  /** The pill's text: the supplier, plus its share once the line is split or only partly awarded. */
  pillLabel(i: number, j: number, k: number, pill: { id: string; name: string }): string {
    const d = this.detailsAt(i, j)?.at(k);
    const won = d ? this.sharesOf(d) : [];
    const partial = d ? this.pillQtyLeft(d) > 0 : false;
    const mine = won.length > 1 || partial ? won.find((s) => s.supplierId === pill.id) : undefined;
    if (!mine) return pill.name;
    return partial ? `${pill.name} · ${mine.qty}/${Number(d!.get('quantity')?.value) || 0}` : `${pill.name} · ${mine.qty}`;
  }

  private pillQtyLeft(d: AbstractControl): number {
    const total = Number(d.get('quantity')?.value) || 0;
    return total - this.sharesOf(d).reduce((n, s) => n + s.qty, 0);
  }

  /** A pill of a supplier that holds nothing is closed once the whole quantity is awarded. */
  pillBlocked(i: number, j: number, k: number, supplierId: string): boolean {
    const d = this.detailsAt(i, j)?.at(k);
    if (!d || !this.sharesOf(d).length || this.pillAwarded(i, j, k, supplierId)) return false;
    return !(this.pillQtyLeft(d) > 0) && supplierId !== (this.baseSuppliers.get(d) ?? '');
  }

  pickPill(i: number, j: number, k: number, supplierId: string): void {
    const d = this.detailsAt(i, j)?.at(k);
    if (!d || this.lineLocked?.(i, j, k)) return;
    const price = this.supplierCost(d, supplierId);
    const base = this.baseSuppliers.get(d) ?? '';
    const awarded = this.sharesOf(d).length > 0;
    // Nothing awarded: the deal supplier is already the active pill.
    if (!awarded && supplierId === base) return;
    // The active pill, or the job's own supplier once the whole line is awarded elsewhere, takes the award back: the line returns to the deal supplier and cost.
    const held = this.sharesOf(d);
    // On a split line, the active pill releases only that supplier's share.
    if (held.length > 1 && held.some((s) => s.supplierId === supplierId)) {
      this.applyShares(d, held.filter((s) => s.supplierId !== supplierId));
      this.refillScopeQtys(d, '');
      d.markAsDirty();
      this.pillClicked.emit({ lineKey: d.get('lineKey')?.value, supplierId, price: null });
      return;
    }
    if (awarded && (this.pillAwarded(i, j, k, supplierId) || (supplierId === base && !(this.pillQtyLeft(d) > 0)))) {
      this.shares.set(d.get('lineKey')?.value, []);
      const deal = this.dealCost(d);
      d.patchValue({ supplierId: base || null, ...(deal != null ? { unitCost: deal } : {}) });
      this.refillScopeQtys(d, '');
      d.markAsDirty();
      this.pillClicked.emit({ lineKey: d.get('lineKey')?.value, supplierId: base, price: deal });
      return;
    }
    // Once some quantity is awarded, another supplier only takes what is still unawarded.
    const left = this.pillQtyLeft(d);
    if (awarded && !(left > 0)) return;
    const cost = price ?? (Number(d.get('unitCost')?.value) || 0);
    // A quantity typed on the supplier's own tab is what it gets, capped at what is still free.
    const typed = this.scopeQtys.get(`${d.get('lineKey')?.value}|${supplierId}`);
    const free = awarded ? left : Number(d.get('quantity')?.value) || 0;
    const qty = typed?.dirty && Number(typed.value) > 0 ? Math.min(Number(typed.value), free) : free;
    this.applyShares(d, [...(awarded ? this.sharesOf(d) : []), { supplierId, qty, cost }]);
    this.refillScopeQtys(d, supplierId);
    d.markAsDirty();
    this.pillClicked.emit({ lineKey: d.get('lineKey')?.value, supplierId, price });
  }

  /** What each supplier won of a line, kept per line while the form is open; before that, the awards the RFQs already hold. */
  private shares = new Map<string, LineShare[]>();

  sharesOf(d: AbstractControl): LineShare[] {
    const key = d.get('lineKey')?.value;
    if (!key) return [];
    const own = this.shares.get(key);
    if (own) return own;
    const total = Number(d.get('quantity')?.value) || 0;
    return (this.lineOffers?.(d.getRawValue()) ?? [])
      .filter((o) => o.state === 'awarded' && o.supplierId)
      .map((o) => ({ supplierId: o.supplierId!, qty: o.qty || total, cost: Number(o.price) || 0 }));
  }

  private claimedElsewhere(d: AbstractControl, supplierId: string): number {
    return this.sharesOf(d).filter((s) => s.supplierId !== supplierId).reduce((n, s) => n + s.qty, 0);
  }

  /** Records the shares and moves the line to its lead supplier at the average cost of what is awarded (as the server prices a split line). */
  private applyShares(d: AbstractControl, list: LineShare[]): void {
    const key = d.get('lineKey')?.value;
    if (!key) return;
    this.shares.set(key, list);
    const qty = list.reduce((n, s) => n + s.qty, 0);
    if (!list.length || !(qty > 0)) return;
    const cost = list.reduce((n, s) => n + s.qty * s.cost, 0) / qty;
    const lead = list.reduce((a, b) => (b.qty > a.qty ? b : a));
    d.patchValue({ supplierId: lead.supplierId, ...(cost > 0 ? { unitCost: cost } : {}) });
  }

  /** Other tabs' untouched quantities follow what is still unawarded; typed ones are left alone. */
  private refillScopeQtys(d: AbstractControl, except: string): void {
    const key = d.get('lineKey')?.value;
    const total = Number(d.get('quantity')?.value) || 0;
    if (!key) return;
    this.scopeQtys.forEach((c, k) => {
      const sid = k.slice(key.length + 1);
      if (!k.startsWith(`${key}|`) || sid === except || c.dirty) return;
      c.setValue(Math.max(0, total - this.claimedElsewhere(d, sid)));
    });
  }

  /** The cost a purchase line started with (the deal's), so another supplier's tab is not seeded with a cost that was awarded elsewhere. */
  private baseCosts = new WeakMap<AbstractControl, number | null>();

  /** The supplier the line started with (the deal's), whose cost is the deal cost. */
  private baseSuppliers = new WeakMap<AbstractControl, string>();

  /** Purchase: the deal sheet's cost and supplier for a line, so the baseline survives an award being saved over the line. */
  @Input() lineDeal: ((itemName: string, line: any) => { cost: number | null; supplierId: string | null } | null) | null = null;

  private dealOf(d: AbstractControl): { cost: number | null; supplierId: string | null } | null {
    if (!this.lineDeal) return null;
    const itemName = String(d.parent?.parent?.get('itemName')?.value || '');
    return this.lineDeal(itemName, d.value);
  }

  private dealCost(d: AbstractControl): number | null {
    const deal = this.dealOf(d);
    if (deal?.cost != null) {
      this.baseCosts.set(d, deal.cost);
      this.baseSuppliers.set(d, deal.supplierId || this.baseSuppliers.get(d) || String(d.get('supplierId')?.value || ''));
      return deal.cost;
    }
    if (!this.baseCosts.has(d)) {
      this.baseCosts.set(d, Number(d.get('dealUnitCost')?.value) || Number(d.get('unitCost')?.value) || null);
      this.baseSuppliers.set(d, String(d.get('supplierId')?.value || ''));
    }
    return this.baseCosts.get(d) ?? null;
  }

  /** The deal's cost, but only for the deal's supplier: it is not another supplier's price. */
  private dealCostFor(d: AbstractControl, supplierId: string): number | null {
    const deal = this.dealCost(d);
    const base = this.baseSuppliers.get(d) ?? '';
    return !base || base === supplierId ? deal : null;
  }

  /** A supplier's unit cost for the line: typed on its tab, else its quote, else the deal cost when it is the deal's supplier. */
  private supplierCost(d: AbstractControl, supplierId: string): number | null {
    const deal = this.dealCost(d);
    const typed = this.scopeCosts.get(`${d.get('lineKey')?.value}|${supplierId}`)?.value;
    if (typed != null && Number(typed) > 0) return Number(typed);
    const offer = this.lineOffers?.(d.getRawValue())?.find((o) => o.supplierId === supplierId);
    if (offer?.price != null && Number(offer.price) > 0) return Number(offer.price);
    return this.baseSuppliers.get(d) === supplierId ? deal : null;
  }

  /** Purchase: the line's unit cost minus the deal's (negative = saving), or null while unchanged. */
  unitCostDiff(i: number, j: number, k: number): number | null {
    const d = this.detailsAt(i, j)?.at(k);
    const base = d ? this.baseCosts.get(d) : null;
    if (!d || base == null) return null;
    const diff = this.shownUnitCost(i, j, k) - base;
    return Math.abs(diff) < 0.005 ? null : diff;
  }

  /** Supplier tab: quantity still to award (positive) or over-awarded (negative) for the line, counting this tab's typed quantity; 0 when settled. */
  scopeRemaining(i: number, j: number, k: number): number {
    const d = this.detailsAt(i, j)?.at(k);
    const total = Number(d?.get('quantity')?.value) || 0;
    if (!d || !total || !this.usesScopeQty(i, j, k)) return 0;
    // An untouched tab still carries the default quantity; it only counts once typed or awarded here.
    const ctl = this.scopeQtyControl(i, j, k);
    const mine = this.sharesOf(d).some((s) => s.supplierId === this.supplierScope);
    if (!ctl.dirty && !mine && this.shownQty(i, j, k) === total) return 0;
    const left = total - this.claimedElsewhere(d, this.supplierScope!) - this.shownQty(i, j, k);
    return Math.abs(left) < 0.0001 ? 0 : Math.round(left * 10000) / 10000;
  }

  /** Ticked lines of this tab that cannot be awarded as typed: nothing entered, or more than is left. */
  selectedExceedCount(): number {
    const ticked = this.selectedActiveLines();
    let n = 0;
    this.itemsAt(0).controls.forEach((_, j) => (this.detailsAt(0, j)?.controls || []).forEach((d, k) => {
      if (ticked.includes(d) && (this.scopeRemaining(0, j, k) < 0 || !(this.shownQty(0, j, k) > 0))) n++;
    }));
    return n;
  }

  pillsFor(i: number, j: number, k: number): { id: string; name: string }[] {
    if (!this.isPurchase || !this.linePills) return [];
    const d = this.detailsAt(i, j)?.at(k);
    return d ? this.linePills(d.getRawValue()) : [];
  }

  /** Pills are rebuilt on every check; tracking by supplier keeps the button (and its click) alive. */
  trackPill = (_: number, p: { id: string }): string => p.id;
  /** Purchase mode: a supplier pill was clicked on a line. */
  @Output() offerPicked = new EventEmitter<{ lineKey: string; offer: LineSupplierOffer }>();

  /** Lines and items below this margin % are flagged amber (below zero is always red). Unset until the limit is decided. */
  /** Items loaded with more lines than this start collapsed. Unset until the limit is decided. */
  @Input() autoCollapseLines: number | null = null;
  /**
   * Names this list for the command palette ("Quotation", "Supplier RFQ"); while set, the palette can
   * add products to it. Hosts inside a drawer bind it only while the drawer is open.
   */
  @Input() paletteTargetLabel: string | null = null;

  @Output() totals = new EventEmitter<ItemEntryTotals>();
  @Output() compareClicked = new EventEmitter<{ i: number; j: number; k: number }>();
  @Output() previousJobsClicked = new EventEmitter<void>();
  @Output() createProductRequested = new EventEmitter<CreateProductRequest>();
  /** Purchase mode: the ticked lines (by line key) to put on the picked supplier's RFQ. */
  @Output() addToRfq = new EventEmitter<{ supplierId: string; lineKeys: string[] }>();
  /** Deal mode: which option the user is working in. */
  @Output() optionChanged = new EventEmitter<number>();
  /** What an option tab is called; default "Option N". The RFQ drawer names tabs after their supplier. */
  @Input() optionLabel: ((i: number, meta: any) => string) | null = null;
  /** Rendered next to the tabs for the selected option (RFQ drawer: export that supplier's sheet). */
  @Input() optionExtraTemplate: TemplateRef<any> | null = null;
  @Input() addOptionLabel = 'Add option';
  /** The host adds the option itself (e.g. to carry the selected lines along): the button emits `addOptionClicked` instead. */
  @Input() customAddOption = false;
  @Output() addOptionClicked = new EventEmitter<void>();
  @Input() optionRemoveLabel = 'Remove option';
  /** Capitalised name used in the "… removed" undo message. */
  @Input() optionNoun = 'Option';

  tabLabel(i: number): string {
    return this.optionLabel?.(i, this.optionalItems.at(i)?.get('meta')?.value) ?? `Option ${i + 1}`;
  }

  selectedOption = 0;
  /** Deal mode: the quoted numbers each line was seeded with, for restoring on untick. */
  private originals = new WeakMap<FormGroup, ItemEntryLineValue>();
  /** What the template binds; either the host's list or the one loaded from SupplierService. */
  resolvedSupplierOptions: SfOption[] = [];

  /** Keyed `i-j` for item names and `i-j-k` for descriptions. */
  suggestions: Record<string, ItemSuggestion[]> = {};
  activeSuggestionKey: string | null = null;
  /** Keyboard-highlighted row in the open dropdown; -1 means nothing highlighted, `rows.length` means the "Create product" row. */
  highlightedIndex = -1;

  /** Catalogue palette: the item it adds lines to, or null when closed. */
  palette: { i: number; j: number } | null = null;
  paletteTerm = '';
  paletteRows: ItemSuggestion[] = [];
  paletteIndex = 0;
  paletteLoading = false;
  /** The term the rows belong to, and whether the server may hold more under it. */
  paletteQuery = '';
  paletteMore = false;
  paletteFetching = false;
  /** Lines added in this palette session, shown as feedback since the palette stays open. */
  paletteAdded = 0;
  /** The item card the user last worked in; Ctrl+K opens the palette for it. */
  private lastItem: { i: number; j: number } | null = null;
  private lastLine: { i: number; j: number; k: number } | null = null;
  private paletteSearch$ = new Subject<string>();
  /** Focuses the palette's search box as soon as it renders. */
  @ViewChild('paletteInput') set paletteInput(ref: ElementRef<HTMLInputElement> | undefined) {
    if (ref) setTimeout(() => ref.nativeElement.focus());
  }

  private search$ = new Subject<{ key: string; term: string; category: string }>();
  private subs = new Subscription();
  /** Guards the cost/margin/price derivation from re-entering itself. */
  private deriving = false;
  imageUploads: Record<string, boolean> = {};
  imagePreviews: Record<string, string> = {};
  imagePreviewLoading: Record<string, boolean> = {};
  imageErrors: Record<string, string> = {};

  constructor(
    private _fb: FormBuilder,
    private alerts: AlertService,
    private _supplierService: SupplierService,
    private _masterList: MasterListService,
    private _activeItemEntry: ActiveItemEntryService,
    private _modal: ModalService,
    private _palette: CommandPaletteService,
    private _quotationService: QuotationService,
    @Optional() @Inject(ITEM_SUGGESTION_SOURCE) private _providedSource: ItemSuggestionSource | null,
  ) {}

  ngOnInit(): void {
    // A deal form mounts this twice (line table on step 1, totals-only on step 2) over one shared
    // FormArray; the second mount must keep the ticked lines/suppliers instead of re-seeding them.
    const alreadyFilled = this.isDeal && this.optionalItems.length > 0;
    if (this.seedOptionalItems?.length && !alreadyFilled) this.patchOptions(this.seedOptionalItems);
    else if (!this.optionalItems.length) this.addOption();

    this.subs.add(this.optionalItems.valueChanges.subscribe(() => this.emitTotals()));

    if (!this.isDeal) {
      const self = this;
      this.unregisterTarget = this._activeItemEntry.register({
        get label() { return self.paletteTargetLabel || ''; },
        canAdd: () => !!this.paletteTargetLabel && !this.itemsHidden,
        supplier: () => {
          const meta = this.optionalItems.at(this.selectedOption)?.get('meta')?.value;
          return meta?.supplierId ? { supplierId: String(meta.supplierId), supplierName: meta.supplierName || '' } : null;
        },
        addProducts: (products) => this.addCatalogueProducts(products),
      });
    }

    if (this.availabilityOptions) this.resolvedAvailabilityOptions = this.availabilityOptions;
    else this.subs.add(this._masterList.getOptions('availability', { fallback: DEFAULT_AVAILABILITY_OPTIONS.map((o) => o.label) })
      .subscribe((opts) => (this.resolvedAvailabilityOptions = this.withSavedAvailability(opts))));

    this.loadUnits();

    if (this.supplierOptions) this.resolvedSupplierOptions = this.supplierOptions;
    else this.subs.add(this._supplierService.supplierList(true).subscribe({
      next: (res) => (this.resolvedSupplierOptions = (res?.data || []).map((s: any) => ({ label: s.supplierName, value: s._id }))),
    }));

    this.subs.add(
      this.search$
        .pipe(
          debounceTime(300),
          distinctUntilChanged((a, b) => a.key === b.key && a.term === b.term),
          // An empty term is the "close" signal: it cancels any in-flight lookup so a late response can't reopen the popup.
          switchMap(({ key, term, category }) => term ? this.fetchSuggestions(key, term, category) : of({ key, rows: [] as ItemSuggestion[] })),
        )
        .subscribe(({ key, rows }) => {
          this.suggestions[key] = rows;
          this.highlightedIndex = rows.length ? 0 : -1;
          // A description field (3-part key) still opens on zero matches, to offer "+ Create product".
          const isDetailKey = key.split('-').length === 3;
          this.activeSuggestionKey = rows.length || (isDetailKey && this.allowCreateProduct) ? key : null;
        }),
    );

    this.subs.add(
      this.paletteSearch$
        .pipe(
          debounceTime(200),
          distinctUntilChanged(),
          // The palette searches the whole catalogue, not just the item's category: it is for finding.
          tap((term) => (this.paletteQuery = term)),
          switchMap((term) => term.length >= 2 ? this.fetchSuggestions('palette', term, '', { skip: 0, limit: PALETTE_PAGE }) : of({ key: 'palette', rows: [] as ItemSuggestion[] })),
        )
        .subscribe(({ rows }) => {
          this.paletteRows = rows;
          this.paletteMore = rows.length >= PALETTE_PAGE;
          this.paletteIndex = 0;
          this.paletteLoading = false;
        }),
    );

    this.emitTotals();
  }

  private savedUnits = new Set<string>();
  private masterUnits: SfOption[] = [];

  private loadUnits(): void {
    this.subs.add(this._masterList.getOptions('unit').subscribe((opts) => {
      this.masterUnits = opts;
      this.resolveUnits();
    }));
  }

  refreshSuppliers(): void {
    if (this.supplierOptions) return;
    this.subs.add(this._supplierService.supplierList(true).subscribe({
      next: (res) => (this.resolvedSupplierOptions = (res?.data || []).map((supplier: any) => ({
        label: supplier.supplierName,
        value: supplier._id,
      }))),
    }));
  }

  private resolveUnits(): void {
    const missing = [...this.savedUnits].filter((v) => !this.masterUnits.some((o) => String(o.value).toLowerCase() === v.toLowerCase()));
    this.resolvedUomOptions = [...missing.map((v) => ({ label: v, value: v })), ...this.masterUnits];
  }

  /** The master list's spelling of a unit ("NOS" -> "Nos"), so one unit never shows up in two cases. */
  private canonicalUnit(value?: string | null): string {
    const v = (value ?? '').toString().trim();
    const match = this.masterUnits.find((o) => String(o.value).toLowerCase() === v.toLowerCase());
    return match ? String(match.value) : v;
  }

  private keepUnit(value?: string | null): void {
    const v = this.canonicalUnit(value);
    if (!v || this.savedUnits.has(v) || this.masterUnits.some((o) => o.value === v)) return;
    this.savedUnits.add(v);
    this.resolveUnits();
  }

  /** Same quick-add dialog the product form uses for its master lists. */
  openAddMasterOption(list: 'unit' | 'availability', control: AbstractControl | null): void {
    const title = list === 'unit' ? 'Unit of Measure' : 'Availability';
    const create: QuickAddDialogData['create'] = (name) => this._masterList.createItem(list, { label: name, value: null });
    this.subs.add(this._modal.open<any, QuickAddDialogData>(QuickAddDialogComponent, { width: '480px', data: { title, create } })
      .afterClosed().subscribe((res) => {
        const name = res?.data?.label;
        if (!name) return;
        if (list === 'unit') { this.masterUnits = [...this.masterUnits, { label: name, value: name }]; this.resolveUnits(); }
        else this.resolvedAvailabilityOptions = this.withSavedAvailability([...this.resolvedAvailabilityOptions, { label: name, value: name }]);
        control?.setValue(name);
        control?.markAsDirty();
      }));
  }

  /** Anyone can add a list option from the dropdown; hiding and deleting stay in Settings. */
  addMasterOption(list: 'unit' | 'availability', label: string, control: AbstractControl | null): void {
    this.subs.add(this._masterList.createItem(list, { label, value: null }).subscribe({
      next: (res) => {
        const name = res.data?.label ?? label;
        if (list === 'unit') { this.masterUnits = [...this.masterUnits, { label: name, value: name }]; this.resolveUnits(); }
        else this.resolvedAvailabilityOptions = this.withSavedAvailability([...this.resolvedAvailabilityOptions, { label: name, value: name }]);
        control?.setValue(name);
        control?.markAsDirty();
      },
      error: (e) => this.alerts.error(e?.error?.message || 'Could not add option'),
    }));
  }

  /** Saved lines may carry a value since removed from the master list; keep it selectable. */
  private savedAvailability = new Set<string>();

  private keepAvailability(value?: string | null): void {
    if (!value) return;
    this.savedAvailability.add(value);
    this.resolvedAvailabilityOptions = this.withSavedAvailability(this.resolvedAvailabilityOptions);
  }

  private withSavedAvailability(options: SfOption[]): SfOption[] {
    const all = [...options, ...this.extraAvailabilityOptions.filter((e) => !options.some((o) => o.value === e.value))];
    const missing = [...this.savedAvailability].filter((v) => !all.some((o) => o.value === v));
    return [...missing.map((v) => ({ label: v, value: v })), ...all];
  }

  /**
   * A host that keeps this component mounted across wizard steps delivers a late seed (an enquiry
   * picked after mount) through an input change rather than through ngOnInit.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['supplierOptions'] && this.supplierOptions) this.resolvedSupplierOptions = this.supplierOptions;
    if (changes['lineLocked'] && !changes['lineLocked'].isFirstChange()) this.applyLineLocks();

    const seed = changes['seedOptionalItems'];
    if (!seed || seed.isFirstChange() || !this.seedOptionalItems?.length) return;
    this.patchOptions(this.seedOptionalItems);
  }

  ngOnDestroy(): void {
    this.codeLookupTimers.forEach((timer) => clearTimeout(timer));
    this.codeLookupTimers.clear();
    this.subs.unsubscribe();
    this.unregisterTarget?.();
    Object.keys(this.imagePreviews).forEach((key) => this.closeImagePreview(key));
  }

  private unregisterTarget?: () => void;

  get isDeal(): boolean { return this.mode === 'deal'; }
  get isQuote(): boolean { return this.mode === 'quote'; }
  get isPurchase(): boolean { return this.mode === 'purchase'; }
  /** Purchase mode only: lay lines out like a quotation (editable item code and part no, a read-only Margin column). Rules stay purchase rules. */
  @Input() quoteLayout = false;
  /** The compact purchase strip: no margin column, item code shown read-only. */
  get dropsMargin(): boolean { return this.isPurchase && !this.quoteLayout; }
  get isRfq(): boolean { return this.mode === 'rfq'; }
  /** Flat single-list modes: no options and no optional items. */
  get isFlat(): boolean { return this.isPurchase || this.isRfq; }
  /** RFQ mode opts in through allowOptions (each tab is one supplier); purchase stays flat. */
  get optionsEnabled(): boolean { return this.allowOptions && !this.isPurchase; }
  get optionalItemsEnabled(): boolean { return this.allowOptionalItems && !this.isFlat; }

  /** Awarded lines the user chose to edit anyway (purchase mode). */
  private unlockedLines = new WeakSet<object>();

  /** True when the host locks the line and the user hasn't unlocked it. */
  isLineLocked(i: number, j: number, k: number): boolean {
    if (!this.isPurchase || !this.lineLocked?.(i, j, k)) return false;
    const line = this.detailsAt(i, j)?.at(k);
    return !(line && this.unlockedLines.has(line));
  }

  /** The host locks this line but the user can lift the lock. */
  isLineUnlockable(i: number, j: number, k: number): boolean {
    return this.isPurchase && !!this.lineLocked?.(i, j, k);
  }

  isLineUnlocked(i: number, j: number, k: number): boolean {
    return this.isLineUnlockable(i, j, k) && !this.isLineLocked(i, j, k);
  }

  toggleLineLock(i: number, j: number, k: number): void {
    const line = this.detailsAt(i, j)?.at(k);
    if (!line) return;
    if (this.unlockedLines.has(line)) this.unlockedLines.delete(line);
    else this.unlockedLines.add(line);
    this.applyLineLocks();
  }

  isItemLocked(i: number, j: number): boolean {
    if (!this.isPurchase || !this.lineLocked) return false;
    return (this.detailsAt(i, j)?.controls || []).some((_, k) => this.isLineLocked(i, j, k));
  }

  badgeFor(i: number, j: number, k: number): string | null {
    return this.isPurchase && this.lineBadge ? this.lineBadge(i, j, k) : null;
  }

  compareLabelFor(i: number, j: number, k: number): string {
    return this.compareLabel?.(i, j, k) || 'Compare';
  }

  supplierLabel(id: string | null): string {
    return (id && this.resolvedSupplierOptions.find((o) => o.value === id)?.label) || '—';
  }

  /** Informational only in purchase mode: nothing writes it back to the price. */
  /** Supplier costs typed under a tab for a supplier that is not the line's own; kept per line and supplier, never written to the line. */
  private scopeCosts = new Map<string, FormControl<number | null>>();

  /** Purchase supplier tab: true when the line's cost here belongs to the tab's supplier and not to the line (its default or awarded supplier owns the line's cost). */
  usesScopeCost(i: number, j: number, k: number): boolean {
    const d = this.detailsAt(i, j)?.at(k);
    if (!d || !this.isPurchase || !this.supplierScope || !d.get('lineKey')?.value) return false;
    return String(d.get('supplierId')?.value || '') !== this.supplierScope || this.sharesOf(d).length > 1;
  }

  scopeCostControl(i: number, j: number, k: number): FormControl<number | null> {
    const d = this.detailsAt(i, j)!.at(k);
    const key = `${d.get('lineKey')?.value}|${this.supplierScope}`;
    let c = this.scopeCosts.get(key);
    if (!c) {
      const offer = this.lineOffers?.(d.getRawValue())?.find((o) => o.supplierId === this.supplierScope);
      // A cost awarded to another supplier is not this supplier's: fall back to the deal's cost only while nobody has won the line,
      // and only for the deal's own supplier; any other supplier starts empty until its price is typed.
      const won = this.sharesOf(d);
      const mine = won.find((s) => s.supplierId === this.supplierScope)?.cost || null;
      c = new FormControl<number | null>(mine ?? offer?.price ?? (won.length ? null : this.dealCostFor(d, this.supplierScope ?? '')));
      this.scopeCosts.set(key, c);
      this.scopeCostSeeds.set(key, c.value);
    }
    return c;
  }

  /** This supplier's latest quote for the product on another request, shown as a hint on its tab. */
  previousQuote(i: number, j: number, k: number): SalesRfqPastQuote | null {
    const d = this.detailsAt(i, j)?.at(k);
    if (!d || !this.supplierScope) return null;
    return this.lineOffers?.(d.getRawValue())?.find((o) => o.supplierId === this.supplierScope)?.previous ?? null;
  }

  /** Warning when this request plus what was already awarded to the supplier elsewhere passes the quantity they quoted. */
  previousQuoteOver(i: number, j: number, k: number): string | null {
    const pq = this.previousQuote(i, j, k);
    if (!pq || !(pq.quantity > 0)) return null;
    const need = Number(this.scopeQtyControl(i, j, k).value) || 0;
    const total = need + (pq.awardedQty || 0);
    return total > pq.quantity ? `${total} of ${pq.quantity} quoted` : null;
  }

  /** What each tab's cost started as, to tell a price the buyer typed from one the tab only showed. */
  private scopeCostSeeds = new Map<string, number | null>();

  /** What a supplier tab holds for a line, for saving it as that supplier's RFQ: the tab's quantity, and its cost only once typed over. */
  scopeEdit(lineKey: string, supplierId: string): { quantity: number | null; unitCost: number | null } {
    const key = `${lineKey}|${supplierId}`;
    const qty = Number(this.scopeQtys.get(key)?.value);
    const cost = this.scopeCosts.get(key);
    const typed = cost?.value != null && Number(cost.value) >= 0 && Number(cost.value) !== (this.scopeCostSeeds.get(key) ?? null);
    return { quantity: qty > 0 ? qty : null, unitCost: typed ? Number(cost!.value) : null };
  }

  /** The unit cost shown on the row: the tab's own figure in a supplier tab, otherwise the line's. */
  private shownUnitCost(i: number, j: number, k: number): number {
    if (this.usesScopeCost(i, j, k)) return Number(this.scopeCostControl(i, j, k).value) || 0;
    return Number(this.detailsAt(i, j)?.at(k)?.get('unitCost')?.value) || 0;
  }

  lineCostShown(i: number, j: number, k: number): number {
    return this.shownQty(i, j, k) * this.shownUnitCost(i, j, k);
  }

  /** Quantities typed under a supplier tab, kept per line and supplier; the line's own quantity changes only when that supplier is awarded. */
  private scopeQtys = new Map<string, FormControl<number | null>>();

  /** Purchase supplier tab: the quantity here belongs to the tab's supplier, not to the line. */
  usesScopeQty(i: number, j: number, k: number): boolean {
    const d = this.detailsAt(i, j)?.at(k);
    return !!d && this.isPurchase && this.quoteLayout && !!this.supplierScope && !!d.get('lineKey')?.value;
  }

  scopeQtyControl(i: number, j: number, k: number): FormControl<number | null> {
    const d = this.detailsAt(i, j)!.at(k);
    const key = `${d.get('lineKey')?.value}|${this.supplierScope}`;
    let c = this.scopeQtys.get(key);
    if (!c) {
      const raw = d.get('quantity')?.value;
      const full = this.dealQty(d) ?? (raw == null || raw === '' ? null : Number(raw));
      // A split line shows this supplier's awarded share, or what is still open, rather than the whole quantity.
      const scope = this.supplierScope ?? '';
      const own = this.sharesOf(d).find((s) => s.supplierId === scope)?.qty;
      const open = full == null ? null : Math.max(0, (Number(raw) || full) - this.claimedElsewhere(d, scope));
      c = new FormControl<number | null>(own ?? (this.sharesOf(d).length ? open : full));
      this.scopeQtys.set(key, c);
    }
    return c;
  }

  /** The quantity shown on the row: the tab's own figure in a supplier tab, otherwise the line's. */
  private shownQty(i: number, j: number, k: number): number {
    if (this.usesScopeQty(i, j, k)) return Number(this.scopeQtyControl(i, j, k).value) || 0;
    return Number(this.detailsAt(i, j)?.at(k)?.get('quantity')?.value) || 0;
  }

  /** The line's first quantity (the deal's); captured once, null while the line has none. */
  private dealQty(d: AbstractControl): number | null {
    let base = this.baseQtys.get(d);
    if (base === undefined) {
      const raw = d.get('quantity')?.value;
      const now = Number(raw);
      if (raw == null || raw === '' || !Number.isFinite(now)) return null;
      base = now;
      this.baseQtys.set(d, base);
    }
    return base;
  }

  lineMargin(i: number, j: number, k: number): number | null {
    const d = this.detailsAt(i, j)?.at(k);
    const c = this.shownUnitCost(i, j, k);
    const p = Number(d?.get('unitSellingPrice')?.value) || 0;
    return c && p ? ((p - c) / p) * 100 : null;
  }

  /** The margin a purchase line started with (the deal's), kept to colour it once a supplier's cost moves it. */
  private baseMargins = new WeakMap<AbstractControl, number>();

  /** Purchase: the line's margin minus the margin it started with (percentage points), or null while unchanged. */
  lineMarginDiff(i: number, j: number, k: number): number | null {
    const d = this.detailsAt(i, j)?.at(k);
    const now = this.lineMargin(i, j, k);
    if (!d || now === null) return null;
    let base = this.baseMargins.get(d);
    const deal = this.dealOf(d)?.cost;
    const price = Number(d.get('unitSellingPrice')?.value) || 0;
    if (deal != null && price > 0) {
      base = ((price - deal) / price) * 100;
      this.baseMargins.set(d, base);
    } else if (base === undefined) {
      const seeded = d.get('profit')?.value;
      base = seeded != null && seeded !== '' && Number.isFinite(Number(seeded)) ? Number(seeded) : now;
      this.baseMargins.set(d, base);
    }
    const diff = now - base;
    return Math.abs(diff) < 0.05 ? null : diff;
  }

  /** The quantity a purchase line started with (the deal's), kept to show how far an edit moved it. */
  private baseQtys = new WeakMap<AbstractControl, number>();

  /** Purchase: the line's total cost minus the cost the deal margin implied (negative = saving), or null while unchanged. */
  lineCostDiff(i: number, j: number, k: number): number | null {
    const d = this.detailsAt(i, j)?.at(k);
    const marginDiff = this.lineMarginDiff(i, j, k);
    const base = d ? this.baseMargins.get(d) : undefined;
    if (!d || marginDiff === null || base === undefined) return null;
    const price = Number(d.get('unitSellingPrice')?.value) || 0;
    const qty = this.shownQty(i, j, k);
    const diff = this.lineCostShown(i, j, k) - qty * price * (1 - base / 100);
    return Math.abs(diff) < 0.005 ? null : diff;
  }

  private static readonly LOCKABLE = ['itemCode', 'partNo', 'detail', 'quantity', 'unitCost', 'profit', 'unitSellingPrice', 'availability', 'supplierId', 'uom'];

  /**
   * Controls are disabled one by one rather than the whole line group: a disabled group would drop
   * out of `optionalItems.value` and shift the indices the totals and the host's lookups rely on.
   */
  applyLineLocks(): void {
    if (!this.isPurchase) return;
    this.optionalItems.controls.forEach((_, i) => {
      this.itemsAt(i)?.controls.forEach((item, j) => {
        const details = this.detailsAt(i, j)?.controls || [];
        let allLocked = details.length > 0;
        details.forEach((line, k) => {
          const locked = this.isLineLocked(i, j, k);
          if (!locked) allLocked = false;
          ItemEntryComponent.LOCKABLE.forEach((name) => {
            const c = line.get(name);
            if (!c) return;
            if (locked && c.enabled) c.disable({ emitEvent: false });
            else if (!locked && c.disabled) c.enable({ emitEvent: false });
          });
        });
        const name = item.get('itemName');
        if (allLocked && name?.enabled) name.disable({ emitEvent: false });
        else if (!allLocked && name?.disabled) name.enable({ emitEvent: false });
      });
    });
  }

  selectOption(i: number): void {
    this.selectedOption = i;
    this.optionChanged.emit(i);
    this.clearSelection();
    this.recompute();
  }

  private get source(): ItemSuggestionSource | null {
    return this.suggestionSource ?? this._providedSource;
  }

  private fetchSuggestions(key: string, term: string, category: string, page?: { skip: number; limit: number }) {
    const source = this.source;
    if (!source) return of({ key, rows: [] as ItemSuggestion[] });
    return source
      .search({ search: term, category, scopeIds: this.scopeIds, ...page })
      .pipe(switchMap((rows) => [{ key, rows: rows || [] }]));
  }

  get parentFormGroup(): FormGroup {
    return this.optionalItems.parent as FormGroup;
  }

  get scopeIds(): string[] {
    if (this.suggestionScopeIds) return this.suggestionScopeIds;
    const departments = this.parentFormGroup?.get('departments')?.value || [];
    return (departments as any[]).map((d) => (typeof d === 'string' ? d : d?._id)).filter(Boolean);
  }

  // --- structure -------------------------------------------------------------

  itemsAt(i: number): FormArray {
    return this.optionalItems.at(i).get('items') as FormArray;
  }

  detailsAt(i: number, j: number): FormArray | null {
    const group = this.itemsAt(i)?.at(j);
    return group instanceof FormGroup ? (group.get('itemDetails') as FormArray) : null;
  }

  private createDetail(): FormGroup {
    if (this.isRfq) return this.createRfqDetail();
    const deal = this.isDeal;
    const purchase = this.isPurchase;
    const group = this._fb.group({
      // Hidden: set only by `applySuggestion`, cleared when the user retypes the line by hand.
      productId: [null as string | null],
      itemCode: [''],
      partNo: [''],
      detail: ['', deal ? [] : Validators.required],
      quantity: [null as number | null, deal ? [this.whenTicked(Validators.required), Validators.min(0)] : [Validators.required, Validators.min(0)]],
      unitCost: [null as number | null, deal ? [this.whenTicked(Validators.required), Validators.min(0)] : [Validators.required, Validators.min(0)]],
      // A deal may sell below cost, so no negative-margin rule there.
      profit: [null as number | null, deal ? [this.whenTicked(Validators.required), this.whenTicked(Validators.max(99.99))] : purchase ? [] : [Validators.required, Validators.min(0), Validators.max(99.99), this.nonNegativeProfitValidator()]],
      unitSellingPrice: [null as number | null, deal ? [this.whenTicked(Validators.required), Validators.min(0)] : purchase ? [Validators.min(0)] : [Validators.required, Validators.min(0)]],
      availability: ['', deal || purchase ? [] : Validators.required],
      // null, not '': the server casts this to an ObjectId and an empty string fails the cast.
      supplierId: [null as string | null, deal ? [this.whenTicked(this.supplierRequired)] : []],
      uom: ['', deal || purchase ? [] : Validators.required],
      image: [null],
    });
    if (purchase) {
      (group as FormGroup).addControl('lineKey', this._fb.control(null as string | null));
      (group as FormGroup).addControl('dealUnitCost', this._fb.control(null as number | null));
    }
    if (deal) {
      (group as FormGroup).addControl('dealSelected', this._fb.control(false));
      // Every line is listed read-only; ticking it unlocks just that row for editing.
      const editable = ['quantity', 'unitCost', 'profit', 'unitSellingPrice', 'supplierId'];
      const lock = (on: boolean) => editable.forEach((name) =>
        on ? group.get(name)!.enable({ emitEvent: false }) : group.get(name)!.disable({ emitEvent: false }));
      lock(false);
      this.subs.add(group.get('dealSelected')!.valueChanges.subscribe((on) => {
        if (!on) {
          const quoted = this.originals.get(group);
          // Prices go back to the quoted ones, but a supplier already picked stays for when the line is ticked again.
          if (quoted) this.writeDetail(group, { ...quoted, supplierId: group.get('supplierId')?.value ?? quoted.supplierId ?? null, dealSelected: false });
        }
        lock(!!on);
        editable.forEach((name) => group.get(name)!.updateValueAndValidity({ emitEvent: false }));
      }));
    }

    // The smart-form controls are value accessors, so pricing is derived from the control stream
    // rather than from DOM events. `emitEvent: false` on the write-back stops the two rules looping.
    const price = () => group.get('unitSellingPrice')!;
    const margin = () => group.get('profit')!;
    const cost = () => group.get('unitCost')!;

    const fromCostAndMargin = () => {
      if (this.deriving) return;
      const c = Number(cost().value) || 0;
      const m = Number(margin().value) / 100;
      if (!c || !Number.isFinite(m) || m >= 1) return;
      this.deriving = true;
      price().setValue(Math.ceil(c / (1 - m)), { emitEvent: false });
      this.deriving = false;
    };

    // A purchase line's cost (what we pay) and price (what the deal sold it at) are separate facts.
    if (purchase) return group;

    this.subs.add(cost().valueChanges.subscribe(fromCostAndMargin));
    this.subs.add(margin().valueChanges.subscribe(fromCostAndMargin));
    this.subs.add(price().valueChanges.subscribe(() => {
      if (this.deriving) return;
      const c = Number(cost().value) || 0;
      const p = Number(price().value) || 0;
      // Re-emitting the price that was derived from this margin (e.g. on blur) must not rewrite the margin: 25 would drift to 25.04.
      const m = Number(margin().value) / 100;
      if (c && p && margin().value != null && Number.isFinite(m) && m < 1 && Math.ceil(c / (1 - m)) === p) return;
      this.deriving = true;
      margin().setValue(c && p ? Number((((p - c) / p) * 100).toFixed(2)) : null, { emitEvent: false });
      this.deriving = false;
    }));

    return group;
  }

  /** An RFQ line: what is asked for, and (once the supplier replies) its unit price in `unitCost`. */
  private createRfqDetail(): FormGroup {
    return this._fb.group({
      productId: [null as string | null],
      itemCode: [''],
      partNo: [''],
      detail: ['', Validators.required],
      quantity: [null as number | null, [Validators.required, Validators.min(0.0001)]],
      unitCost: [null as number | null, [Validators.min(0)]],
      profit: [null as number | null],
      unitSellingPrice: [null as number | null],
      availability: [''],
      paymentTerms: [''],
      deliveryTerms: [''],
      remarks: [''],
      offeredQty: [null as number | null, [Validators.min(0)]],
      alternative: [''],
      supplierId: [null as string | null],
      uom: [''],
      lineKey: [ItemEntryComponent.newLineKey()],
    });
  }

  static newLineKey(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  private createItem(isOptional = false): FormGroup {
    return this._fb.group({
      itemName: ['', this.flat ? [] : Validators.required],
      isOptional: [isOptional],
      includeInTotal: [false],
      itemDetails: this._fb.array([this.createDetail()]),
    });
  }

  /** Back to a single blank option. The host calls this when its form is reset. */
  reset(): void {
    this.optionalItems.clear();
    this.addOption();
    this.selectedOption = 0;
    this.emitTotals();
  }

  /** A discount larger than what is being sold would make the final total negative. */
  private discountWithinTotal: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const discount = Number(group.get('totalDiscount')?.value) || 0;
    if (!discount) return null;
    let selling = 0;
    ((group.get('items') as FormArray | null)?.getRawValue() || []).forEach((item: any) => {
      if (!this.countsTowardsTotal(item)) return;
      (item.itemDetails || []).forEach((d: any) => {
        if (this.isDeal && !d.dealSelected) return;
        selling += (Number(d.quantity) || 0) * (Number(d.unitSellingPrice) || 0);
      });
    });
    return discount > selling + 0.005 ? { discountExceedsTotal: true } : null;
  };

  private optionGroup(items: FormArray, totalDiscount: number | null, meta: any): FormGroup {
    return this._fb.group({
      items,
      totalDiscount: [totalDiscount, [Validators.min(0)]],
      meta: [meta ?? null],
    }, { validators: [this.discountWithinTotal] });
  }

  onAddOptionClick(): void {
    if (this.customAddOption) this.addOptionClicked.emit();
    else this.addOption();
  }

  addOption(): void {
    this.optionalItems.push(this.optionGroup(this._fb.array([this.createItem()]), null, null));
    this.selectedOption = this.optionalItems.length - 1;
    this.seedMargin(this.selectedOption, 0, 0);
    // Deferred: the first option is added while the editor initialises, inside the host's change detection.
    const added = this.selectedOption;
    Promise.resolve().then(() => this.optionChanged.emit(added));
  }

  removeOption(i: number): void {
    if (this.optionalItems.length <= 1) return;
    this.removedOptions.push({ option: this.optionalItems.at(i).value, i });
    this.optionalItems.removeAt(i);
    this.selectedOption = Math.max(0, Math.min(this.selectedOption, this.optionalItems.length - 1));
    this.optionChanged.emit(this.selectedOption);
    this.offerUndo('option');
  }

  addItem(i: number, isOptional = false): void {
    this.itemsAt(i).push(this.createItem(isOptional));
    this.seedMargin(i, this.itemsAt(i).length - 1, 0);
  }

  removeItem(i: number, j: number): void {
    if (this.itemsAt(i).length <= 1) return;
    this.removedItems.push({ item: this.itemsAt(i).at(j).value, i, j });
    this.itemsAt(i).removeAt(j);
    this.offerUndo('item');
  }

  addDetail(i: number, j: number): void {
    const details = this.detailsAt(i, j);
    if (!details) return;
    details.push(this.createDetail());
    this.seedMargin(i, j, details.length - 1);
    const id = `${this.itemDomId(i, j)}-l${details.length - 1}`;
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  removeDetail(i: number, j: number, k: number): void {
    const details = this.detailsAt(i, j);
    if (!details || details.length <= 1) return;
    this.removedItemDetails.push({ item: details.at(k).value, i, j, k });
    details.removeAt(k);
    this.offerUndo('line');
  }

  /** Wipes every field of the line but keeps its row. */
  clearDetail(i: number, j: number, k: number): void {
    const details = this.detailsAt(i, j);
    if (!details || !details.at(k)) return;
    details.setControl(k, this.createDetail());
    this.seedMargin(i, j, k);
    details.markAsDirty();
    this.recompute();
    this.emitTotals();
  }

  dropItem(event: CdkDragDrop<AbstractControl[]>, i: number): void {
    if (event.previousIndex === event.currentIndex) return;
    const items = this.itemsAt(i);
    moveItemInArray(items.controls, event.previousIndex, event.currentIndex);
    items.updateValueAndValidity();
    items.markAsDirty();
  }

  dropDetail(event: CdkDragDrop<AbstractControl[] | undefined>, i: number, j: number): void {
    if (event.previousIndex === event.currentIndex) return;
    const details = this.detailsAt(i, j);
    if (!details) return;
    moveItemInArray(details.controls, event.previousIndex, event.currentIndex);
    details.updateValueAndValidity();
    details.markAsDirty();
  }

  /** Rebuilds the array from a plain-object list (enquiry estimations) without losing validators. */
  patchOptions(options: ItemEntryOptionValue[]): void {
    this.optionalItems.clear();
    options.forEach((option) => {
      // Flat mode shows one list of lines, so every saved group is folded into a single group.
      const source = this.flat && (option.items || []).length > 1
        ? [{ ...option.items![0], itemDetails: option.items!.flatMap((item) => item.itemDetails || []) }]
        : option.items || [];
      const items = source.map((item) => {
        const details = (item.itemDetails || []).map((d) => {
          const group = this.createDetail();
          this.writeDetail(group, d);
          return group;
        });
        const itemGroup = this.createItem(!!item.isOptional);
        itemGroup.setControl('itemDetails', this._fb.array(details.length ? details : [this.createDetail()]));
        itemGroup.patchValue({ itemName: item.itemName ?? '', includeInTotal: !!item.includeInTotal });
        if (this.autoCollapseLines != null && details.length > this.autoCollapseLines) this.collapsed.add(itemGroup);
        return itemGroup;
      });
      this.optionalItems.push(this.optionGroup(this._fb.array(items.length ? items : [this.createItem()]), option.totalDiscount ?? null, option.meta));
    });
    if (!this.optionalItems.length) this.addOption();
    this.selectedOption = 0;
    this.applyLineLocks();
    this.emitTotals();
  }

  /** Runs `validator` only while the line is ticked into the deal. */
  private whenTicked(validator: ValidatorFn): ValidatorFn {
    return (control) => (control.parent?.get('dealSelected')?.value ? validator(control) : null);
  }

  private supplierRequired: ValidatorFn = (control) => (control.value ? null : { supplierRequired: true });

  /** Writes a stored/imported line without letting the pricing rules overwrite the saved price. */
  private writeDetail(group: FormGroup, d: ItemEntryLineValue): void {
    const cost = d.unitCost != null ? Number(d.unitCost) : null;
    const price = d.unitSellingPrice != null ? Number(d.unitSellingPrice) : null;
    // Purchase: the deal's cost is remembered on the line, so awarding a supplier never moves the baseline the diffs are measured from.
    const dealRaw = (d as any).dealUnitCost;
    const dealUnitCost = this.isPurchase ? (Number(dealRaw) > 0 ? Number(dealRaw) : cost) : null;
    const profit = this.isPurchase && dealUnitCost && price
      ? Number((((price - dealUnitCost) / price) * 100).toFixed(2))
      : d.profit != null && (d.profit as any) !== ''
        ? Number(d.profit)
        : cost && price ? Number((((price - cost) / price) * 100).toFixed(2)) : null;

    if (this.isDeal && !this.originals.has(group)) this.originals.set(group, { ...d });
    this.keepAvailability(d.availability);
    this.keepUnit(d.uom);
    this.deriving = true;
    group.patchValue({
      productId: (typeof d.productId === 'object' ? d.productId?._id : d.productId) || null,
      itemCode: d.itemCode ?? '',
      partNo: d.partNo ?? '',
      detail: d.detail ?? '',
      quantity: d.quantity != null ? Number(d.quantity) : null,
      unitCost: cost,
      profit,
      unitSellingPrice: price,
      availability: d.availability ?? '',
      ...(this.isRfq ? { paymentTerms: d.paymentTerms ?? '', deliveryTerms: d.deliveryTerms ?? '', remarks: d.remarks ?? '', offeredQty: d.offeredQty ?? null, alternative: d.alternative ?? '' } : {}),
      supplierId: (typeof d.supplierId === 'object' ? d.supplierId?._id : d.supplierId) || null,
      uom: this.canonicalUnit(d.uom),
      image: d.image ?? null,
      ...(this.isPurchase ? { lineKey: d.lineKey ?? null, dealUnitCost } : {}),
      // An RFQ line keeps the key it was created with unless the record already has one.
      ...(this.isRfq && d.lineKey ? { lineKey: d.lineKey } : {}),
    }, { emitEvent: false });
    this.deriving = false;
    if (this.isDeal && d.dealSelected) group.get('dealSelected')?.setValue(true);
    group.updateValueAndValidity();
  }

  imageKey(i: number, j: number, k: number): string {
    return `${i}-${j}-${k}`;
  }

  imageUrl(image: { fileName?: string } | null | undefined): string {
    return image?.fileName ? this._quotationService.itemImageUrl(image.fileName) : '';
  }

  uploadImage(event: Event, i: number, j: number, k: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const key = this.imageKey(i, j, k);
    this.imageErrors[key] = '';
    if (!file.type.startsWith('image/')) {
      this.imageErrors[key] = 'Choose an image file.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.imageErrors[key] = 'Maximum size is 5 MB.';
      return;
    }
    this.imageUploads[key] = true;
    const detail = this.detailsAt(i, j)?.at(k);
    const partNumber = detail?.get('partNo')?.value || detail?.get('itemCode')?.value || '';
    this._quotationService.uploadItemImage(file, this.quoteReference, partNumber).subscribe({
      next: (image) => {
        detail?.get('image')?.setValue(image);
        this.imageUploads[key] = false;
      },
      error: (error) => {
        this.imageUploads[key] = false;
        this.imageErrors[key] = error?.error?.message || 'Image upload failed.';
      },
    });
  }

  /** Opens the shared full-screen viewer; the image is fetched with auth and shown from a blob URL. */
  toggleImagePreview(i: number, j: number, k: number): void {
    const key = this.imageKey(i, j, k);
    const fileName = this.detailsAt(i, j)?.at(k).get('image')?.value?.fileName;
    if (!fileName) return;
    this.imageErrors[key] = '';
    this.imagePreviewLoading[key] = true;
    this._quotationService.itemImageBlob(fileName).subscribe({
      next: (blob) => {
        this.closeImagePreview(key);
        this.imagePreviews[key] = URL.createObjectURL(blob);
        this.imagePreviewLoading[key] = false;
      },
      error: () => {
        this.imagePreviewLoading[key] = false;
        this.imageErrors[key] = 'Could not load the image.';
      },
    });
  }

  closeImagePreview(key: string): void {
    const url = this.imagePreviews[key];
    if (url) URL.revokeObjectURL(url);
    delete this.imagePreviews[key];
  }

  removeImage(i: number, j: number, k: number): void {
    this.closeImagePreview(this.imageKey(i, j, k));
    this.detailsAt(i, j)?.at(k).get('image')?.setValue(null);
    this.imageErrors[this.imageKey(i, j, k)] = '';
  }

  /** Appends items copied from elsewhere (previous jobs, a template) into the selected option. */
  addItems(items: ItemEntryItemValue[]): void {
    if (!items?.length) return;
    const i = this.selectedOption ?? 0;

    items.forEach((item) => {
      const itemsArray = this.itemsAt(i);
      const first = itemsArray.length ? (itemsArray.at(0) as FormGroup) : null;

      let target: FormGroup;
      if (first && this.isItemEmpty(first)) {
        target = first;
      } else {
        this.addItem(i);
        target = itemsArray.at(itemsArray.length - 1) as FormGroup;
      }
      target.get('itemName')?.setValue(item.itemName);

      const details = target.get('itemDetails') as FormArray;
      (item.itemDetails || []).forEach((d, index) => {
        if (index > 0) details.push(this.createDetail());
        this.writeDetail(details.at(index) as FormGroup, d);
      });
    });

    this.emitTotals();
  }

  /**
   * Adds catalogue products as lines (from the command palette): each goes under the item named after
   * its category, reusing that item or a blank one, at one unit. Returns how many lines were added.
   */
  addCatalogueProducts(products: ItemSuggestion[]): number {
    const i = this.selectedOption ?? 0;
    let added = 0;
    products.forEach((s) => {
      const itemsArray = this.itemsAt(i);
      if (!itemsArray) return;
      const norm = (v: unknown) => (v ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
      const name = norm(s.categoryName || 'Items');
      let j = itemsArray.controls.findIndex((g) => norm(g.get('itemName')?.value) === name);
      if (j < 0) j = itemsArray.controls.findIndex((g) => this.isItemEmpty(g as FormGroup));
      if (j < 0) {
        this.addItem(i);
        j = itemsArray.length - 1;
      }
      const details = this.detailsAt(i, j);
      if (!details) return;
      const last = details.at(details.length - 1) as FormGroup | undefined;
      const blank = last && !(last.get('detail')?.value || '').toString().trim() && !last.get('productId')?.value;
      if (!blank) details.push(this.createDetail());
      const k = details.length - 1;
      this.applySuggestion(i, j, k, s);
      const itemName = this.itemsAt(i).at(j).get('itemName');
      if (!(itemName?.value || '').toString().trim()) itemName?.setValue(s.categoryName || 'Items', { emitEvent: false });
      const line = details.at(k);
      if (line.get('quantity')?.value == null) line.get('quantity')?.setValue(1);
      added++;
    });
    this.emitTotals();
    return added;
  }

  // --- Excel import / export ---------------------------------------------------

  /** Off by default: a module opts in. Shows "Import Excel" and "Template", filling lines from a sheet into the selected option. */
  @Input() allowExcelImport = false;
  /** Off by default: shows "Export Excel", downloading the selected option's lines. */
  @Input() allowExcelExport = false;
  /** File name stem for the export and template downloads. */
  @Input() excelFileName = 'items';

  @ViewChild('excelFile') excelFile?: ElementRef<HTMLInputElement>;
  excelBusy = false;

  /** Set false when the host shows its own Import/Export buttons (e.g. a drawer footer) and calls pickExcelFile / exportExcel / downloadExcelTemplate. */
  @Input() excelToolbar = true;
  /** Details written above the table on export (e.g. the RFQ's terms); the same labels found on import come back through `excelMetaImported`. */
  @Input() excelMeta: () => ItemSheetMeta[] = () => [];
  /** Details read from above the table of an imported sheet, keyed by lower-cased label. */
  @Output() excelMetaImported = new EventEmitter<Record<string, string>>();

  pickExcelFile(): void {
    this.excelFile?.nativeElement.click();
  }

  get excelEnabled(): boolean {
    return (this.allowExcelImport || this.allowExcelExport) && !this.isDeal && !this.isPurchase && !this.itemsHidden;
  }

  private get excelColumns() {
    return itemSheetColumns(this.mode, this.rfqQuoted);
  }

  downloadExcelTemplate(): void {
    void downloadItemsTemplate(this.excelColumns, `${this.excelFileName}-template.xlsx`, this.excelMeta());
  }

  async exportExcel(): Promise<void> {
    const option = this.optionalItems.getRawValue()[this.selectedOption];
    const rows = await exportItemsSheet(option?.items || [], this.excelColumns, `${this.excelFileName}.xlsx`, this.excelMeta());
    if (!rows) this.alerts.info('Nothing to export', 'Add at least one line first.');
  }

  async onExcelFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.excelBusy = true;
    try {
      const result = await readItemsSheet(file, this.excelColumns);
      if (!result.imported) {
        this.alerts.warning('Nothing imported', result.skipped.slice(0, 5).join('; ') || 'No item rows were found in the sheet.');
        return;
      }
      if (this.isRfq && this.rfqPriced) {
        // The supplier's answers go onto the lines already here, matched by part no, item code or description.
        const { matched, unmatched } = this.fillPricedLines(result.items);
        this.optionalItems.markAsDirty();
        this.excelMetaImported.emit(result.meta);
        const note = unmatched.length ? ` ${unmatched.length} row(s) matched no line: ${unmatched.slice(0, 3).join('; ')}${unmatched.length > 3 ? '…' : ''}` : '';
        if (unmatched.length || !matched) this.alerts.warning('Excel imported', `${matched} line${matched === 1 ? '' : 's'} filled.${note}`);
        else this.alerts.success('Excel imported', `${matched} line${matched === 1 ? '' : 's'} filled.`);
        return;
      }
      this.addItems(result.items);
      this.optionalItems.markAsDirty();
      this.excelMetaImported.emit(result.meta);
      const extra = result.skipped.length ? ` ${result.skipped.length} skipped: ${result.skipped.slice(0, 3).join('; ')}${result.skipped.length > 3 ? '…' : ''}` : '';
      const message = `${result.imported} line${result.imported === 1 ? '' : 's'} added.${extra}`;
      if (result.skipped.length) this.alerts.warning('Excel imported', message);
      else this.alerts.success('Excel imported', message);
    } catch (e: any) {
      this.alerts.error('Could not read the file', e?.message || 'Use an .xlsx file in the template format.');
    } finally {
      this.excelBusy = false;
    }
  }

  /** Writes imported price, availability, terms and remarks onto the current tab's matching lines; blank cells leave the line as it is. */
  private fillPricedLines(items: ItemEntryItemValue[]): { matched: number; unmatched: string[] } {
    const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const lines: FormGroup[] = [];
    this.itemsAt(this.selectedOption).controls.forEach((_, j) => this.detailsAt(this.selectedOption, j)?.controls.forEach((d) => lines.push(d as FormGroup)));
    const used = new Set<FormGroup>();
    let matched = 0;
    const unmatched: string[] = [];
    items.forEach((item) => (item.itemDetails || []).forEach((row) => {
      const find = (field: 'partNo' | 'itemCode' | 'detail') => {
        const want = norm(row[field]);
        return want ? lines.find((l) => !used.has(l) && norm(l.get(field)?.value) === want) : undefined;
      };
      const line = find('partNo') || find('itemCode') || find('detail');
      if (!line) {
        unmatched.push(String(row.detail || row.partNo || '').slice(0, 40));
        return;
      }
      used.add(line);
      matched++;
      const patch: Record<string, unknown> = {};
      if (row.unitCost != null) patch['unitCost'] = row.unitCost;
      if (row.availability) patch['availability'] = row.availability;
      if (patch['availability']) this.keepAvailability(String(patch['availability']));
      line.patchValue(patch);
    }));
    return { matched, unmatched };
  }

  private isItemEmpty(group: FormGroup): boolean {
    if ((group.get('itemName')?.value || '').toString().trim()) return false;
    const details = group.get('itemDetails') as FormArray;
    return !details?.controls.some((d) =>
      !!(d.get('detail')?.value || '').toString().trim() || d.get('quantity')?.value != null || d.get('unitCost')?.value != null);
  }

  // --- undo ------------------------------------------------------------------

  private removedItems: any[] = [];
  private removedItemDetails: any[] = [];
  private removedOptions: any[] = [];

  private offerUndo(kind: 'option' | 'item' | 'line'): void {
    const label = kind === 'line' ? 'Line' : kind === 'item' ? 'Item' : this.optionNoun;
    this.alerts.action({ title: `${label} removed`, onAction: () => this.undo(kind) });
  }

  private rebuildItem(item: ItemEntryItemValue): FormGroup {
    const group = this.createItem(!!item.isOptional);
    const details = (item.itemDetails || []).map((d) => {
      const g = this.createDetail();
      this.writeDetail(g, d);
      return g;
    });
    group.setControl('itemDetails', this._fb.array(details.length ? details : [this.createDetail()]));
    group.patchValue({ itemName: item.itemName, includeInTotal: !!item.includeInTotal });
    return group;
  }

  private undo(kind: 'option' | 'item' | 'line'): void {
    if (kind === 'option' && this.removedOptions.length) {
      const { option, i } = this.removedOptions.pop();
      this.optionalItems.insert(i, this.optionGroup(this._fb.array((option.items || []).map((item: any) => this.rebuildItem(item))), option.totalDiscount ?? null, option.meta));
      this.selectedOption = i;
    } else if (kind === 'item' && this.removedItems.length) {
      const { item, i, j } = this.removedItems.pop();
      this.itemsAt(i).insert(j, this.rebuildItem(item));
    } else if (kind === 'line' && this.removedItemDetails.length) {
      const { item, i, j, k } = this.removedItemDetails.pop();
      const g = this.createDetail();
      this.writeDetail(g, item);
      this.detailsAt(i, j)?.insert(k, g);
    }
    this.emitTotals();
  }

  // --- suggestions -----------------------------------------------------------

  onItemNameInput(i: number, j: number): void {
    const term = ((this.itemsAt(i).at(j) as FormGroup).get('itemName')?.value || '').toString().trim();
    this.queueSearch(`${i}-${j}`, term, '');
  }

  onDetailInput(i: number, j: number, k: number): void {
    const detail = this.detailsAt(i, j)?.at(k) as FormGroup | undefined;
    // Editing the description by hand means the line no longer describes the product that was
    // picked, so the link is dropped rather than left pointing at something else.
    detail?.get('productId')?.setValue(null, { emitEvent: false });
    const term = (this.detailsAt(i, j)?.at(k)?.get('detail')?.value || '').toString().trim();
    // Not narrowed to the group name: the description is matched against the whole catalogue.
    this.queueSearch(`${i}-${j}-${k}`, term, '');
  }

  /**
   * Typing an item code or part no directly: on Enter/blur the catalogue is asked for it, and an exact
   * match fills the whole line. Several exact matches open the description dropdown to choose from.
   */
  lookupByCode(i: number, j: number, k: number, field: 'itemCode' | 'partNo'): void {
    const detail = this.detailsAt(i, j)?.at(k) as FormGroup | undefined;
    const code = (detail?.get(field)?.value || '').toString().trim();
    if (!detail || !this.source || code.length < 2 || detail.get('productId')?.value) return;
    const wanted = code.toLowerCase();
    this.subs.add(this.source.search({ search: code, category: '', scopeIds: this.scopeIds, skip: 0, limit: 10 }).subscribe((rows) => {
      const exact = (rows || []).filter((s) => (s[field] || '').toLowerCase() === wanted);
      if (exact.length === 1) { this.applySuggestion(i, j, k, exact[0]); return; }
      if (exact.length > 1) {
        const key = `${i}-${j}-${k}`;
        this.suggestions[key] = exact;
        this.highlightedIndex = 0;
        this.activeSuggestionKey = key;
      }
    }));
  }

  private codeLookupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Exact codes link automatically after typing pauses; Enter and blur still run immediately. */
  queueCodeLookup(i: number, j: number, k: number, field: 'itemCode' | 'partNo'): void {
    const key = `${i}-${j}-${k}-${field}`;
    const existing = this.codeLookupTimers.get(key);
    if (existing) clearTimeout(existing);
    this.codeLookupTimers.set(key, setTimeout(() => {
      this.codeLookupTimers.delete(key);
      this.lookupByCode(i, j, k, field);
    }, 350));
  }

  private queueSearch(key: string, term: string, category: string): void {
    if (term.length < 2 || !this.source) {
      this.suggestions[key] = [];
      if (this.activeSuggestionKey === key) this.activeSuggestionKey = null;
      return;
    }
    this.search$.next({ key, term, category });
  }

  suggestionsFor(key: string): ItemSuggestion[] {
    return this.activeSuggestionKey === key ? this.suggestions[key] || [] : [];
  }

  /** Whether the open dropdown for `key` offers a trailing "+ Create product" row. */
  createRowAvailable(key: string, k: number | null): boolean {
    // An RFQ already has "Add product" in its drawer footer.
    return k !== null && this.allowCreateProduct && !this.isRfq && this.activeSuggestionKey === key;
  }

  /** Arrow Up/Down moves the highlight, Enter applies the highlighted row (or opens create), Escape closes. */
  onSuggestionKeydown(event: KeyboardEvent, key: string, i: number, j: number, k: number | null): void {
    if (this.activeSuggestionKey !== key) return;
    const rows = this.suggestionsFor(key);
    const createAvailable = this.createRowAvailable(key, k);
    const total = rows.length + (createAvailable ? 1 : 0);
    if (!total && event.key !== 'Escape') return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex + 1) % total;
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex - 1 + total) % total;
        break;
      case 'Enter':
        if (this.highlightedIndex < 0) return;
        event.preventDefault();
        if (this.highlightedIndex < rows.length) this.applySuggestion(i, j, k, rows[this.highlightedIndex]);
        else if (createAvailable) this.requestCreateProduct(i, j, k as number);
        break;
      case 'Escape':
        event.preventDefault();
        this.closeSuggestions();
        break;
    }
  }

  /** Applies a picked suggestion. Inventory rows will additionally carry uom/unitCost/supplierId. */
  applySuggestion(i: number, j: number, k: number | null, s: ItemSuggestion): void {
    const itemGroup = this.itemsAt(i).at(j) as FormGroup;
    const nameControl = itemGroup.get('itemName');
    if (k === null || !(nameControl?.value || '').toString().trim()) {
      nameControl?.setValue(s.categoryName, { emitEvent: false });
    }
    const detail = this.detailsAt(i, j)?.at(k ?? 0) as FormGroup | undefined;
    detail?.get('detail')?.setValue(s.description, { emitEvent: false });
    if (detail) {
      // Margin first, so a catalogue cost derives a price from it; a catalogue price, set after, wins.
      if (k !== null) this.seedMargin(i, j, k);
      // The product link plus its snapshot identifiers always come from the picked row.
      // The link emits, so a parent watching the lines (e.g. last supplier prices) sees the product change.
      detail.get('productId')?.setValue(s._id);
      this.fillIfEmpty(detail, 'itemCode', s.itemCode);
      this.fillIfEmpty(detail, 'partNo', s.partNo);
      this.keepUnit(s.uom);
      this.fillIfEmpty(detail, 'uom', s.uom);
      // An RFQ line is priced by the supplier, so catalogue costs and vendors are not copied onto it;
      // only the product's availability is offered as a starting point for the availability column.
      if (this.isRfq) {
        if (this.rfqQuoted && s.availability) { this.keepAvailability(s.availability); this.fillIfEmpty(detail, 'availability', s.availability); }
        this.closeSuggestions();
        return;
      }
      this.fillIfEmpty(detail, 'supplierId', s.supplierId);
      // Pricing stays event-emitting so the margin/selling-price derivation reruns.
      if (s.unitCost != null && detail.get('unitCost')?.value == null) detail.get('unitCost')?.setValue(s.unitCost);
      if (s.unitSellingPrice != null && detail.get('unitSellingPrice')?.value == null) {
        detail.get('unitSellingPrice')?.setValue(s.unitSellingPrice);
      }
    }
    this.closeSuggestions();
  }

  /** Suggestions must never overwrite something the user already typed on the line. */
  private fillIfEmpty(group: FormGroup, name: string, value: string | undefined): void {
    const control = group.get(name);
    if (!control || !value) return;
    const current = control.value;
    if (current === null || current === undefined || current === '') control.setValue(value, { emitEvent: false });
  }

  /** Stock line shown under a suggestion. Null for rows with no stock position to report. */
  stockSummary(s: ItemSuggestion): string | null {
    if (s.productType && s.productType !== 'Stock') return null;
    if (s.stockOnHand == null) return null;
    // An RFQ exists because the item isn't in stock, so a "Not in stock" line only adds noise.
    if (this.mode === 'rfq' && (s.stockAvailable ?? s.stockOnHand) <= 0) return null;
    const parts = [`${s.stockStatus || ((s.stockAvailable ?? 0) > 0 ? 'In stock' : 'Not in stock')}`, `${s.stockAvailable ?? s.stockOnHand} available`, `${s.stockOnHand} on hand`];
    if (s.stockReserved) parts.push(`${s.stockReserved} reserved`);
    if (s.stockQuarantined) parts.push(`${s.stockQuarantined} quarantined`);
    return parts.join(' · ');
  }

  warehouseSummary(s: ItemSuggestion): string | null {
    const warehouses = (s.warehouseAvailability || []).filter((w) => Number(w.quantity) > 0);
    if (!warehouses.length) return null;
    return warehouses.slice(0, 3).map((w) => `${w.warehouseName}: ${w.quantity}`).join(' · ');
  }

  salesHistorySummary(s: ItemSuggestion): string | null {
    const history = s.salesHistory;
    if (!history || (!history.quotedCount && !history.soldCount)) return null;
    const parts = [`${history.quotedCount} quoted`];
    if (history.soldCount) parts.push(`${history.soldCount} sold`);
    const recent = history.recent?.[0];
    if (recent?.quoteId) {
      parts.push(`last ${recent.quoteId}${recent.customerName ? ' · ' + recent.customerName : ''}`);
    }
    return parts.join(' · ');
  }

  recentUsageRows(s: ItemSuggestion) {
    return (s.salesHistory?.recent || []).slice(0, 2);
  }

  /** Green when there is free stock, amber when it is all committed, grey when there is none. */
  stockTone(s: ItemSuggestion): string {
    const available = s.stockAvailable ?? s.stockOnHand ?? 0;
    if (available > 0) return 'text-emerald-700 dark:text-emerald-400';
    if ((s.stockOnHand ?? 0) > 0) return 'text-amber-700 dark:text-amber-400';
    return 'text-gray-400 dark:text-gray-500';
  }

  closeSuggestions(): void {
    this.activeSuggestionKey = null;
    this.highlightedIndex = -1;
    this.search$.next({ key: '', term: '', category: '' });
  }

  // --- catalogue palette -------------------------------------------------------

  /** Records which item card the user is working in, so Ctrl+K knows where to add lines. */
  trackItem(i: number, j: number): void {
    this.lastItem = { i, j };
  }

  /** Remembers the line being edited, so the palette can start from its description. */
  trackLine(i: number, j: number, k: number): void {
    this.lastLine = { i, j, k };
  }

  /** Product search lives in the global command palette; it adds to the open list. */
  openGlobalPalette(): void {
    this._palette.open();
  }

  openPalette(i: number, j: number): void {
    this.closeSuggestions();
    this.palette = { i, j };
    this.paletteTerm = '';
    this.paletteRows = [];
    this.paletteIndex = 0;
    this.paletteAdded = 0;
    this.paletteLoading = false;
    // Resets distinctUntilChanged, so re-searching the previous session's term still fires.
    this.paletteSearch$.next('');
    // Start from what the user already typed: the focused line's description, else the item's name.
    const line = this.lastLine && this.lastLine.i === i && this.lastLine.j === j
      ? this.detailsAt(i, j)?.at(this.lastLine.k) as FormGroup | undefined : undefined;
    const seed = ((line?.get('detail')?.value || '').toString().trim()
      || ((this.itemsAt(i).at(j) as FormGroup)?.get('itemName')?.value || '').toString().trim());
    if (seed.length >= 2) this.onPaletteInput(seed);
  }

  closePalette(): void {
    this.palette = null;
  }

  get paletteItemName(): string {
    const p = this.palette;
    return p ? ((this.itemsAt(p.i).at(p.j) as FormGroup)?.get('itemName')?.value || '').toString().trim() : '';
  }

  /** Rows plus the trailing "Create product" row once a search has come back. */
  get paletteTotal(): number {
    return this.paletteRows.length + (this.paletteCreateAvailable ? 1 : 0);
  }

  get paletteCreateAvailable(): boolean {
    // An RFQ already has "Add product" in its drawer footer.
    return this.allowCreateProduct && !this.isRfq && !this.paletteLoading && this.paletteTerm.trim().length >= 2;
  }

  /** Fetches the next page of the palette's search when its list is scrolled to the end. */
  loadMorePalette(): void {
    const term = this.paletteQuery;
    if (!this.paletteMore || this.paletteFetching || term.length < 2) return;
    this.paletteFetching = true;
    this.fetchSuggestions('palette', term, '', { skip: this.paletteRows.length, limit: PALETTE_PAGE }).subscribe({
      next: ({ rows }) => {
        this.paletteFetching = false;
        // The user may have searched again while the page was on its way.
        if (term !== this.paletteQuery) return;
        this.paletteRows = [...this.paletteRows, ...rows];
        this.paletteMore = rows.length >= PALETTE_PAGE;
      },
      error: () => {
        this.paletteFetching = false;
        this.paletteMore = false;
      },
    });
  }

  onPaletteInput(term: string): void {
    this.paletteTerm = term;
    const trimmed = term.trim();
    this.paletteLoading = trimmed.length >= 2;
    if (trimmed.length < 2) this.paletteRows = [];
    this.paletteSearch$.next(trimmed);
  }

  onPaletteKeydown(event: KeyboardEvent): void {
    const total = this.paletteTotal;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // Past the last loaded row, fetch the next page rather than wrapping to the top.
        if (this.paletteMore && this.paletteIndex >= this.paletteRows.length - 1) {
          this.loadMorePalette();
          break;
        }
        if (total) this.paletteIndex = (this.paletteIndex + 1) % total;
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (total) this.paletteIndex = (this.paletteIndex - 1 + total) % total;
        break;
      case 'Enter':
        event.preventDefault();
        if (this.paletteIndex < this.paletteRows.length) this.pickFromPalette(this.paletteRows[this.paletteIndex]);
        else if (this.paletteCreateAvailable) this.createFromPalette();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closePalette();
        break;
    }
  }

  /**
   * Adds the product as a line on the palette's item: into the last line if it is still blank,
   * otherwise as a new line. The palette stays open so several products can be added in a row.
   */
  pickFromPalette(s: ItemSuggestion): void {
    const p = this.palette;
    const details = p && this.detailsAt(p.i, p.j);
    if (!p || !details) return;
    const last = details.at(details.length - 1) as FormGroup | undefined;
    const blank = last && !(last.get('detail')?.value || '').toString().trim() && !last.get('productId')?.value;
    if (!blank) details.push(this.createDetail());
    this.applySuggestion(p.i, p.j, details.length - 1, s);
    // A freshly added product line starts at one unit; the user adjusts from there.
    const line = details.at(details.length - 1);
    if (line.get('quantity')?.value == null) line.get('quantity')?.setValue(1);
    this.paletteAdded++;
    this.paletteTerm = '';
    this.paletteRows = [];
    this.paletteIndex = 0;
    this.paletteSearch$.next('');
  }

  /** Hands the typed text to the host's create-product flow, prefilled on a blank line. */
  createFromPalette(): void {
    const p = this.palette;
    const details = p && this.detailsAt(p.i, p.j);
    if (!p || !details) return;
    const last = details.at(details.length - 1) as FormGroup | undefined;
    const blank = last && !(last.get('detail')?.value || '').toString().trim();
    if (!blank) details.push(this.createDetail());
    details.at(details.length - 1).get('detail')?.setValue(this.paletteTerm.trim());
    const k = details.length - 1;
    this.closePalette();
    this.requestCreateProduct(p.i, p.j, k);
  }

  /** The line a create-product request came from, so the new product can be put on it. */
  private createTarget: { i: number; j: number; k: number } | null = null;

  /** Puts a product the host just created on the line that asked for it. */
  applyCreatedProduct(s: ItemSuggestion): void {
    const t = this.createTarget;
    this.createTarget = null;
    const line = t ? (this.detailsAt(t.i, t.j)?.at(t.k) as FormGroup | undefined) : undefined;
    if (!t || !line) {
      // Created from a host button rather than from a line: add it as a new line.
      if (!t) { this.addCatalogueProducts([s]); this.emitTotals(); }
      return;
    }
    // The typed description gives way to the catalogue's own wording.
    line.get('detail')?.setValue(s.description, { emitEvent: false });
    this.applySuggestion(t.i, t.j, t.k, s);
    if (line.get('quantity')?.value == null) line.get('quantity')?.setValue(1);
    this.emitTotals();
  }

  requestCreateProduct(i: number, j: number, k: number): void {
    this.createTarget = { i, j, k };
    const itemName = ((this.itemsAt(i).at(j) as FormGroup).get('itemName')?.value || '').toString().trim();
    const detail = (this.detailsAt(i, j)?.at(k)?.get('detail')?.value || '').toString().trim();
    this.closeSuggestions();
    this.createProductRequested.emit({ itemName, detail, scopeIds: this.scopeIds });
  }

  // --- pricing ---------------------------------------------------------------

  lineCost(i: number, j: number, k: number): number {
    if (this.isPurchase && this.supplierScope) return this.lineCostShown(i, j, k);
    const d = this.detailsAt(i, j)?.at(k);
    return (Number(d?.get('quantity')?.value) || 0) * (Number(d?.get('unitCost')?.value) || 0);
  }

  lineTotal(i: number, j: number, k: number): number {
    const d = this.detailsAt(i, j)?.at(k);
    return (this.supplierScope ? this.shownQty(i, j, k) : Number(d?.get('quantity')?.value) || 0) * (Number(d?.get('unitSellingPrice')?.value) || 0);
  }

  itemTotal(i: number, j: number): number {
    let sum = 0;
    this.detailsAt(i, j)?.controls.forEach((_, k) => (sum += this.lineTotal(i, j, k)));
    return sum;
  }

  /** An optional item is excluded from the totals unless it is explicitly included. */
  private countsTowardsTotal(item: any): boolean {
    return !item.isOptional || !!item.includeInTotal;
  }

  private sumOption(line: (j: number, k: number) => number): number {
    const option = this.optionalItems.value[this.selectedOption];
    let sum = 0;
    (option?.items || []).forEach((item: any, j: number) => {
      if (!this.countsTowardsTotal(item)) return;
      (item.itemDetails || []).forEach((d: any, k: number) => {
        if (this.isDeal && !d.dealSelected) return;
        if (this.isPurchase && this.supplierScope && !this.inSupplierScope(d)) return;
        sum += line(j, k);
      });
    });
    return sum;
  }

  totalCost(): number {
    const lines = this.sumOption((j, k) => this.lineCost(this.selectedOption, j, k));
    return this.isDeal ? lines + (Number(this.costAdjustment) || 0) : lines;
  }

  sellingPrice(): number {
    return this.sumOption((j, k) => this.lineTotal(this.selectedOption, j, k));
  }

  discount(): number {
    if (this.isDeal) return Number(this.discountAdjustment) || 0;
    return Number(this.optionalItems.value[this.selectedOption]?.totalDiscount) || 0;
  }

  finalTotal(): number {
    return this.sellingPrice() - this.discount();
  }

  marginValue(): number {
    return this.finalTotal() - this.totalCost();
  }

  profitPercent(): number {
    const net = this.finalTotal();
    return net > 0 ? ((net - this.totalCost()) / net) * 100 : 0;
  }

  /** Purchase: the deal's own figures (its quantities, selling prices and margins), which do not move with the PR. In a supplier tab, only that tab's lines. */
  dealFigures(): { cost: number; selling: number; marginValue: number; marginPercent: number } {
    let selling = 0;
    let cost = 0;
    const option = this.optionalItems.value[this.selectedOption];
    (option?.items || []).forEach((item: any, j: number) => {
      if (!this.countsTowardsTotal(item)) return;
      (item.itemDetails || []).forEach((d: any, k: number) => {
        if (this.supplierScope && !this.inSupplierScope(d)) return;
        const ctrl = this.detailsAt(this.selectedOption, j)?.at(k);
        const qty = (ctrl && this.dealQty(ctrl)) ?? (Number(d.quantity) || 0);
        const lineSelling = qty * (Number(d.unitSellingPrice) || 0);
        selling += lineSelling;
        // The deal's unit cost when known (exact); otherwise back out of the stored margin, which is rounded.
        const deal = ctrl ? this.dealCost(ctrl) : null;
        if (deal != null) { cost += qty * deal; return; }
        const m = ctrl ? this.baseMargins.get(ctrl) : undefined;
        const margin = m ?? (d.profit != null && d.profit !== '' ? Number(d.profit) : null);
        cost += margin != null && Number.isFinite(margin) ? lineSelling * (1 - margin / 100) : qty * (Number(d.unitCost) || 0);
      });
    });
    const marginValue = selling - cost;
    return { cost, selling, marginValue, marginPercent: selling > 0 ? (marginValue / selling) * 100 : 0 };
  }

  /** Purchase: the PR's margin — current selling price against the cost of the chosen suppliers. */
  prMarginValue(): number {
    return this.sellingPrice() - this.totalCost();
  }

  prMarginPercent(): number {
    const selling = this.sellingPrice();
    return selling > 0 ? (this.prMarginValue() / selling) * 100 : 0;
  }

  private emitTotals(): void {
    this.recompute();
    this.totals.emit({
      totalCost: this.totalCost(),
      sellingPrice: this.sellingPrice(),
      totalProfit: this.profitPercent(),
      discount: this.discount(),
    });
  }

  /** True when at least one line has a description — what "this step has content" means to a host. */
  get hasAnyLine(): boolean {
    return this.optionalItems.controls.some((option) =>
      ((option.get('items') as FormArray)?.controls || []).some((item) =>
        ((item.get('itemDetails') as FormArray)?.controls || []).some((d) => !!(d.get('detail')?.value || '').toString().trim())));
  }

  // --- margin defaults ---------------------------------------------------------
  // Item margin → line. Nothing is preset: an item has a margin only once the user sets one. Only the
  // line's `profit` is saved; the item level lives on the component, and a "custom" line is simply one
  // whose margin differs from its item's.

  get marginEnabled(): boolean { return this.mode === 'quote'; }

  private itemMargins = new WeakMap<AbstractControl, number>();

  /** The margin a line in this item should have unless the user set its own. */
  effectiveMargin(i: number, j: number): number | null {
    return this.itemMargins.get(this.itemsAt(i).at(j)) ?? null;
  }

  /** Gives a line with no margin yet its item's margin, if the item has one. Emits, so a known cost derives the price. */
  private seedMargin(i: number, j: number, k: number): void {
    if (!this.marginEnabled) return;
    const profit = this.detailsAt(i, j)?.at(k)?.get('profit');
    const margin = this.effectiveMargin(i, j);
    if (profit && margin != null && (profit.value == null || profit.value === '')) profit.setValue(margin);
  }

  private differs(value: any, margin: number | null): boolean {
    return value != null && value !== '' && margin != null && Math.abs(Number(value) - margin) > 0.005;
  }

  isCustomMargin(i: number, j: number, k: number): boolean {
    return this.marginEnabled && this.differs(this.detailsAt(i, j)?.at(k)?.get('profit')?.value, this.effectiveMargin(i, j));
  }

  customMarginCount(i: number, j: number): number {
    const margin = this.effectiveMargin(i, j);
    return (this.detailsAt(i, j)?.controls || []).filter((l) => this.differs(l.get('profit')?.value, margin)).length;
  }

  resetMargin(i: number, j: number, k: number): void {
    const margin = this.effectiveMargin(i, j);
    const profit = this.detailsAt(i, j)?.at(k)?.get('profit');
    if (!profit || margin == null) return;
    profit.setValue(margin);
    profit.markAsDirty();
  }

  /** Text colour for a margin %: red below zero, amber below the threshold. */
  marginTone(value: number | null | undefined): string {
    if (value == null || (value as any) === '' || !Number.isFinite(Number(value))) return 'text-gray-500 dark:text-gray-400';
    if (Number(value) < 0) return 'text-red-600 dark:text-red-400';
    return 'text-emerald-600 dark:text-emerald-400';
  }

  lineMarginRing(i: number, j: number, k: number): string {
    if (!this.marginEnabled) return '';
    const value = this.detailsAt(i, j)?.at(k)?.get('profit')?.value;
    if (value == null || value === '') return '';
    if (Number(value) < 0) return 'ring-1 ring-red-400 rounded-lg';
    return '';
  }

  // --- item summary --------------------------------------------------------------

  itemCost(i: number, j: number): number {
    let sum = 0;
    this.detailsAt(i, j)?.controls.forEach((_, k) => (sum += this.lineCost(i, j, k)));
    return sum;
  }

  itemMarginPercent(i: number, j: number): number | null {
    const total = this.itemTotal(i, j);
    return total > 0 ? ((total - this.itemCost(i, j)) / total) * 100 : null;
  }

  itemIssues(i: number, j: number): number {
    return (this.detailsAt(i, j)?.controls || []).filter((l) => this.lineFlags(l).errors).length;
  }

  // --- collapse & density ------------------------------------------------------

  private collapsed = new WeakSet<AbstractControl>();
  compact = this.readDensity();

  isCollapsed(i: number, j: number): boolean {
    return !this.flat && !this.filterActive && this.collapsed.has(this.itemsAt(i).at(j));
  }

  toggleCollapse(i: number, j: number): void {
    const item = this.itemsAt(i).at(j);
    if (this.collapsed.has(item)) this.collapsed.delete(item);
    else this.collapsed.add(item);
  }

  setAllCollapsed(on: boolean): void {
    this.itemsAt(this.selectedOption).controls.forEach((item) => (on ? this.collapsed.add(item) : this.collapsed.delete(item)));
  }

  toggleDensity(): void {
    this.compact = !this.compact;
    try { localStorage.setItem('ie-density', this.compact ? 'compact' : 'comfortable'); } catch { /* storage unavailable */ }
  }

  private readDensity(): boolean {
    try { return localStorage.getItem('ie-density') === 'compact'; } catch { return false; }
  }

  // --- search, filters & jump --------------------------------------------------

  private static seq = 0;
  readonly uid = ++ItemEntryComponent.seq;

  lineSearch = '';
  lineFilter: LineFilter | null = null;
  counts: Record<LineFilter, number> = { missingPrice: 0, notInCatalogue: 0, notAwarded: 0, errors: 0 };
  readonly filterChips: { key: LineFilter; label: string; hint: string }[] = [
    { key: 'missingPrice', label: 'Missing price', hint: 'Lines with no selling price yet' },
    { key: 'notInCatalogue', label: 'Not in products', hint: 'Lines typed by hand that are not linked to a product in the catalogue' },
    { key: 'errors', label: 'Errors', hint: 'Filled-in lines that fail validation or (purchase requests) have no supplier. Blank lines are not counted until you start typing in them' },
  ];
  /** The item "Jump to" just scrolled to, highlighted briefly. */
  flashItem: AbstractControl | null = null;

  get filterActive(): boolean {
    return !!this.lineSearch.trim() || !!this.lineFilter;
  }

  visibleChips(): { key: LineFilter; label: string; hint: string }[] {
    return this.filterChips.filter((c) =>
      (c.key !== 'missingPrice' || !(this.isRfq && !this.rfqPriced)));
  }

  toggleFilter(key: LineFilter): void {
    this.lineFilter = this.lineFilter === key ? null : key;
    if (this.lineFilter) this.jumpToFirstFlagged(this.lineFilter);
  }

  /** Scrolls to the first item holding a line with the given problem. */
  private jumpToFirstFlagged(key: LineFilter): void {
    const i = this.selectedOption;
    const items = this.itemsAt(i)?.controls || [];
    const j = items.findIndex((_, jj) => (this.detailsAt(i, jj)?.controls || []).some((l) => this.lineFlags(l)[key]));
    if (j >= 0) this.jumpTo(String(j));
  }

  clearFilters(): void {
    this.lineSearch = '';
    this.lineFilter = null;
  }

  /** Blank lines (nothing typed yet) never count as problems. */
  private lineFlags(line: AbstractControl): Record<LineFilter, boolean> {
    const v = (line as FormGroup).getRawValue();
    const detail = (v.detail || '').toString().trim();
    const filled = !!detail || v.quantity != null || v.unitCost != null;
    if (!filled) return { missingPrice: false, notInCatalogue: false, notAwarded: false, errors: false };
    return {
      missingPrice: this.isRfq ? this.rfqPriced && v.unitCost == null : !(Number(v.unitSellingPrice) > 0),
      notInCatalogue: !v.productId && !!detail,
      notAwarded: !!this.lineAwarded && !this.lineAwarded(v),
      errors: line.invalid || this.missingSupplier(v),
    };
  }

  /** Purchase: every line needs a supplier (picked, awarded or at least asked through an RFQ). */
  private missingSupplier(v: any): boolean {
    if (!this.isPurchase) return false;
    return !v.supplierId && !(this.lineOffers?.(v)?.length);
  }

  /** Purchase: show only the lines this supplier is asked about (null = every line). */
  @Input() supplierScope: string | null = null;

  /** Lines handed to the scoped supplier by hand; shown under that supplier's tab only, the line's own supplier is untouched. */
  @Input() scopeLineKeys: string[] = [];
  @Input() supplierScopeName = '';

  /** The lineKeys of the ticked lines. */
  selectedLineKeys(): string[] {
    return this.selectedLines().map((l) => l.get('lineKey')?.value).filter((k): k is string => !!k);
  }

  /** Lines taken out of the scoped supplier's tab by hand. */
  @Input() scopeExcludedKeys: string[] = [];

  /** The line's only supplier (its default from the deal, or awarded) cannot be taken out of the tab; with several suppliers any of them can. */
  private scopeProtected(v: any): boolean {
    if (this.awardedHere(v)) return true;
    const mine = v.supplierId === this.supplierScope;
    const listed = this.linePills ? this.linePills(v).length : 1;
    return listed <= 1 && (mine || !!v.supplierId);
  }

  /** The line is awarded (a share or an awarded offer) to the scoped supplier. */
  private awardedHere(v: any): boolean {
    return !!this.lineOffers?.(v)?.some((o) => o.supplierId === this.supplierScope && o.state === 'awarded')
      || (!!v.lineKey && !!this.shares.get(v.lineKey)?.some((s) => s.supplierId === this.supplierScope && s.qty > 0));
  }

  /** Why Unlist is off, for the tooltip. */
  unlistBlockedReason(): string {
    const lines = this.selectedActiveLines().map((l) => l.getRawValue());
    if (lines.some((v) => this.awardedHere(v))) return 'Assigned to this supplier. Release it to unlist.';
    return 'The only supplier on a ticked line cannot be unlisted.';
  }

  /** Why Assign is off, for the tooltip. */
  awardBlockedReason(): string {
    if (this.selectedFullCount() > 0) return 'A ticked line has its whole quantity assigned to other suppliers. Release one first.';
    return 'A ticked line has more quantity assigned than the line needs.';
  }

  /** Why Apply is off, for the tooltip. */
  applyBlockedReason(): string {
    return 'Some ticked lines are not listed for this supplier. List them first.';
  }

  private inSupplierScope(v: any, scope = this.supplierScope, listed = this.scopeLineKeys, excluded = this.scopeExcludedKeys): boolean {
    if (v.lineKey && excluded.includes(v.lineKey)) return false;
    return v.supplierId === scope || !!this.lineOffers?.(v)?.some((o) => o.supplierId === scope && !o.pastOnly)
      || (!!v.lineKey && listed.includes(v.lineKey))
      || (!!v.lineKey && !!this.shares.get(v.lineKey)?.some((s) => s.supplierId === scope));
  }

  /**
   * Lines on a supplier tab and how many have a price there. The tab is passed in, and the price is worked out the way its
   * cost box would seed it, so a parent can ask before this view has rendered the tab.
   */
  scopePriceStatus(scope: string, listed: string[], excluded: string[]): { lines: number; priced: number } {
    let lines = 0;
    let priced = 0;
    this.optionalItems.controls.forEach((_, i) => this.itemsAt(i).controls.forEach((_, j) =>
      (this.detailsAt(i, j)?.controls ?? []).forEach((d) => {
        const v = d.getRawValue();
        if (!v.lineKey || !this.inSupplierScope(v, scope, listed, excluded)) return;
        lines++;
        const typed = this.scopeCosts.get(`${v.lineKey}|${scope}`)?.value;
        const won = this.sharesOf(d);
        const seed = won.find((s) => s.supplierId === scope)?.cost
          || this.lineOffers?.(v)?.find((o) => o.supplierId === scope)?.price
          || (v.supplierId === scope ? Number(v.unitCost) : null)
          || (won.length ? null : this.dealCostFor(d, scope));
        if (Number(typed ?? seed) > 0) priced++;
      })));
    return { lines, priced };
  }

  /** Ticked lines of the active supplier tab (what Remove and Award act on). */
  private selectedActiveLines(): AbstractControl[] {
    return this.selectedLines().filter((l) => this.inSupplierScope(l.getRawValue()));
  }

  /** Ticked lines in this tab whose supplier here is the default or awarded one. */
  selectedProtectedCount(): number {
    return this.selectedActiveLines().filter((l) => this.scopeProtected(l.getRawValue())).length;
  }

  selectedActiveCount(): number {
    return this.selectedActiveLines().length;
  }

  @Output() removeFromTab = new EventEmitter<string[]>();

  bulkRemoveFromTab(): void {
    if (this.selectedProtectedCount()) return;
    const keys = this.selectedActiveLines().map((l) => l.get('lineKey')?.value).filter((k): k is string => !!k);
    if (!keys.length) return;
    const scope = this.supplierScope;
    // An unlisted supplier gives its share back, so the quantity is open to the others again.
    this.selectedActiveLines().forEach((d) => {
      const won = this.sharesOf(d);
      if (!won.some((s) => s.supplierId === scope)) return;
      this.applyShares(d, won.filter((s) => s.supplierId !== scope));
      this.refillScopeQtys(d, scope ?? '');
    });
    this.removeFromTab.emit(keys);
    this.clearSelection();
  }

  /** Lines awarded straight to the scoped supplier, with the cost shown in the tab. */
  @Output() awardToTab = new EventEmitter<{ lineKey: string; price: number; qty: number; total: number }[]>();

  /** Ticked lines of this tab whose whole quantity is already assigned to other suppliers. */
  selectedFullCount(): number {
    const scope = this.supplierScope ?? '';
    return this.selectedActiveLines().filter((d) => {
      const total = Number(d.get('quantity')?.value) || 0;
      return this.sharesOf(d).length > 0 && !(total - this.claimedElsewhere(d, scope) > 0);
    }).length;
  }

  /** Ticked lines of this tab that are assigned to the scoped supplier. */
  selectedHeldCount(): number {
    return this.selectedActiveLines().filter((l) => this.awardedHere(l.getRawValue())).length;
  }

  /** Gives the ticked lines back from this supplier: its share is released, and a line left with no supplier returns to the job's supplier and cost. */
  bulkReleaseFromTab(): void {
    const scope = this.supplierScope;
    if (!scope) return;
    let changed = false;
    this.selectedActiveLines().forEach((d) => {
      if (!this.awardedHere(d.getRawValue())) return;
      const rest = this.sharesOf(d).filter((s) => s.supplierId !== scope);
      const key = d.get('lineKey')?.value;
      if (rest.length) {
        this.applyShares(d, rest);
      } else {
        const base = this.baseSuppliers.get(d) ?? '';
        const deal = this.dealCost(d);
        this.shares.set(key, []);
        d.patchValue({ supplierId: base || null, ...(deal != null ? { unitCost: deal } : {}) });
      }
      this.refillScopeQtys(d, '');
      this.pillClicked.emit({ lineKey: key, supplierId: String(d.get('supplierId')?.value || ''), price: null });
      changed = true;
    });
    if (changed) this.clearSelection();
  }

  /** Assigns this tab's quantity of each ticked line to the supplier. A line can be split between suppliers while quantity is left; the line's own quantity stays the full amount. */
  bulkAwardToTab(): void {
    const scope = this.supplierScope;
    if (!scope || this.selectedExceedCount() || this.selectedFullCount()) return;
    const ticked = this.selectedActiveLines();
    const out: { lineKey: string; price: number; qty: number; total: number }[] = [];
    this.itemsAt(0).controls.forEach((_, j) => (this.detailsAt(0, j)?.controls || []).forEach((d, k) => {
      const lineKey = d.get('lineKey')?.value;
      if (!lineKey || !ticked.includes(d as FormGroup)) return;
      // An untouched tab holds the full quantity; it only takes what the other suppliers have left.
      const open = (Number(d.get('quantity')?.value) || 0) - this.claimedElsewhere(d, scope);
      const typed = this.shownQty(0, j, k);
      const qty = this.scopeQtyControl(0, j, k).dirty ? typed : Math.min(typed, open);
      const price = this.shownUnitCost(0, j, k);
      this.dealCost(d);
      this.applyShares(d, [...this.sharesOf(d).filter((s) => s.supplierId !== scope), { supplierId: scope, qty, cost: price }]);
      this.refillScopeQtys(d, scope);
      out.push({ lineKey, price, qty, total: Number(d.get('quantity')?.value) || 0 });
    }));
    if (!out.length) return;
    this.awardToTab.emit(out);
    this.clearSelection();
  }

  /** In a supplier tab the order is "this supplier's lines first", so reordering is off. */
  get dragLocked(): boolean { return this.filterActive || !!this.supplierScope; }

  /** Supplier tab: true for the lines that belong to the tab (every line when there is no tab). */
  lineActive(i: number, j: number, k: number): boolean {
    if (!this.supplierScope) return true;
    const line = this.detailsAt(i, j)?.at(k);
    return !!line && this.inSupplierScope((line as FormGroup).getRawValue());
  }

  /** Supplier tab: items holding no line of the tab sink below the ones that do. */
  itemOrder(i: number, j: number): number {
    return this.supplierScope && !(this.detailsAt(i, j)?.controls || []).some((_, k) => this.lineActive(i, j, k)) ? 1 : 0;
  }

  /** Ticked lines that are not in the active supplier tab yet. */
  selectedInactiveKeys(): string[] {
    return this.selectedLines()
      .filter((l) => !this.inSupplierScope(l.getRawValue()))
      .map((l) => l.get('lineKey')?.value).filter((k): k is string => !!k);
  }

  @Output() addToTab = new EventEmitter<string[]>();

  bulkAddToTab(): void {
    const keys = this.selectedInactiveKeys();
    if (!keys.length) return;
    this.addToTab.emit(keys);
    this.clearSelection();
  }

  lineVisible(i: number, j: number, k: number): boolean {
    if (!this.filterActive) return true;
    const line = this.detailsAt(i, j)?.at(k);
    if (!line) return false;
    if (this.lineFilter && !this.lineFlags(line)[this.lineFilter]) return false;
    const term = this.lineSearch.trim().toLowerCase();
    if (!term) return true;
    const v = (line as FormGroup).getRawValue();
    // Flat lists have no real group name (it is just the first line's leftover), so matching on it would show every line.
    const name = this.flat ? '' : (this.itemsAt(i).at(j).get('itemName')?.value || '').toString();
    return [v.detail, v.itemCode, v.partNo, name].some((s) => (s || '').toString().toLowerCase().includes(term));
  }

  itemVisible(i: number, j: number): boolean {
    if (!this.filterActive) return true;
    return (this.detailsAt(i, j)?.controls || []).some((_, k) => this.lineVisible(i, j, k));
  }

  anyItemVisible(i: number): boolean {
    return this.itemsAt(i).controls.some((_, j) => this.itemVisible(i, j));
  }

  itemDomId(i: number, j: number): string {
    return `ie-${this.uid}-${i}-${j}`;
  }

  /** Adds an item from the sticky toolbar and scrolls to it, so long lists need no trip to the bottom. */
  addItemAndJump(isOptional = false): void {
    const i = this.selectedOption;
    if (this.filterActive) this.clearFilters();
    this.addItem(i, isOptional);
    this.jumpTo(String(this.itemsAt(i).length - 1));
  }

  /**
   * Called by a host after a failed save: opens the first option holding an invalid line, clears any
   * filter hiding it, expands collapsed items with problems and scrolls to the first one.
   */
  revealInvalid(): void {
    for (let i = 0; i < this.optionalItems.length; i++) {
      const items = this.itemsAt(i);
      const bad = (items?.controls || []).map((item, j) => ({ item, j }))
        .filter(({ item }) => item.invalid);
      if (!bad.length) continue;
      if (i !== this.selectedOption) this.selectOption(i);
      if (this.filterActive) this.clearFilters();
      bad.forEach(({ item }) => this.collapsed.delete(item));
      this.jumpTo(String(bad[0].j));
      return;
    }
  }

  jumpTo(value: string): void {
    const j = Number(value);
    const i = this.selectedOption;
    const item = this.itemsAt(i)?.at(j);
    if (!item) return;
    this.collapsed.delete(item);
    this.flashItem = item;
    setTimeout(() => document.getElementById(this.itemDomId(i, j))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setTimeout(() => { if (this.flashItem === item) this.flashItem = null; }, 1600);
  }

  /** Filter counts for the selected option, and pruning of selected lines that no longer exist. */
  private recompute(): void {
    const counts: Record<LineFilter, number> = { missingPrice: 0, notInCatalogue: 0, notAwarded: 0, errors: 0 };
    const live = new Set<AbstractControl>();
    this.optionalItems.controls.forEach((_, i) => (this.itemsAt(i)?.controls || []).forEach((__, j) =>
      (this.detailsAt(i, j)?.controls || []).forEach((line) => {
        live.add(line);
        if (i !== this.selectedOption) return;
        const flags = this.lineFlags(line);
        (Object.keys(counts) as LineFilter[]).forEach((key) => flags[key] && counts[key]++);
      })));
    this.selected.forEach((line) => { if (!live.has(line)) this.selected.delete(line); });
    this.counts = counts;
  }

  // --- bulk selection ------------------------------------------------------------

  /** Purchase mode: lines can be ticked to ask a supplier for a price on them (the host adds the action through `bulkExtraTemplate`). */
  @Input() bulkSelect = false;
  get bulkEnabled(): boolean { return this.mode === 'quote' || this.isRfq || (this.isPurchase && this.bulkSelect); }
  /** The supplier box in the bulk bar also picks who to ask when creating an RFQ; Apply sets it as the lines' supplier too. */
  get bulkSupplierAsksRfq(): boolean { return this.isPurchase && this.bulkSelect && this.addToRfq.observed; }

  private selected = new Set<AbstractControl>();
  private anchor: { i: number; j: number; k: number } | null = null;
  bulkQtyControl = new FormControl<number | null>(null);
  bulkUomControl = new FormControl<string | null>(null);
  bulkPriceControl = new FormControl<number | null>(null);
  bulkMarginControl = new FormControl<number | null>(null);
  bulkAvailabilityControl = new FormControl<string | null>(null);
  bulkSupplierControl = new FormControl<string | null>(null);

  get selectedCount(): number { return this.selected.size; }

  /** Where each selected line sits in the editor, in order, for a host that works on saved lines by position. */
  selectedPositions(): { i: number; j: number; k: number }[] {
    const out: { i: number; j: number; k: number }[] = [];
    this.optionalItems.controls.forEach((_, i) => this.itemsAt(i).controls.forEach((__, j) =>
      (this.detailsAt(i, j)?.controls || []).forEach((line, k) => this.selected.has(line) && out.push({ i, j, k }))));
    return out;
  }

  /** The supplier chosen in the bulk bar, then cleared. */
  takeBulkSupplier(): string | null {
    const id = this.bulkSupplierControl.value;
    this.bulkSupplierControl.reset(null);
    return id;
  }

  /** "Add to RFQ": hands the host the picked supplier and the ticked lines, then clears both. */
  bulkAddToRfq(): void {
    const supplierId = this.bulkSupplierControl.value;
    const lineKeys = this.selectedLines().map((l) => l.get('lineKey')?.value).filter((k): k is string => !!k);
    if (!supplierId || !lineKeys.length) return;
    this.addToRfq.emit({ supplierId, lineKeys });
    this.bulkSupplierControl.reset(null);
    this.clearSelection();
  }

  /** The selected line groups, for a host's own bulk actions. */
  selectedLines(): FormGroup[] {
    return Array.from(this.selected) as FormGroup[];
  }

  isSelected(i: number, j: number, k: number): boolean {
    const line = this.detailsAt(i, j)?.at(k);
    return !!line && this.selected.has(line);
  }

  /** Shift-click selects the range from the last clicked line in the same item. */
  toggleLine(i: number, j: number, k: number, event: MouseEvent): void {
    const details = this.detailsAt(i, j);
    if (!details) return;
    const on = !this.selected.has(details.at(k));
    const a = this.anchor;
    const range = event.shiftKey && a && a.i === i && a.j === j
      ? [Math.min(a.k, k), Math.max(a.k, k)] : [k, k];
    for (let n = range[0]; n <= range[1]; n++) {
      if (n !== k && !this.lineVisible(i, j, n)) continue;
      if (on) this.selected.add(details.at(n)); else this.selected.delete(details.at(n));
    }
    this.anchor = { i, j, k };
  }

  itemSelectState(i: number, j: number): 'none' | 'some' | 'all' {
    const lines = this.detailsAt(i, j)?.controls || [];
    const n = lines.filter((l) => this.selected.has(l)).length;
    return n === 0 ? 'none' : n === lines.length ? 'all' : 'some';
  }

  toggleItemSelection(i: number, j: number): void {
    const select = this.itemSelectState(i, j) !== 'all';
    (this.detailsAt(i, j)?.controls || []).forEach((line, k) => {
      if (!this.lineVisible(i, j, k)) return;
      if (select) this.selected.add(line); else this.selected.delete(line);
    });
  }

  selectAllVisible(): void {
    const i = this.selectedOption;
    this.itemsAt(i).controls.forEach((_, j) =>
      (this.detailsAt(i, j)?.controls || []).forEach((line, k) => this.lineVisible(i, j, k) && this.selected.add(line)));
  }

  clearSelection(): void {
    this.selected.clear();
    this.anchor = null;
  }

  private forSelected(fn: (line: FormGroup) => void): void {
    this.bulkTargets().forEach(fn);
  }

  /** Deal mode has no separate selection: the lines ticked into the deal are the ones the bulk bar acts on. */
  dealTickedLines(): FormGroup[] {
    if (!this.isDeal) return [];
    const option = this.optionalItems.at(this.selectedOption);
    return (((option?.get('items') as FormArray)?.controls) || []).flatMap((item) =>
      ((item.get('itemDetails') as FormArray).controls as FormGroup[]).filter((d) => !!d.get('dealSelected')?.value));
  }

  get dealTickedCount(): number { return this.dealTickedLines().length; }

  private bulkTargets(): FormGroup[] {
    return this.isDeal ? this.dealTickedLines() : (Array.from(this.selected) as FormGroup[]);
  }

  /** Applies every filled-in bulk field to the selected lines; blank fields are left untouched. */
  bulkApply(): void {
    const filled = (v: unknown) => v != null && (v as any) !== '';
    const fields: [string, unknown, boolean][] = [
      ['quantity', this.bulkQtyControl.value, true],
      ['uom', this.bulkUomControl.value, false],
      ['profit', this.marginEnabled ? this.bulkMarginControl.value : null, true],
      // An RFQ's price is the supplier's unit price, kept in `unitCost`.
      [this.isRfq ? 'unitCost' : 'unitSellingPrice', !this.isRfq || this.rfqQuoted ? this.bulkPriceControl.value : null, true],
      ['availability', !this.isRfq || this.rfqQuoted ? this.bulkAvailabilityControl.value : null, false],
      ['supplierId', this.isRfq ? null : this.bulkSupplierControl.value, false],
    ];
    const active = fields.filter(([, v]) => filled(v));
    if (!active.length) { this.alerts.warning('Nothing to set', 'Fill in at least one field.'); return; }
    // Same bounds the line's own margin field enforces; a margin of 100% or more has no selling price.
    const bulkMargin = active.find(([name]) => name === 'profit');
    if (bulkMargin && (Number(bulkMargin[1]) > 99.99 || (!this.isDeal && Number(bulkMargin[1]) < 0))) {
      this.alerts.warning('Margin out of range', this.isDeal ? 'Margin must be below 100%.' : 'Margin must be between 0% and 99.99%.');
      return;
    }
    // An awarded line keeps its awarded price and quantity, so the bar leaves it alone.
    const locked = new Set(this.selectedPositions().filter((p) => this.isLineLocked(p.i, p.j, p.k)).map((p) => this.detailsAt(p.i, p.j)!.at(p.k)));
    const count = this.bulkTargets().length;
    this.forSelected((line) => !locked.has(line) && active.forEach(([name, v, numeric]) => {
      const c = line.get(name);
      c?.setValue(numeric ? Number(v) : v);
      c?.markAsDirty();
    }));
    [this.bulkQtyControl, this.bulkUomControl, this.bulkPriceControl, this.bulkMarginControl,
      this.bulkAvailabilityControl, this.bulkSupplierControl].forEach((c) => c.reset(null));
    this.alerts.success(`${active.length} field${active.length > 1 ? 's' : ''} set on ${count} lines`);
  }

  /** Removes the selected lines with one Undo. A group whose lines are all selected is removed too (the last group of an option keeps one blank line). */
  bulkDelete(): void {
    type Op =
      | { type: 'lines'; i: number; j: number; lines: { item: ItemEntryLineValue; k: number }[]; blank?: FormGroup }
      | { type: 'group'; i: number; j: number; item: ItemEntryItemValue };
    const ops: Op[] = [];
    const seeds: [number, number][] = [];
    let count = 0;
    // Snapshot first: nothing below may touch the selection until every group has been processed.
    const picked = new Set(this.selected);
    this.optionalItems.controls.forEach((_, i) => {
      const items = this.itemsAt(i);
      for (let j = items.length - 1; j >= 0; j--) {
        const details = this.detailsAt(i, j);
        if (!details) continue;
        const ks = details.controls.map((l, k) => (picked.has(l) && !this.isLineLocked(i, j, k) ? k : -1)).filter((k) => k >= 0);
        if (!ks.length) continue;
        count += ks.length;
        if (ks.length === details.length && items.length > 1) {
          ops.push({ type: 'group', i, j, item: items.at(j).getRawValue() });
          items.removeAt(j, { emitEvent: false });
          continue;
        }
        const op: Op = { type: 'lines', i, j, lines: ks.map((k) => ({ item: (details.at(k) as FormGroup).getRawValue(), k })) };
        for (let n = ks.length - 1; n >= 0; n--) details.removeAt(ks[n], { emitEvent: false });
        if (!details.length) {
          op.blank = this.createDetail();
          details.push(op.blank, { emitEvent: false });
          seeds.push([i, j]);
        }
        ops.push(op);
      }
    });
    if (!count) return;
    seeds.forEach(([i, j]) => this.seedMargin(i, j, 0));
    this.clearSelection();
    this.optionalItems.updateValueAndValidity();
    this.optionalItems.markAsDirty();
    this.alerts.action({
      title: `${count} line${count === 1 ? '' : 's'} removed`,
      onAction: () => this.undoBulkDelete(ops),
    });
  }

  private undoBulkDelete(ops: any[]): void {
    [...ops].reverse().forEach((op) => {
      if (op.type === 'group') {
        this.itemsAt(op.i).insert(op.j, this.rebuildItem(op.item), { emitEvent: false });
        return;
      }
      const blank = op.blank as FormGroup | undefined;
      const parent = blank?.parent as FormArray | null | undefined;
      const at = parent && blank ? parent.controls.indexOf(blank) : -1;
      if (parent && at >= 0) parent.removeAt(at, { emitEvent: false });
      op.lines.forEach(({ item, k }: { item: ItemEntryLineValue; k: number }) => {
        const group = this.createDetail();
        this.writeDetail(group, item);
        this.detailsAt(op.i, op.j)?.insert(k, group, { emitEvent: false });
      });
    });
    this.optionalItems.updateValueAndValidity();
    this.emitTotals();
  }

  private nonNegativeProfitValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null =>
      control.value != null && control.value < 0 ? { negativeProfit: true } : null;
  }
}
