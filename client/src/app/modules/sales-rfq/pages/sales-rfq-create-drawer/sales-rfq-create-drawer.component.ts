import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SfDrawerComponent, SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import {
  CatalogueSuggestionSource,
  CreateProductRequest,
  ItemEntryComponent,
  ItemEntryItemValue,
  ItemEntryOptionValue,
} from 'src/app/shared/components/item-entry';
import { SupplierFormDrawerComponent } from 'src/app/modules/suppliers/pages/supplier-form-drawer/supplier-form-drawer.component';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';
import { isPastDate, isValidEmail } from 'src/app/shared/utils/form-validation.util';
import { ItemSheetMeta } from 'src/app/shared/components/item-entry/item-entry-excel';
import { readRfqSheetMeta, rfqSheetMeta } from '../../sales-rfq-sheets';
import { RfqPreset } from 'src/app/core/services/palette-handoff.service';
import {
  salesRfqStatusLabel,
  SalesRfq,
  SalesRfqAvailability,
  SalesRfqLineInput,
  SalesRfqStockCheck,
  SalesRfqSupplier,
  SalesRfqSupplierActivity,
  SalesRfqSupplierOption,
  SalesRfqTerms,
  PurchaseRfqData,
} from 'src/app/shared/interfaces/sales-rfq.interface';

/** The supplier of one editor tab (kept in the option's `meta`). Each tab becomes its own RFQ with only that tab's lines. */
interface DraftSupplier {
  supplierId: string;
  supplierName: string;
  contactEmail?: string;
  isSupplierApproved?: boolean;
  /** Index of the tab this supplier belongs to. */
  option: number;
}

/** One line as the item editor holds it, flattened with its item name. */
interface FlatLine {
  group: FormGroup;
  option: number;
  key: string;
  itemName: string;
  productId: string | null;
  detail: string;
  quantity: number;
  uom: string;
}

type SuggestedSupplier = SalesRfqStockCheck['suppliers'][number];

/** The choices come from the Availability master list; "Unavailable" is added because it drives the RFQ's own logic. */
const UNAVAILABLE_OPTION: SfOption[] = [{ label: 'Unavailable', value: 'Unavailable' }];

/**
 * Supplier RFQ drawer, opened from the enquiry's RFQs tab.
 *
 * Create (`enquiryId`): the sales person first finds each product in the catalogue (or creates it),
 * sees whether stock covers it, and asks suppliers only for what is short or not stocked. Lines are
 * entered with the shared item editor (catalogue search, Ctrl+K, multi-select bulk actions). Every
 * supplier picked becomes its own RFQ holding only the lines it is asked for.
 *
 * Edit (`rfqId`): the same drawer filled with one RFQ. Its supplier is fixed; the lines, terms and
 * the supplier's prices are edited and saved together.
 */
@Component({
  selector: 'app-sales-rfq-create-drawer',
  standalone: true,
  templateUrl: './sales-rfq-create-drawer.component.html',
  imports: [NgIf, NgFor, DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule, SmartFormModule,
    ActionButtonComponent, ItemEntryComponent, SupplierFormDrawerComponent, ProductFormDrawerComponent],
  providers: [CatalogueSuggestionSource],
})
export class SalesRfqCreateDrawerComponent implements OnChanges {
  @Input() open = false;
  /** Create mode: the enquiry to raise RFQs for. */
  @Input() enquiryId: string | null = null;
  /** Edit mode: the RFQ to open. Takes precedence over `enquiryId`. */
  @Input() rfqId: string | null = null;
  /** Create mode: products and a supplier picked in the command palette, added on top of the enquiry's lines. */
  @Input() preset: RfqPreset | null = null;
  /** Create mode for a purchase request: the lines picked on it are asked of suppliers instead of an enquiry's. */
  @Input() purchaseId: string | null = null;
  /** Purchase mode: saved line ids to ask about (all lines when empty). */
  @Input() purchaseLineKeys: string[] = [];
  /** Purchase mode: the supplier chosen in the selection banner, placed on the first tab. */
  @Input() purchaseSupplier: { supplierId: string; supplierName: string; contactEmail?: string; isSupplierApproved?: boolean } | null = null;
  /** Emits once RFQs are created or the edited one is saved. */
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;
  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  private salesRfqService = inject(SalesRfqService);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private destroyRef = inject(DestroyRef);
  private fb = inject(FormBuilder);
  readonly catalogue = inject(CatalogueSuggestionSource);

  readonly currencySfOptions: SfOption[] = ['QAR', 'USD', 'EUR', 'AED', 'SAR', 'GBP'].map((c) => ({ label: c, value: c }));
  readonly unavailableOption = UNAVAILABLE_OPTION;

  form: FormGroup = this.fb.group({ optionalItems: this.fb.array([]) });
  /** What the item editor starts from; it is mounted only once this is set. */
  seed: ItemEntryOptionValue[] | null = null;

  enquiry: any = null;
  /** Purchase mode: the request the lines belong to, and the saved line ids RFQs may point at. */
  purchase: PurchaseRfqData['purchase'] | null = null;
  private purchaseKeys = new Set<string>();
  fromPresale = false;
  /** Edit mode: the RFQ and its one supplier. */
  rfq: SalesRfq | null = null;
  invite: SalesRfqSupplier | null = null;

  /** The editor tab being worked on. */
  activeOption = 0;
  terms: SalesRfqTerms = {};
  deadline: string | null = null;
  requiredBy: string | null = null;
  notes = '';
  /** Other open requests to the picked suppliers, keyed by supplier id. */
  activity: Record<string, SalesRfqSupplierActivity[]> = {};
  private activity$ = new Subject<void>();

  /** Who quoted each picked product before, newest/most-used first. */
  pastSuppliers: { productId: string; rows: any[] }[] = [];
  private history$ = new Subject<void>();

  loading = false;
  saving = false;
  dirty = false;
  loadError = '';
  /** Stock position per line, keyed by line key. */
  stock: Record<string, SalesRfqStockCheck> = {};
  stockLoading = false;
  private stock$ = new Subject<void>();
  private formSub?: Subscription;

