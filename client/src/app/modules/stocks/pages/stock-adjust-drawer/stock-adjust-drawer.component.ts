import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ProductService } from 'src/app/core/services/product/product.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { StockAvailability, StockService } from 'src/app/core/services/stock/stock.service';
import { ModalService } from 'src/app/shared/components/modal';
import { StockAreaService } from 'src/app/core/services/stock-area/stock-area.service';
import { QuickAddDialogComponent, QuickAddDialogData } from 'src/app/modules/products/modals/quick-add-dialog/quick-add-dialog.component';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';
import { CatalogueSuggestionSource } from 'src/app/shared/components/item-entry/catalogue-suggestion.source';
import { ItemSuggestion } from 'src/app/shared/components/item-entry/item-entry.model';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';

const ADD_REASONS = ['Opening stock', 'Count correction', 'Other'];
const REMOVE_REASONS = ['Count correction', 'Damaged', 'Lost / missing', 'Other'];

/**
 * Manual stock correction in a slide-over: add or remove stock for a product in a warehouse, always with a
 * reason. Opened from the Stock screen, optionally for a product already chosen.
 */
@Component({
  selector: 'app-stock-adjust-drawer',
  standalone: true,
  templateUrl: './stock-adjust-drawer.component.html',
  imports: [NgIf, NgFor,ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ProductFormDrawerComponent],
  providers: [CatalogueSuggestionSource],
})
export class StockAdjustDrawerComponent implements OnInit, OnChanges {
  @Input() open = false;
  /** Product to adjust; leave empty to let the user choose one. */
  @Input() productId = '';
  /** Warehouse to preselect (the one the stock sits in on the Stock Balance row). */
  @Input() warehouseId = '';
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  saving = false;
  createProductOpen = false;
  productOptions: SfOption[] = [];
  /** Text in the product textarea; suggestions are filtered from it. */
  showSuggestions = false;
  /** Shared smart-form textarea for the product; kept outside the form so it never blocks submit. */
  readonly productText = new FormControl('', { nonNullable: true });
  get productQuery(): string { return this.productText.value; }
  set productQuery(text: string) { this.productText.setValue(text, { emitEvent: false }); }
  warehouseOptions: SfOption[] = [];
  areaOptions: SfOption[] = [];
  private productWarehouse: Record<string, string> = {};
  readonly directionOptions: SfOption[] = [
    { label: 'Add stock', value: 'add' },
    { label: 'Remove stock', value: 'remove' },
  ];
  current: StockAvailability | null = null;

  private fb = inject(FormBuilder);
  private toast = inject(ToastrService);
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private warehouseService = inject(WarehouseService);
  private modal = inject(ModalService);
  private areaService = inject(StockAreaService);
  private catalogue = inject(CatalogueSuggestionSource);

  form = this.fb.group({
    product: ['', Validators.required],
    warehouse: ['', Validators.required],
    direction: ['add', Validators.required],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
    reason: ['', Validators.required],
    unitCost: [null as number | null],
    arrivalDate: [''],
    area: [''],
    serialNos: [''],
    remarks: [''],
  });

