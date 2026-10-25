import { FormPromptService } from 'src/app/shared/components/form-prompt-modal/form-prompt.service';
import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
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
import { firstValueFrom, Subscription } from 'rxjs';
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
import { LineSupplierOffer } from 'src/app/shared/components/item-entry/item-entry.component';
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
  @Input() initialStep: 1 | 2 | 3 | 4 | null = null;
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
  liveTotalLpo = signal<number>(0);

  /** A new list means the editor reseeds from it, so whatever it held is no longer unsaved work. */
  private resetEntryDirty = effect(() => {
    this.itemsList();
    untracked(() => this.entryItems.markAsPristine());
  });

  entrySeed = computed<ItemEntryOptionValue[]>(() => [{
    totalDiscount: null,
    items: this.itemsList().map((item: any, i: number) => ({
      itemName: item.itemName || '',
      itemDetails: (item.itemDetails || []).map((d: any, j: number) => ({
        itemCode: d.itemCode || '',
        // The PR's partNo is the product link; the editor keeps that in productId and the code in partNo.
        productId: this.getPartNumberValue(d.partNo) || null,
        partNo: typeof d.partNo === 'object' ? d.partNo?.partNo || '' : '',
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

  /** For the item form's "Not awarded" filter: the line's saved copy says whether a supplier won it. */
  lineAwarded = (line: any): boolean => {
    const saved = line?.lineKey ? this.originalsByKey().get(line.lineKey) : undefined;
    return !!saved && this.isAwardedLine(saved);
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
      ...this.itemsList().flatMap((item: any) => (item.itemDetails || []).map((d: any) => String(d.partNo?._id || d.partNo || ''))),
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
  private entryProductIds(): string[] {
    return (this.entryItems.getRawValue()?.[0]?.items || [])
      .flatMap((item: any) => (item.itemDetails || []).map((d: any) => String(d.productId || '')))
      .filter(Boolean);
  }

  /** A line linked to a product with no loaded prices yet reloads them, so its suppliers start at their last price. */
  private refreshLastPricesForEntry(): void {
    const loaded = new Set(this.lastPricesFor.split(','));
    if (this.entryProductIds().some((id) => !loaded.has(id))) this.loadLastPrices();
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
        });
      });
      map.set(key, list);
    });
    return map;
  });

  /** A line's suppliers: those compared on it, its current supplier, and suppliers with a last price for the product. */
  lineOffers = (line: any): LineSupplierOffer[] => {
    // Called for every line on every change detection pass: hand back the same array until the inputs change.
    const cache = this.offerCache();
    // Editor lines carry the product in productId; saved lines in partNo.
    const product = String(line?.productId || line?.partNo || '');
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
    this.entryItems.markAsDirty();
    this.recomputeLiveTotal();
  }

  /** A supplier pill on a line: the line (already patched with the supplier and its price) is that supplier's; kept on Save. */
  onPillPicked(_e: { lineKey: string; supplierId: string; price: number | null }): void {
    this.entryItems.markAsDirty();
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
    items.forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      total++;
      const ids = new Set<string>();
      this.lineOffers(d).forEach((o) => o.supplierId && !o.pastOnly && ids.add(o.supplierId));
      if (d.supplierId) ids.add(String(d.supplierId));
      const excluded = this.tabExcluded();
      const shared = d.lineKey ? this.prFormCmp?.itemEntry?.lineShares(d.lineKey) : null;
      // A supplier that is a line's default, or holds an award on any line, stays on the PR.
      if (d.supplierId) inUse.add(String(d.supplierId));
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
      .sort(([a], [b]) => this.tabOrder.indexOf(a) - this.tabOrder.indexOf(b))
      .map(([id, count]) => ({
        id, name: name(id), count: count + Math.max(0, handedExtra.get(id) ?? 0), total, closable: !inUse.has(id),
      }));
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
    this.addedSuppliers.update((l) => l.filter((x) => x !== id));
    this.removedSuppliers.update((l) => [...new Set([...l, id])]);
    this.tabLines.update(({ [id]: _, ...rest }) => rest);
    if (this.activeTab === id) this.activeTab = 'items';
    this.lineTick.update((n) => n + 1);
    this.entryItems.markAsDirty();
  }

  onSupplierTabAdded(e: { supplierId: string; lineKeys: string[] }): void {
    const id = e?.supplierId;
    if (!id) return;
    this.removedSuppliers.update((l) => l.filter((x) => x !== id));
    if (!this.addedSuppliers().includes(id)) this.addedSuppliers.update((l) => [...l, id]);
    if (e.lineKeys.length) {
      this.tabLines.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...e.lineKeys])] }));
    }
    this.activeTab = id;
    if (e.lineKeys.length) this.entryItems.markAsDirty();
  }

  onLinesAddedToTab(lineKeys: string[]): void {
    const id = this.activeTab;
    if (id === 'items' || !lineKeys.length) return;
    this.tabLines.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...lineKeys])] }));
    this.tabExcluded.update((m) => ({ ...m, [id]: (m[id] ?? []).filter((k) => !lineKeys.includes(k)) }));
  }

  /** Lines taken out of a supplier tab by hand (a line's only supplier cannot be taken out). */
  private tabExcluded = signal<Record<string, string[]>>({});

  activeTabExcludedKeys(): string[] {
    return this.tabExcluded()[this.activeTab] ?? CreatePurchaseComponent.NO_LINES;
  }

  onLinesRemovedFromTab(lineKeys: string[]): void {
    const id = this.activeTab;
    if (id === 'items' || !lineKeys.length) return;
    this.tabLines.update((m) => ({ ...m, [id]: (m[id] ?? []).filter((k) => !lineKeys.includes(k)) }));
    this.tabExcluded.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...lineKeys])] }));
    this.lineTick.update((n) => n + 1);
  }

  /** Chooses the active supplier for the ticked lines. The item entry already set the line's supplier, shares and cost; they are kept on Save. */
  onLinesAwardedToTab(lines: { lineKey: string; price: number; qty: number; total: number }[]): void {
    const id = this.activeTab;
    if (id === 'items' || !lines.length) return;
    // The chosen supplier keeps the line under its tab even when another supplier leads the line.
    this.tabLines.update((m) => ({ ...m, [id]: [...new Set([...(m[id] ?? []), ...lines.map((l) => l.lineKey)])] }));
    this.lineTick.update((n) => n + 1);
    this.entryItems.markAsDirty();
  }

  private recomputeLiveTotal(): void {
    this.lineTick.update((n) => n + 1);
    const byKey = this.originalsByKey();
    let total = 0;
    (this.entryItems.getRawValue()?.[0]?.items || []).forEach((item: any) =>
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
          partNo: productId || '',
          supplierId: fields.supplierId || original?.supplierId || '',
        };
        // The deal's cost stays the baseline; the line's own cost is the award.
        const deal = this.dealHit(groups.get(lineKey) ?? formName, fields.detail);
        if (deal?.cost != null) line.dealUnitCost = deal.cost;
        line.comparisons = this.lineComparisons({ ...d, ...line });
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
      list.push({ supplierId, supplierName: this.supplierOptions().find((o) => o.value === supplierId)?.label || '', quantity: lineQty, unitPrice: Number(d.unitCost), paymentTerms: 'Not specified', selected: false });
    }
    if (!entry || !key) return list;
    const nameOf = (id: string) => this.supplierOptions().find((o) => o.value === id)?.label || '';
    const upsert = (supplierId: string, price: number | null, qty: number | null) => {
      let c = list.find((x) => String(x.supplierId) === supplierId);
      if (!c) {
        if (price == null) return null;
        c = { supplierId, supplierName: nameOf(supplierId), quantity: qty || lineQty, unitPrice: price, paymentTerms: 'Not specified', selected: false };
        list.push(c);
      } else if (price != null) c.unitPrice = price;
      return c;
    };
    const shares = entry.lineShares(key);
    this.linePills(d).forEach((p) => {
      // The line's own supplier, unsplit, is priced by the line's cost; any other supplier by its tab.
      const own = String(d.supplierId || '') === p.id && !(shares && shares.length > 1);
      const price = own ? (Number(d.unitCost) > 0 ? Number(d.unitCost) : null) : entry.scopePrice(key, p.id);
      upsert(p.id, price, entry.scopeEdit(key, p.id).quantity);
    });
    if (shares) {
      list.forEach((c) => { c.selected = false; c.awardedQty = undefined; });
      shares.filter((s) => s.qty > 0).forEach((s) => {
        const c = upsert(s.supplierId, s.cost > 0 ? s.cost : null, s.qty);
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
    if (!this.entryItems.dirty) return true;
    const items = this.collectEntryItems();
    if (!items) return false;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.entryItems.markAsPristine();
    return true;
  }

  onSaveEntryItems(): void {
    const items = this.collectEntryItems();
    if (!items) return;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.entryItems.markAsPristine();
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

    this.subscriptions.add(this.entryItems.valueChanges.subscribe(() => { this.recomputeLiveTotal(); this.refreshLastPricesForEntry(); }));

    this.refreshHeader();
    this.subscriptions.add(this.purchaseForm.valueChanges.subscribe(() => this.refreshHeader()));
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
    return this.entryItems.dirty || (!this.purchaseId && (!!this.requestedJobId() || this.itemCount() > 0));
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

  onSubmit(): void {
    if (!this.syncEntryToList()) return;
    if (!this.canSubmitForApproval()) return;
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

  /** Save is offered on a new request and on one still being prepared, never on a submitted or rejected one. */
  get canSaveDraft(): boolean {
    return !this.isEditing || ['New', 'In Progress'].includes(this.purchaseForm.get('status')?.value);
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
      const updatedItems = job.quotation?.dealData?.updatedItems || [];
      const itemsWithComparisons = this.patchComparisonsData(updatedItems, job.quotation?.dealData);
      this.itemsList.set(itemsWithComparisons);
      this.patchItemsValuesWithPartNoIds(itemsWithComparisons);
      this.loadLastPrices();

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
      partNo: [typeof item.partNo === 'object' && item.partNo?._id ? item.partNo._id : (item.partNo || '')],
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
    return `NRN/PR-${year}-${month}-${this.prSequence}`;
  }


  /** Every product line has an awarded supplier offer; only then can the request go for approval. */
  get allAwarded(): boolean {
    const lines = this.itemsList().flatMap((item: any) => item.itemDetails || []).filter((d: any) => Number(d.quantity) > 0);
    return lines.length > 0 && lines.every((d: any) => this.isResolvedLine(d));
  }

  /** Awarded vs total product lines, for the Compare & award counter and the submit hint. */
  get awardStats(): { awarded: number; total: number } {
    // Unsaved awards and releases count too, so the counter moves as the pills are clicked.
    const source = this.entryItems.dirty ? (this.collectEntryItems(true) ?? this.itemsList()) : this.itemsList();
    const lines = source.flatMap((item: any) => item.itemDetails || []).filter((d: any) => Number(d.quantity) > 0);
    return { awarded: lines.filter((d: any) => this.isResolvedLine(d)).length, total: lines.length };
  }

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
    if (!this.entryItems.dirty) {
      proceed();
      return;
    }
    const items = this.collectEntryItems();
    if (!items) return;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.entryItems.markAsPristine();
    this.saveItemsToBackend(items, (ok) => { if (ok) proceed(); });
  }

  /** 2 = items (the lines and their suppliers, one RFQ each), 3 = compare & award, 4 = POs once approved. Step 1 (Need) was merged into Items. */
  step: 1 | 2 | 3 | 4 = 2;
  readonly steps: { n: 1 | 2 | 3 | 4; label: string }[] = [
    { n: 2, label: 'Items' },
    { n: 3, label: 'Compare & award' },
    { n: 4, label: 'POs' },
  ];
  private dealQty = signal<Map<string, { itemName: string; detail: string; quantity: number; sellPrice: number | null; cost: number | null; supplierName: string; supplierId: string | null }>>(new Map());

  /** The deal sheet's cost and supplier for a line, the baseline the PR's awards are compared with. */
  lineDeal = (itemName: string, line: any): { cost: number | null; supplierId: string | null } | null => {
    const hit = this.dealHit((line?.lineKey && this.groupByKey().get(line.lineKey)) || itemName, line?.detail);
    return hit ? { cost: hit.cost, supplierId: hit.supplierId } : null;
  };

  /** The deal sheet line for a PR line: same item and detail, else the only deal line with that detail (a saved PR can regroup its lines). */
  private dealHit(itemName: string, detail: string) {
    const deal = this.dealQty();
    const exact = deal.get(CreatePurchaseComponent.dealKey(itemName, detail));
    if (exact) return exact;
    const d = (detail || '').trim().toLowerCase();
    const same = [...deal.values()].filter((v) => v.detail.trim().toLowerCase() === d);
    return same.length === 1 ? same[0] : undefined;
  }
  reviewBusy = signal(false);

  private static dealKey(itemName: string, detail: string): string {
    return `${(itemName || '').trim().toLowerCase()}|${(detail || '').trim().toLowerCase()}`;
  }

  /** Deal sheet quantities and prices of the job, for the compare step's deal columns and margins. */
  private refreshDealQty(): void {
    const deal = new Map<string, { itemName: string; detail: string; quantity: number; sellPrice: number | null; cost: number | null; supplierName: string; supplierId: string | null }>();
    const updated = (this.selectedJobSheet as any)?.quotation?.dealData?.updatedItems || [];
    updated.forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      const key = CreatePurchaseComponent.dealKey(item.itemName, d.detail);
      const prev = deal.get(key);
      deal.set(key, {
        itemName: item.itemName || '', detail: d.detail || '', quantity: (prev?.quantity ?? 0) + (Number(d.quantity) || 0),
        sellPrice: prev?.sellPrice ?? (Number(d.unitSellingPrice) || null), cost: prev?.cost ?? (Number(d.unitCost) || null),
        supplierName: prev?.supplierName || d.supplierName || '',
        supplierId: prev?.supplierId || (d.supplierId?._id || d.supplierId ? String(d.supplierId?._id || d.supplierId) : null),
      });
    }));
    this.dealQty.set(deal);
  }

  /** Once per opening: an approved PR opens on its POs, one with the approvers on its awards. */
  private stepChosen = false;
  private openFirstStep(status: string): void {
    if (this.stepChosen) return;
    this.stepChosen = true;
    const step = this.initialStep ?? (status === 'Approved' ? 4 : status === 'Pending' ? 3 : null);
    if (step) this.goToStep(step === 1 ? 2 : step);
  }

  get isApproved(): boolean {
    return this.f['status']?.value === 'Approved';
  }

  /** A step is done when the next one has what it needs. */
  stepDone(n: number): boolean {
    const status = this.f['status']?.value;
    const submitted = !!status && !['New', 'In Progress', 'Rejected'].includes(status);
    if (n === 2) return this.supplierTabs().length > 0 || submitted;
    if (n === 3) return submitted || (this.awardStats.total > 0 && !this.submitBlockedReason);
    return this.poCards().length > 0 && this.poCards().every((c) => c.lpos.some((l) => ['Placed', 'Closed'].includes(l.poStatus)));
  }

  stepLocked(n: number): boolean {
    return n === 4 && !this.isApproved;
  }

  goToStep(n: 1 | 2 | 3 | 4): void {
    if (this.stepLocked(n) || n === this.step) return;
    if (n === 1 || n === 2) {
      this.activeTab = 'items';
      this.step = 2;
      return;
    }
    if (n === 3) { this.onNextClicks(); return; }
    this.loadPos();
    this.step = 4;
  }

  onNextClicks(): void {
    // Submitted or approved: nothing to save, the compare step is read-only.
    // The totals bar of this step reads the item entry, so it must be on Items, not a supplier tab. The step opens a tick
    // later so the item entry has left the supplier tab before the bar reads it.
    const open = () => {
      this.activeTab = 'items';
      this.refreshDealQty();
      setTimeout(() => (this.step = 3));
    };
    if (!this.canSaveDraft) { open(); return; }
    // Choices made in the item form (pills, supplier tabs) are saved first, so the compare step starts from them.
    const dirty = this.entryItems.dirty;
    if (!this.syncEntryToList()) return;
    if (dirty && this.purchaseId) {
      this.saveItemsToBackend(this.itemsList(), (ok) => { if (ok) open(); });
      return;
    }
    this.whenSaved(open);
  }

  onBackClicks(): void {
    if (this.step <= 2) return;
    this.goToStep((this.step - 1) as 1 | 2 | 3);
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
      (d.comparisons || []).forEach((c: any) => {
        const id = c.supplierId?._id || c.supplierId;
        if (!id || suppliers.some((s) => s.supplierId === String(id))) return;
        const won = !!c.selected;
        const qty = won ? (Number(c.awardedQty) || Number(c.quantity) || prQty) : 0;
        const price = Number(c.unitPrice) > 0 ? Number(c.unitPrice) : null;
        allocated += qty;
        suppliers.push({
          supplierId: String(id), name: c.supplierName || nameOf(String(id)) || 'Supplier',
          state: won ? 'awarded' : price != null ? 'priced' : 'waiting', price,
          qty, offerQty: price != null ? (Number(c.quantity) || prQty) : null,
        });
      });
      // Suppliers on the line in step 1 (its supplier, its tabs) are options too, at their last price when they have one.
      const addOption = (id: string | undefined, name: string | undefined, price: number | null = null) => {
        if (!id || !name || suppliers.some((s) => s.supplierId === id)) return;
        suppliers.push({ supplierId: id, name, state: price != null ? 'priced' : 'waiting', price, qty: 0, offerQty: price != null ? prQty : null });
      };
      const offers = this.lineOffers({ ...d, lineKey: key, partNo: this.getPartNumberValue(d.partNo), supplierId: this.lineSupplierId(d) });
      offers.filter((o) => !o.pastOnly).forEach((o) => addOption(o.supplierId, o.supplierName, o.price ?? null));
      Object.entries(this.tabLines()).forEach(([sid, keys]) => {
        if (keys.includes(key)) addOption(sid, nameOf(sid), offers.find((o) => o.supplierId === sid)?.price ?? null);
      });
      // The line's own supplier (from the deal sheet): with nobody chosen it supplies the whole line at the line's cost.
      const defaultId = String(d.supplierId?._id || d.supplierId || '');
      const defaultName = d.supplierDetails?.supplierName || d.supplierName || nameOf(defaultId) || '';
      if (defaultId && !allocated) {
        allocated = prQty;
        const hit = suppliers.find((s) => s.supplierId === defaultId);
        if (hit) {
          hit.state = 'default'; hit.qty = prQty;
          hit.price ??= Number(d.unitCost) || null;
          hit.offerQty ??= prQty;
        } else suppliers.unshift({ supplierId: defaultId, name: defaultName || 'Supplier', state: 'default', price: Number(d.unitCost) || null, qty: prQty, offerQty: prQty });
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
      next: () => { this.reviewBusy.set(false); this.loadPurchaseData(); this.saved.emit(); },
      error: (err) => {
        this.reviewBusy.set(false);
        this.toaster.error(err?.error?.message || 'Could not save the award.');
      },
    }));
  }

  /** Short asks for the reason; clearing needs no confirmation. */
  async onReviewShort(e: { key: string; detail: string; short: boolean }): Promise<void> {
    if (!this.purchaseId) return;
    let reason: string | undefined;
    if (e.short) {
      const result = await this.confirm.open({
        tone: 'approve',
        title: `Mark "${e.detail}" short?`,
        message: 'The request can go for approval without this product fully awarded. Only the awarded quantity is ordered.',
        reason: true,
        reasonLabel: 'Why is it short?',
        confirmLabel: 'Mark short',
        cancelLabel: 'Cancel',
      });
      if (!result.confirmed || !result.reason?.trim()) return;
      reason = result.reason.trim();
    }
    this.reviewBusy.set(true);
    this.subscriptions.add(this.salesRfqService.markPurchaseShort(this.purchaseId, e.key, e.short, reason).subscribe({
      next: () => { this.reviewBusy.set(false); this.loadPurchaseData(); },
      error: (err) => { this.reviewBusy.set(false); this.toaster.error(err?.error?.message || 'Could not save the short mark.'); },
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
    type Card = { supplierId: string; name: string; lines: number; value: number; lpos: { _id: string; poNo: string; poStatus: string }[] };
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
      c.lpos.push({ _id: l._id, poNo: l.poNo, poStatus: l.poStatus });
      cards.set(id, c);
    });
    return [...cards.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

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

  makingPos = signal(false);

  /** Suppliers with quantity still to order: the ones Make POs raises a PO for. */
  get suppliersToOrder(): { supplierId: string; name: string }[] {
    return this.poCards()
      .filter((c) => this.poCardTotals(c.supplierId).toOrder > 0 || (!this.orderRows().length && !c.lpos.length))
      .map((c) => ({ supplierId: c.supplierId, name: c.name }));
  }

  /** One PO per supplier for everything it still has to order, at its chosen prices; each PO then goes for approval. */
  async onMakeAllPos(): Promise<void> {
    const purchaseId = this.purchaseId;
    const targets = this.suppliersToOrder;
    if (!purchaseId || !targets.length || this.makingPos()) return;
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: `Make ${targets.length} PO${targets.length === 1 ? '' : 's'}?`,
      message: 'Each supplier gets one PO for the quantity it still has to supply, at its chosen price. The POs go for approval.',
      details: targets.map((t) => ({ label: 'Supplier', value: t.name })),
      confirmLabel: 'Make POs',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    this.makingPos.set(true);
    const purchaseNo = this.f['purchaseNo']?.value || '';
    const jobId = this.purchaseForm.get('job')?.value || undefined;
    const quoteId = (this.selectedJobSheet as any)?.quotation?._id || undefined;
    let made = 0;
    for (const t of targets) {
      try {
        const items: any[] = ((await firstValueFrom(this.purchaseOrderService.getItemsForPurchaseRequest(purchaseId, t.supplierId)))?.data || [])
          .filter((it: any) => Number(it.remainingQuantity) > 0);
        if (!items.length) continue;
        const poNo = (await firstValueFrom(this.purchaseOrderService.generatePONumber()))?.data;
        const terms = items[0]?.comparisons || {};
        const payload: any = {
          poNo,
          poStatus: 'Pending for Approval',
          items: items.map((it: any) => {
            const unitCost = Number(it.unitPrice) || 0;
            const quantity = Number(it.remainingQuantity) || 0;
            return { detail: it.detail, partNo: it.partNo?._id || it.partNo || null, prLineKey: it._id, quantity, uom: it.uom || it.comparisons?.uom || '', unitCost, totalCost: quantity * unitCost };
          }),
          supplierId: t.supplierId,
          purchaseId,
          jobId,
          quoteId,
          etaTerms: terms.etaTerms || 'As per terms',
          paymentTerms: terms.paymentTerms || 'As per terms',
          deliveryTerms: terms.etaTerms || terms.paymentTerms || 'As per terms',
          // Both are required on a PO; the supplier's comparison terms when given, otherwise left for the approver to edit.
          shippingTerms: terms.shippingTerms || 'As per terms',
          placeOfDelivery: terms.deliveryLocation || terms.placeOfDelivery || 'As per terms',
          subject: purchaseNo ? `Purchase order for ${purchaseNo}` : 'Purchase order',
          poDate: new Date(),
          discount: 0,
        };
        await firstValueFrom(this.purchaseOrderService.createPurchaseOrder(payload));
        made++;
      } catch (err: any) {
        this.toaster.error(err?.error?.message || `Could not make the PO for ${t.name}.`);
      }
    }
    this.makingPos.set(false);
    if (made) this.toaster.success(`${made} PO${made === 1 ? '' : 's'} sent for approval`);
    this.loadPos();
    this.saved.emit();
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
    return items.map(item => ({
      ...item,
      itemDetails: (item.itemDetails || []).map((detail: any) => {
        const partNoId = typeof detail.partNo === 'string' ? detail.partNo : detail.partNo?._id;
        if (partNoId) {
          const option = this.partNumberOptions().find(opt => opt.value === partNoId);
          if (option?.data) {
            return {
              ...detail,
              partNo: {
                _id: option.data._id,
                partNo: option.data.partNo,
                productDescription: option.data.productDescription
              }
            };
          }
        }
        return detail;
      })
    }));
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
            email: detail.email || '',
            phoneNo: detail.phoneNo || '',
            dealSelected: detail.dealSelected || false,
            comparisons: detail.comparisons && Array.isArray(detail.comparisons) ? detail.comparisons : [],
            isNewlyAdded: detail.isNewlyAdded !== undefined ? detail.isNewlyAdded : false,
            merged: detail.merged !== undefined ? detail.merged : false,
            fromMrRequest: detail.fromMrRequest === true
          };

          // Handle unitSellingPrice - only include if it's a valid number
          if (detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null && detail.unitSellingPrice !== '') {
            const sellingPrice = typeof detail.unitSellingPrice === 'number' ? detail.unitSellingPrice : parseFloat(String(detail.unitSellingPrice));
            if (!isNaN(sellingPrice)) {
              cleanedDetail.unitSellingPrice = sellingPrice;
            }
          }

          // Handle partNo - convert to ObjectId string if it's an object
          if (detail.partNo) {
            if (typeof detail.partNo === 'object' && detail.partNo !== null && detail.partNo._id) {
              cleanedDetail.partNo = detail.partNo._id;
            } else if (typeof detail.partNo === 'string' && detail.partNo.trim() !== '') {
              cleanedDetail.partNo = detail.partNo.trim();
            }
          }

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

  onCreatePartNumber(): void {
    this.createProductPrefill = null;
    this.createProductOpen = true;
  }

  onProductCreated(result: any): void {
    if (!result?.partNo || !result?._id) return;
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
