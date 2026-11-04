import { FormPromptService } from 'src/app/shared/components/form-prompt-modal/form-prompt.service';
import { dealSheetPriceDetails, expandDealComponents } from 'src/app/shared/utils/deal-pricing.util';
import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AfterViewInit, Component, computed, effect, EventEmitter, HostBinding, inject, Input, OnDestroy, OnInit, Output, signal, untracked, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MrRequestComponent } from '../mr-request/mr-request.component';
import { MaterialRequestModalComponent } from '../material-request-modal/material-request-modal.component';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { JobService } from 'src/app/core/services/job/job.service';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { Subscription, debounceTime } from 'rxjs';
import { MrDetails, QuoteItem, QuoteItemDetails, ProductPartNumber, SupplierLastPrice } from 'src/app/shared/interfaces/purchase.interface';
import { ProductService, PartNumberOption } from 'src/app/core/services/product/product.service';
import { PrReviewStepComponent, ReviewAward, ReviewRow, ReviewSupplier } from './pr-review-step/pr-review-step.component';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';
import { SupplierFormDrawerComponent } from 'src/app/modules/suppliers/pages/supplier-form-drawer/supplier-form-drawer.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ModalService } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { ItemEntryComponent, LineSupplierOffer } from 'src/app/shared/components/item-entry/item-entry.component';
import { PurchaseOrderStatusRow, PurchaseOrderStatusSupplier, SalesRfqCompareColumn } from 'src/app/shared/interfaces/sales-rfq.interface';
import { PoCancelModalComponent } from './po-cancel-modal/po-cancel-modal.component';
import { PoReassignModalComponent } from './po-reassign-modal/po-reassign-modal.component';
import { PrFormComponent } from './pr-form/pr-form.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { InitiateLpoComponent } from 'src/app/modules/purchase-order/pages/initiate-lpo/initiate-lpo.component';
import {
  DetailViewBadge,
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

interface PartNumberDropdownOption {
  label: string;
  value: string;
  data: PartNumberOption;
}

@Component({
  selector: 'app-create-purchase',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ProductFormDrawerComponent,
    SupplierFormDrawerComponent,
    SmartFormModule,
    DetailViewShellComponent,
    ActionButtonComponent,
    NgIcon,
    MatTooltipModule,
    DetailBadgeComponent,
    PrFormComponent,
    PrReviewStepComponent,
    InitiateLpoComponent,
  ],
  templateUrl: './create-purchase.component.html',
  styleUrl: './create-purchase.component.css',
})
export class CreatePurchaseComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Renders the create form in a slide-over instead of as a page. The host mounts it per opening. */
  @Input() drawer = false;
  /** Drawer mode: job to preselect (replaces the `jobId` query param of the page). */
  @Input() initialJobId: string | null = null;
  /** Drawer mode: start as a general purchase (replaces the `withoutJob` query param). */
  @Input() withoutJob = false;
  /** Drawer/page launch can own the source mode, so users do not switch between PR and General mid-form. */
  @Input() sourceLocked = false;
  /** Drawer mode: an existing PR to edit (replaces the `/purchase/edit/:id` route param). */
  @Input() editPurchaseId: string | null = null;
  /** Drawer mode: the step to open on; when absent it follows the PR status (Approved opens POs, Pending opens Compare & award). */
  @Input() initialStep: 1 | 2 | 3 | 4 | 5 | null = null;
  /** Drawer mode: look-only view of items, compare & award and additional costs, with just a Close button. */
  @Input() viewOnly = false;
  /** Drawer mode: a PR was created or saved as a draft, so the list should reload. */
  @Output() saved = new EventEmitter<void>();
  /** Drawer mode: the slide-out animation finished; the host can unmount. */
  @Output() closed = new EventEmitter<void>();
  /** Id of a request just sent for approval, so the list can show Pending before its reload lands. */
  @Output() submitted = new EventEmitter<string>();

  @HostBinding('style.display') get hostDisplay(): string | null {
    return this.drawer ? 'contents' : null;
  }

  private fb = inject(FormBuilder);
  private modal = inject(ModalService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private toaster = inject(ToastrService)
  private salesRfqService = inject(SalesRfqService)
  private purchaseService = inject(PurchaseService)
  private jobService = inject(JobService)
  private productService = inject(ProductService)
  private employeeService = inject(EmployeeService)
  private supplierService = inject(SupplierService)
  private purchaseOrderService = inject(PurchaseOrderService)
  private confirm = inject(ConfirmDialogService)
  private formPrompt = inject(FormPromptService)
  private subscriptions = new Subscription()

  generatedPRId: string = '';
  prSequence: string = '0001'
  purchaseJobData!: any;
  purchaseNo!: string;
  purchaseId: string | null = null;

  itemsList = signal<any[]>([])
  isSubmitted = signal<boolean>(false);
  jobSheets = signal<getJob[]>([]);
  selectedJobSheet!: getJob;
  requestedJobId = signal<string>('')
  isEditing: boolean = false;
  partNumberOptions = signal<PartNumberDropdownOption[]>([])
  currency = signal<string>('')
  isJobLess: boolean = false;
  currentEmployeeName = signal<string>('');
  suppliersList = signal<any[]>([]);

  // header / view model
  breadcrumbs: DetailViewBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PR', link: '/purchase/pr' }];
  badges = signal<DetailViewBadge[]>([]);
  headerSubtitle = signal<string>('');
  stats = signal<DetailViewStat[]>([]);
  jobOptions = computed<SfOption[]>(() => this.jobSheets().map((j: any) => ({ label: j.jobId, value: j._id, description: j.clientDetails?.companyName })));
  supplierOptions = computed<SfOption[]>(() => this.suppliersList().map((s) => ({ label: s.supplierName, value: s._id })));
  itemCount = computed(() => this.itemsList().reduce((n, item: any) => n + (item.itemDetails?.length || 0), 0));

  // --- Item entry ----------------------------------------------------------------------
  // Integration boundary: `itemsList` (and `saveItemsToBackend`) stays the source of truth because the
  // comparison sheet, MR linkage and supplier discounts all key off the saved item records. The
  // shared editor gets its own option → items → details array seeded from that list; every line
  // carries a `lineKey` so an edited/reordered/removed line can be mapped back to its saved record.

  entryForm: FormGroup = this.fb.group({ optionalItems: this.fb.array([]) });
  get entryItems(): FormArray { return this.entryForm.get('optionalItems') as FormArray; }
  /** The form array's own dirty flag is cleared whenever a child control is marked pristine, so supplier-tab changes are tracked here too. */
  private extraDirty = false;
  get entryDirty(): boolean { return this.extraDirty || this.entryItems.dirty; }
  private markEntryDirty(): void { this.extraDirty = true; this.entryItems.markAsDirty(); }
  private markEntryPristine(): void { this.extraDirty = false; this.entryItems.markAsPristine(); }
  liveTotalLpo = signal<number>(0);

  /** A new list means the editor reseeds from it, so whatever it held is no longer unsaved work. */
  private resetEntryDirty = effect(() => {
    this.itemsList();
    untracked(() => this.markEntryPristine());
  });

  entrySeed = computed<ItemEntryOptionValue[]>(() => [{
    totalDiscount: null,
    items: this.itemsList().map((item: any, i: number) => ({
      itemName: item.itemName || '',
      itemDetails: (item.itemDetails || []).map((d: any, j: number) => ({
        itemCode: d.itemCode || '',
        productId: this.getPartNumberValue(d.productId) || null,
        partNo: typeof d.partNo === 'object' ? d.partNo?.partNo || '' : d.partNo || '',
        detail: d.detail || '',
        quantity: d.quantity ?? null,
        unitCost: d.unitCost ?? null,
        unitSellingPrice: d.unitSellingPrice ?? null,
        availability: d.availability || '',
        supplierId: this.lineSupplierId(d) || null,
        uom: d.uom || '',
        lineKey: this.lineKeyOf(i, j, d),
      })),
    })),
  }]);

  private originalsByKey = computed(() => {
    const map = new Map<string, any>();
    this.itemsList().forEach((item: any, i: number) =>
      (item.itemDetails || []).forEach((d: any, j: number) => map.set(this.lineKeyOf(i, j, d), d)));
    return map;
  });

  /** The item group each saved line belongs to; the flat editor folds every group into one, so this restores them on save. */
  private groupByKey = computed(() => {
    const map = new Map<string, string>();
    this.itemsList().forEach((item: any, i: number) =>
      (item.itemDetails || []).forEach((d: any, j: number) => map.set(this.lineKeyOf(i, j, d), item.itemName || '')));
    return map;
  });

  /** A reopened draft/PR keeps the supplier on the selected comparison (else the first) when the line itself has none. */
  private lineSupplierId(d: any): string {
    const id = d?.supplierId?._id || d?.supplierId || (d?.comparisons || []).find((c: any) => c.selected)?.supplierId || d?.comparisons?.[0]?.supplierId;
    return id ? String(id) : '';
  }

  private lineKeyOf(i: number, j: number, detail: any): string {
    return detail?._id || `idx-${i}-${j}`;
  }

  private originalAt(i: number, j: number, k: number): any | undefined {
    const items = this.entryItems.at(i)?.get('items') as FormArray | null;
    const details = items?.at(j)?.get('itemDetails') as FormArray | null;
    const key = details?.at(k)?.get('lineKey')?.value;
    return key ? this.originalsByKey().get(key) : undefined;
  }

  /** Awarded lines stay editable; nothing is locked in the PR item entry. */
  lineLocked = (_i: number, _j: number, _k: number): boolean => false;

  /** Lines already on a live PO, by line id -> the PO holding them. They change only after that PO is rejected or cancelled. */
  poLockedLines: Record<string, string> = {};

  /** What live POs already took of each line, by line id (ordered qty and the qty per supplier); a line with quantity left over stays editable within limits. */
  poUsage: Record<string, { ordered: number; po: string; suppliers: Record<string, number> }> = {};
  /** Discount per supplier already carried by live POs: it cannot be lowered below this. */
  poDiscounts: Record<string, number> = {};
  discountFloor = (supplierId: string): number => this.poDiscounts[supplierId] || 0;

  private lineKeyAt(i: number, j: number, k: number): string | undefined {
    const items = this.entryItems.at(i)?.get('items') as FormArray | null;
    const details = items?.at(j)?.get('itemDetails') as FormArray | null;
    return details?.at(k)?.get('lineKey')?.value || undefined;
  }

  /** Lines fully on live POs: nothing on them changes. */
  lineHardLocked = (i: number, j: number, k: number): boolean => {
    const key = this.lineKeyAt(i, j, k);
    return !!key && !!this.poLockedLines[key];
  };

  /** Lines with part of their quantity on a PO: product and quantity are fixed and the line stays; the quantity left can go to other suppliers. */
  lineFixed = (i: number, j: number, k: number): boolean => {
    const key = this.lineKeyAt(i, j, k);
    return !!key && !!this.poUsage[key] && !this.poLockedLines[key];
  };

  /** The quantity of a line can go up but not below what is already on POs. */
  lineMinQty = (i: number, j: number, k: number): number => {
    const key = this.lineKeyAt(i, j, k);
    return (key && this.poUsage[key]?.ordered) || 0;
  };

  /** Suppliers that already have quantity ordered on a PO, so their tab and award stay. */
  private orderedSupplierIds(): Set<string> {
    return new Set(Object.values(this.poUsage).flatMap((u) => Object.keys(u.suppliers)));
  }

  /** For the item form's "Not awarded" filter: the line's saved copy says whether a supplier won it. */
  lineAwarded = (line: any): boolean => {
    const saved = line?.lineKey ? this.originalsByKey().get(line.lineKey) : undefined;
    return !!saved && (this.isAwardedLine(saved) || this.isResolvedLine(saved));
  };

  private isAwardedLine(detail: any): boolean {
    const won = (detail?.comparisons || []).filter((c: any) => c.selected);
    if (!won.length) return false;
    // Every chosen supplier needs a price.
    if (won.some((c: any) => !(Number(c.unitPrice) > 0))) return false;
    // A line split between suppliers is awarded once their shares add up to its quantity.
    if (!won.some((c: any) => c.awardedQty)) return true;
    const total = won.reduce((sum: number, c: any) => sum + (+c.awardedQty || +detail.quantity || 0), 0);
    return total + 0.0001 >= (+detail.quantity || 0);
  }

  /** Awarded, or not awarded yet but carrying the deal sheet's default supplier, which counts as awarded on submit. */
  private isResolvedLine(detail: any): boolean {
    // A line marked short goes for approval with whatever is awarded (the server gate skips it too).
    if (detail?.short) return true;
    const anyWon = (detail?.comparisons || []).some((c: any) => c.selected);
    return anyWon ? this.isAwardedLine(detail) : !!detail?.supplierId && Number(detail?.unitCost) > 0;
  }

  /** Each supplier's last price per product (last PO, else last comparison), in the request's currency. */
  private lastPrices = signal<SupplierLastPrice[]>([]);

  /** Loads the last prices of the request's products, so a supplier added to a line starts at its last price. */
  private loadLastPrices(): void {
    const ids = [...new Set([
      ...this.itemsList().flatMap((item: any) => (item.itemDetails || []).map((d: any) => String(d.productId?._id || d.productId || ''))),
      ...this.entryProductIds(),
    ].filter(Boolean))];
    this.lastPricesFor = ids.slice().sort().join(',');
    if (!ids.length) { this.lastPrices.set([]); return; }
    this.subscriptions.add(this.purchaseService.getSupplierPrices(ids, [], this.currency() || 'QAR').subscribe({
      next: (res) => this.lastPrices.set(res?.data || []),
      error: () => this.lastPrices.set([]),
    }));
  }

  /** The product ids the last prices were loaded for. */
  private lastPricesFor = '';

  /** Products linked on the editor's lines, saved or not. */
  private entryProductIds(raw: any[] = this.entryItems.getRawValue()): string[] {
    return (raw?.[0]?.items || [])
      .flatMap((item: any) => (item.itemDetails || []).map((d: any) => String(d.productId || '')))
      .filter(Boolean);
  }

  /** A line linked to a product with no loaded prices yet reloads them, so its suppliers start at their last price. */
  private refreshLastPricesForEntry(raw?: any[]): void {
    const loaded = new Set(this.lastPricesFor.split(','));
    if (this.entryProductIds(raw).some((id) => !loaded.has(id))) this.loadLastPrices();
  }

  private lastPricesByProduct = computed(() => {
    const map = new Map<string, SupplierLastPrice[]>();
    this.lastPrices().forEach((p) => map.set(String(p.productId), [...(map.get(String(p.productId)) ?? []), p]));
    return map;
  });

  /** The suppliers on each saved line, from its comparisons: chosen ones are awarded, priced ones are offers. */
  private offersByLine = computed(() => {
    const map = new Map<string, LineSupplierOffer[]>();
    this.originalsByKey().forEach((d, key) => {
      const list: LineSupplierOffer[] = [];
      (d?.comparisons || []).forEach((c: any) => {
        if (!c.supplierId || list.some((o) => o.supplierId === String(c.supplierId))) return;
        const price = Number(c.unitPrice) > 0 ? Number(c.unitPrice) : null;
        list.push({
          supplierId: String(c.supplierId),
          supplierName: c.supplierName || this.supplierOptions().find((o) => o.value === String(c.supplierId))?.label || 'Supplier',
          state: c.selected ? 'awarded' : price != null ? 'priced' : 'none',
          price,
          qty: c.selected && c.awardedQty ? Number(c.awardedQty) : undefined,
          savedQty: Number(c.offeredQty) > 0 ? Number(c.offeredQty) : Number(c.quantity) > 0 ? Number(c.quantity) : undefined,
        });
      });
      // Nobody awarded: the line's own (deal sheet) supplier is listed as an option only; nothing reads as selected.
      const ownId = String(d?.supplierId?._id || d?.supplierId || '');
      if (ownId && !list.some((o) => o.supplierId === ownId)) {
        const cost = Number(d.unitCost) > 0 ? Number(d.unitCost) : null;
        list.push({ supplierId: ownId, supplierName: d.supplierDetails?.supplierName || d.supplierName || this.supplierOptions().find((o) => o.value === ownId)?.label || 'Supplier', state: cost != null ? 'priced' : 'none', price: cost });
      }
      map.set(key, list);
    });
    return map;
  });

  /** A line's suppliers: those compared on it, its current supplier, and suppliers with a last price for the product. */
  lineOffers = (line: any): LineSupplierOffer[] => {
    // Called for every line on every change detection pass: hand back the same array until the inputs change.
    const cache = this.offerCache();
    const product = String(line?.productId?._id || line?.productId || '');
    const key = `${line?.lineKey ?? ''}|${line?.supplierId ?? ''}|${product}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const offers = (this.offersByLine().get(line?.lineKey) ?? []).map((o) => ({ ...o }));
    const label = (id?: string) => (id ? this.supplierOptions().find((o) => o.value === id)?.label : undefined);
    if (line?.supplierId && !offers.some((o) => o.supplierId === String(line.supplierId))) {
      const name = label(String(line.supplierId));
      if (name) offers.push({ supplierId: String(line.supplierId), supplierName: name, state: 'none' });
    }
    // A last price seeds a supplier with no price on the line; a supplier only known from it does not join the line's tabs.
    (this.lastPricesByProduct().get(product) ?? []).forEach((p) => {
      let o = offers.find((x) => x.supplierId === String(p.supplierId));
      if (!o) {
        const name = label(String(p.supplierId));
        if (!name) return;
        o = { supplierId: String(p.supplierId), supplierName: name, state: 'none', pastOnly: true };
        offers.push(o);
      }
      o.last = p;
      if (o.price == null) o.price = p.lastPrice;
    });
    cache.set(key, offers);
    return offers;
  };

  /** Fresh (empty) whenever the offers, the last prices or the supplier list change. */
  private offerCache = computed(() => {
    this.offersByLine();
    this.lastPricesByProduct();
    this.supplierOptions();
    return new Map<string, LineSupplierOffer[]>();
  });

  onOfferPicked(_event: { lineKey: string; offer: LineSupplierOffer }): void {
    this.markEntryDirty();
    this.recomputeLiveTotal();
  }

  /** A supplier pill on a line: the line (already patched with the supplier and its price) is that supplier's; kept on Save. */
  onPillPicked(_e: { lineKey: string; supplierId: string; price: number | null }): void {
    this.markEntryDirty();
    this.recomputeLiveTotal();
  }

  lineBadge = (i: number, j: number, k: number): string | null =>
    this.originalAt(i, j, k)?.fromMrRequest ? 'MR' : null;

  /** The supplier tabs a line is listed under (same rule as the tab counts). */
  linePills = (d: any): { id: string; name: string }[] => {
    const excluded = this.tabExcluded();
    const handed = this.tabLines();
    const offers = this.lineOffers(d);
    return this.supplierTabs()
      .filter((t) => {
        const own = String(d.supplierId || '') === t.id;
        if (d.lineKey && (excluded[t.id] ?? []).includes(d.lineKey)) return false;
        return own || offers.some((o) => o.supplierId === t.id && !o.pastOnly) || (!!d.lineKey && (handed[t.id] ?? []).includes(d.lineKey));
      })
      .map((t) => ({ id: t.id, name: t.name }));
  };

  private lineHasContent(d: any): boolean {
    return !!(d?.detail || '').toString().trim() || d?.quantity != null || d?.unitCost != null;
  }

  /** "Items" lists every line; each supplier tab narrows the same lines to those that supplier is asked about. */
  activeTab = 'items';
  private addedSuppliers = signal<string[]>([]);
  private lineTick = signal(0);

  supplierTabs = computed<{ id: string; name: string; count: number; total: number; closable: boolean }[]>(() => {
    this.lineTick();
    const counts = new Map<string, number>();
    const items = this.entryItems.getRawValue()?.[0]?.items || [];
    const handed = this.tabLines();
    // Handed lines already counted through an offer (the RFQ was saved) are not counted twice.
    const handedExtra = new Map<string, number>(Object.entries(handed).map(([id, keys]) => [id, keys.length]));
    let total = 0;
    const inUse = new Set<string>();
    const removed = this.removedSuppliers();
    const dealSuppliers = this.dealSupplierIds();
    items.forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      total++;
      const ids = new Set<string>();
      this.lineOffers(d).forEach((o) => o.supplierId && !o.pastOnly && ids.add(o.supplierId));
      if (d.supplierId) ids.add(String(d.supplierId));
      const excluded = this.tabExcluded();
      const shared = d.lineKey ? this.prFormCmp?.itemEntry?.lineShares(d.lineKey) : null;
      // A supplier that holds an award on any line stays on the PR; a line's default supplier (e.g. from the deal) can be closed.
      shared?.forEach((s) => s.qty > 0 && inUse.add(s.supplierId));
      this.lineOffers(d).forEach((o) => o.supplierId && o.state === 'awarded' && inUse.add(o.supplierId));
      removed.forEach((id) => ids.delete(id));
      ids.forEach((id) => {
        if ((excluded[id] ?? []).includes(d.lineKey)) return;
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (d.lineKey && handed[id]?.includes(d.lineKey)) handedExtra.set(id, (handedExtra.get(id) ?? 0) - 1);
      });
    }));
    this.addedSuppliers().forEach((id) => removed.includes(id) || counts.has(id) || counts.set(id, 0));
    const name = (id: string) => this.supplierOptions().find((o) => o.value === id)?.label || 'Supplier';
    // Only a supplier added by hand that no line or offer uses yet can be closed (lines handed to the tab are released with it).
    // Keep each supplier where it first appeared, so awarding a line never reorders the tabs or pills.
    counts.forEach((_, id) => this.tabOrder.includes(id) || this.tabOrder.push(id));
    return [...counts]
      // Deal-sheet suppliers always come first; suppliers added later follow them.
      .sort(([a], [b]) => (Number(dealSuppliers.has(b)) - Number(dealSuppliers.has(a))) || this.tabOrder.indexOf(a) - this.tabOrder.indexOf(b))
      .map(([id, count]) => ({
        id, name: name(id), count: count + Math.max(0, handedExtra.get(id) ?? 0), total, closable: !inUse.has(id) && !dealSuppliers.has(id),
      }));
  });

  /** Suppliers chosen on the deal sheet: their tabs are fixed; only tabs added later for comparison can be closed. */
  private dealSupplierIds = computed(() => {
    const ids = new Set<string>();
    this.dealQty().forEach((v) => v.supplierId && ids.add(v.supplierId));
    return ids;
  });

  /** Suppliers taken off the PR by hand: their saved comparisons are dropped on Save. */
  private removedSuppliers = signal<string[]>([]);
  private tabOrder: string[] = [];

  /** Lines ticked on Items when a supplier tab was added: shown under that tab with that supplier, never written onto the line. */
  private tabLines = signal<Record<string, string[]>>({});
  private static readonly NO_LINES: string[] = [];

  activeTabLineKeys(): string[] {
    return this.tabLines()[this.activeTab] ?? CreatePurchaseComponent.NO_LINES;
  }

  onSupplierTabClosed(id: string): void {
    if (this.dealSupplierIds().has(id)) return;
    if (this.orderedSupplierIds().has(id)) {
      this.toaster.warning('This supplier already has quantity on a purchase order, so its tab stays.');
      return;
    }
    this.addedSuppliers.update((l) => l.filter((x) => x !== id));
    this.removedSuppliers.update((l) => [...new Set([...l, id])]);
    // Lines that defaulted to this supplier (e.g. from the deal) lose that default, or the tab would come straight back.
    const entry = this.prFormCmp?.itemEntry;
    entry?.itemsAt(0).controls.forEach((_, j) => (entry.detailsAt(0, j)?.controls || []).forEach((c) => {
      const ctl = c.get('supplierId');
      if (String(ctl?.value || '') === id) ctl!.setValue('');
    }));
    this.tabLines.update(({ [id]: _, ...rest }) => rest);
    if (this.activeTab === id) this.activeTab = 'items';
    this.lineTick.update((n) => n + 1);
    this.markEntryDirty();
  }

  onSupplierTabAdded(e: { supplierId: string; lineKeys: string[] }): void {
    const id = e?.supplierId;
    if (!id) return;
    this.removedSuppliers.update((l) => l.filter((x) => x !== id));
    if (!this.addedSuppliers().includes(id)) this.addedSuppliers.update((l) => [...l, id]);
    if (e.lineKeys.length) {
      this.tabLines.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...e.lineKeys])] }));
      this.tabExcluded.update((m) => ({ ...m, [id]: (m[id] ?? []).filter((k) => !e.lineKeys.includes(k)) }));
    }
    this.activeTab = id;
    if (e.lineKeys.length) this.markEntryDirty();
  }

  onLinesAddedToTab(lineKeys: string[]): void {
    const id = this.activeTab;
    if (id === 'items' || !lineKeys.length) return;
    this.tabLines.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...lineKeys])] }));
    this.tabExcluded.update((m) => ({ ...m, [id]: (m[id] ?? []).filter((k) => !lineKeys.includes(k)) }));
    this.lineTick.update((n) => n + 1);
    this.markEntryDirty();
  }

  /** Lines taken out of a supplier tab by hand (a line's only supplier cannot be taken out). */
  private tabExcluded = signal<Record<string, string[]>>({});

  activeTabExcludedKeys(): string[] {
    return this.tabExcluded()[this.activeTab] ?? CreatePurchaseComponent.NO_LINES;
  }

  onLinesRemovedFromTab(lineKeys: string[]): void {
    const id = this.activeTab;
    if (id === 'items' || !lineKeys.length) return;
    // A supplier cannot be taken off a line it already has ordered quantity on.
    const kept = lineKeys.filter((k) => this.poUsage[k]?.suppliers[id]);
    if (kept.length) {
      this.toaster.warning('This supplier already has quantity ordered on that product, so it stays on it.');
      lineKeys = lineKeys.filter((k) => !kept.includes(k));
      if (!lineKeys.length) return;
    }
    this.tabLines.update((m) => ({ ...m, [id]: (m[id] ?? []).filter((k) => !lineKeys.includes(k)) }));
    this.tabExcluded.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...lineKeys])] }));
    this.lineTick.update((n) => n + 1);
    this.markEntryDirty();
  }

  /** Chooses the active supplier for the ticked lines. The item entry already set the line's supplier, shares and cost; they are kept on Save. */
  onLinesAwardedToTab(lines: { lineKey: string; price: number; qty: number; total: number }[]): void {
    const id = this.activeTab;
    if (id === 'items' || !lines.length) return;
    // The chosen supplier keeps the line under its tab even when another supplier leads the line.
    this.tabLines.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...lines.map((l) => l.lineKey)])] }));
    this.lineTick.update((n) => n + 1);
    this.markEntryDirty();
  }

  private recomputeLiveTotal(raw: any[] = this.entryItems.getRawValue()): void {
    this.lineTick.update((n) => n + 1);
    const byKey = this.originalsByKey();
    let total = 0;
    (raw?.[0]?.items || []).forEach((item: any) =>
      (item.itemDetails || []).forEach((d: any) => {
        if (d.lineKey && byKey.get(d.lineKey)?.fromMrRequest) return;
        total += (+d.quantity || 0) * (+d.unitCost || 0);
      }));
    this.liveTotalLpo.set(total);
  }

  /** Translates the editor back into the `itemsList` shape, keeping each saved line's hidden fields. */
  private collectEntryItems(quiet = false): any[] | null {
    const byKey = this.originalsByKey();
    const groups = this.groupByKey();
    let invalid = false;
    let overName = '';
    const items: any[] = [];
    const groupOf = (name: string) => {
      let g = items.find((x) => x.itemName === name);
      if (!g) items.push(g = { itemName: name, itemDetails: [] });
      return g;
    };

    (this.entryItems.getRawValue()?.[0]?.items || []).forEach((item: any) => {
      const formName = (item.itemName || '').toString().trim();
      (item.itemDetails || []).filter((d: any) => this.lineHasContent(d)).forEach((d: any) => {
        const { lineKey, profit, productId, partNo: _partCode, ...fields } = d;
        if (!(fields.detail || '').toString().trim() || !(+fields.quantity > 0)) invalid = true;
        const original = lineKey ? byKey.get(lineKey) : undefined;
        const line = {
          ...(original ?? { isNewlyAdded: true, merged: false, comparisons: [] }),
          ...fields,
          partNo: String(_partCode ?? '').trim(),
          productId: productId || '',
          supplierId: fields.supplierId || (this.removedSuppliers().includes(String(original?.supplierId)) ? '' : original?.supplierId) || '',
        };
        // The deal's cost stays the baseline; the line's own cost is the award.
        const deal = this.dealHit(groups.get(lineKey) ?? formName, fields.detail);
        // A baseline already on the line is kept: a later deal sheet change must not rewrite this request's diffs.
        if (deal?.cost != null && !(Number(line.dealUnitCost) > 0)) line.dealUnitCost = deal.cost;
        line.comparisons = this.lineComparisons({ ...d, ...line });
        // A supplier cannot be offered more than the deal asks for on the line.
        const over = line.comparisons.find((c: any) => Number(c.quantity) > Number(line.quantity) + 0.0001);
        if (over && !overName) overName = `${over.supplierName || 'A supplier'} quantity (${over.quantity}) is above the line quantity (${line.quantity}) for ${line.detail}`;
        // A deal line goes under its deal item, a saved line back to its own group, a new line under the group it was added to.
        const name = deal?.itemName || (lineKey && groups.get(lineKey)) || formName || line.detail || 'Item';
        groupOf(name).itemDetails.push(line);
      });
    });

    if (invalid) {
      if (quiet) return items;
      this.toaster.warning('Please fill all required fields!');
      return null;
    }
    if (overName && !quiet) {
      this.toaster.warning(`${overName}. Reduce it to continue.`);
      return null;
    }
    return items;
  }

  /**
   * The line's supplier comparisons as the form now holds them: every supplier tab it is under keeps its price
   * (typed, offered or its last price), and the suppliers chosen in the form are selected with their shares.
   */
  private lineComparisons(d: any): any[] {
    const entry = this.prFormCmp?.itemEntry;
    const key: string | undefined = d.lineKey;
    // Payment terms are required on a comparison; the deal sheet's can be blank.
    const gone = this.removedSuppliers();
    const list: any[] = (d.comparisons || [])
      .filter((c: any) => c.selected || !gone.includes(String(c.supplierId)))
      .map((c: any) => ({ ...c, paymentTerms: c.paymentTerms || 'Not specified' }));
    const lineQty = Number(d.quantity) || 0;
    // A line added in this edit has no key yet: its own supplier and cost are its only comparison.
    if (entry && !key && d.supplierId && Number(d.unitCost) > 0 && !list.some((c) => String(c.supplierId) === String(d.supplierId))) {
      const supplierId = String(d.supplierId);
      list.push({ supplierId, supplierName: this.supplierOptions().find((o) => o.value === supplierId)?.label || '', quantity: lineQty, unitPrice: Number(d.unitCost), uom: d.uom || '', etaTerms: d.availability || '', paymentTerms: 'Not specified', selected: false });
    }
    if (!entry || !key) return list;
    const nameOf = (id: string) => this.supplierOptions().find((o) => o.value === id)?.label || '';
    const upsert = (supplierId: string, price: number | null, qty: number | null) => {
      let c = list.find((x) => String(x.supplierId) === supplierId);
      if (!c) {
        // A supplier added to the line with no price yet is still saved (price 0 = not quoted), so the comparison is not lost.
        // A new comparison starts from the line's own quantity, UoM and availability; the buyer changes them per supplier later.
        c = { supplierId, supplierName: nameOf(supplierId), quantity: qty || lineQty, unitPrice: price ?? 0, uom: d.uom || '', etaTerms: d.availability || '', paymentTerms: 'Not specified', selected: false };
        list.push(c);
      } else if (price != null) c.unitPrice = price;
      return c;
    };
    const shares = entry.lineShares(key);
    this.linePills(d).forEach((p) => {
      // The line's own supplier, unsplit, is priced by the line's cost; any other supplier by its tab.
      const own = String(d.supplierId || '') === p.id && !(shares && shares.length > 1);
      const price = own ? (Number(d.unitCost) > 0 ? Number(d.unitCost) : null) : entry.scopePrice(key, p.id);
      const edit = entry.scopeEdit(key, p.id);
      const c = upsert(p.id, price, edit.quantity);
      // What the buyer set on this supplier's tab is the supplier's own UoM and availability.
      if (c && edit.quantity) c.quantity = edit.quantity;
      if (c && edit.uom) c.uom = edit.uom;
      if (c && edit.availability) c.etaTerms = edit.availability;
    });
    if (shares) {
      list.forEach((c) => { c.selected = false; c.awardedQty = undefined; });
      const live = shares.filter((s) => s.qty > 0);
      live.forEach((s) => {
        // A line awarded whole to its own supplier is priced by the line's cost, which the buyer may have edited since the award (the share keeps the old price).
        const edited = live.length === 1 && s.supplierId === String(d.supplierId || '') && Number(d.unitCost) > 0;
        const cost = edited ? Number(d.unitCost) : s.cost;
        const c = upsert(s.supplierId, cost > 0 ? cost : null, s.qty);
        if (!c) return;
        c.selected = true;
        c.awardedQty = s.qty;
        c.quantity = s.qty;
      });
    }
    return list;
  }

  /** Pulls unsaved editor changes into `itemsList` before a whole-form save. */
  private syncEntryToList(): boolean {
    if (!this.entryDirty) return true;
    const items = this.collectEntryItems();
    if (!items) return false;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.markEntryPristine();
    return true;
  }

  onSaveEntryItems(): void {
    const items = this.collectEntryItems();
    if (!items) return;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.markEntryPristine();
    this.saveItemsToBackend(items);
  }

  purchaseForm: FormGroup = this.fb.group({
    customerId: ['', [Validators.required]],
    supplierId: [''],
    salesManager: ['', [Validators.required]],
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    dealSheetId: ['', [Validators.required]],
    items: this.fb.array([this.createQuoteItemGroup()]),
    totalLpo: [0, [Validators.required]],
    status: [''],
    createdBy: [''],
    job: [''],
    customer: [''],
  })

  toggleJobLess(isJobLess: boolean): void {
    this.isJobLess = isJobLess;
    this.selectedJobSheet = undefined as any;
    this.requestedJobId.set('');
    this.itemsList.set([]);
    this.purchaseForm.reset();
    this.purchaseForm.get('purchaseNo')?.setValue(this.purchaseNo);

    const jobIdControl = this.purchaseForm.get('jobId');
    const dealSheetIdControl = this.purchaseForm.get('dealSheetId');
    const customerIdControl = this.purchaseForm.get('customerId');
    const supplierIdControl = this.purchaseForm.get('supplierId');

    if (isJobLess) {
      jobIdControl?.clearValidators();
      dealSheetIdControl?.clearValidators();
      customerIdControl?.clearValidators();
      supplierIdControl?.clearValidators();
      this.loadCurrentEmployeeName();
    } else {
      jobIdControl?.setValidators([Validators.required]);
      dealSheetIdControl?.setValidators([Validators.required]);
      customerIdControl?.setValidators([Validators.required]);
      supplierIdControl?.clearValidators();
    }

    if (isJobLess && this.itemsList().length === 0) {
      this.onAddColumnClicks();
    }
    jobIdControl?.updateValueAndValidity();
    dealSheetIdControl?.updateValueAndValidity();
    customerIdControl?.updateValueAndValidity();
    supplierIdControl?.updateValueAndValidity();
  }

  loadSuppliers(): void {
    this.subscriptions.add(
      this.supplierService.supplierList().subscribe({
        next: (res) => {
          this.suppliersList.set(res.data || []);
        },
        error: (error) => {
          console.error('Failed to load suppliers', error);
        }
      })
    );
  }

  loadCurrentEmployeeName(): void {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((emp) => {
        if (emp) {
          const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
          this.currentEmployeeName.set(name);
          this.purchaseForm.patchValue({ salesManager: name });
        } else {
          this.employeeService.getEmployeeData();
        }
      })
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(this.employeeService.employeeData$.subscribe((emp: any) => {
      const role = String(emp?.category?.role || '');
      this.canCancelPo = /^(admin|superadmin)$/i.test(role) || !!emp?.category?.privileges?.purchaseOrder?.canCancel;
    }));
    const url = this.route.snapshot.routeConfig?.path || '';
    this.isEditing = !!this.editPurchaseId || (!this.drawer && url.includes('edit'));

    if (this.isEditing) {
      this.purchaseId = this.drawer ? this.editPurchaseId : <string>this.route.snapshot.paramMap.get('id');
      this.loadPurchaseData();
    } else {
      this.purchaseForm.reset();
      this.getPurchaseNo();
      
      const jobId = this.drawer ? this.initialJobId : this.route.snapshot.queryParamMap.get('jobId');
      if (jobId) {
        this.requestedJobId.set(jobId);
      }

      if (this.drawer ? this.withoutJob : this.route.snapshot.queryParamMap.get('withoutJob') === 'true') {
        this.toggleJobLess(true);
      }

      this.deelSheets(jobId);
    }

    this.generatedPRId = this.generateId();
    this.loadPartNumbers();
    this.loadSuppliers();

    (this.purchaseForm.get('items') as FormArray).valueChanges.subscribe(() => {
      this.updateTotalLpo();
    });

    this.subscriptions.add(this.entryItems.valueChanges.subscribe(() => {
      const raw = this.entryItems.getRawValue();
      this.recomputeLiveTotal(raw);
      this.refreshLastPricesForEntry(raw);
    }));

    this.refreshHeader();
    this.subscriptions.add(this.purchaseForm.valueChanges.pipe(debounceTime(150)).subscribe(() => this.refreshHeader()));
  }

  ngAfterViewInit(): void {
    // Mounted closed and opened on the next tick so the drawer slides in instead of appearing.
    if (this.drawer) setTimeout(() => (this.drawerShown = true));
  }

  // --- Drawer mode -------------------------------------------------------------------

  drawerShown = false;
  /** Widens the drawer to the full viewport for the item table. */
  fullView = false;

  drawerSubtitle(): string {
    const subtitle = this.headerSubtitle();
    const pr = this.f['purchaseNo'].value;
    const jobId = this.isJobLess ? '' : (this.f['jobId'].value || (this.selectedJobSheet as any)?.jobId || '');
    return [pr, jobId, subtitle].filter(Boolean).join(' · ');
  }

  formTitle(): string {
    if (this.viewOnly) return this.isJobLess ? 'View general purchase' : 'View purchase requisition';
    if (this.isEditing && this.isApproved) return 'Initiate POs';
    if (this.isJobLess) return this.isEditing ? 'Edit general purchase' : 'New general purchase';
    return this.isEditing ? 'Edit purchase requisition' : 'New purchase requisition';
  }

  sourceTitle(): string {
    return this.isJobLess ? 'General purchase' : 'Job purchase';
  }

  sourceSubtitle(): string {
    return this.isJobLess
      ? 'Create a supplier purchase that is not tied to a job.'
      : 'Create from an approved job so deal sheet items, customer and pricing stay linked.';
  }

  /** Items auto-save to a server draft, so only an unsaved pick or a half-typed row counts as dirty. */
  isDrawerDirty(): boolean {
    return this.entryDirty || (!this.purchaseId && (!!this.requestedJobId() || this.itemCount() > 0));
  }

  closeDrawer(): void {
    if (!this.drawerShown) return;
    this.drawerShown = false;
    // A draft may already exist (items auto-save), so let the list pick it up.
    if (this.purchaseId) this.saved.emit();
    setTimeout(() => this.closed.emit(), 250);
  }

  /** After create/draft: the page returns to the list, the drawer just closes over it. */
  private backToList(submittedId?: string): void {
    if (this.drawer) {
      if (submittedId) this.submitted.emit(submittedId);
      this.saved.emit();
      this.closeDrawer();
      return;
    }
    this.router.navigate([this.isJobLess ? '/purchase/po/general' : '/purchase/pr']);
  }

  /** Header badges/stats; kept in signals so the shell's inputs only change when the form does. */
  private refreshHeader(): void {
    const v = this.purchaseForm.getRawValue();
    const total = this.calculateTotalLpo();
    const money = `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim();
    const status = v.status || (this.isEditing ? '' : 'New');
    const tones: Record<string, DetailViewBadge['tone']> = { Pending: 'warn', Approved: 'good', Rejected: 'bad', New: 'info', 'In Progress': 'info' };

    this.badges.set([
      ...(status ? [{ label: status, tone: tones[status] ?? 'neutral' }] : []),
      ...(this.isJobLess ? [{ label: 'General purchase', tone: 'info' as const }] : []),
    ]);
    this.headerSubtitle.set(this.isJobLess
      ? (this.suppliersList().find((s) => s._id === v.supplierId)?.supplierName || 'Suppliers chosen per line')
      : (v.customer || 'No job selected'));
    this.stats.set(this.isJobLess
      ? [
          { label: 'PR No', value: v.purchaseNo || '—' },
          { label: 'Items', value: String(this.itemCount()) },
          { label: 'Total PR value', value: money },
        ]
      : [
          { label: 'PR No', value: v.purchaseNo || '—' },
          { label: 'Job ID', value: this.isEditing ? (v.jobId || '—') : (this.selectedJobSheet as any)?.jobId || '—' },
          { label: 'Deal sheet', value: v.dealSheetId || '—' },
          { label: 'Items', value: String(this.itemCount()) },
          { label: 'Total PR value', value: money },
        ]);
  }

  selectJobById(jobId: string): void {
    this.jobService.getOneJob(jobId).subscribe({
      next: (res) => {
        if (res && res.length > 0) {
          this.patchValues(res[0]);
        }
      },
      error: (error) => {
        console.error(error);
        this.toaster.error('Failed to load job details');
      }
    });
  }

  loadPurchaseData(): void {
    if (!this.purchaseId) return;

    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (res) => {
          if (res.data) {
            const purchase = res.data;
            this.isJobLess = purchase.sourceType === 'manual' || !purchase.jobId;

            if (this.isJobLess) {
              const jobIdControl = this.purchaseForm.get('jobId');
              const dealSheetIdControl = this.purchaseForm.get('dealSheetId');
              const customerIdControl = this.purchaseForm.get('customerId');
              const supplierIdControl = this.purchaseForm.get('supplierId');
              jobIdControl?.clearValidators();
              dealSheetIdControl?.clearValidators();
              customerIdControl?.clearValidators();
              supplierIdControl?.clearValidators();
              jobIdControl?.updateValueAndValidity();
              dealSheetIdControl?.updateValueAndValidity();
              customerIdControl?.updateValueAndValidity();
              supplierIdControl?.updateValueAndValidity();
            }

            this.purchaseForm.patchValue({
              customerId: purchase.customerId?._id || purchase.customerId,
              supplierId: purchase.supplierId?._id || purchase.supplierId || '',
              salesManager: `${(purchase.quoteCreatedBy ?? purchase.createdBy)?.firstName || ''} ${(purchase.quoteCreatedBy ?? purchase.createdBy)?.lastName || ''}`.trim(),
              purchaseNo: purchase.purchaseNo,
              jobId: purchase.jobId?.jobId || '',
              dealSheetId: purchase.jobId?.quoteId?.dealData?.dealId || purchase.dealSheetId,
              customer: purchase.customerId?.companyName || purchase.customer,
              status: purchase.status,
              totalLpo: purchase.totalLpo,
              job: purchase.jobId?._id || purchase.jobId
            });

            this.poLockedLines = purchase.lockedLines || {};
            this.poUsage = purchase.poUsage || {};
            this.poDiscounts = (purchase as any).poDiscounts || {};
            if (purchase.items) {
              this.itemsList.set(purchase.items);
              this.patchItemsValuesWithPartNoIds(purchase.items);
              this.updateTotalLpo();
            }

            if (purchase.currency) {
              this.currency.set(purchase.currency);
            }
            this.loadLastPrices();

            if (purchase.mrRequest?.engineer) {
              this.patchMrValues(purchase.mrRequest);
            }

            if (purchase.supplierDiscounts?.suppliers) {
              this.patchSupplierDiscounts(purchase.supplierDiscounts);
            }
            // Older PRs never stored their own costs: those fall back to the deal sheet's.
            if (Array.isArray(purchase.additionalCosts)) {
              this.prCosts = purchase.additionalCosts.map((c: any) => ({ name: c.name || '', value: Number(c.value) || 0 }));
            }

            this.openFirstStep(purchase.status);

            const purchaseJobId = purchase.jobId?._id || purchase.jobId;
            if (purchaseJobId) {
              this.jobService.getOneJob(purchaseJobId).subscribe({
                next: (jobRes) => {
                  if (jobRes && jobRes.length > 0) {
                    this.selectedJobSheet = jobRes[0];
                    this.purchaseForm.get('jobId')?.setValue(jobRes[0].jobId || '');
                    this.refreshHeader();
                    this.refreshDealQty();
                  }
                },
                error: (error) => {
                  console.error(error);
                }
              });
            }
          }
        },
        error: (error) => {
          console.error('Error loading purchase data:', error);
          this.toaster.error('Failed to load purchase data');
        }
      })
    );
  }

  /** Stops an empty or half-filled request from being sent for approval. Returns true when it can go. */
  private canSubmitForApproval(): boolean {
    // The reactive form still carries a stale items array, so its overall validity is not a reliable gate; check the fields that matter.
    this.purchaseForm.get('supplierId')?.markAsTouched();
    this.purchaseForm.get('job')?.markAsTouched();
    if (!this.isJobLess && !(this.purchaseForm.get('job')?.value || this.purchaseForm.get('jobId')?.value)) {
      this.toaster.error('Select a job before submitting');
      return false;
    }
    const lines = this.itemsList().flatMap((item: any) => item.itemDetails || []);
    if (!lines.some((d: any) => String(d.detail || '').trim() && Number(d.quantity) > 0)) {
      this.toaster.error('Add at least one item with a description and a quantity before submitting');
      return false;
    }
    if (lines.some((d: any) => Number(d.quantity) < 0 || Number(d.unitCost) < 0)) {
      this.toaster.error('Quantities and costs cannot be negative');
      return false;
    }
    return true;
  }

  /** True when a line has no item code. Part no (the catalogue link) is optional. */
  private hasCatalogueGaps(): boolean {
    return this.itemsList().some((item: any) => (item.itemDetails || []).some((d: any) =>
      String(d.detail || '').trim() && !String(d.itemCode || '').trim()));
  }

  onSubmit(): void {
    if (!this.syncEntryToList()) return;
    if (!this.canSubmitForApproval()) return;
    if (this.hasCatalogueGaps() || this.prFormCmp?.itemEntry?.hasSubmitProblems()) {
      // Saving and awarding work without catalogue products; only sending for approval needs every line linked and valid.
      this.toaster.warning('Fill the highlighted fields: every line needs a catalogue product with an item code before it can be sent for approval. Pick the product or use + Create product.');
      this.goToStep(2);
      setTimeout(() => this.prFormCmp?.itemEntry?.showCatalogueGaps(), 60);
      return;
    }
    if (!this.allAwarded) {
      this.toaster.error('Award every product in Compare & award before sending for approval');
      return;
    }
    this.statusBeforeSubmit = this.purchaseForm.get('status')?.value;
    this.purchaseForm.get('status')?.setValue('Pending')
    if (this.isEditing) {
      this.onEditSubmits()
    } else {
      this.sendToService()
    }
  }

  /** Status held before Submit set Pending, put back if the request fails so Save stays available. */
  private statusBeforeSubmit: string | undefined;

  private submitFailed(error: any): void {
    console.error(error);
    this.purchaseForm.get('status')?.setValue(this.statusBeforeSubmit ?? this.draftStatus);
    this.toaster.error(error?.error?.message || 'Failed to send for approval');
  }

  /** A saved-but-unsubmitted PR is In Progress (New is only a job allocated but not yet started). */
  private get draftStatus(): 'In Progress' {
    return 'In Progress';
  }

  /** Save and Send for approval are offered on a new request, one still being prepared, and a rejected or revoked one being reworked; never on a submitted one. */
  get canSaveDraft(): boolean {
    if (this.viewOnly) return false;
    return !this.isEditing || ['New', 'In Progress', 'Rejected', 'Revoked'].includes(this.purchaseForm.get('status')?.value);
  }

  onDraftClicks() {
    if (!this.syncEntryToList()) return;
    if (this.purchaseId) {
      this.updatePurchaseDraft();
    } else {
      this.createPurchaseDraft();
    }
  }

  @ViewChild(PrFormComponent) private prFormCmp?: PrFormComponent;

  createPurchaseDraft(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = this.draftStatus;

    this.subscriptions.add(
      this.purchaseService.createPurchaseDraft(formValue).subscribe({
        next: (res) => {
          if (res.success && res.data?._id) {
            this.purchaseId = res.data._id;
            this.toaster.success('Purchase saved as draft');
            this.backToList();
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to save draft');
        }
      })
    );
  }

  updatePurchaseDraft(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = this.draftStatus;

    this.subscriptions.add(
      this.purchaseService.updatePurchase(this.purchaseId!, formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase updated successfully');
            this.backToList();
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to update purchase');
        }
      })
    );
  }

  sendToService() {
    if (this.purchaseId) {
      this.updatePurchase();
    } else {
      this.createPurchase();
    }
  }

  createPurchase(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = 'Pending';

    this.subscriptions.add(
      this.purchaseService.createPurchase(formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase request submitted for approval');
            this.backToList(res.data?._id);
          }
        },
        error: (error) => this.submitFailed(error)
      })
    );
  }

  updatePurchase(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = 'Pending';

    this.subscriptions.add(
      this.purchaseService.updatePurchase(this.purchaseId!, formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase request submitted for approval');
            this.backToList(this.purchaseId!);
          }
        },
        error: (error) => this.submitFailed(error)
      })
    );
  }

  getFormValueForSave(): any {
    const job = this.purchaseForm.get('job')?.value;
    const formValue = { ...this.purchaseForm.value };

    if (job) {
      formValue.jobId = job;
    }
    const itemsWithPartNoObjects = this.convertPartNoIdsToObjects(this.itemsList());
    formValue.items = itemsWithPartNoObjects;
    formValue.additionalCosts = this.extraCosts
      .filter((c) => c.name?.trim() && Number(c.value) > 0)
      .map((c) => ({ name: c.name.trim(), value: Number(c.value) }));
    delete formValue.job;

    formValue.sourceType = this.isJobLess ? 'manual' : 'job';
    if (this.isJobLess) {
      delete formValue.jobId;
      delete formValue.dealSheetId;
    }

    return formValue;
  }



  onDiscardClicks() {
    if (this.drawer) {
      this.closeDrawer();
      return;
    }
    const isJobLess = this.isJobLess;
    this.purchaseForm.reset()
    this.itemsList.set([])
    this.router.navigate([isJobLess ? '/purchase/po/general' : '/purchase/pr'])
  }

  createSupplierGroup(): FormGroup {
    return this.fb.group({
      suppliers: this.fb.array([]),
      totalDiscount: ['']
    });
  }

  createMrGroup(): FormGroup {
    return this.fb.group({
      engineer: ['', Validators.required],
      message: ['', Validators.required],
      createdDate: [new Date()]
    });
  }

  createQuoteItemDetailGroup(): FormGroup {
    return this.fb.group({
      detail: ['', Validators.required],
      quantity: ['', Validators.required],
      unitCost: ['', Validators.required],
      unitSellingPrice: [''],
      availability: [''],
      partNo: [''],
      productId: [''],
      supplierName: [''],
      email: [''],
      phoneNo: [''],
      dealSelected: [false],
    });
  }

  createQuoteItemGroup(): FormGroup {
    return this.fb.group({
      itemName: [''],
      itemDetails: this.fb.array([
        this.createQuoteItemDetailGroup()
      ])
    });
  }


  patchValues(job: getJob) {
    this.selectedJobSheet = job
    this.requestedJobId.set(job._id);
    this.purchaseForm.patchValue({
      customer: job?.clientDetails?.companyName,
      customerId: job?.clientDetails?._id,
      salesManager: `${job?.salesPersonDetails?.[0]?.firstName || ''} ${job?.salesPersonDetails?.[0]?.lastName || ''}`.trim(),
      dealSheetId: job?.quotation?.dealData?.dealId,
      jobId: job.jobId,
      job: job._id
    })

    const currency = (job?.quotation as any)?.currency || (job?.quotation as any)?.dealData?.currency || '';
    if (currency) {
      this.currency.set(currency);
    }

    if (!this.isEditing) {
      const updatedItems = expandDealComponents(job.quotation?.dealData?.updatedItems);
      const itemsWithComparisons = this.patchComparisonsData(updatedItems, job.quotation?.dealData);
      this.itemsList.set(itemsWithComparisons);
      this.patchItemsValuesWithPartNoIds(itemsWithComparisons);
      this.loadLastPrices();
      this.prCosts = null;

      if (job.quotation?.dealData?.additionalCosts) {
        this.convertAdditionalCostsToSupplierDiscounts(job.quotation.dealData.additionalCosts);
      }
    }
  }

  patchComparisonsData(updatedItems: any[], dealData: any): any[] {
    return (updatedItems || []).map(item => ({
      ...item,
      itemDetails: (item.itemDetails || []).map((detail: any) => ({
        ...detail,
        unitSellingPrice: detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null 
          ? detail.unitSellingPrice 
          : (detail.unitCost || 0),
        unitCost: detail.unitCost || 0,
        comparison: true,
        comparisons: detail.supplierDetails || detail.supplierId ? [
          {
            paymentTerms: dealData?.paymentTerms || 'Not specified',
            etaTerms: detail.availability || '',
            // The Deal Sheet supplier is only a default; the PR has to award each line itself.
            selected: false,
            supplierId: detail.supplierDetails?._id || detail.supplierId || '',
            supplierName: detail.supplierDetails?.supplierName || detail.supplierName || '',
            totalCost: (detail.unitCost || 0) * (detail.quantity || 0),
            unitPrice: detail.unitCost || 0,
            quantity: detail.quantity || 0
          }
        ] : [],
      }))
    }));
  }

  patchItemsValues(items: any[]) {
    const itemsFormArray = this.purchaseForm.get('items') as FormArray;
    itemsFormArray.clear();
    const updatedItems = items || [];
    updatedItems.forEach(item => {
      itemsFormArray.push(this.createItemGroup(item));
    });
  }

  patchItemsValuesWithPartNoIds(items: any[]) {
    const itemsFormArray = this.purchaseForm.get('items') as FormArray;
    itemsFormArray.clear();
    const updatedItems = items || [];
    updatedItems.forEach(item => {
      const itemGroup = this.createItemGroup(item);
      const itemDetailsArray = itemGroup.get('itemDetails') as FormArray;
      itemDetailsArray.controls.forEach(control => {
        const partNo = control.get('partNo')?.value;
        if (partNo && typeof partNo === 'object' && partNo._id) {
          control.get('partNo')?.setValue(partNo._id);
        }
      });
      itemsFormArray.push(itemGroup);
    });
  }

  patchMrValues(data: MrDetails) {
    if (!this.purchaseForm.get('mrRequest')) {
      this.purchaseForm.addControl('mrRequest', this.createMrGroup());
    }
    (this.purchaseForm.get('mrRequest') as FormGroup).patchValue(data);
  }

  /** A discount typed on a supplier tab is stored with the request's supplier discounts. */
  /** A supplier discount typed since the last save. Items are saved on their own route, so these go separately. */
  private discountsUnsaved = false;

  /** Saves the supplier discounts typed on the Items step; runs `next` once they are stored (or when there is nothing to store). */
  private saveDiscountsThen(next: () => void): void {
    const v = this.purchaseForm.get('supplierDiscounts')?.value;
    if (!this.discountsUnsaved || !this.purchaseId || !v?.suppliers) { next(); return; }
    const payload = {
      suppliers: v.suppliers.map((s: any) => ({ supplierId: s.supplierId?._id ?? s.supplierId, discount: Number(s.discount) || 0 })),
      totalDiscount: Number(v.totalDiscount) || 0,
    };
    this.subscriptions.add(this.purchaseService.updatePurchase(this.purchaseId, { supplierDiscounts: payload } as any).subscribe({
      next: (res) => { if (res.success) this.discountsUnsaved = false; next(); },
      error: () => { this.toaster.error('Failed to save supplier discounts'); },
    }));
  }

  /** Suppliers whose discount was typed in this session, so a typed 0 is kept instead of falling back to the deal's figure. */
  private typedDiscountIds = new Set<string>();

  onSupplierDiscountEdited(e: { supplierId: string; discount: number }): void {
    this.discountsUnsaved = true;
    this.typedDiscountIds.add(e.supplierId);
    const idOf = (s: any) => String(s?.supplierId?._id ?? s?.supplierId ?? '');
    const ctrl = this.purchaseForm.get('supplierDiscounts');
    if (!ctrl) this.purchaseForm.addControl('supplierDiscounts', this.createSupplierGroup());
    const target = this.purchaseForm.get('supplierDiscounts')!;
    const arr = target.get('suppliers') as FormArray | null;
    if (arr) {
      const row = arr.controls.find((c) => idOf(c.value) === e.supplierId);
      if (row) row.get('discount')?.setValue(e.discount);
      else arr.push(this.fb.group({ supplierId: [e.supplierId], discount: [e.discount], discountType: ['amount'] }));
      const total = arr.controls.reduce((sum, c) => sum + (Number(c.get('discount')?.value) || 0), 0);
      target.get('totalDiscount')?.setValue(total.toString());
      return;
    }
    // Loaded from a saved request: the control holds a plain object.
    const value = { ...(target.value ?? {}) };
    const suppliers = [...(value.suppliers ?? [])];
    const at = suppliers.findIndex((s: any) => idOf(s) === e.supplierId);
    if (at >= 0) suppliers[at] = { ...suppliers[at], discount: e.discount };
    else suppliers.push({ supplierId: e.supplierId, discount: e.discount, discountType: 'amount' });
    const total = suppliers.reduce((sum: number, s: any) => sum + (Number(s.discount) || 0), 0);
    target.setValue({ ...value, suppliers, totalDiscount: total.toString() });
  }

  patchSupplierDiscounts(supplierDiscounts: any) {
    if (!supplierDiscounts) return;

    if (!this.purchaseForm.get('supplierDiscounts')) {
      this.purchaseForm.addControl('supplierDiscounts', this.fb.control(supplierDiscounts));
    } else {
      this.purchaseForm.get('supplierDiscounts')?.setValue(supplierDiscounts);
    }
  }


  createItemGroup(item: QuoteItem): FormGroup {
    return this.fb.group({
      itemName: [item?.itemName || ''],
      itemDetails: this.fb.array(
        (item?.itemDetails || []).map((detail: any) => this.createItemDetailsGroup(detail))
      )
    });
  }

  createItemDetailsGroup(item: QuoteItemDetails): FormGroup {
    return this.fb.group({
      detail: [item.detail || '', Validators.required],
      quantity: [item.quantity || 0, Validators.required],
      unitSellingPrice: [item.unitSellingPrice || 0],
      unitCost: [item.unitCost || 0, Validators.required],
      availability: [item.availability || ''],
      partNo: [typeof item.partNo === 'object' ? (item.partNo as any)?.partNo || '' : (item.partNo || '')],
      productId: [(item as any).productId?._id ?? (item as any).productId ?? (typeof item.partNo === 'object' ? (item.partNo as any)?._id : '') ?? ''],
      supplierName: [item.supplierName || ''],
      email: [item.email || ''],
      phoneNo: [item.phoneNo || ''],
      dealSelected: [item.dealSelected || false],
      comparison: [(item as any).comparison || false],
      comparisons: [item.comparisons || []],
      paymentTerms: [(item as any).paymentTerms || ''],
      etaTerms: [(item as any).etaTerms || ''],
      selected: [(item as any).selected || false],
      supplierId: [(item as any).supplierId || ''],
      totalCost: [(item as any).totalCost || 0],
      unitPrice: [(item as any).unitPrice || 0]
    });
  }

  ensurePurchaseId(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.purchaseId) {
        resolve(this.purchaseId);
        return;
      }

      if (!this.selectedJobSheet && !this.isJobLess) {
        this.warningMessage('Please select any job from given list');
        reject('No job selected');
        return;
      }

      const formValue = this.getFormValueForSave();
      formValue.status = this.draftStatus;

      this.purchaseService.createPurchaseDraft(formValue).subscribe({
        next: (res) => {
          if (res.success && res.data?._id) {
            const newPurchaseId = res.data._id;
            this.purchaseId = newPurchaseId;
            resolve(newPurchaseId);
          } else {
            reject('Failed to create draft');
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to create draft');
          reject(error);
        }
      });
    });
  }

  generateId(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `NT/PR-${year}-${month}-${this.prSequence}`;
  }


  /** Every product line has an awarded supplier offer; only then can the request go for approval. */
  get allAwarded(): boolean {
    const lines = this.itemsList().flatMap((item: any) => item.itemDetails || []).filter((d: any) => Number(d.quantity) > 0);
    return lines.length > 0 && lines.every((d: any) => this.isResolvedLine(d));
  }

  /** Awarded vs total product lines, for the Compare & award counter and the submit hint. */
  get awardStats(): { awarded: number; total: number } {
    // Read by the footer on every change detection pass; rebuilding every line each time froze the drawer for seconds.
    // Everything the count depends on is a signal (or bumps lineTick on a form change), so reuse it until one changes.
    const version = this.awardVersion();
    const dirty = this.entryDirty;
    const hit = this.awardCache;
    if (hit && hit.version === version && hit.dirty === dirty) return hit.value;
    // Unsaved awards and releases count too, so the counter moves as the pills are clicked.
    const source = dirty ? (this.collectEntryItems(true) ?? this.itemsList()) : this.itemsList();
    const lines = source.flatMap((item: any) => item.itemDetails || []).filter((d: any) => Number(d.quantity) > 0);
    const value = { awarded: lines.filter((d: any) => this.isResolvedLine(d)).length, total: lines.length };
    this.awardCache = { version, dirty, value };
    return value;
  }

  private awardCache?: { version: object; dirty: boolean; value: { awarded: number; total: number } };

  /** A new object whenever something the award counter reads changes. */
  private awardVersion = computed(() => {
    this.lineTick(); this.itemsList(); this.tabLines(); this.tabExcluded(); this.removedSuppliers();
    this.dealQty(); this.lastPrices(); this.supplierOptions();
    return {};
  });

  /** Why Submit for approval is disabled, or null when it can go. */
  get submitBlockedReason(): string | null {
    const { awarded, total } = this.awardStats;
    if (!total) return 'Add at least one line';
    if (awarded < total) return `${total - awarded} line${total - awarded === 1 ? '' : 's'} not awarded`;
    return null;
  }

  /** Saves unsaved edits (and the draft itself) so the awards can point at saved lines, then runs `next`. */
  private whenSaved(next: (purchaseId: string) => void): void {
    if (!this.isJobLess && !this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }
    const proceed = () => this.ensurePurchaseId().then(next).catch(() => {});
    if (!this.entryDirty) {
      proceed();
      return;
    }
    const items = this.collectEntryItems();
    if (!items) return;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.markEntryPristine();
    this.saveItemsToBackend(items, (ok) => { if (ok) proceed(); });
  }

  /** 2 = items (the lines and their suppliers, one RFQ each), 3 = compare & award, 4 = POs once approved. Step 1 (Need) was merged into Items. */
  step: 1 | 2 | 3 | 4 | 5 = 2;
  /** The view-only drawer shows items, compare & award and additional costs; its POs are a tab on Items. */
  get shownSteps(): { n: 1 | 2 | 3 | 4 | 5; label: string }[] {
    if (!this.viewOnly) return this.steps;
    return this.steps.filter((s) => s.n >= 2 && s.n <= 4);
  }

  readonly steps: { n: 1 | 2 | 3 | 4 | 5; label: string }[] = [
    { n: 2, label: 'Items' },
    { n: 3, label: 'Compare & award' },
    { n: 4, label: 'Additional costs' },
    { n: 5, label: 'POs' },
  ];
  private dealQty = signal<Map<string, { itemName: string; detail: string; quantity: number; sellPrice: number | null; cost: number | null; supplierName: string; supplierId: string | null }>>(new Map());

  /** The deal sheet's cost and supplier for a line, the baseline the PR's awards are compared with. */
  lineDeal = (itemName: string, line: any): { cost: number | null; supplierId: string | null } | null => {
    const name = (line?.lineKey && this.groupByKey().get(line.lineKey)) || itemName;
    // Several lines can share an item and detail (same product, different price/qty): match them in order, not all to the first.
    const same = this.dealLinesByKey().get(CreatePurchaseComponent.dealKey(name, line?.detail));
    if (same && same.length > 1) {
      const n = line?.lineKey ? this.lineOrdinal().get(line.lineKey) : undefined;
      const hit = same[n !== undefined && n < same.length ? n : 0];
      return { cost: hit.cost, supplierId: hit.supplierId };
    }
    const hit = this.dealHit(name, line?.detail);
    return hit ? { cost: hit.cost, supplierId: hit.supplierId } : null;
  };

  /** Every deal line per item+detail, unmerged and in order. */
  private dealLinesByKey = signal<Map<string, { cost: number | null; supplierId: string | null }[]>>(new Map());

  /** Which occurrence of its item+detail each saved PR line is, so it pairs with the same-numbered deal line. */
  private lineOrdinal = computed(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, number>();
    this.itemsList().forEach((item: any, i: number) =>
      (item.itemDetails || []).forEach((d: any, j: number) => {
        const key = CreatePurchaseComponent.dealKey(item.itemName, d.detail);
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        out.set(this.lineKeyOf(i, j, d), n);
      }));
    return out;
  });

  /** The deal sheet line for a PR line: same item and detail, else the only deal line with that detail (a saved PR can regroup its lines). */
  private dealHit(itemName: string, detail: string) {
    const deal = this.dealQty();
    const exact = deal.get(CreatePurchaseComponent.dealKey(itemName, detail));
    if (exact) return exact;
    const same = this.dealByDetail().get((detail || '').trim().toLowerCase());
    return same?.length === 1 ? same[0] : undefined;
  }

  /** The deal lines grouped by detail, so a lookup by detail is not a scan of every deal line (it runs for every line on every check). */
  private dealByDetail = computed(() => {
    type DealLine = { itemName: string; detail: string; quantity: number; sellPrice: number | null; cost: number | null; supplierName: string; supplierId: string | null };
    const map = new Map<string, DealLine[]>();
    this.dealQty().forEach((v) => {
      const k = v.detail.trim().toLowerCase();
      map.set(k, [...(map.get(k) ?? []), v]);
    });
    return map;
  });
  reviewBusy = signal(false);

  private static dealKey(itemName: string, detail: string): string {
    return `${(itemName || '').trim().toLowerCase()}|${(detail || '').trim().toLowerCase()}`;
  }

  /** Deal sheet quantities and prices of the job, for the compare step's deal columns and margins. */
  private refreshDealQty(): void {
    const deal = new Map<string, { itemName: string; detail: string; quantity: number; sellPrice: number | null; cost: number | null; supplierName: string; supplierId: string | null }>();
    const updated = expandDealComponents((this.selectedJobSheet as any)?.quotation?.dealData?.updatedItems);
    const lines = new Map<string, { cost: number | null; supplierId: string | null }[]>();
    updated.forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      const key = CreatePurchaseComponent.dealKey(item.itemName, d.detail);
      lines.set(key, [...(lines.get(key) ?? []), {
        cost: Number(d.unitCost) || null,
        supplierId: d.supplierId?._id || d.supplierId ? String(d.supplierId?._id || d.supplierId) : null,
      }]);
      const prev = deal.get(key);
      deal.set(key, {
        itemName: item.itemName || '', detail: d.detail || '', quantity: (prev?.quantity ?? 0) + (Number(d.quantity) || 0),
        sellPrice: prev?.sellPrice ?? (Number(d.unitSellingPrice) || null), cost: prev?.cost ?? (Number(d.unitCost) || null),
        supplierName: prev?.supplierName || d.supplierName || '',
        supplierId: prev?.supplierId || (d.supplierId?._id || d.supplierId ? String(d.supplierId?._id || d.supplierId) : null),
      });
    }));
    this.dealLinesByKey.set(lines);
    this.dealQty.set(deal);
  }

  /** Once per opening: an approved PR opens on its POs, one with the approvers on its awards. */
  private stepChosen = false;
  /** Opened as rejected/revoked, so the submit button reads "Resend". */
  isResend = false;
  private openFirstStep(status: string): void {
    if (this.stepChosen) return;
    this.stepChosen = true;
    this.isResend = status === 'Rejected' || status === 'Revoked';
    // The view opens on Items; once approved, its POs tab sits next to the supplier tabs.
    if (this.viewOnly) {
      if (status === 'Approved') this.loadPos();
      return;
    }
    const step = this.initialStep ?? (status === 'Approved' ? 5 : status === 'Pending' ? 3 : null);
    if (step) this.goToStep(step === 1 ? 2 : step);
  }

  get isApproved(): boolean {
    return this.f['status']?.value === 'Approved';
  }

  /** A step is done when the next one has what it needs. */
  stepDone(n: number): boolean {
    const status = this.f['status']?.value;
    const submitted = !!status && !['New', 'In Progress', 'Rejected', 'Revoked'].includes(status);
    if (n === 2) return this.supplierTabs().length > 0 || submitted;
    if (n === 3) return submitted || (this.awardStats.total > 0 && !this.submitBlockedReason);
    if (n === 4) return this.stepDone(3);
    return this.poCards().length > 0 && this.poCards().every((c) => c.lpos.some((l) => ['Placed', 'Closed'].includes(l.poStatus)));
  }

  readonly stepDoneFn = (n: number): boolean => this.stepDone(n);
  readonly stepLockedFn = (n: number): boolean => this.stepLocked(n);
  /** Stable arrays for the stepper: the view-only drawer hides the POs step. */
  get shownLabels(): string[] { return this.viewOnly ? this.viewLabels : this.fullLabels; }
  get shownIds(): number[] { return this.viewOnly ? this.viewIds : this.fullIds; }
  private readonly fullLabels = this.steps.map((x) => x.label);
  private readonly fullIds: number[] = this.steps.map((x) => x.n);
  private readonly viewLabels = this.steps.filter((x) => x.n <= 4).map((x) => x.label);
  private readonly viewIds: number[] = this.steps.filter((x) => x.n <= 4).map((x) => x.n);

  stepLocked(n: number): boolean {
    return n === 5 && !this.isApproved;
  }

  goToStep(n: 1 | 2 | 3 | 4 | 5): void {
    if (this.stepLocked(n) || n === this.step) return;
    if (n === 1 || n === 2) {
      this.activeTab = 'items';
      this.step = 2;
      return;
    }
    // Leaving Items by the stepper saves like Save & compare does, so nothing typed there is lost.
    if (this.step === 2 && this.canSaveDraft) { this.onNextClicks(n); return; }
    this.openStep(n);
  }

  private openStep(n: 3 | 4 | 5): void {
    if (n === 3) { this.onNextClicks(); return; }
    if (n === 4) { this.step = 4; return; }
    this.loadPos();
    this.step = 5;
  }

  // --- Additional costs step -------------------------------------------------
  // Same three kinds as the deal sheet: extra costs and supplier discounts are the PR's own and can be
  // edited here; the customer discount was agreed on the deal and is only shown.

  readonly costReasonOptions: SfOption<string>[] = ['Shipping Charges', 'Transportation charges', 'Man power changes', 'CP', 'Other'].map((v) => ({ label: v, value: v }));
  /** The fixed reasons, plus the cost's own name when older data used one that isn't in the list, so it still shows. */
  costOptionsFor(name: string): SfOption<string>[] {
    return name && !this.costReasonOptions.some((o) => o.value === name) ? [{ label: name, value: name }, ...this.costReasonOptions] : this.costReasonOptions;
  }

  /** The PR's extra costs. Null until loaded or edited: until then the deal sheet's are used. */
  prCosts: { name: string; value: number | null }[] | null = null;

  private get dealCostList(): any[] {
    const costs = (this.selectedJobSheet as any)?.quotation?.dealData?.additionalCosts;
    return Array.isArray(costs) ? costs : [];
  }

  get extraCosts(): { name: string; value: number | null }[] {
    return (this.prCosts ??= this.dealCostList
      .filter((c) => (c.type || 'Additional Cost') === 'Additional Cost')
      .map((c) => ({ name: c.name || '', value: Number(c.value) || 0 })));
  }

  /** The deal's amount for a cost type, or null when the deal has no such cost (a cost added in this PR). */
  dealCostFor(name: string): number | null {
    const hits = this.dealCostList.filter((c) => (c.type || 'Additional Cost') === 'Additional Cost' && c.name && c.name === name);
    return hits.length ? hits.reduce((s, c) => s + (Number(c.value) || 0), 0) : null;
  }

  private dealDiscountsSource: any[] | null = null;
  private dealDiscountsCache: { supplierId: string; discount: number }[] = [];
  /** The deal's own supplier discounts: the baseline the PR cost is measured against. Cached so the input only changes with the deal. */
  get dealSupplierDiscounts(): { supplierId: string; discount: number }[] {
    const list = this.dealCostList;
    if (list !== this.dealDiscountsSource) {
      this.dealDiscountsSource = list;
      this.dealDiscountsCache = list.filter((c) => c.type === 'Supplier Discount')
        .map((c) => ({ supplierId: String(c.supplierId?._id ?? c.supplierId ?? ''), discount: Number(c.value) || 0 }));
    }
    return this.dealDiscountsCache;
  }

  get customerDiscounts():{ value: number }[] {
    return this.dealCostList.filter((c) => c.type === 'Customer Discount').map((c) => ({ value: Number(c.value) || 0 }));
  }

  /** `value` is the discount this PR uses for the supplier; `deal` is what the deal sheet agreed (never changed here). `pr` is the PR's own figure, used when it differs from the deal. */
  get supplierDiscountRows(): { supplierId: string; name: string; value: number; deal: number; pr: number; awarded: boolean }[] {
    const awarded = this.awardedSupplierIds();
    const v = this.purchaseForm.get('supplierDiscounts')?.value;
    return (v?.suppliers ?? []).map((s: any) => {
      const id = String(s?.supplierId?._id ?? s?.supplierId ?? '');
      const dealCosts = this.dealCostList.filter((c) => c.type === 'Supplier Discount' && String(c.supplierId?._id ?? c.supplierId ?? '') === id);
      const deal = dealCosts.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
      // The deal's discount is the default: a stored 0 only counts once the user typed it here.
      const value = Number(s.discount) || (this.typedDiscountIds.has(id) ? 0 : deal);
      return {
        supplierId: id,
        name: s?.supplierId?.supplierName || dealCosts[0]?.supplierDetails?.supplierName || this.supplierOptions().find((o) => o.value === id)?.label || 'Supplier',
        value,
        deal,
        pr: value,
        awarded: awarded.has(id),
      };
    });
  }
  get dealDiscountRows() { return this.supplierDiscountRows.filter((r) => r.deal > 0); }
  /** Suppliers whose PR discount differs from the deal (more or less), or that have none on the deal. The merge into the deal overwrites the deal with these. */
  get prDiscountRows() { return this.supplierDiscountRows.filter((r) => r.pr !== r.deal || r.deal === 0 || this.pinnedPrSuppliers.has(r.supplierId)); }
  /** One row per supplier with a discount on the deal or the PR, each showing its deal figure and the difference. */
  get discountRows() { return this.supplierDiscountRows.filter((r) => r.deal > 0 || r.pr > 0 || this.pinnedPrSuppliers.has(r.supplierId)); }
  /** Suppliers the user added to the PR list, kept visible even while their figure equals the deal's. */
  private pinnedPrSuppliers = new Set<string>();

  /** Suppliers that supply a line: awarded in Compare & award, or the line's default supplier when nobody is awarded. */
  private awardedSupplierIds(): Set<string> {
    const ids = new Set<string>();
    this.itemsList().forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      const won = (d.comparisons || []).filter((c: any) => c.selected && c.supplierId);
      won.forEach((c: any) => ids.add(String(c.supplierId?._id ?? c.supplierId)));
      if (!won.length && d.supplierId) ids.add(String(d.supplierId?._id ?? d.supplierId));
    }));
    return ids;
  }

  /** Deal cost and margin sit in the totals bar on Compare & award only; Additional costs is too narrow for them. */
  get showDealFigures(): boolean {
    return this.step === 3;
  }

  /** Suppliers that can still get a discount: awarded and not already listed. */
  get discountSupplierChoices(): SfOption[] {
    const used = new Set(this.discountRows.map((r) => r.supplierId));
    const awarded = this.awardedSupplierIds();
    return this.supplierOptions().filter((o) => awarded.has(String(o.value)) && !used.has(String(o.value)));
  }

  newDiscountSupplier: string | null = null;
  trackBySupplierId = (_: number, r: { supplierId: string }) => r.supplierId;

  addExtraCost(): void { this.extraCosts.push({ name: '', value: null }); }
  removeExtraCost(i: number): void { this.extraCosts.splice(i, 1); }

  addSupplierDiscount(): void {
    if (!this.newDiscountSupplier) return;
    const id = String(this.newDiscountSupplier);
    this.pinnedPrSuppliers.add(id);
    // A supplier already on the deal starts from the deal's figure; others start at 0.
    const existing = this.supplierDiscountRows.find((r) => r.supplierId === id);
    this.onSupplierDiscountEdited({ supplierId: id, discount: existing ? existing.value : 0 });
    this.newDiscountSupplier = null;
  }

  /** Sets the discount this PR uses for the supplier; the deal's own figure is untouched. */
  setPrDiscount(r: { supplierId: string }, pr: number): void {
    this.onSupplierDiscountEdited({ supplierId: r.supplierId, discount: pr });
  }

  /** Removes the PR's figure. A supplier with a deal discount goes back to the deal amount. */
  removeSupplierDiscount(supplierId: string): void {
    const target = this.purchaseForm.get('supplierDiscounts');
    if (!target) return;
    this.pinnedPrSuppliers.delete(supplierId);
    this.typedDiscountIds.delete(supplierId);
    const suppliers = this.supplierDiscountRows
      .filter((r) => r.supplierId !== supplierId || r.deal > 0)
      .map((r) => ({ supplierId: r.supplierId, discount: r.supplierId === supplierId ? r.deal : r.value, discountType: 'amount' }));
    const totalDiscount = suppliers.reduce((sum, s) => sum + s.discount, 0).toString();
    // Swap in a plain control: the saved shape may be a FormGroup or a plain object.
    this.purchaseForm.setControl('supplierDiscounts', this.fb.control({ suppliers, totalDiscount }));
  }

  get extraCostsTotal(): number { return this.extraCosts.reduce((s, c) => s + (Number(c.value) || 0), 0); }
  get dealExtraCostsTotal(): number {
    return this.dealCostList.filter((c) => (c.type || 'Additional Cost') === 'Additional Cost').reduce((s, c) => s + (Number(c.value) || 0), 0);
  }

  /** Totals bar: the lines' cost plus how far the PR's extra costs moved from the deal's (already in the deal baseline, like the discount). */
  /** Lines' cost less the supplier discount in force, plus all the PR's additional costs: same basis as the deal's Total cost. */
  prTotalCost(ie: ItemEntryComponent): number { return ie.prTotalCost(); }
  prMarginValue(ie: ItemEntryComponent): number { return ie.prMarginValue(); }
  prMarginPercent(ie: ItemEntryComponent): number {
    const selling = ie.prPrice();
    return selling > 0 ? (this.prMarginValue(ie) / selling) * 100 : 0;
  }
  /** Against the deal's margin after the deal's own extra costs, so unchanged costs read as no change. */
  /** Magnitude only, so the summary bar shows no minus sign. */
  absNum(v: number | null | undefined): number {
    return Math.abs(Number(v) || 0);
  }

  prMarginTone(ie: ItemEntryComponent): string {
    const diff = this.prMarginValue(ie) - ie.dealNetMargin().value;
    if (Math.abs(diff) <= 0.005) return 'text-gray-900 dark:text-gray-100';
    return diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  }
  get supplierDiscountTotal(): number { return this.supplierDiscountRows.filter((r) => r.awarded).reduce((s, r) => s + r.value, 0); }
  /** Quotation discount plus the deal's extra customer discounts; read from the deal, so PR edits never move it. */
  get dealCustomerDiscount(): number {
    const quote = Number((this.selectedJobSheet as any)?.quotation?.dealData?.totalDiscount) || 0;
    return quote + this.customerDiscountTotal;
  }
  /** The job's own Total cost and net price, exactly as the job sheet shows them. */
  get jobTotals(): { cost: number; price: number } | null {
    const d = (this.selectedJobSheet as any)?.quotation?.dealData;
    if (!d?.updatedItems) return null;
    // Same object each pass while the deal is the same, or the bound input would change on every check (NG0100).
    if (this.jobTotalsFor !== d) {
      const p = dealSheetPriceDetails(d.updatedItems, d.additionalCosts, d.totalDiscount);
      this.jobTotalsFor = d;
      this.jobTotalsCache = { cost: p.totalCost, price: p.totalSellingPrice };
    }
    return this.jobTotalsCache;
  }
  private jobTotalsFor: unknown = null;
  private jobTotalsCache: { cost: number; price: number } | null = null;
  get customerDiscountTotal(): number { return this.customerDiscounts.reduce((s, c) => s + c.value, 0); }

  onNextClicks(target: 3 | 4 | 5 = 3): void {
    // Submitted or approved: nothing to save, the compare step is read-only.
    // The totals bar of this step reads the item entry, so it must be on Items, not a supplier tab. The step opens a tick
    // later so the item entry has left the supplier tab before the bar reads it.
    const open = () => this.saveDiscountsThen(() => {
      this.activeTab = 'items';
      this.refreshDealQty();
      setTimeout(() => {
        this.step = 3;
        if (target !== 3) this.openStep(target);
      });
    });
    if (!this.canSaveDraft) { open(); return; }
    // Choices made in the item form (pills, supplier tabs) are saved first, so the compare step starts from them.
    const dirty = this.entryDirty;
    if (!this.syncEntryToList()) return;
    if (dirty && this.purchaseId) {
      this.saveItemsToBackend(this.itemsList(), (ok) => { if (ok) open(); });
      return;
    }
    this.whenSaved(open);
  }

  onBackClicks(): void {
    if (this.step <= 2) return;
    this.goToStep((this.step - 1) as 1 | 2 | 3 | 4);
  }

  /** Items step counters: lines with no supplier yet. */
  askSummary = computed(() => {
    this.lineTick();
    let unasked = 0;
    this.itemsList().forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      if (Number(d.quantity) > 0 && !d.supplierId && !(d.comparisons || []).some((c: any) => c.supplierId)) unasked++;
    }));
    return { unasked };
  });

  /** Every request line with its suppliers (from its comparisons), what is chosen, and the quantity not yet covered. */
  reviewRows = computed<ReviewRow[]>(() => {
    const deal = this.dealQty();
    const rows: ReviewRow[] = [];
    this.itemsList().forEach((item: any, i: number) => (item.itemDetails || []).forEach((d: any, j: number) => {
      const prQty = Number(d.quantity) || 0;
      if (!(prQty > 0)) return;
      const key = this.lineKeyOf(i, j, d);
      const suppliers: ReviewSupplier[] = [];
      let allocated = 0;
      const nameOf = (id?: string) => (id ? this.supplierOptions().find((o) => o.value === id)?.label : undefined);
      // The quantity follows the line entered in step 1: a sole winner takes the whole line, and split shares never exceed it.
      const winners = (d.comparisons || []).filter((c: any) => c.selected).length;
      (d.comparisons || []).forEach((c: any) => {
        const id = c.supplierId?._id || c.supplierId;
        if (!id || suppliers.some((s) => s.supplierId === String(id))) return;
        const won = !!c.selected;
        const qty = won ? (winners === 1 ? prQty : Math.min(Number(c.awardedQty) || Number(c.quantity) || prQty, Math.max(0, prQty - allocated))) : 0;
        const price = Number(c.unitPrice) > 0 ? Number(c.unitPrice) : null;
        allocated += qty;
        suppliers.push({
          supplierId: String(id), name: c.supplierName || nameOf(String(id)) || 'Supplier',
          state: won ? 'awarded' : price != null ? 'priced' : 'waiting', price,
          qty, offerQty: price != null ? Math.min(Number(c.quantity) > 0 ? Number(c.quantity) : prQty, prQty) : null, availability: c.etaTerms || undefined,
        });
      });
      // Suppliers on the line in step 1 (its supplier, its tabs) are options too, at their last price when they have one.
      const addOption = (id: string | undefined, name: string | undefined, price: number | null = null, offered?: number) => {
        if (!id || !name || suppliers.some((s) => s.supplierId === id)) return;
        suppliers.push({ supplierId: id, name, state: price != null ? 'priced' : 'waiting', price, qty: 0, offerQty: price != null ? Math.min(offered && offered > 0 ? offered : prQty, prQty) : null });
      };
      const offers = this.lineOffers({ ...d, lineKey: key, productId: this.getPartNumberValue(d.productId), supplierId: this.lineSupplierId(d) });
      offers.filter((o) => !o.pastOnly).forEach((o) => addOption(o.supplierId, o.supplierName, o.price ?? null, o.savedQty));
      Object.entries(this.tabLines()).forEach(([sid, keys]) => {
        const o = offers.find((x) => x.supplierId === sid);
        if (keys.includes(key)) addOption(sid, nameOf(sid), o?.price ?? null, o?.savedQty);
      });
      // The line's own supplier (from the deal sheet): with nobody chosen it supplies the whole line at the line's cost.
      const defaultId = String(d.supplierId?._id || d.supplierId || '');
      const defaultName = d.supplierDetails?.supplierName || d.supplierName || nameOf(defaultId) || '';
      // It is only a default: it does not count as awarded, so the line still shows as to award.
      if (defaultId && !allocated) {
        const hit = suppliers.find((s) => s.supplierId === defaultId);
        if (hit) {
          hit.state = 'default'; hit.qty = prQty;
          hit.price ??= Number(d.unitCost) || null;
          hit.offerQty ??= prQty;
          hit.availability ||= d.availability || undefined;
        } else suppliers.unshift({ supplierId: defaultId, name: defaultName || 'Supplier', state: 'default', price: Number(d.unitCost) || null, qty: prQty, offerQty: prQty, availability: d.availability || undefined });
      }
      const dealHit = deal.get(CreatePurchaseComponent.dealKey(item.itemName, d.detail)) ?? this.dealHit(item.itemName, d.detail);
      rows.push({
        key, itemName: dealHit?.itemName || item.itemName || '', detail: d.detail || '', uom: d.uom || undefined, prQty,
        dealQty: dealHit ? dealHit.quantity : null, allocated, remaining: Math.max(0, prQty - allocated), suppliers,
        sellPrice: dealHit?.sellPrice ?? (Number(d.unitSellingPrice) || null),
        dealCost: dealHit?.cost ?? null,
        dealSupplier: dealHit?.supplierName || defaultName || '',
        short: !!d.short,
        shortReason: d.shortReason,
      });
    }));
    return rows;
  });

  /** One compare column per supplier tab from step 1, plus any supplier that quoted without a tab. */
  reviewColumns = computed<{ id: string; name: string }[]>(() => {
    const cols = this.supplierTabs().map((t) => ({ id: t.id, name: t.name }));
    this.reviewRows().forEach((r) => r.suppliers.forEach((s) => {
      if (!cols.some((c) => (s.supplierId && c.id === s.supplierId) || c.name === s.name)) cols.push({ id: s.supplierId || s.name, name: s.name });
    }));
    return cols;
  });

  /** Deal sheet items that have no line in this request. */
  missingFromPr = computed(() => {
    const have = new Set(this.reviewRows().map((r) => CreatePurchaseComponent.dealKey(r.itemName, r.detail)));
    return [...this.dealQty()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  });

  onReviewAward(a: ReviewAward): void {
    this.onReviewAwardMany([a]);
  }

  /** Saves the supplier choices in order, straight on the request's lines. */
  onReviewAwardMany(awards: ReviewAward[]): void {
    if (!this.purchaseId || !awards.length) return;
    this.reviewBusy.set(true);
    this.subscriptions.add(this.purchaseService.awardLines(this.purchaseId, awards).subscribe({
      next: () => {
        this.reviewBusy.set(false);
        // Step 1 keeps its own copy of each line's awards; drop it so the pills follow what was just saved.
        this.prFormCmp?.itemEntry?.forgetShares(awards.map((a) => a.lineKey));
        // A line whose award was taken back goes back to the deal's supplier and cost in step 1.
        this.prFormCmp?.itemEntry?.releaseLines(awards.filter((a) => a.clear).map((a) => a.lineKey));
        this.loadPurchaseData();
        this.saved.emit();
      },
      error: (err) => {
        this.reviewBusy.set(false);
        this.toaster.error(err?.error?.message || 'Could not save the award.');
      },
    }));
  }

  // --- Step 4: POs -----------------------------------------------------------------

  private lpos = signal<any[]>([]);
  posLoading = signal(false);
  placingId: string | null = null;
  /** Initiate LPO slide-over, opened on one supplier. */
  createPoSupplierId: string | null = null;

  /** Per line and supplier: awarded, on POs, received, cancelled, left to order. */
  orderRows = signal<PurchaseOrderStatusRow[]>([]);
  /** Cancel a PO and move freed quantity to another supplier. */
  canCancelPo = false;
  /** Supplier cards opened to show their lines. */
  openPoCards = new Set<string>();

  private loadPos(): void {
    if (!this.purchaseId) return;
    this.posLoading.set(true);
    this.subscriptions.add(this.purchaseOrderService.getAllPurchaseOrders({ purchaseId: this.purchaseId, row: 200 }).subscribe({
      next: (res: any) => {
        this.lpos.set(res?.data || []);
        this.posLoading.set(false);
      },
      error: () => { this.lpos.set([]); this.posLoading.set(false); this.toaster.error('Could not load the POs of this request.'); },
    }));
    this.subscriptions.add(this.salesRfqService.getPurchaseOrderStatus(this.purchaseId).subscribe({
      next: (res) => this.orderRows.set(res?.data?.rows || []),
      error: () => this.orderRows.set([]),
    }));
  }

  trackPoCardLine = (_: number, x: { row: PurchaseOrderStatusRow }) => x.row.lineKey;

  /** A supplier's lines on the PO step: its share, what its POs hold, and what it still has to order. */
  poCardLines(supplierId: string): { row: PurchaseOrderStatusRow; s: PurchaseOrderStatusSupplier }[] {
    const out: { row: PurchaseOrderStatusRow; s: PurchaseOrderStatusSupplier }[] = [];
    this.orderRows().forEach((row) => {
      const s = row.suppliers.find((x) => x.supplierId === supplierId);
      if (s && (s.awardedQty > 0 || s.pos.length)) out.push({ row, s });
    });
    return out;
  }

  /** Card totals: quantity to order, received, cancelled. */
  poCardTotals(supplierId: string): { toOrder: number; ordered: number; received: number; cancelled: number } {
    return this.poCardLines(supplierId).reduce((t, { s }) => ({
      toOrder: t.toOrder + s.freeQty, ordered: t.ordered + s.orderedQty, received: t.received + s.receivedQty, cancelled: t.cancelled + s.cancelledQty,
    }), { toOrder: 0, ordered: 0, received: 0, cancelled: 0 });
  }

  /** Request-wide: lines still missing a PO, and quantity no supplier is awarded. */
  poStepSummary = computed(() => {
    const rows = this.orderRows();
    return {
      lines: rows.length,
      fullyOrdered: rows.filter((r) => r.awardedQty > 0 && r.toOrderQty <= 0).length,
      toOrder: rows.filter((r) => r.toOrderQty > 0).length,
      unawarded: rows.filter((r) => r.unawardedQty > 0 && !r.short).length,
      cancelled: rows.filter((r) => r.cancelledQty > 0).length,
    };
  });

  togglePoCard(id: string): void {
    if (this.openPoCards.has(id)) this.openPoCards.delete(id); else this.openPoCards.add(id);
  }

  canCancelStatus(status: string): boolean {
    return ['Draft', 'Pending for Approval', 'Approved', 'Placed'].includes(status);
  }

  onCancelPo(lpo: { _id: string; poNo: string }): void {
    const ref = this.modal.open<{ success: boolean }>(PoCancelModalComponent, { width: '760px', closeOnBackdrop: false, data: { poId: lpo._id, poNo: lpo.poNo } });
    ref.afterClosed().subscribe((r) => { if (r?.success) { this.loadPos(); this.saved.emit(); } });
  }

  onReassign(row: PurchaseOrderStatusRow, s: PurchaseOrderStatusSupplier): void {
    if (!this.purchaseId) return;
    const quoted: Record<string, number> = {};
    // Only prices kept on the line count as offered; the server takes them as they are.
    (this.originalsByKey().get(row.lineKey)?.comparisons || []).forEach((c: any) => {
      if (c.supplierId && Number(c.unitPrice) > 0) quoted[String(c.supplierId?._id || c.supplierId)] = Number(c.unitPrice);
    });
    const ref = this.modal.open<{ success: boolean }>(PoReassignModalComponent, {
      width: '560px',
      closeOnBackdrop: false,
      data: {
        purchaseId: this.purchaseId, lineKey: row.lineKey, detail: row.detail, uom: row.uom, currency: this.currency() || 'QAR',
        from: { supplierId: s.supplierId, supplierName: s.supplierName, freeQty: s.freeQty, unitPrice: s.unitPrice },
        quoted, suppliers: this.supplierOptions(),
      },
    });
    ref.afterClosed().subscribe((r) => { if (r?.success) { this.loadPurchaseData(); this.loadPos(); this.saved.emit(); } });
  }

  /** One card per awarded supplier: what it was awarded and the POs raised for it. */
  poCards = computed(() => {
    type Card = { supplierId: string; name: string; lines: number; value: number; lpos: { _id: string; poNo: string; poStatus: string; discount: number; hasGrn: boolean }[] };
    const cards = new Map<string, Card>();
    // On an approved request the order status is the truth: shares moved after approval show up here.
    if (this.orderRows().length) {
      this.orderRows().forEach((row) => row.suppliers.forEach((s) => {
        if (!(s.awardedQty > 0)) return;
        const c: Card = cards.get(s.supplierId) ?? { supplierId: s.supplierId, name: s.supplierName, lines: 0, value: 0, lpos: [] };
        c.lines++;
        c.value += (s.unitPrice ?? 0) * s.awardedQty;
        cards.set(s.supplierId, c);
      }));
    } else this.reviewRows().forEach((r) => {
      const awarded = r.suppliers.filter((s) => s.state === 'awarded');
      const chosen = awarded.length ? awarded : r.suppliers.filter((s) => s.state === 'default');
      chosen.forEach((s) => {
        if (!s.supplierId || !(s.qty > 0)) return;
        const c: Card = cards.get(s.supplierId) ?? { supplierId: s.supplierId, name: s.name, lines: 0, value: 0, lpos: [] };
        c.lines++;
        c.value += (s.price ?? 0) * s.qty;
        cards.set(s.supplierId, c);
      });
    });
    this.lpos().forEach((l) => {
      const id = String(l.supplierId?._id ?? l.supplierId ?? '');
      const c: Card | null = cards.get(id) ?? (id ? { supplierId: id, name: l.supplierId?.supplierName || l.supplierName || 'Supplier', lines: 0, value: 0, lpos: [] } : null);
      if (!c) return;
      c.lpos.push({ _id: l._id, poNo: l.poNo, poStatus: l.poStatus, discount: Number(l.discount) || 0, hasGrn: (Number(l.receivedQuantity) || 0) > 0 || (Array.isArray(l.grns) && l.grns.length > 0) });
      cards.set(id, c);
    });
    return [...cards.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  /** The discount this request uses for a supplier, shown on its PO card. */
  poCardDiscount(supplierId: string): number {
    return this.supplierDiscountRows.find((r) => r.supplierId === supplierId)?.value ?? 0;
  }

  poTone(status: string): string {
    return ['Placed', 'Closed'].includes(status)
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : status === 'Approved'
        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
        : status === 'Rejected'
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          : status === 'Cancelled'
            ? 'bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }

  onCreatePo(supplierId: string): void {
    this.createPoSupplierId = supplierId;
  }

  onCreatePoClosed(): void {
    this.createPoSupplierId = null;
  }

  onPoIssued(): void {
    this.loadPos();
    this.saved.emit();
  }

  onViewPo(id: string): void {
    this.router.navigate(['/purchase/view-lpo', id]);
  }

  cancellingId: string | null = null;

  /** Cancels a placed PO whole (everything not yet received); the reason is required. */
  async onCancelPlacedPo(lpo: { _id: string; poNo: string }): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: `Cancel ${lpo.poNo}?`,
      message: 'The order stops here and the quantities not yet received go back to be ordered. This cannot be undone.',
      confirmLabel: 'Cancel PO',
      reason: true,
    });
    if (!confirmed || !reason?.trim()) return;
    this.cancellingId = lpo._id;
    this.subscriptions.add(this.purchaseOrderService.cancelPurchaseOrder(lpo._id, reason.trim()).subscribe({
      next: () => { this.cancellingId = null; this.toaster.success(`${lpo.poNo} cancelled`); this.loadPos(); this.saved.emit(); },
      error: (err) => { this.cancellingId = null; this.toaster.error(err?.error?.message || 'Could not cancel the PO.'); },
    }));
  }

  async onPlacePo(lpo: { _id: string; poNo: string }): Promise<void> {
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const result = await this.formPrompt.prompt({
      title: `Place ${lpo.poNo}`,
      message: 'Confirm the order has been sent to the supplier. The receiving team is notified and the LPO shows in GRN > Arriving.',
      confirmLabel: 'Place order',
      fields: [{ key: 'expectedDeliveryDate', label: 'Expected delivery date', type: 'date', required: true, min: today, hint: 'The receiving team gets a reminder on this day.' }],
    });
    if (!result) return;
    this.placingId = lpo._id;
    this.subscriptions.add(this.purchaseOrderService.placePurchaseOrder(lpo._id, result['expectedDeliveryDate']).subscribe({
      next: () => { this.placingId = null; this.toaster.success(`${lpo.poNo} placed`); this.loadPos(); this.saved.emit(); },
      error: (err) => { this.placingId = null; this.toaster.error(err?.error?.message || 'Could not place the order.'); },
    }));
  }

  onMrRequestClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    this.ensurePurchaseId().then((purchaseId) => {
      const dialogRef = this.modal.open<{ success: boolean }>(MrRequestComponent, {
        width: '560px',
        closeOnBackdrop: false,
        data: { purchaseId }
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.success) {
          this.loadPurchaseData();
        }
      });
    }).catch(() => {});
  }

  onGetMaterialRequestsClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    this.ensurePurchaseId().then((purchaseId) => {
      const dialogRef = this.modal.open<{ success: boolean }>(MaterialRequestModalComponent, {
        width: '880px',
        closeOnBackdrop: false,
        data: {
          purchaseId,
          jobId: this.purchaseForm.get('job')?.value,
          onDataChange: () => {
            this.loadPurchaseData();
          }
        }
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.success) {
          this.loadPurchaseData();
        }
      });
    }).catch(() => {});
  }

  deelSheets(requestedJobId?: string | null) {
    this.subscriptions.add(
      this.jobService.getConvertibleJobs().subscribe({
        next: (res: any) => {
          if (res.jobs) this.jobSheets.set(res.jobs);

          if (requestedJobId) {
            const isEligible = (res.jobs || []).some((j: any) => j._id === requestedJobId);
            if (isEligible) {
              this.selectJobById(requestedJobId);
            } else {
              this.requestedJobId.set('');
              this.toaster.error('This job is not available for a new purchase requisition. It may already have a purchase request or is not open for procurement.');
            }
          }
        }, error: (err) => {
          console.error(err)
        }
      })
    )
  }

  onJobSelected(selected: string | string[]) {
    if (!selected) return;
    this.purchaseForm.reset();
    this.purchaseForm.get('purchaseNo')?.setValue(this.purchaseNo);
    this.purchaseId = null;
    this.itemsList.set([]);
    
    this.jobService.getOneJob(selected as string).subscribe({
      next: (res) => {
        if (res && res.length > 0) {
          this.patchValues(res[0]);
        }
      },
      error: (error) => {
        console.error(error);
      }
    });
  }

  getPurchaseNo() {
    this.purchaseService.getPurchaseNo().subscribe({
      next: (res: any) => {
        if (res.data) {
          this.purchaseForm.get('purchaseNo')?.setValue(res.data.purchaseNo)
          this.purchaseNo = res.data.purchaseNo
        }
      }, error: (error: Error) => {
        console.log(error)
      }
    })
  }

  warningMessage(message: string) {
    this.toaster.warning(message);
  }

  calculateTotalLpo(): number {
    const itemsList = this.itemsList();
    if (!itemsList || itemsList.length === 0) return 0;
    return itemsList.reduce((total, item: any) => {
      if (!item.itemDetails || !Array.isArray(item.itemDetails)) return total;
      const itemTotal = item.itemDetails.reduce((subTotal: number, detail: any) => {
        if (detail.fromMrRequest) {
          return subTotal;
        }
        const quantity = +detail.quantity || 0;
        const unitCost = +detail.unitCost || 0;
        return subTotal + (quantity * unitCost);
      }, 0);
      return total + itemTotal;
    }, 0);
  }

  updateTotalLpo() {
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
  }

  get f() {
    return this.purchaseForm.controls;
  }

  onAddColumnClicks() {
    const itemsArray = this.purchaseForm.get('items') as FormArray;
    itemsArray.push(this.createQuoteItemGroup());
  }

  saveItemsToBackend(updatedItemsList: any[], done?: (ok: boolean) => void): void {
    // Convert part number IDs to objects first, then clean for backend
    const itemsWithPartNos = this.convertPartNoIdsToObjects(updatedItemsList);
    const itemsToSave = this.cleanItemsForBackend(itemsWithPartNos);
    
    const handleSaveResponse = (res: any) => {
      if (res.success && res.data && res.data.items) {
        // Update itemsList with the saved items that have IDs from backend
        this.itemsList.set(res.data.items);
        this.patchItemsValuesWithPartNoIds(res.data.items);
        this.toaster.success('Item saved successfully');
      } else if (res.success) {
        this.toaster.success('Item saved successfully');
      }
      done?.(!!res.success);
    };
    
    if (this.purchaseId) {
      this.subscriptions.add(
        this.purchaseService.updatePurchaseItems(this.purchaseId, itemsToSave).subscribe({
          next: handleSaveResponse,
          error: (error) => {
            console.error('Error saving item:', error);
            this.toaster.error('Failed to save item');
            done?.(false);
          }
        })
      );
    } else if (this.selectedJobSheet || this.isJobLess) {
      console.log('Creating draft first before saving items');
      this.ensurePurchaseId().then((purchaseId) => {
        this.subscriptions.add(
          this.purchaseService.updatePurchaseItems(purchaseId, itemsToSave).subscribe({
            next: handleSaveResponse,
            error: (error) => {
              console.error('Error saving item:', error);
              this.toaster.error('Failed to save item');
              done?.(false);
            }
          })
        );
      }).catch((error) => {
        console.error('Error creating draft:', error);
        this.toaster.error('Failed to create draft purchase');
        done?.(false);
      });
    } else {
      console.warn('Cannot save items: no purchaseId and no selectedJobSheet');
    }
  }

  checkMRExists(): boolean {
    return this.purchaseForm.contains('mrRequest');
  }

  checkSupplierExists(): boolean {
    return this.purchaseForm.contains('supplierDiscounts')
  }

  onEditSubmits() {
    if (!this.purchaseId) return;
    
    const formValue = this.getFormValueForSave();
    formValue.status = 'Pending';

    this.subscriptions.add(
      this.purchaseService.updatePurchase(this.purchaseId, formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Sent for approval');
            if (this.drawer) {
              this.submitted.emit(this.purchaseId!);
              this.saved.emit();
              this.closeDrawer();
            } else {
              this.router.navigate(['/purchase/view-purchase', this.purchaseId]);
            }
          }
        },
        error: (error) => this.submitFailed(error)
      })
    );
  }

  convertAdditionalCostsToSupplierDiscounts(additionalCosts: any[]) {
    const supplierDiscounts = additionalCosts.filter(cost =>
      cost.type === 'Supplier Discount' && cost.supplierId
    );

    if (supplierDiscounts.length > 0) {
      if (this.purchaseForm.get('supplierDiscounts')) {
        this.purchaseForm.removeControl('supplierDiscounts');
      }

      this.purchaseForm.addControl('supplierDiscounts', this.createSupplierGroup());
      const supplierForm = this.purchaseForm.get('supplierDiscounts') as FormGroup;
      const supplierArray = supplierForm.get('suppliers') as FormArray;

      let totalDiscount = 0;

      supplierDiscounts.forEach((discount: any) => {
        supplierArray.push(this.fb.group({
          supplierId: [discount.supplierId],
          discount: [discount.value],
          discountType: ['amount']
        }));
        totalDiscount += discount.value || 0;
      });

      supplierForm.patchValue({
        totalDiscount: totalDiscount.toString()
      });
    }
  }


  getPurchaseStatus(): string {
    return this.purchaseForm.get('status')?.value || 'Pending';
  }

  loadPartNumbers(search?: string): void {
    const params: { search?: string; limit?: number } = { limit: 50 };
    if (search) {
      params.search = search;
    }

    this.subscriptions.add(
      this.productService.getPartNumbers(params).subscribe({
        next: (res) => {
          const options = (res.data || []).map((item: PartNumberOption) => ({
            label: this.composePartNumberLabel(item),
            value: item._id,
            data: item
          }));
          this.partNumberOptions.set(options);
        },
        error: (error) => {
          console.error('Error loading part numbers:', error);
          this.partNumberOptions.set([]);
        }
      })
    );
  }

  private composePartNumberLabel(option: { partNo?: string; productDescription?: string; brand?: string }): string {
    const code = option.partNo || '';
    const description = option.productDescription || '';
    const brandName = option.brand || '';
    const details = [brandName, description].filter(Boolean).join(' - ');
    return details ? `${code} (${details})` : code;
  }

  getPartNumberValue(partNo: any): string {
    if (!partNo) return '';
    if (typeof partNo === 'string') return partNo;
    return partNo._id || '';
  }

  convertPartNoIdsToObjects(items: any[]): any[] {
    // Lines keep the part number as text and the catalogue link in productId, so nothing is converted.
    return items;
  }

  cleanItemsForBackend(items: any[]): any[] {
    return items.map(item => {
      // Ensure itemName is set - use first detail if itemName is empty
      let itemName = item.itemName;
      if (!itemName || itemName.trim() === '') {
        itemName = item.itemDetails?.[0]?.detail || 'Item';
      }

      const cleanedItem: any = {
        itemName: itemName.trim(),
        itemDetails: (item.itemDetails || []).map((detail: any) => {
          const cleanedDetail: any = {
            detail: detail.detail || '',
            quantity: typeof detail.quantity === 'number' ? detail.quantity : (detail.quantity ? parseFloat(String(detail.quantity)) : 0),
            unitCost: typeof detail.unitCost === 'number' ? detail.unitCost : (detail.unitCost ? parseFloat(String(detail.unitCost)) : 0),
            availability: detail.availability || '',
            supplierName: detail.supplierName || '',
            supplierId: typeof detail.supplierId === 'object' && detail.supplierId !== null ? detail.supplierId._id : (detail.supplierId || null),
            uom: detail.uom || '',
            itemCode: String(detail.itemCode || '').trim(),
            email: detail.email || '',
            phoneNo: detail.phoneNo || '',
            dealSelected: detail.dealSelected || false,
            comparisons: detail.comparisons && Array.isArray(detail.comparisons) ? detail.comparisons : [],
            isNewlyAdded: detail.isNewlyAdded !== undefined ? detail.isNewlyAdded : false,
            merged: detail.merged !== undefined ? detail.merged : false,
            fromMrRequest: detail.fromMrRequest === true
          };

          // The deal's cost is the baseline the diffs are measured from; it must survive a save.
          if (Number(detail.dealUnitCost) > 0) cleanedDetail.dealUnitCost = Number(detail.dealUnitCost);

          // Handle unitSellingPrice - only include if it's a valid number
          if (detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null && detail.unitSellingPrice !== '') {
            const sellingPrice = typeof detail.unitSellingPrice === 'number' ? detail.unitSellingPrice : parseFloat(String(detail.unitSellingPrice));
            if (!isNaN(sellingPrice)) {
              cleanedDetail.unitSellingPrice = sellingPrice;
            }
          }

          // Part number text and the catalogue link (productId) are kept separately.
          const partText = typeof detail.partNo === 'object' ? detail.partNo?.partNo : detail.partNo;
          if (String(partText ?? '').trim()) cleanedDetail.partNo = String(partText).trim();
          const linkedId = typeof detail.productId === 'object' ? detail.productId?._id : detail.productId;
          if (linkedId) cleanedDetail.productId = linkedId;

          // Only include _id if it's a valid MongoDB ObjectId (not a temporary ID)
          // MongoDB ObjectIds are 24 hex characters
          if (detail._id && typeof detail._id === 'string' && !detail._id.startsWith('temp-')) {
            // Check if it's a valid ObjectId format (24 hex characters)
            if (/^[0-9a-fA-F]{24}$/.test(detail._id)) {
              cleanedDetail._id = detail._id;
            }
          }

          return cleanedDetail;
        })
      };

      return cleanedItem;
    });
  }

  createSupplierOpen = false;

  onSupplierCreated(supplier: any): void {
    this.createSupplierOpen = false;
    this.loadSuppliers();
    const id = supplier?._id ?? supplier?.supplier?._id;
    if (id) this.onSupplierTabAdded({ supplierId: id, lineKeys: [] });
  }

  createProductOpen = false;
  createProductPrefill: { productSegment?: string; productCategoryName?: string; productDescription?: string } | null = null;

  onCreatePartNumber(req?: { itemName?: string; detail?: string }): void {
    // Opened from a line: carry the description already typed there into the new product.
    const detail = req?.detail?.trim();
    this.createProductPrefill = detail ? { productDescription: detail } : null;
    this.createProductOpen = true;
  }

  onProductCreated(result: any): void {
    if (!result?._id) return;
    // Put the new product straight on the line that asked for it (item code, part no, UOM, description).
    this.prFormCmp?.itemEntry?.applyCreatedProduct({
      _id: result._id,
      categoryName: result.productCategory?.categoryName || '',
      description: result.productDescription || '',
      source: 'catalogue',
      itemCode: result.itemCode || '',
      partNo: result.partNo || '',
      uom: result.unitOfMeasure || '',
    });
    if (!result?.partNo) return;
    const option: PartNumberDropdownOption = {
      label: this.composePartNumberLabel({
        partNo: result.partNo,
        productDescription: result.productDescription
      }),
      value: result._id,
      data: {
        _id: result._id,
        partNo: result.partNo,
        productDescription: result.productDescription
      }
    };
    const filtered = this.partNumberOptions().filter(opt => opt.value !== option.value);
    this.partNumberOptions.set([option, ...filtered]);
    this.loadPartNumbers();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