  /** Serials typed one per line (commas also accepted), trimmed and de-duplicated. */
  get serialList(): string[] {
    return [...new Set((this.form.controls.serialNos.value || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  }

  get reasonOptions(): SfOption[] {
    return (this.form.controls.direction.value === 'remove' ? REMOVE_REASONS : ADD_REASONS).map((reason) => ({ label: reason, value: reason }));
  }

  get isOther(): boolean { return this.form.controls.reason.value === 'Other'; }

  /** Catalogue products matching the typed text (same lookup as the quotation item description). */
  productSuggestions: ItemSuggestion[] = [];
  private searchText$ = new Subject<string>();

  onProductInput(text: string): void {
    this.showSuggestions = true;
    // typing again clears a product picked earlier until a suggestion is chosen
    const picked = this.productOptions.find((o) => o.value === this.form.controls.product.value);
    if (picked && picked.label !== text) this.form.controls.product.setValue('');
    this.form.controls.product.markAsDirty();
    this.form.controls.product.markAsTouched();
    this.searchText$.next(text.trim());
  }

  onProductFocus(): void {
    this.showSuggestions = true;
    this.searchText$.next(this.productQuery.trim());
  }

  selectProduct(s: ItemSuggestion): void {
    this.productQuery = s.description || s.productName || s.itemCode || '';
    this.showSuggestions = false;
    if (!this.productOptions.some((o) => o.value === s._id)) this.productOptions = [{ label: this.productQuery, value: s._id }, ...this.productOptions];
    this.form.controls.product.setValue(s._id);
    this.form.controls.product.markAsDirty();
    this.fillFromStockBalance(s);
  }

  /** Finds the picked product on the Stock Balance and copies its warehouse, unit cost and arrival date into the form. */
  private fillFromStockBalance(s: ItemSuggestion): void {
    const key = s.itemCode || s.partNo || s.description;
    if (!key) return;
    this.stockService.getOverview({ search: key, page: 1, row: 50 }).subscribe({
      next: (res) => {
        if (this.form.controls.product.value !== s._id) return;
        const row = (res.data?.overview ?? []).find((r) => r.productId === s._id);
        if (!row) return;
        const c = this.form.controls;
        const wh = [...(row.warehouses ?? [])].sort((a, b) => b.quantity - a.quantity)[0]?.warehouseId;
        if (wh && !this.warehouseId && this.warehouseOptions.some((o) => o.value === wh)) c.warehouse.setValue(wh);
        if (row.unitCost != null && !c.unitCost.dirty) c.unitCost.setValue(Number(row.unitCost));
        if (row.arrivalDate && !c.arrivalDate.dirty) c.arrivalDate.setValue(String(row.arrivalDate).slice(0, 10));
      },
      error: () => { },
    });
  }

  hideSuggestionsSoon(): void {
    setTimeout(() => (this.showSuggestions = false), 150);
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.form.dirty) event.preventDefault();
  }

  ngOnInit(): void {
    this.productService.getProducts({ page: 1, row: 1000 }).subscribe({
      next: (res) => {
        (res.data?.products ?? []).forEach((p: any) => this.rememberWarehouse(p));
        this.productOptions = (res.data?.products ?? []).map((p: any) => ({ label: p.productDescription || p.productName || p.itemCode || '', value: p._id }));
        const picked = this.productOptions.find((o) => o.value === this.form.controls.product.value);
        if (picked && !this.productQuery) this.productQuery = picked.label;
      },
      error: () => this.toast.error('Failed to load products'),
    });
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouseOptions = (warehouses ?? []).filter((w: any) => w.isActive !== false).map((w) => ({ label: w.wareHouseName, value: w._id as string }));
        if (this.warehouseOptions.length === 1 && !this.form.controls.warehouse.value) this.form.controls.warehouse.setValue(this.warehouseOptions[0].value);
      },
      error: () => this.toast.error('Failed to load warehouses'),
    });
    this.areaService.getAreas().subscribe({
      next: (areas) => (this.areaOptions = (areas ?? []).filter((a) => a.isActive !== false).map((a) => ({ label: a.areaName, value: a.areaName }))),
      error: () => this.toast.error('Failed to load areas'),
    });
    this.productText.valueChanges.subscribe((text) => this.onProductInput(text));
    this.searchText$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((search) => this.catalogue.search({ search, scopeIds: [], limit: 20 }).pipe(catchError(() => of([])))),
    ).subscribe((list) => (this.productSuggestions = list));
    this.form.controls.direction.valueChanges.subscribe(() => {
      // a reason that does not fit the new direction is cleared
      if (!this.reasonOptions.some((o) => o.value === this.form.controls.reason.value)) this.form.controls.reason.setValue('');
    });
    this.form.controls.reason.valueChanges.subscribe(() => {
      const remarks = this.form.controls.remarks;
      remarks.setValidators(this.isOther ? [Validators.required] : []);
      remarks.updateValueAndValidity({ emitEvent: false });
    });
    this.form.controls.product.valueChanges.subscribe((id) => {
      this.loadCurrent(id);
      // a product set from outside (opened for an item, or just created) shows its name in the textarea
      const label = this.productOptions.find((o) => o.value === id)?.label;
      if (label) this.productQuery = label;
      // default the warehouse to the one set on the product in Master Data
      const wh = id ? this.productWarehouse[id] : '';
      if (wh && this.warehouseOptions.some((o) => o.value === wh)) this.form.controls.warehouse.setValue(wh);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open) return;
    this.reset();
    this.applyRequired();
    if (this.productId) this.form.controls.product.setValue(this.productId);
    // set after the product, which defaults the warehouse to the product's master-data one
    if (this.warehouseId) this.form.controls.warehouse.setValue(this.warehouseId);
  }

  /** A product created here is added to the list and selected. */
  onProductCreated(product: any): void {
    if (!product?._id) return;
    const label = product.productDescription || product.productName || product.itemCode || '';
    this.rememberWarehouse(product);
    this.productOptions = [{ label, value: product._id }, ...this.productOptions.filter((o) => o.value !== product._id)];
    this.form.controls.product.setValue(product._id);
    this.form.controls.product.markAsDirty();
  }

  /** Quick-add an area (same dialog as Settings > Product Data, with the active checkbox) and select it if active. */
  createArea(): void {
    const data: QuickAddDialogData = {
      title: 'Area',
      showActive: true,
      create: (name, isActive) => this.areaService.createArea({ areaName: name, createdDate: new Date(), isActive }),
    };
    this.modal.open<any, QuickAddDialogData>(QuickAddDialogComponent, { width: '480px', data }).afterClosed().subscribe((area) => {
      if (!area) return;
      this.toast.success('Area created successfully');
      if (area.isActive === false) return;
      this.areaOptions = [...this.areaOptions, { label: area.areaName, value: area.areaName }];
      this.form.controls.area.setValue(area.areaName);
      this.form.controls.area.markAsDirty();
    });
  }

  /** Quick-add a warehouse (same dialog as the product form) and select it. */
  createWarehouse(): void {
    const data: QuickAddDialogData = {
      title: 'Warehouse',
      create: (name) => this.warehouseService.createWarehouse({ wareHouseName: name, createdDate: new Date() } as any),
    };
    this.modal.open<any, QuickAddDialogData>(QuickAddDialogComponent, { width: '480px', data }).afterClosed().subscribe((warehouse) => {
      if (!warehouse) return;
      this.toast.success('Warehouse created successfully');
      this.warehouseOptions = [...this.warehouseOptions, { label: warehouse.wareHouseName, value: warehouse._id }];
      this.form.controls.warehouse.setValue(warehouse._id);
      this.form.controls.warehouse.markAsDirty();
    });
  }

  onDrawerClosed(discarded: boolean): void {
    if (discarded) this.reset();
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    // editing without a quantity: there is nothing to post to the ledger
    if (v.quantity === null || v.quantity === undefined || String(v.quantity) === '') {
      this.toast.info('No quantity entered, so nothing was posted.');
      this.reset();
      this.closed.emit();
      return;
    }
    const serialNos = this.serialList;
    if (serialNos.length > Number(v.quantity)) {
      this.toast.error(`${serialNos.length} serial numbers entered for a quantity of ${Number(v.quantity)}`);
      return;
    }
    this.saving = true;
    this.stockService.adjust({
      product: v.product as string,
      warehouse: v.warehouse as string,
      direction: v.direction as 'add' | 'remove',
      quantity: Number(v.quantity),
      // editing an existing item does not force a reason; it is recorded as a count correction
      reason: (v.reason || 'Count correction') as string,
      remarks: v.remarks?.trim() || undefined,
      area: v.area?.trim() || undefined,
      unitCost: v.direction === 'add' && v.unitCost !== null && v.unitCost !== undefined ? Number(v.unitCost) : undefined,
      arrivalDate: v.direction === 'add' && v.arrivalDate ? String(v.arrivalDate) : undefined,
      serialNos: serialNos.length ? serialNos : undefined,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success('Stock adjusted');
        this.reset();
        this.closed.emit();
        this.saved.emit();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(err?.error?.message || 'Could not adjust the stock.');
      },
    });
  }

  /** Editing an existing item: product, warehouse, action and reason are already known, so none is required. Quantity stays required. */
  get isEdit(): boolean { return !!this.productId; }

  private applyRequired(): void {
    const { product, warehouse, direction, reason, quantity } = this.form.controls;
    [product, warehouse, direction, reason].forEach((c) => {
      c.setValidators(this.isEdit ? [] : [Validators.required]);
      c.updateValueAndValidity({ emitEvent: false });
    });
    quantity.setValidators(this.isEdit ? [Validators.min(1)] : [Validators.required, Validators.min(1)]);
    quantity.updateValueAndValidity({ emitEvent: false });
  }

  private rememberWarehouse(p: any): void {
    const wh = p?.warehouse?._id ?? p?.warehouse;
    if (p?._id && wh) this.productWarehouse[p._id] = wh;
  }

  private reset(): void {
    this.form.reset({ product: '', warehouse: this.warehouseOptions.length === 1 ? this.warehouseOptions[0].value : '', direction: 'add', quantity: null, reason: '', unitCost: null, arrivalDate: '', area: '', serialNos: '', remarks: '' });
    this.current = null;
    this.productQuery = '';
    this.showSuggestions = false;
  }

  private loadCurrent(productId: string | null): void {
    this.current = null;
    if (!productId) return;
    // default the unit price to the product's last PO price, unless the user already typed one
    this.stockService.getItemDetails(productId).subscribe({
      next: (res) => {
        const cost = res.data?.lastPo?.['unitCost'];
        const control = this.form.controls.unitCost;
        if (this.form.controls.product.value === productId && cost != null && !control.dirty) control.setValue(Number(cost));
      },
      error: () => { },
    });
    this.stockService.getAvailability([productId]).subscribe({
      next: (res) => (this.current = res.data?.[productId] ?? null),
      error: () => (this.current = null),
    });
  }
}
