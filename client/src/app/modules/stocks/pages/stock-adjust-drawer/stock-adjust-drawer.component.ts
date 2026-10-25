import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ProductService } from 'src/app/core/services/product/product.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { StockAvailability, StockService } from 'src/app/core/services/stock/stock.service';
import { ModalService } from 'src/app/shared/components/modal';
import { QuickAddDialogComponent, QuickAddDialogData } from 'src/app/modules/products/modals/quick-add-dialog/quick-add-dialog.component';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';

const ADD_REASONS = ['Opening stock', 'Count correction', 'Found', 'Other'];
const REMOVE_REASONS = ['Count correction', 'Damaged', 'Lost / missing', 'Other'];

/**
 * Manual stock correction in a slide-over: add or remove stock for a product in a warehouse, always with a
 * reason. Opened from the Stock screen, optionally for a product already chosen.
 */
@Component({
  selector: 'app-stock-adjust-drawer',
  standalone: true,
  templateUrl: './stock-adjust-drawer.component.html',
  imports: [NgIf, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ProductFormDrawerComponent],
})
export class StockAdjustDrawerComponent implements OnInit, OnChanges {
  @Input() open = false;
  /** Product to adjust; leave empty to let the user choose one. */
  @Input() productId = '';
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  saving = false;
  createProductOpen = false;
  productOptions: SfOption[] = [];
  warehouseOptions: SfOption[] = [];
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

  form = this.fb.group({
    product: ['', Validators.required],
    warehouse: ['', Validators.required],
    direction: ['add', Validators.required],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
    reason: ['', Validators.required],
    unitCost: [null as number | null],
    remarks: [''],
  });

  get reasonOptions(): SfOption[] {
    return (this.form.controls.direction.value === 'remove' ? REMOVE_REASONS : ADD_REASONS).map((reason) => ({ label: reason, value: reason }));
  }

  get isOther(): boolean { return this.form.controls.reason.value === 'Other'; }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.form.dirty) event.preventDefault();
  }

  ngOnInit(): void {
    this.productService.getProducts({ page: 1, row: 1000 }).subscribe({
      next: (res) => {
        (res.data?.products ?? []).forEach((p: any) => this.rememberWarehouse(p));
        this.productOptions = (res.data?.products ?? []).map((p: any) => ({ label: `${p.partNo || p.itemCode} - ${p.productDescription || p.productName || ''}`, value: p._id }));
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
      // default the warehouse to the one set on the product in Master Data
      const wh = id ? this.productWarehouse[id] : '';
      if (wh && this.warehouseOptions.some((o) => o.value === wh)) this.form.controls.warehouse.setValue(wh);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open) return;
    this.reset();
    if (this.productId) this.form.controls.product.setValue(this.productId);
  }

  /** A product created here is added to the list and selected. */
  onProductCreated(product: any): void {
    if (!product?._id) return;
    const label = `${product.partNo || product.itemCode} - ${product.productDescription || product.productName || ''}`;
    this.rememberWarehouse(product);
    this.productOptions = [{ label, value: product._id }, ...this.productOptions.filter((o) => o.value !== product._id)];
    this.form.controls.product.setValue(product._id);
    this.form.controls.product.markAsDirty();
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
    this.saving = true;
    this.stockService.adjust({
      product: v.product as string,
      warehouse: v.warehouse as string,
      direction: v.direction as 'add' | 'remove',
      quantity: Number(v.quantity),
      reason: v.reason as string,
      remarks: v.remarks?.trim() || undefined,
      unitCost: v.direction === 'add' && v.unitCost !== null && v.unitCost !== undefined ? Number(v.unitCost) : undefined,
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

  private rememberWarehouse(p: any): void {
    const wh = p?.warehouse?._id ?? p?.warehouse;
    if (p?._id && wh) this.productWarehouse[p._id] = wh;
  }

  private reset(): void {
    this.form.reset({ product: '', warehouse: this.warehouseOptions.length === 1 ? this.warehouseOptions[0].value : '', direction: 'add', quantity: null, reason: '', unitCost: null, remarks: '' });
    this.current = null;
  }

  private loadCurrent(productId: string | null): void {
    this.current = null;
    if (!productId) return;
    this.stockService.getAvailability([productId]).subscribe({
      next: (res) => (this.current = res.data?.[productId] ?? null),
      error: () => (this.current = null),
    });
  }
}
