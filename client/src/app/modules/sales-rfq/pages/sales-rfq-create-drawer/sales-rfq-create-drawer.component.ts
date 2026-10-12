import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
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
import { downloadRequestSheet } from '../../sales-rfq-sheets';
import { RfqPreset } from 'src/app/core/services/palette-handoff.service';
import { ProductService } from 'src/app/core/services/product/product.service';
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

const AVAILABILITY_OPTIONS: SfOption[] = (['Available', 'Limited', 'Unavailable'] as SalesRfqAvailability[]).map((a) => ({ label: a, value: a }));

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
  /** Emits once RFQs are created or the edited one is saved. */
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;
  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  private salesRfqService = inject(SalesRfqService);
  private productService = inject(ProductService);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private destroyRef = inject(DestroyRef);
  private fb = inject(FormBuilder);
  readonly catalogue = inject(CatalogueSuggestionSource);

  readonly currencySfOptions: SfOption[] = ['QAR', 'USD', 'EUR', 'AED', 'SAR', 'GBP'].map((c) => ({ label: c, value: c }));
  readonly availabilityOptions = AVAILABILITY_OPTIONS;

  form: FormGroup = this.fb.group({ optionalItems: this.fb.array([]) });
  /** What the item editor starts from; it is mounted only once this is set. */
  seed: ItemEntryOptionValue[] | null = null;

  enquiry: any = null;
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
  private supplierSearch$ = new Subject<string>();
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
        switchMap((term) => this.salesRfqService.supplierOptions(term).pipe(catchError(() => of({ success: false, data: [] as SalesRfqSupplierOption[] })))),
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
      },
      error: (err) => {
        this.loading = false;
        this.loadError = err?.error?.message || 'Could not load the enquiry.';
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
        paymentTerms: quote?.paymentTerms ?? '',
        deliveryTerms: quote?.etaTerms ?? '',
        remarks: quote?.remarks ?? '',
        offeredQty: quote && quote.quantity !== line.quantity ? quote.quantity : null,
        alternative: quote?.isAlternative ? quote.modelOffered ?? '' : '',
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
    const supplier = this.preset?.supplier;
    if (!supplier) return;
    // The editor builds its tabs on first render; the supplier waits for them.
    setTimeout(() => {
      if (!this.optionalItems.length) return;
      this.setMeta(0, { supplierId: supplier.supplierId, supplierName: supplier.supplierName, contactEmail: supplier.contactEmail, isSupplierApproved: supplier.isSupplierApproved });
    });
  }

  /** Groups flat RFQ lines under their item names, the shape the item editor works in. */
  private toSeed(lines: (SalesRfqLineInput & { unitCost?: number | null; availability?: string; paymentTerms?: string; deliveryTerms?: string; remarks?: string; offeredQty?: number | null; alternative?: string; productItemCode?: string; productPartNo?: string })[]): ItemEntryOptionValue[] {
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
        paymentTerms: line.paymentTerms || '',
        deliveryTerms: line.deliveryTerms || '',
        remarks: line.remarks || '',
        offeredQty: line.offeredQty ?? null,
        alternative: line.alternative || '',
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
    return (this.stockFor(line)?.suppliers || []).filter((sug) => !this.suppliers.some((d) => d.supplierId === sug.supplierId));
  }

  /** Past-supplier row: ask that supplier again (unless already on a tab). */
  askPast(row: any): void {
    this.pickSupplier({ supplierId: row.supplierId, supplierName: row.supplierName, isSupplierApproved: true } as unknown as SalesRfqSupplierOption);
  }

  isAskedPast(row: any): boolean {
    return this.suppliers.some((s) => s.supplierId === row.supplierId);
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

  get supplierChoices(): SfOption[] {
    const choices = this.supplierOptions.map((o) => ({
      label: o.supplierName,
      value: o.supplierId,
      description: [!o.isSupplierApproved ? 'pending' : '', this.isPicked(o) ? 'open tab' : ''].filter(Boolean).join(' · ') || undefined,
    }));
    const current = this.activeSupplier;
    // Keep the tab's own supplier selectable/visible even if the loaded list does not include it.
    if (current && !choices.some((c) => c.value === current.supplierId)) choices.unshift({ label: current.supplierName, value: current.supplierId, description: undefined });
    return choices;
  }

  pickSupplierById(id: string | null): void {
    const option = this.supplierOptions.find((o) => o.supplierId === id);
    if (option) this.pickSupplier(option);
  }

  onSupplierFocus(): void {
    if (this.supplierOptions.length) return;
    this.salesRfqService.supplierOptions(this.supplierSearch.trim()).subscribe({
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

  private setMeta(index: number, meta: Omit<DraftSupplier, 'option'> | null): void {
    this.optionalItems.at(index)?.get('meta')?.setValue(meta);
    this.activity$.next();
    this.dirty = true;
  }

  /** Picks a supplier for the current tab; if that tab already has one, the pick gets a new tab of its own. */
  pickSupplier(option: SalesRfqSupplierOption): void {
    this.supplierSearch = '';
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
  private copyLinesFrom(from: number): void {
    const items = (this.optionalItems.at(from)?.get('items') as FormArray | null)?.getRawValue() ?? [];
    const copied = items
      .map((item: any) => ({
        itemName: item.itemName,
        itemDetails: (item.itemDetails || [])
          .filter((d: any) => d.detail || d.productId)
          .map((d: any) => ({
            productId: d.productId, itemCode: d.itemCode, partNo: d.partNo, detail: d.detail,
            quantity: d.quantity, uom: d.uom, lineKey: ItemEntryComponent.newLineKey(),
          })),
      }))
      .filter((item: any) => item.itemDetails.length);
    if (!copied.length) return;
    this.itemEntry?.addItems(copied);
    this.toaster.info('Lines copied from the previous supplier. Remove any this supplier should not quote.');
  }

  /** A supplier registered from here is picked straight away; its approval is skipped for now. */
  onSupplierCreated(supplier: any): void {
    if (!supplier?._id) return;
    this.pickSupplier({
      supplierId: supplier._id,
      supplierName: supplier.supplierName,
      contactEmail: supplier.contactDetails?.email,
      isSupplierApproved: false,
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
    return this.filledLines.filter((l) => l.option === option && !this.isCovered(l.group)).map((l) => l.key);
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

  /** Blank columns on the exported sheet for the supplier to complete. Once the RFQ is being priced they are real columns of the editor, so none are added. */
  get excelFillColumns(): string[] {
    return this.isEdit ? [] : ['Unit Price', 'Availability', 'Payment Terms', 'Delivery Terms', 'Remarks'];
  }

  /** Excel request sheet for one tab's supplier, built from what is on screen (before the RFQ exists). */
  async exportOption(index: number): Promise<void> {
    const supplier = this.suppliers.find((s) => s.option === index);
    if (!supplier) {
      this.toaster.warning('Pick the supplier for this tab first.', 'No supplier');
      return;
    }
    const keys = this.keysFor(index);
    if (!keys.length) {
      this.toaster.warning('This tab has no lines to send.', 'Nothing to export');
      return;
    }
    const rfq = {
      rfqNo: `${this.enquiry?.enquiryId || 'RFQ'}-draft`,
      deadline: this.deadline || undefined,
      notes: this.notes,
      requestedTerms: this.terms,
      requestedLines: this.buildLines(true).filter((l) => keys.includes(l.itemDetailKey!)),
    } as unknown as SalesRfq;
    try {
      await downloadRequestSheet(rfq, { supplierName: supplier.supplierName, lineKeys: keys } as unknown as SalesRfqSupplier);
    } catch {
      this.toaster.error('Could not build the request sheet.');
    }
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
    this.saving = true;
    this.createNewItems().subscribe((ok) => {
      this.saving = false;
      if (!ok) return;
      if (this.isEdit) this.saveEdit();
      else this.create();
    });
  }

  /**
   * Lines typed in without a catalogue product become Pending products, so the item exists once and can be
   * reviewed, instead of staying free text on the RFQ. A part number that is already in the catalogue is reused.
   */
  private createNewItems() {
    const fresh = this.filledLines.filter((l) => !l.productId);
    if (!fresh.length) return of(true);
    return forkJoin(fresh.map((l) => this.productService.quickCreateProduct({
      productName: l.itemName || undefined,
      productDescription: l.detail || l.itemName,
      unitOfMeasure: l.uom || undefined,
    }).pipe(
      map((res) => { l.group.patchValue({ productId: res.product?._id }); return true; }),
      catchError((err) => { this.toaster.error(err?.error?.message || `Could not add "${l.itemName || l.detail}" to the catalogue.`); return of(false); }),
    ))).pipe(map((results) => results.every(Boolean)));
  }

  private create(): void {
    if (!this.enquiryId) return;
    const suppliers = this.suppliers
      .map((s) => ({ supplierId: s.supplierId, contactEmail: s.contactEmail, lineKeys: this.keysFor(s.option) }))
      .filter((s) => s.lineKeys.length);
    if (!suppliers.length) {
      this.toaster.warning(this.suppliers.length ? 'The picked suppliers have no lines to price.' : 'Pick at least one supplier to ask for prices.', 'No supplier');
      return;
    }
    const badEmail = this.suppliers.find((s) => !isValidEmail(s.contactEmail));
    if (badEmail) {
      this.toaster.warning(`"${badEmail.contactEmail}" is not a valid email address for ${badEmail.supplierName}.`, 'Contact email');
      return;
    }
    if (!this.deadline) {
      this.toaster.warning('Say when you need the supplier prices by.', 'Prices by');
      return;
    }
    if (isPastDate(this.deadline)) {
      this.toaster.warning('"Prices needed by" is already in the past. Pick today or a later date.', 'Deadline');
      return;
    }
    if (this.deadline && this.requiredBy && this.requiredBy < this.deadline) {
      this.toaster.warning('The customer needs the goods before the suppliers\' prices are due. Check both dates.', 'Dates');
      return;
    }
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
          this.closed.emit();
          this.saved.emit();
        },
        error: (err) => {
          this.saving = false;
          this.toaster.error(err?.error?.message || 'Could not create the RFQ.');
        },
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
        quantity: v.offeredQty != null && v.offeredQty !== '' && Number(v.offeredQty) > 0 ? Number(v.offeredQty) : l.quantity,
        modelOffered: String(v.alternative || '').trim() || undefined,
        isAlternative: !!String(v.alternative || '').trim(),
        paymentTerms: String(v.paymentTerms || '').trim() || undefined,
        deliveryTerms: String(v.deliveryTerms || '').trim() || undefined,
        remarks: String(v.remarks || '').trim() || undefined,
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

  /** The supplier's request sheet (Excel) with only its lines, to send outside the system. */
  downloadSheet(): void {
    if (this.rfq && this.invite) {
      downloadRequestSheet(this.rfq, this.invite).catch(() => this.toaster.error('Could not build the request sheet.'));
    }
  }
}
