import { Component, EventEmitter, Inject, Input, OnChanges, OnDestroy, OnInit, Optional, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, Subscription, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgIcon } from '@ng-icons/core';
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
@Component({
  selector: 'app-item-entry',
  standalone: true,
  templateUrl: './item-entry.component.html',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgIcon, DragDropModule, SmartFormModule, ActionButtonComponent, ParseBoldTextPipe, ParseBracketsTextPipe],
  styles: [SF_STYLES + `
    :host { display: block; }
    /* The numeric strip is dense on purpose: seven fields per line have to fit without a horizontal scrollbar. */
    .ie-strip { display: grid; gap: 0.375rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (min-width: 640px) { .ie-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (min-width: 1400px) { .ie-strip { grid-template-columns: minmax(0, 7.5fr) minmax(0, 7.5fr) minmax(0, 5fr) minmax(0, 5fr) minmax(0, 6.5fr) minmax(0, 5.5fr) minmax(0, 6.5fr) minmax(0, 11.5fr) minmax(0, 10.5fr) minmax(0, 6.5fr) minmax(0, 7fr); } }
    .ie-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    .ie-labels > span:nth-child(n+3):nth-child(-n+7), .ie-labels > span:nth-child(n+10) { text-align: right; }
    .ie-cell { display: flex; align-items: center; min-height: 2.25rem; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .ie-cell { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
    .ie-total { display: flex; align-items: center; justify-content: flex-end; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; font-variant-numeric: tabular-nums; font-weight: 500; background: #f9fafb; color: #111827; }
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
   */
  @Input() mode: 'quote' | 'deal' = 'quote';
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

  /** Shown as the "add from previous jobs" affordance; the host owns the fetch. */
  @Input() previousJobItemsCount = 0;
  @Input() previousJobsLabel = 'Previous jobs';

  @Input() availabilityOptions: SfOption[] = DEFAULT_AVAILABILITY_OPTIONS;
  /** Leave null to load the supplier list here; pass a list to supply it from the host instead. */
  @Input() supplierOptions: SfOption[] | null = null;
  /** Overrides the `ITEM_SUGGESTION_SOURCE` provider for this usage. Null in both: no suggestions. */
  @Input() suggestionSource: ItemSuggestionSource | null = null;
  /** Department/segment ids to narrow suggestions to. Falls back to the host form's `departments`. */
  @Input() suggestionScopeIds: string[] | null = null;

  @Output() totals = new EventEmitter<ItemEntryTotals>();
  @Output() previousJobsClicked = new EventEmitter<void>();
  @Output() createProductRequested = new EventEmitter<CreateProductRequest>();
  /** Deal mode: which option the user is working in. */
  @Output() optionChanged = new EventEmitter<number>();

  selectedOption = 0;
  /** Deal mode: the quoted numbers each line was seeded with, for restoring on untick. */
  private originals = new WeakMap<FormGroup, ItemEntryLineValue>();
  /** What the template binds; either the host's list or the one loaded from SupplierService. */
  resolvedSupplierOptions: SfOption[] = [];

  /** Keyed `i-j` for item names and `i-j-k` for descriptions. */
  suggestions: Record<string, ItemSuggestion[]> = {};
  activeSuggestionKey: string | null = null;

  private search$ = new Subject<{ key: string; term: string; category: string }>();
  private subs = new Subscription();
  /** Guards the cost/margin/price derivation from re-entering itself. */
  private deriving = false;

  constructor(
    private _fb: FormBuilder,
    private snackBar: MatSnackBar,
    private _supplierService: SupplierService,
    @Optional() @Inject(ITEM_SUGGESTION_SOURCE) private _providedSource: ItemSuggestionSource | null,
  ) {}

  ngOnInit(): void {
    if (this.seedOptionalItems?.length) this.patchOptions(this.seedOptionalItems);
    else if (!this.optionalItems.length) this.addOption();

    this.subs.add(this.optionalItems.valueChanges.subscribe(() => this.emitTotals()));

    if (this.supplierOptions) this.resolvedSupplierOptions = this.supplierOptions;
    else this.subs.add(this._supplierService.supplierList().subscribe({
      next: (res) => (this.resolvedSupplierOptions = (res?.data || []).map((s: any) => ({ label: s.supplierName, value: s._id }))),
    }));

    this.subs.add(
      this.search$
        .pipe(
          debounceTime(300),
          distinctUntilChanged((a, b) => a.key === b.key && a.term === b.term),
          switchMap(({ key, term, category }) => this.fetchSuggestions(key, term, category)),
        )
        .subscribe(({ key, rows }) => {
          this.suggestions[key] = rows;
          this.activeSuggestionKey = rows.length ? key : null;
        }),
    );

    this.emitTotals();
  }

  /**
   * A host that keeps this component mounted across wizard steps delivers a late seed (an enquiry
   * picked after mount) through an input change rather than through ngOnInit.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['supplierOptions'] && this.supplierOptions) this.resolvedSupplierOptions = this.supplierOptions;

    const seed = changes['seedOptionalItems'];
    if (!seed || seed.isFirstChange() || !this.seedOptionalItems?.length) return;
    this.patchOptions(this.seedOptionalItems);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get isDeal(): boolean { return this.mode === 'deal'; }

  selectOption(i: number): void {
    this.selectedOption = i;
    this.optionChanged.emit(i);
  }

  private get source(): ItemSuggestionSource | null {
    return this.suggestionSource ?? this._providedSource;
  }

  private fetchSuggestions(key: string, term: string, category: string) {
    const source = this.source;
    if (!source) return of({ key, rows: [] as ItemSuggestion[] });
    return source
      .search({ search: term, category, scopeIds: this.scopeIds })
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
    const deal = this.isDeal;
    const group = this._fb.group({
      itemCode: [''],
      partNo: [''],
      detail: ['', deal ? [] : Validators.required],
      quantity: [null as number | null, deal ? [this.whenTicked(Validators.required), Validators.min(0)] : [Validators.required, Validators.min(0)]],
      unitCost: [null as number | null, deal ? [this.whenTicked(Validators.required), Validators.min(0)] : [Validators.required, Validators.min(0)]],
      // A deal may sell below cost, so no negative-margin rule there.
      profit: [null as number | null, deal ? [this.whenTicked(Validators.required)] : [Validators.required, Validators.min(0), this.nonNegativeProfitValidator()]],
      unitSellingPrice: [null as number | null, deal ? [this.whenTicked(Validators.required), Validators.min(0)] : [Validators.required, Validators.min(0)]],
      availability: ['', deal ? [] : Validators.required],
      // null, not '': the server casts this to an ObjectId and an empty string fails the cast.
      supplierId: [null as string | null, deal ? [this.whenTicked(this.supplierRequired)] : []],
      uom: [''],
    });
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
          if (quoted) this.writeDetail(group, { ...quoted, supplierId: null });
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

    this.subs.add(cost().valueChanges.subscribe(fromCostAndMargin));
    this.subs.add(margin().valueChanges.subscribe(fromCostAndMargin));
    this.subs.add(price().valueChanges.subscribe(() => {
      if (this.deriving) return;
      const c = Number(cost().value) || 0;
      const p = Number(price().value) || 0;
      this.deriving = true;
      margin().setValue(c && p ? Number((((p - c) / p) * 100).toFixed(2)) : null, { emitEvent: false });
      this.deriving = false;
    }));

    return group;
  }

  private createItem(isOptional = false): FormGroup {
    return this._fb.group({
      itemName: ['', Validators.required],
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

  addOption(): void {
    this.optionalItems.push(this._fb.group({
      items: this._fb.array([this.createItem()]),
      totalDiscount: [null as number | null, [Validators.min(0)]],
    }));
    this.selectedOption = this.optionalItems.length - 1;
  }

  removeOption(i: number): void {
    if (this.optionalItems.length <= 1) return;
    this.removedOptions.push({ option: this.optionalItems.at(i).value, i });
    this.optionalItems.removeAt(i);
    this.selectedOption = Math.max(0, Math.min(this.selectedOption, this.optionalItems.length - 1));
    this.offerUndo('option');
  }

  addItem(i: number, isOptional = false): void {
    this.itemsAt(i).push(this.createItem(isOptional));
  }

  removeItem(i: number, j: number): void {
    if (this.itemsAt(i).length <= 1) return;
    this.removedItems.push({ item: this.itemsAt(i).at(j).value, i, j });
    this.itemsAt(i).removeAt(j);
    this.offerUndo('item');
  }

  addDetail(i: number, j: number): void {
    this.detailsAt(i, j)?.push(this.createDetail());
  }

  removeDetail(i: number, j: number, k: number): void {
    const details = this.detailsAt(i, j);
    if (!details || details.length <= 1) return;
    this.removedItemDetails.push({ item: details.at(k).value, i, j, k });
    details.removeAt(k);
    this.offerUndo('line');
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
      const items = (option.items || []).map((item) => {
        const details = (item.itemDetails || []).map((d) => {
          const group = this.createDetail();
          this.writeDetail(group, d);
          return group;
        });
        const itemGroup = this.createItem(!!item.isOptional);
        itemGroup.setControl('itemDetails', this._fb.array(details.length ? details : [this.createDetail()]));
        itemGroup.patchValue({ itemName: item.itemName ?? '', includeInTotal: !!item.includeInTotal });
        return itemGroup;
      });
      this.optionalItems.push(this._fb.group({
        items: this._fb.array(items.length ? items : [this.createItem()]),
        totalDiscount: [option.totalDiscount ?? null, [Validators.min(0)]],
      }));
    });
    if (!this.optionalItems.length) this.addOption();
    this.selectedOption = 0;
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
    const profit = d.profit != null && (d.profit as any) !== ''
      ? Number(d.profit)
      : cost && price ? Number((((price - cost) / price) * 100).toFixed(2)) : null;

    if (this.isDeal && !this.originals.has(group)) this.originals.set(group, { ...d });
    this.deriving = true;
    group.patchValue({
      itemCode: d.itemCode ?? '',
      partNo: d.partNo ?? '',
      detail: d.detail ?? '',
      quantity: d.quantity != null ? Number(d.quantity) : null,
      unitCost: cost,
      profit,
      unitSellingPrice: price,
      availability: d.availability ?? '',
      supplierId: (typeof d.supplierId === 'object' ? d.supplierId?._id : d.supplierId) || null,
      uom: d.uom ?? '',
    }, { emitEvent: false });
    this.deriving = false;
    group.updateValueAndValidity();
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
    const label = kind === 'line' ? 'Line' : kind === 'item' ? 'Item' : 'Option';
    this.snackBar.open(`${label} removed.`, 'Undo', { duration: 4000 })
      .onAction().subscribe(() => this.undo(kind));
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
      this.optionalItems.insert(i, this._fb.group({
        items: this._fb.array((option.items || []).map((item: any) => this.rebuildItem(item))),
        totalDiscount: [option.totalDiscount ?? null, [Validators.min(0)]],
      }));
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
    const term = (this.detailsAt(i, j)?.at(k)?.get('detail')?.value || '').toString().trim();
    const category = ((this.itemsAt(i).at(j) as FormGroup).get('itemName')?.value || '').toString().trim();
    this.queueSearch(`${i}-${j}-${k}`, term, category);
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
      if (s.uom) detail.get('uom')?.setValue(s.uom, { emitEvent: false });
      if (s.supplierId) detail.get('supplierId')?.setValue(s.supplierId, { emitEvent: false });
      if (s.unitCost != null) detail.get('unitCost')?.setValue(s.unitCost);
    }
    this.closeSuggestions();
  }

  closeSuggestions(): void {
    this.activeSuggestionKey = null;
  }

  requestCreateProduct(i: number, j: number, k: number): void {
    const itemName = ((this.itemsAt(i).at(j) as FormGroup).get('itemName')?.value || '').toString().trim();
    const detail = (this.detailsAt(i, j)?.at(k)?.get('detail')?.value || '').toString().trim();
    this.closeSuggestions();
    this.createProductRequested.emit({ itemName, detail, scopeIds: this.scopeIds });
  }

  // --- pricing ---------------------------------------------------------------

  lineCost(i: number, j: number, k: number): number {
    const d = this.detailsAt(i, j)?.at(k);
    return (Number(d?.get('quantity')?.value) || 0) * (Number(d?.get('unitCost')?.value) || 0);
  }

  lineTotal(i: number, j: number, k: number): number {
    const d = this.detailsAt(i, j)?.at(k);
    return (Number(d?.get('quantity')?.value) || 0) * (Number(d?.get('unitSellingPrice')?.value) || 0);
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

  profitPercent(): number {
    const net = this.finalTotal();
    return net > 0 ? ((net - this.totalCost()) / net) * 100 : 0;
  }

  private emitTotals(): void {
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

  private nonNegativeProfitValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null =>
      control.value != null && control.value < 0 ? { negativeProfit: true } : null;
  }
}