  supplierSearch = '';
  supplierOptions: SalesRfqSupplierOption[] = [];
  /** Suppliers that already hold a live RFQ for this enquiry (id → RFQ no.); they cannot be asked again here. */
  asked: Record<string, string> = {};
  private supplierSearch$ = new Subject<string>();
  /** Master details of the suppliers seen so far, keyed by supplier id; the banner shows the current tab's. */
  supplierInfo: Record<string, SalesRfqSupplierOption> = {};
  /** The details banner can fold down to its header row. */
  bannerOpen = true;
  supplierFormOpen = false;
  productFormOpen = false;
  productPrefill: { productSegment?: string; productCategoryName?: string; productDescription?: string } | null = null;

  constructor() {
    // Pending products can be asked for: product approval is skipped on RFQs for now.
    this.catalogue.includePending = true;

    this.supplierSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => this.fetchSupplierOptions(term).pipe(catchError(() => of({ success: false, data: [] as SalesRfqSupplierOption[] })))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => (this.supplierOptions = res.data || []));

    this.activity$
      .pipe(
        debounceTime(400),
        switchMap(() => {
          const supplierIds = this.suppliers.map((s) => s.supplierId);
          if (!supplierIds.length) return of({ success: true, data: [] as SalesRfqSupplierActivity[] });
          const lines = this.flatLines.map((l) => ({ partNo: l.productId ?? undefined, detail: l.detail }));
          return this.salesRfqService.supplierActivity({ supplierIds, lines }).pipe(catchError(() => of({ success: false, data: [] as SalesRfqSupplierActivity[] })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        const map: Record<string, SalesRfqSupplierActivity[]> = {};
        (res.data || []).forEach((a) => (map[a.supplierId] = [...(map[a.supplierId] || []), a]));
        this.activity = map;
      });

    this.history$
      .pipe(
        debounceTime(900),
        switchMap(() => {
          const ids = [...new Set(this.filledLines.map((l) => l.productId).filter((id): id is string => !!id))].slice(0, 8);
          if (!ids.length) return of([] as { productId: string; rows: any[] }[]);
          return forkJoin(ids.map((productId) => this.salesRfqService.supplierProducts({ productId }).pipe(
            map((res) => ({ productId, rows: (res?.data || []) as any[] })),
            catchError(() => of({ productId, rows: [] as any[] })),
          )));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((groups) => (this.pastSuppliers = groups.filter((g) => g.rows.length)));

    // Re-checks stock once the lines settle (a product picked, a quantity changed).
    this.stock$.pipe(debounceTime(700), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.checkStock());
  }

  get isEdit(): boolean {
    return !!this.rfqId;
  }

  get locked(): boolean {
    return !!this.rfq && ['Closed', 'Cancelled'].includes(this.rfq.status);
  }

  get statusLabel(): string {
    return this.rfq ? salesRfqStatusLabel(this.rfq.status, !!this.rfq.quotationId) : '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) this.load();
  }

  // --- load --------------------------------------------------------------------

  private load(): void {
    this.reset();
    if (this.rfqId) this.loadRfq(this.rfqId);
    else if (this.purchaseId) this.loadPurchaseDraft(this.purchaseId);
    else if (this.enquiryId) this.loadDraft(this.enquiryId);
    else this.loadError = 'No enquiry selected.';
  }

  private loadDraft(enquiryId: string): void {
    this.loading = true;
    this.salesRfqService.draft(enquiryId).subscribe({
      next: (res) => {
        const data = res.data;
        this.enquiry = data.enquiry;
        this.fromPresale = data.fromPresale;
        const presetLines = this.presetLines(data.lines || []);
        this.mountLines(this.toSeed([...(data.lines || []), ...presetLines]));
        this.applyPresetSupplier();
        this.loading = false;
        // Learn which suppliers already hold an RFQ for this enquiry before the first pick.
        this.fetchSupplierOptions('').subscribe({ next: (r) => (this.supplierOptions = r.data || []), error: () => {} });
      },
      error: (err) => {
        this.loading = false;
        this.loadError = err?.error?.message || 'Could not load the enquiry.';
      },
    });
  }

  /** Purchase request: the picked lines (or all of them) become the lines to ask suppliers about. */
  private loadPurchaseDraft(purchaseId: string): void {
    this.loading = true;
    this.salesRfqService.forPurchase(purchaseId).subscribe({
      next: (res) => {
        const data = res.data;
        this.purchase = data.purchase;
        const wanted = new Set(this.purchaseLineKeys);
        const lines = data.lines.filter((l) => !wanted.size || wanted.has(l.itemDetailKey));
        this.purchaseKeys = new Set(data.lines.map((l) => l.itemDetailKey));
        this.fetchSupplierOptions('').pipe(catchError(() => of({ success: false, data: [] as SalesRfqSupplierOption[] }))).subscribe((r) => {
          this.supplierOptions = r.data || [];
          const seed = this.supplierSeed(lines);
          this.mountLines(seed);
          // One tab per supplier already tied to the lines; otherwise the palette's supplier goes on the first tab.
          if (!seed.some((o) => o.meta)) this.applyPresetSupplier();
          this.loading = false;
        });
      },
      error: (err) => {
        this.loading = false;
        this.loadError = err?.error?.message || 'Could not load the purchase request.';
      },
    });
  }

  private loadRfq(id: string): void {
    this.loading = true;
    this.salesRfqService.getById(id).subscribe({
      next: (res) => {
        this.applyRfq(res.data);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.loadError = err?.error?.message || 'Could not load the RFQ.';
      },
    });
  }

  /** Fills the form from a loaded (or just-changed) RFQ, with its one supplier's prices if it has any. */
  private applyRfq(rfq: SalesRfq): void {
    this.rfq = rfq;
    this.enquiry = rfq.enquiryId;
    this.invite = rfq.suppliers?.[0] ?? null;
    if (this.invite?.supplierId) this.loadSupplierInfo(this.invite.supplierId);
    this.terms = { currency: 'QAR', ...(rfq.requestedTerms || {}) };
    this.deadline = rfq.deadline ? rfq.deadline.slice(0, 10) : null;
    this.requiredBy = rfq.requiredBy ? rfq.requiredBy.slice(0, 10) : null;
    this.notes = rfq.notes || '';
    const quotes = new Map((rfq.quotes || [])
      .filter((q) => !this.invite || String(q.inviteId || '') === String(this.invite._id))
      .map((q) => [q.itemDetailKey, q]));
    const lines = (rfq.requestedLines || []).map((line) => {
      const quote = quotes.get(line.itemDetailKey);
      // The server populates the product on each line so its code and part no show again on reopen.
      const rawPartNo: any = line.partNo;
      const product: any = rawPartNo && typeof rawPartNo === 'object' ? rawPartNo : null;
      return {
        ...line,
        partNo: product ? product._id : line.partNo,
        productItemCode: product?.itemCode,
        productPartNo: product?.partNo,
        unitCost: quote?.unitPrice ?? null,
        availability: quote?.availability ?? '',
      };
    });
    this.mountLines(this.toSeed(lines));
  }

  /** The palette's products not already on the enquiry, as RFQ lines with keys known up front. */
  private presetLines(existing: SalesRfqLineInput[]): SalesRfqLineInput[] {
    const have = new Set(existing.map((l) => String(l.partNo || '')).filter(Boolean));
    return (this.preset?.products || [])
      .filter((p) => !have.has(String(p._id)))
      .map((p) => ({
        itemDetailKey: ItemEntryComponent.newLineKey(),
        itemName: p.categoryName || 'Items',
        detail: p.description,
        quantity: 1,
        partNo: p._id as any,
        uom: p.uom || '',
      }));
  }

  /** The palette's supplier becomes the first tab's supplier. */
  private applyPresetSupplier(): void {
    const supplier = this.purchaseSupplier ?? this.preset?.supplier;
    if (!supplier) return;
    // The editor builds its tabs on first render; the supplier waits for them.
    setTimeout(() => {
      if (!this.optionalItems.length) return;
      this.setMeta(0, { supplierId: supplier.supplierId, supplierName: supplier.supplierName, contactEmail: supplier.contactEmail, isSupplierApproved: supplier.isSupplierApproved });
    });
  }

  /**
   * Purchase lines arranged by supplier: one tab per supplier already tied to the lines (offers on file, or the
   * supplier name typed on the line), each holding its lines under their item groups. Lines with no supplier go on
   * a tab of their own, left for the buyer to assign. Without any supplier the lines stay on one tab.
   */
  private supplierSeed(lines: PurchaseRfqData['lines']): ItemEntryOptionValue[] {
    const toLine = (l: PurchaseRfqData['lines'][number]) => ({
      itemDetailKey: l.itemDetailKey, itemName: l.itemName, detail: l.detail, quantity: l.quantity,
      partNo: l.partNo as any, uom: l.uom, productItemCode: l.itemCode,
    });
    const tabs = new Map<string, { meta: any; lines: PurchaseRfqData['lines'] }>();
    const loose: PurchaseRfqData['lines'] = [];
    lines.forEach((l) => {
      const found = new Map<string, { supplierId: string; supplierName: string }>();
      (l.suppliers || []).forEach((s) => found.set(s.supplierId, { supplierId: s.supplierId, supplierName: s.supplierName || '' }));
      const typed = l.supplierName?.trim().toLowerCase();
      const byName = typed ? this.supplierOptions.find((o) => o.supplierName.trim().toLowerCase() === typed) : null;
      if (byName) found.set(byName.supplierId, { supplierId: byName.supplierId, supplierName: byName.supplierName });
      if (!found.size) return void loose.push(l);
      found.forEach((s) => {
        const option = this.supplierOptions.find((o) => o.supplierId === s.supplierId);
        if (!tabs.has(s.supplierId)) {
          tabs.set(s.supplierId, {
            meta: {
              supplierId: s.supplierId,
              supplierName: option?.supplierName || s.supplierName,
              contactEmail: option?.contactEmail,
              isSupplierApproved: option?.isSupplierApproved,
            },
            lines: [],
          });
        }
        tabs.get(s.supplierId)!.lines.push(l);
      });
    });
    if (!tabs.size) return this.toSeed(lines.map(toLine));
    const seed = Array.from(tabs.values()).map((t) => ({ ...this.toSeed(t.lines.map(toLine))[0], meta: t.meta }));
    if (loose.length) seed.push({ ...this.toSeed(loose.map(toLine))[0], meta: null });
    return seed;
  }

  /** Groups flat RFQ lines under their item names, the shape the item editor works in. */
  private toSeed(lines: (SalesRfqLineInput & { unitCost?: number | null; availability?: string; productItemCode?: string; productPartNo?: string })[]): ItemEntryOptionValue[] {
    const items = new Map<string, ItemEntryItemValue>();
    lines.forEach((line) => {
      const name = line.itemName?.trim() || 'Items';
      if (!items.has(name)) items.set(name, { itemName: name, itemDetails: [] });
      items.get(name)!.itemDetails!.push({
        productId: (line.partNo as any) || null,
        itemCode: line.productItemCode || '',
        partNo: line.productPartNo || '',
        detail: line.detail,
        quantity: line.quantity,
        uom: line.uom || '',
        unitCost: line.unitCost ?? null,
        availability: line.availability || '',
        lineKey: line.itemDetailKey || ItemEntryComponent.newLineKey(),
      });
    });
    return [{ items: Array.from(items.values()) }];
  }

  private mountLines(seed: ItemEntryOptionValue[]): void {
    this.form = this.fb.group({ optionalItems: this.fb.array([]) });
    // An empty enquiry starts on one blank item; the editor adds it itself when there is no seed.
    this.seed = seed[0]?.items?.length ? seed : [];
    this.formSub?.unsubscribe();
    // The editor fills itself from the seed on its first render; that is not a user edit. Ignoring those
    // emissions also keeps `dirty` from flipping mid change-detection (NG0100 on every open).
    let seeding = true;
    // An empty seed still renders one blank row.
    this.seedLineCount = Math.max(1, this.seed.reduce((n, o) => n + (o.items || []).reduce((m, i) => m + (i.itemDetails?.length || 0), 0), 0));
    this.formSub = this.optionalItems.valueChanges.subscribe(() => {
      if (seeding) return;
      this.seedLineCount = 0;
      this.dirty = true;
      if (!this.isEdit) {
        this.stock$.next();
        this.history$.next();
      }
    });
    if (!this.isEdit) {
      this.stock$.next();
      this.history$.next();
    }
    setTimeout(() => {
      seeding = false;
      this.dirty = false;
    });
  }

  private reset(): void {
    this.formSub?.unsubscribe();
    this.seed = null;
    this.enquiry = null;
    this.purchase = null;
    this.purchaseKeys = new Set<string>();
    this.fromPresale = false;
    this.rfq = null;
    this.invite = null;
    this.activeOption = 0;
    this.terms = { currency: 'QAR' };
    this.deadline = this.defaultDeadline();
    this.requiredBy = null;
    this.notes = '';
    this.activity = {};
    this.dirty = false;
    this.loadError = '';
    this.stock = {};
    this.supplierSearch = '';
    this.supplierOptions = [];
    this.supplierInfo = {};
    this.asked = {};
  }

  // --- lines -------------------------------------------------------------------

  get optionalItems(): FormArray {
    return this.form.get('optionalItems') as FormArray;
  }

  /** Every line in the editor, in order, with its item name. */
  get flatLines(): FlatLine[] {
    const out: FlatLine[] = [];
    this.optionalItems.controls.forEach((option, optionIndex) => ((option.get('items') as FormArray)?.controls || []).forEach((item) => {
      const itemName = String(item.get('itemName')?.value || '').trim();
      ((item.get('itemDetails') as FormArray)?.controls || []).forEach((line) => {
        const v = (line as FormGroup).getRawValue();
        out.push({
          group: line as FormGroup,
          option: optionIndex,
          key: v.lineKey,
          itemName,
          productId: v.productId || null,
          detail: String(v.detail || '').trim(),
          quantity: Number(v.quantity) || 0,
          uom: v.uom || '',
        });
      });
    }));
    return out;
  }

  /** Lines the seed will create; stands in for the header count until the editor, rendered after it, has built them. */
  private seedLineCount = 0;

  /** Line count for the header strip, stable across the editor's first render. */
  get lineCount(): number {
    return this.flatLines.length || this.seedLineCount;
  }

  /** Lines with something typed in; blank rows are ignored everywhere. */
  private get filledLines(): FlatLine[] {
    return this.flatLines.filter((l) => l.detail || l.productId);
  }

  keyOf(line: FormGroup): string {
    return line.get('lineKey')?.value;
  }

  // --- stock -------------------------------------------------------------------

  private stockSignature = '';

  /** Checks each line against the catalogue and stock; skipped when nothing relevant changed. */
  checkStock(force = false): void {
    const lines = this.filledLines;
    const signature = lines.map((l) => `${l.key}|${l.productId}|${l.detail}|${l.quantity}`).join('\n');
    if (!lines.length || (!force && signature === this.stockSignature)) return;
    this.stockSignature = signature;
    this.stockLoading = true;
    const body = lines.map((l) => ({ itemDetailKey: l.key, itemName: l.itemName, detail: l.detail, quantity: l.quantity, partNo: l.productId ?? undefined, uom: l.uom }));
    this.salesRfqService.stockCheck(body).subscribe({
      next: (res) => {
        this.stockLoading = false;
        this.stock = Object.fromEntries((res.data || []).map((c) => [c.itemDetailKey, c]));
      },
      error: () => (this.stockLoading = false),
    });
  }

  stockFor(line: FormGroup): SalesRfqStockCheck | undefined {
    return this.stock[this.keyOf(line)];
  }

  /** Stock covers the whole quantity: no supplier needed unless the user asks anyway. */
  isCovered(line: FormGroup): boolean {
    const st = this.stockFor(line);
    return !!st?.matched && st.inStock;
  }

  /** Some stock, not enough: suppliers are asked only for the shortfall. */
  shortfall(line: FormGroup): number | null {
    const st = this.stockFor(line);
    if (!st?.matched || st.inStock || !st.available) return null;
    return Math.max(Number(line.get('quantity')?.value || 0) - st.available, 0);
  }

  suggestedSuppliers(line: FormGroup): SuggestedSupplier[] {
    return (this.stockFor(line)?.suppliers || []).filter((sug) => !this.suppliers.some((d) => d.supplierId === sug.supplierId) && !this.asked[sug.supplierId]);
  }

  /** Past-supplier row: ask that supplier again (unless already on a tab). */
  askPast(row: any): void {
    this.pickSupplier({ supplierId: row.supplierId, supplierName: row.supplierName, isSupplierApproved: true } as unknown as SalesRfqSupplierOption);
  }

  isAskedPast(row: any): boolean {
    return this.suppliers.some((s) => s.supplierId === row.supplierId) || !!this.asked[row.supplierId];
  }

  askSuggested(line: FormGroup, sug: SuggestedSupplier): void {
    this.pickSupplier({ ...sug, isSupplierApproved: true } as unknown as SalesRfqSupplierOption);
  }

  // --- products ------------------------------------------------------------------

  openCreateProduct({ itemName, detail, scopeIds }: CreateProductRequest): void {
    this.productPrefill = { productSegment: scopeIds[0] || '', productCategoryName: itemName, productDescription: detail };
    this.productFormOpen = true;
  }

  /** Footer button: register a catalogue product that is not tied to any line. */
  openAddProduct(): void {
    this.productPrefill = null;
    this.productFormOpen = true;
  }

  /** A product created from a line goes straight onto that line, approval or not. */
  onProductCreated(product: any): void {
    if (!product?._id) return;
    this.itemEntry?.applyCreatedProduct({
      _id: product._id,
      categoryName: product.productCategory?.categoryName || '',
      description: product.productDescription || '',
      source: 'catalogue',
      itemCode: product.itemCode || '',
      partNo: product.partNo || '',
      uom: product.unitOfMeasure || '',
    });
  }

  // --- suppliers ---------------------------------------------------------------

  onSupplierSearch(term: string): void {
    this.supplierSearch$.next(term.trim());
  }

  /** Supplier list for the picker; in create mode it also records which suppliers the enquiry already asked. */
  private fetchSupplierOptions(term: string) {
    return this.salesRfqService.supplierOptions(term, undefined, this.isEdit ? undefined : this.enquiryId || undefined).pipe(
      tap((res) => (res.data || []).forEach((o) => {
        if (o.alreadyAsked) this.asked[o.supplierId] = o.askedRfqNo || 'an RFQ';
      })),
    );
  }

  private choicesKey = '';
  private choicesCache: SfOption[] = [];

  /** Memoised: a fresh array every change detection would re-render the dropdown rows and swallow clicks. */
  get supplierChoices(): SfOption[] {
    const current = this.activeSupplier;
    const key = JSON.stringify([this.supplierOptions.map((o) => [o.supplierId, o.supplierName, o.isSupplierApproved, this.isPicked(o), this.asked[o.supplierId]]), current?.supplierId, current?.supplierName]);
    if (key === this.choicesKey) return this.choicesCache;
    const choices: SfOption[] = this.supplierOptions.map((o) => {
      const taken = !!this.asked[o.supplierId] && o.supplierId !== current?.supplierId;
      return {
        label: o.supplierName,
        value: o.supplierId,
        disabled: taken,
        description: [!o.isSupplierApproved ? 'pending' : '', this.isPicked(o) ? 'open tab' : '', taken ? `already asked · ${this.asked[o.supplierId]}` : ''].filter(Boolean).join(' · ') || undefined,
      };
    });
    // Keep the tab's own supplier selectable/visible even if the loaded list does not include it.
    if (current && !choices.some((c) => c.value === current.supplierId)) choices.unshift({ label: current.supplierName, value: current.supplierId, description: undefined });
    this.choicesKey = key;
    return (this.choicesCache = choices);
  }

  pickSupplierById(id: string | null): void {
    const option = this.supplierOptions.find((o) => o.supplierId === id);
    if (option) this.pickSupplier(option);
  }

  onSupplierFocus(): void {
    if (this.supplierOptions.length) return;
    this.fetchSupplierOptions(this.supplierSearch.trim()).subscribe({
      next: (res) => (this.supplierOptions = res.data || []),
      error: () => (this.supplierOptions = []),
    });
  }

  /** One supplier per tab, in tab order. Tabs with no supplier yet are left out. */
  get suppliers(): DraftSupplier[] {
    return this.optionalItems.controls
      .map((option, i) => ({ ...(option.get('meta')?.value || {}), option: i }) as DraftSupplier)
      .filter((s) => !!s.supplierId);
  }

  /** The supplier of the tab being worked on, if one is picked. */
  get activeSupplier(): DraftSupplier | null {
    return this.suppliers.find((s) => s.option === this.activeOption) ?? null;
  }

  /** Tab label: the supplier's name once picked, otherwise "Supplier N". */
  readonly optionLabel = (i: number, meta: any): string => meta?.supplierName || `Supplier ${i + 1}`;

  onOptionChanged(i: number): void {
    this.activeOption = i;
    this.activity$.next();
  }

  isPicked(option: SalesRfqSupplierOption): boolean {
    return this.suppliers.some((s) => s.supplierId === option.supplierId);
  }

  /** The supplier whose details the banner shows: the RFQ's own (edit) or the current tab's (create). */
  get bannerSupplier(): SalesRfqSupplierOption | null {
    const id = this.isEdit ? this.invite?.supplierId : this.activeSupplier?.supplierId;
    return (id && this.supplierInfo[id]) || null;
  }

  /** Fetches a supplier's master details once; the banner fills from them. */
  private loadSupplierInfo(id: string): void {
    if (this.supplierInfo[id]) return;
    this.salesRfqService.supplierOptions('', id).subscribe({
      next: (res) => {
        const s = res.data?.find((o) => o.supplierId === id);
        if (s) this.supplierInfo = { ...this.supplierInfo, [id]: s };
      },
      error: () => {},
    });
  }

  private setMeta(index: number, meta: Omit<DraftSupplier, 'option'> | null): void {
    if (meta?.supplierId) this.loadSupplierInfo(meta.supplierId);
    this.optionalItems.at(index)?.get('meta')?.setValue(meta);
    this.activity$.next();
    this.dirty = true;
  }

  /** Picks a supplier for the current tab; if that tab already has one, the pick gets a new tab of its own. */
  pickSupplier(option: SalesRfqSupplierOption): void {
    this.supplierSearch = '';
    if (this.asked[option.supplierId]) {
      this.toaster.warning(`${option.supplierName} already has ${this.asked[option.supplierId]} for this enquiry. Open that RFQ instead, or withdraw it first.`, 'Supplier already asked');
      return;
    }
    const have = this.suppliers.find((s) => s.supplierId === option.supplierId);
    if (have) {
      if (have.option !== this.activeOption) this.itemEntry?.selectOption(have.option);
      return;
    }
    let target = this.activeOption;
    if (this.activeSupplier && this.itemEntry) {
      // The tab already has a supplier: add a tab instead of silently replacing it.
      const from = this.activeOption;
      this.itemEntry.addOption();
      target = this.optionalItems.length - 1;
      this.activeOption = target;
      this.copyLinesFrom(from);
    }
    this.setMeta(target, {
      supplierId: option.supplierId,
      supplierName: option.supplierName,
      contactEmail: option.contactEmail,
      isSupplierApproved: option.isSupplierApproved,
    });
  }

  /** A new supplier tab starts with the same products and quantities as the tab it was added from; prices stay blank. */
  private copyLinesFrom(from: number, picks?: { j: number; k: number }[]): void {
    const items = (this.optionalItems.at(from)?.get('items') as FormArray | null)?.getRawValue() ?? [];
    const copied = items
      .map((item: any, j: number) => ({
        itemName: item.itemName,
        itemDetails: (item.itemDetails || [])
          .filter((d: any, k: number) => (!picks || picks.some((p) => p.j === j && p.k === k)) && (d.detail || d.productId))
          .map((d: any) => ({
            productId: d.productId, itemCode: d.itemCode, partNo: d.partNo, detail: d.detail,
            quantity: d.quantity, uom: d.uom,
            // A purchase line keeps its saved id on every supplier tab: that id is how the request finds each supplier's price.
            lineKey: this.purchaseId ? d.lineKey : ItemEntryComponent.newLineKey(),
          })),
      }))
      .filter((item: any) => item.itemDetails.length);
    if (!copied.length) return;
    this.itemEntry?.addItems(copied);
    if (!picks) this.toaster.info('Lines copied from the previous supplier. Remove any this supplier should not quote.');
  }

  /** "Add RFQ": a new supplier tab. Lines ticked on this tab are copied onto it and stay where they are. */
  onAddSupplierTab(): void {
    const entry = this.itemEntry;
    if (!entry) return;
    const from = this.activeOption;
    const picks = entry.selectedPositions().filter((p) => p.i === from).map(({ j, k }) => ({ j, k }));
    entry.addOption();
    this.activeOption = this.optionalItems.length - 1;
    if (picks.length) {
      this.copyLinesFrom(from, picks);
      this.toaster.info(`${picks.length} line${picks.length === 1 ? '' : 's'} copied to the new supplier tab.`);
    }
    this.dirty = true;
  }

  openSupplierForm(): void {
    this.supplierFormOpen = true;
  }

  /** A supplier registered from here is picked straight away; new suppliers are saved as approved. */
  onSupplierCreated(supplier: any): void {
    if (!supplier?._id) return;
    this.pickSupplier({
      supplierId: supplier._id,
      supplierName: supplier.supplierName,
      contactEmail: supplier.contactDetails?.email,
      isSupplierApproved: true,
    } as unknown as SalesRfqSupplierOption);
  }

  /** Frees the current tab's supplier so another can be chosen; the tab's lines stay. */
  clearSupplier(): void {
    this.setMeta(this.activeOption, null);
  }

  setContactEmail(email: string): void {
    const s = this.activeSupplier;
    if (!s) return;
    const { option, ...meta } = s;
    this.setMeta(option, { ...meta, contactEmail: email });
  }

  /** Lines a tab sends to its supplier: filled lines that stock does not already cover. */
  private keysFor(option: number): string[] {
    // A purchase request is asked in full: its quantities already take stock into account.
    return this.filledLines.filter((l) => l.option === option && (!!this.purchaseId || !this.isCovered(l.group))).map((l) => l.key);
  }

  assignedCount(supplier: DraftSupplier): number {
    return this.keysFor(supplier.option).length;
  }

  activityFor(supplier: DraftSupplier): SalesRfqSupplierActivity[] {
    return this.activity[supplier.supplierId] || [];
  }

  activityTitle(supplier: DraftSupplier): string {
    return this.activityFor(supplier)
      .map((a) => `${a.rfqNo}${a.enquiryNo ? ' (' + a.enquiryNo + ')' : ''}: ${a.status}${a.overlap.length ? ' · same: ' + a.overlap.join(', ') : ''}`)
      .join('\n');
  }

  /** Lines in a tab that has no supplier picked: they would not be sent to anyone. */
  get unassignedCount(): number {
    const picked = new Set(this.suppliers.map((s) => s.option));
    return this.filledLines.filter((l) => !picked.has(l.option) && !this.isCovered(l.group)).length;
  }

  get coveredCount(): number {
    return this.filledLines.filter((l) => this.isCovered(l.group)).length;
  }

  /** Details written above the lines of the Excel export, as currently entered in the banner. */
  readonly excelMeta = (): ItemSheetMeta[] => {
    const sup = this.bannerSupplier;
    return rfqSheetMeta({
      rfqNo: this.rfq?.rfqNo,
      enquiryNo: this.purchase?.purchaseNo ?? this.enquiry?.enquiryId,
      customer: this.enquiry?.client?.companyName || this.rfq?.customerId?.companyName,
      supplierName: (this.isEdit ? this.invite?.supplierName : this.activeSupplier?.supplierName) || undefined,
      supplierCode: sup?.code,
      contactName: sup?.contactName,
      contactPhone: sup?.contactPhone,
      contactEmail: sup?.contactEmail || sup?.companyEmail,
      deadline: this.deadline,
      requiredBy: this.requiredBy,
      terms: this.terms,
      withValidity: this.isEdit,
      notes: this.notes,
    });
  };

  /** An imported sheet's details fill the banner fields; blank cells leave what is entered. */
  onExcelMeta(meta: Record<string, string>): void {
    const read = readRfqSheetMeta(meta);
    if (read.deadline) this.deadline = read.deadline;
    if (read.requiredBy) this.requiredBy = read.requiredBy;
    if (read.notes) this.notes = read.notes;
    const { currency, ...rest } = read.terms;
    if (currency && this.currencySfOptions.some((o) => o.value === currency)) this.terms.currency = currency;
    if (!this.isEdit) delete rest.validityDate;
    this.terms = { ...this.terms, ...rest };
    this.dirty = true;
  }

  // --- save --------------------------------------------------------------------

  onDrawerClosed(): void {
    this.closed.emit();
  }

  /** Footer Cancel goes through the drawer so unsaved changes get the same discard prompt as X and Esc. */
  cancel(): void {
    this.drawer?.requestClose();
  }

  /** The lines as the server takes them; `askShortfall` sends only the missing quantity on short lines. */
  private buildLines(askShortfall: boolean): SalesRfqLineInput[] {
    return this.filledLines.map((l) => {
      const short = askShortfall ? this.shortfall(l.group) : null;
      return {
        itemDetailKey: l.key,
        itemName: l.itemName,
        detail: l.detail,
        quantity: short != null && short > 0 ? short : l.quantity,
        uom: l.uom,
        partNo: l.productId ?? undefined,
        isNewItem: !l.productId,
      };
    });
  }

  private linesValid(): boolean {
    if (this.optionalItems.invalid || !this.filledLines.length) {
      this.optionalItems.markAllAsTouched();
      // Name the first bad line so it can be found in a long list.
      const all = this.flatLines;
      const badAt = all.findIndex((l) => (l.detail || l.productId) && (l.group.invalid || !l.itemName || l.quantity <= 0));
      const where = badAt >= 0 ? `Line ${badAt + 1}${all[badAt].itemName ? ` (${all[badAt].itemName})` : ''} is incomplete. ` : '';
      this.toaster.warning(`${where}Every line needs an item name, a description and a quantity above zero.`, 'Incomplete');
      return false;
    }
    return true;
  }

  /** New RFQs cannot ask for prices in the past; an existing one keeps whatever dates it was raised with. */
  get minDate(): string | null {
    return this.isEdit ? null : this.defaultDeadlineOffset(0);
  }

  private defaultDeadlineOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Suppliers are asked for prices within three days unless the user picks another date. */
  private defaultDeadline(): string {
    return this.defaultDeadlineOffset(3);
  }

  submit(): void {
    if (this.saving || this.locked) return;
    if (!this.linesValid()) return;
    if (this.purchaseId && !this.isEdit) {
      this.createForPurchase();
      return;
    }
    if (!this.linesLinked()) return;
    if (this.isEdit) this.saveEdit();
    else this.create();
  }

  /** An RFQ line must point at a catalogue product; free-text lines are refused instead of being added to the catalogue. */
  private linesLinked(): boolean {
    const all = this.flatLines;
    const at = all.findIndex((l) => (l.detail || l.itemName) && !l.productId);
    if (at < 0) return true;
    this.toaster.warning(
      `Line ${at + 1}${all[at].itemName ? ` (${all[at].itemName})` : ''} is not linked to a product in the catalogue. Pick it from the catalogue, or create the product first.`,
      'Not in catalogue',
    );
    return false;
  }

  /** Checks the supplier tabs, dates and terms before RFQs are raised; returns the suppliers to send, or null after warning. */
  private validatedSuppliers(): { supplierId: string; contactEmail?: string; lineKeys: string[]; option: number }[] | null {
    const all = this.suppliers.map((s) => ({ supplierId: s.supplierId, supplierName: s.supplierName, contactEmail: s.contactEmail, lineKeys: this.keysFor(s.option), option: s.option }));
    const empty = all.filter((s) => !s.lineKeys.length);
    // A supplier tab with nothing to price used to be dropped silently, so only some of the RFQs were raised.
    if (empty.length && empty.length < all.length) {
      this.toaster.warning(
        `${empty.map((s) => s.supplierName).join(', ')} has no lines to price (empty tab, or every line is already in stock). Add lines to that tab or remove it, then save again.`,
        'Supplier tab without lines',
      );
      return null;
    }
    const suppliers = all.filter((s) => s.lineKeys.length).map(({ supplierId, contactEmail, lineKeys, option }) => ({ supplierId, contactEmail, lineKeys, option }));
    if (!suppliers.length) {
      this.toaster.warning(this.suppliers.length ? 'The picked suppliers have no lines to price.' : 'Pick at least one supplier to ask for prices.', 'No supplier');
      return null;
    }
    const badEmail = this.suppliers.find((s) => !isValidEmail(s.contactEmail));
    if (badEmail) {
      this.toaster.warning(`"${badEmail.contactEmail}" is not a valid email address for ${badEmail.supplierName}.`, 'Contact email');
      return null;
    }
    if (!this.deadline) {
      this.toaster.warning('Say when you need the supplier prices by.', 'Prices by');
      return null;
    }
    if (isPastDate(this.deadline)) {
      this.toaster.warning('"Prices needed by" is already in the past. Pick today or a later date.', 'Deadline');
      return null;
    }
    if (this.deadline && this.requiredBy && this.requiredBy < this.deadline) {
      this.toaster.warning('The goods are needed before the supplier prices are due. Check both dates.', 'Dates');
      return null;
    }
    return suppliers;
  }

  private create(): void {
    if (!this.enquiryId) return;
    const picked = this.validatedSuppliers();
    if (!picked) return;
    const suppliers = picked.map(({ supplierId, contactEmail, lineKeys }) => ({ supplierId, contactEmail, lineKeys }));
    const unassigned = this.unassignedCount;
    this.saving = true;
    this.salesRfqService
      .createFromEnquiry(this.enquiryId, {
        lines: this.buildLines(true),
        suppliers,
        requestedTerms: this.terms,
        deadline: this.deadline || null,
        requiredBy: this.requiredBy || null,
        notes: this.notes,
      })
      .subscribe({
        next: (res) => {
          this.saving = false;
          this.dirty = false;
          const created = res.data || [];
          this.toaster.success(
            `${created.length} RFQ${created.length === 1 ? '' : 's'} raised: ${created.map((r) => `${r.rfqNo} (${r.supplierName})`).join(', ')}.`
              + (unassigned ? ` ${unassigned} line(s) were not sent to any supplier.` : ''),
            'Created'
          );
          this.savePricesEnteredOnCreate(created, picked);
          this.closed.emit();
          this.saved.emit();
        },
        error: (err) => {
          this.saving = false;
          this.toaster.error(err?.error?.message || 'Could not create the RFQ.');
        },
      });
  }

  /** Saves the picked lines of a purchase request as supplier RFQs; they show in the request's RFQ list straight away. */
  private createForPurchase(): void {
    if (!this.purchaseId) return;
    const stray = this.filledLines.find((l) => !this.purchaseKeys.has(l.key));
    if (stray) {
      this.toaster.warning('Only products already on the purchase request can be asked about. Add the new product to the request first.', 'Not on the request');
      return;
    }
    const picked = this.validatedSuppliers();
    if (!picked) return;
    const suppliers = picked.map(({ supplierId, contactEmail, lineKeys }) => ({ supplierId, contactEmail, lineKeys }));
    // A line shared by several supplier tabs is asked at one quantity; the first tab's quantity wins.
    const quantities = new Map<string, number>();
    this.buildLines(false).forEach((l) => { if (l.itemDetailKey && !quantities.has(l.itemDetailKey)) quantities.set(l.itemDetailKey, l.quantity); });
    this.saving = true;
    this.salesRfqService
      .createFromPurchase(this.purchaseId, {
        suppliers,
        lines: Array.from(quantities, ([itemDetailKey, quantity]) => ({ itemDetailKey, quantity })),
        requestedTerms: this.terms,
        deadline: this.deadline!,
        requiredBy: this.requiredBy || null,
        notes: this.notes,
      })
      .subscribe({
        next: (res) => {
          this.saving = false;
          this.dirty = false;
          const created = res.data || [];
          this.toaster.success(created.map((r) => `${r.rfqNo} (${r.supplierName})${r.merged ? ' updated' : ''}`).join(', '), `${created.length} RFQ${created.length === 1 ? '' : 's'} saved`);
          this.savePricesEnteredOnCreate(created, picked);
          this.closed.emit();
          this.saved.emit();
        },
        error: (err) => {
          this.saving = false;
          this.toaster.error(err?.error?.message || 'Could not create the RFQ.');
        },
      });
  }

  /** A unit price or availability typed while raising the RFQ is saved onto the new RFQ as the supplier's reply. */
  private savePricesEnteredOnCreate(created: { _id: string; rfqNo: string; supplierId: string; inviteId: string }[], picked: { supplierId: string; lineKeys: string[]; option: number }[]): void {
    created.forEach((rfq) => {
      const invite = rfq.inviteId ? { _id: rfq.inviteId } : null;
      const tab = picked.find((s) => String(s.supplierId) === rfq.supplierId);
      const keys = new Set(tab?.lineKeys ?? []);
      const prices = this.filledLines
        .filter((l) => keys.has(l.key) && l.option === tab?.option)
        .map((l) => {
          const v = l.group.getRawValue();
          const unavailable = v.availability === 'Unavailable';
          const hasPrice = v.unitCost != null && v.unitCost !== '';
          if (!invite || (!hasPrice && !v.availability)) return null;
          return {
            itemDetailKey: l.key,
            unitPrice: unavailable || !hasPrice ? null : Number(v.unitCost),
            availability: (v.availability || undefined) as SalesRfqAvailability | undefined,
            quantity: l.quantity,
          };
        })
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!prices.length) return;
      this.salesRfqService.submitReply(rfq._id, invite!._id, { terms: this.terms, prices }).subscribe({
        error: () => this.toaster.warning(`${rfq.rfqNo} was raised, but the prices entered could not be saved. Open it to enter them again.`, 'Prices'),
      });
    });
  }

  /** Saves lines and terms, then the supplier's prices; the supplier itself never changes here. */
  private saveEdit(): void {
    const rfq = this.rfq;
    if (!rfq) return;
    const hasPrices = this.filledLines.some((l) => {
      const v = l.group.getRawValue();
      return (v.unitCost != null && v.unitCost !== '') || !!v.availability;
    });
    if (!this.invite && hasPrices) {
      this.toaster.warning('This RFQ has no supplier, so prices cannot be saved. Raise a new RFQ and pick a supplier.', 'No supplier');
      return;
    }
    this.saving = true;
    const prices = this.filledLines.map((l) => {
      const v = l.group.getRawValue();
      const unavailable = v.availability === 'Unavailable';
      return {
        itemDetailKey: l.key,
        unitPrice: unavailable || v.unitCost == null || v.unitCost === '' ? null : Number(v.unitCost),
        availability: (v.availability || undefined) as SalesRfqAvailability | undefined,
        quantity: l.quantity,
      };
    });
    this.salesRfqService
      .update(rfq._id, { lines: this.buildLines(false), requestedTerms: this.terms, deadline: this.deadline || null, requiredBy: this.requiredBy || null, notes: this.notes })
      .pipe(switchMap((res) => (this.invite ? this.salesRfqService.submitReply(rfq._id, this.invite._id, { terms: this.terms, prices }) : of(res))))
      .subscribe({
        next: () => {
          this.saving = false;
          this.dirty = false;
          this.toaster.success(`${rfq.rfqNo} saved.`);
          this.closed.emit();
          this.saved.emit();
        },
        error: (err) => {
          this.saving = false;
          this.toaster.error(err?.error?.message || 'Could not save the RFQ.');
        },
      });
  }

  /** Withdraws this RFQ (a wrong supplier, a request nobody will answer). Cancelled RFQs drop out of Compare & award. */
  async cancelRfq(): Promise<void> {
    const rfq = this.rfq;
    if (!rfq || this.locked || this.saving) return;
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Withdraw this RFQ?',
      message: `${rfq.rfqNo}${this.invite?.supplierName ? ' to ' + this.invite.supplierName : ''} will be withdrawn and can no longer be priced or awarded.`,
      consequence: 'Prices already entered stay on record. To ask again, raise a new RFQ.',
      confirmLabel: 'Withdraw RFQ',
      cancelLabel: 'Keep RFQ',
      reason: true,
      reasonLabel: 'Reason',
    });
    if (!confirmed) return;
    this.saving = true;
    this.salesRfqService.cancel(rfq._id, reason?.trim()).subscribe({
      next: () => {
        this.saving = false;
        this.dirty = false;
        this.toaster.success(`${rfq.rfqNo} withdrawn.`);
        this.closed.emit();
        this.saved.emit();
      },
      error: (err) => {
        this.saving = false;
        this.toaster.error(err?.error?.message || 'Could not cancel the RFQ.');
      },
    });
  }
}
