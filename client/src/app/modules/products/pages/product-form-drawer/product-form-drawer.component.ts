import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ProductService, Product } from 'src/app/core/services/product/product.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { MasterListService } from 'src/app/core/services/master-list.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { PRODUCT_TYPES } from 'src/app/shared/interfaces/product.interface';
import { AddCategoryComponent } from '../../modals/add-category/add-category.component';
import { AddWarehouseComponent } from '../../modals/add-warehouse/add-warehouse.component';

/**
 * Slide-over used to create and edit catalogue items (stock, non-stock or service).
 * The host binds `open`, `mode` and (for edit) `product`, and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-product-form-drawer',
  standalone: true,
  templateUrl: './product-form-drawer.component.html',
  imports: [SmartFormModule, ActionButtonComponent],
})
export class ProductFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() product: Product | null = null;
  /** Optional starting values when launched from another form (create mode only). */
  @Input() prefill: { productSegment?: string; productCategoryName?: string; productDescription?: string } | null = null;
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toastr = inject(ToastrService);
  private productService = inject(ProductService);
  private productCategoryService = inject(ProductCategoryService);
  private warehouseService = inject(WarehouseService);
  private profileService = inject(ProfileService);
  private masterList = inject(MasterListService);
  private subscriptions = new Subscription();

  saving = false;

  typeOptions: SfOption[] = PRODUCT_TYPES.map((t) => ({ label: t, value: t }));
  categoryOptions: SfOption[] = [];
  segmentOptions: SfOption[] = [];
  warehouseOptions: SfOption[] = [];
  unitOptions: SfOption[] = [];
  taxOptions: SfOption[] = [];
  private optionsLoaded = false;

  productForm = this.fb.group({
    partNo: ['', Validators.required],
    itemCode: [{ value: '', disabled: true }, Validators.required],
    productName: [''],
    productDescription: ['', Validators.required],
    type: ['' as string, Validators.required],
    productSegment: ['', Validators.required],
    productCategory: ['', Validators.required],
    warehouse: ['', Validators.required],
    brand: ['', Validators.required],
    unitOfMeasure: [''],
    defaultTaxRate: [null as number | null],
    defaultSellingPrice: [null as number | null],
    estimatedCost: [null as number | null],
    isActive: [true],
  });

  get isEdit(): boolean { return this.mode === 'edit'; }
  get title(): string { return this.isEdit ? 'Edit Product' : 'Create Product'; }
  get subtitle(): string { return this.isEdit ? 'Update catalogue item details' : 'Add a stock, non-stock or service item'; }

  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open;
    if (!this.open || !(opened || changes['product'])) return;

    this.ensureOptions();
    this.loadMasterOptions();
    if (this.isEdit && this.product) {
      this.seedFromProduct(this.product);
    } else if (!this.isEdit) {
      this.resetForm();
      this.applyPrefill();
      this.generateItemCode(this.prefill?.productSegment || undefined);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Unit and tax come from Settings → Master Data; a saved value stays selectable even if retired. */
  private loadMasterOptions(): void {
    const p = this.isEdit ? this.product : null;
    this.subscriptions.add(
      this.masterList.getOptions('unit', { current: p?.unitOfMeasure }).subscribe((o) => (this.unitOptions = o))
    );
    this.subscriptions.add(
      this.masterList.getOptions('tax', { current: p?.defaultTaxRate, useValue: true }).subscribe((o) => {
        this.taxOptions = o.map((x) => (typeof x.value === 'number' && x.label !== String(x.value) ? { ...x, label: `${x.label} (${x.value}%)` } : x));
      })
    );
  }

  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;

    this.loadCategories();
    this.loadWarehouses();

    this.subscriptions.add(
      this.profileService.getDepartments().subscribe({
        next: (departments) => {
          this.segmentOptions = (departments ?? []).map((d) => ({ label: d.departmentName, value: d._id as string }));
        },
        error: () => this.toastr.error('Failed to load product segments'),
      })
    );

    this.subscriptions.add(
      this.productForm.controls.productSegment.valueChanges.subscribe((departmentId) => {
        if (!this.isEdit) this.generateItemCode(departmentId || undefined);
      })
    );
  }

  private loadCategories(selectedId?: string): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        this.categoryOptions = (categories ?? []).map((c: any) => ({ label: c.categoryName, value: c._id }));
        if (selectedId) this.productForm.patchValue({ productCategory: selectedId });
        else this.matchPrefillCategory();
      },
      error: () => this.toastr.error('Failed to load product categories'),
    });
  }

  private loadWarehouses(selectedId?: string): void {
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouseOptions = (warehouses ?? []).map((w: any) => ({ label: w.wareHouseName, value: w._id }));
        if (selectedId) this.productForm.patchValue({ warehouse: selectedId });
      },
      error: () => this.toastr.error('Failed to load warehouses'),
    });
  }

  private generateItemCode(departmentId?: string): void {
    this.productService.generateItemCode(departmentId).subscribe({
      next: (response) => this.productForm.controls.itemCode.setValue(response.itemCode),
      error: () => this.toastr.error('Failed to generate item code'),
    });
  }

  private seedFromProduct(product: any): void {
    const id = (v: any): string => v?._id ?? (typeof v === 'string' ? v : '');
    this.productForm.patchValue({
      partNo: product.partNo || '',
      itemCode: product.itemCode || '',
      productName: product.productName || '',
      productDescription: product.productDescription || '',
      type: product.type || '',
      productSegment: id(product.productSegment),
      productCategory: id(product.productCategory),
      warehouse: id(product.warehouse),
      brand: product.brand || '',
      unitOfMeasure: product.unitOfMeasure || '',
      defaultTaxRate: product.defaultTaxRate ?? null,
      defaultSellingPrice: product.defaultSellingPrice ?? null,
      estimatedCost: product.estimatedCost ?? null,
      isActive: product.isActive ?? true,
    });
    this.productForm.controls.itemCode.disable();
    this.productForm.markAsPristine();
  }

  private applyPrefill(): void {
    if (!this.prefill) return;
    this.productForm.patchValue({
      productSegment: this.prefill.productSegment || '',
      productDescription: this.prefill.productDescription || '',
    });
    this.matchPrefillCategory();
  }

  private matchPrefillCategory(): void {
    const name = this.prefill?.productCategoryName?.trim().toLowerCase();
    if (this.isEdit || !name || this.productForm.value.productCategory) return;
    const match = this.categoryOptions.find((c) => String(c.label).trim().toLowerCase() === name);
    if (match) this.productForm.patchValue({ productCategory: match.value as string });
  }

  private resetForm(): void {
    this.productForm.reset({
      partNo: '', itemCode: '', productName: '', productDescription: '', type: '',
      productSegment: '', productCategory: '', warehouse: '', brand: '', unitOfMeasure: '',
      defaultTaxRate: null, defaultSellingPrice: null, estimatedCost: null, isActive: true,
    });
  }

  createCategory(): void {
    this.dialog.open(AddCategoryComponent).afterClosed().subscribe((category) => {
      if (!category) return;
      this.categoryOptions = [...this.categoryOptions, { label: category.categoryName, value: category._id }];
      this.productForm.patchValue({ productCategory: category._id });
    });
  }

  createWarehouse(): void {
    this.dialog.open(AddWarehouseComponent).afterClosed().subscribe((warehouse) => {
      if (!warehouse) return;
      this.warehouseOptions = [...this.warehouseOptions, { label: warehouse.wareHouseName, value: warehouse._id }];
      this.productForm.patchValue({ warehouse: warehouse._id });
    });
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }

  cancel(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.saving = true;
    const raw = this.productForm.getRawValue();
    const payload: Partial<Product> = {
      partNo: raw.partNo ?? '',
      itemCode: raw.itemCode ?? '',
      productName: raw.productName ?? '',
      productDescription: raw.productDescription ?? '',
      type: raw.type ?? '',
      productSegment: raw.productSegment ?? '',
      productCategory: raw.productCategory ?? '',
      warehouse: raw.warehouse ?? '',
      brand: raw.brand ?? '',
      unitOfMeasure: raw.unitOfMeasure ?? '',
      defaultTaxRate: raw.defaultTaxRate,
      defaultSellingPrice: raw.defaultSellingPrice,
      estimatedCost: raw.estimatedCost,
      isActive: raw.isActive ?? true,
    };

    const request$ = this.isEdit && this.product?._id
      ? this.productService.updateProduct(this.product._id, payload)
      : this.productService.createProduct(payload);

    request$.subscribe({
      next: (product) => {
        this.saving = false;
        this.toastr.success(this.isEdit ? 'Product updated successfully' : 'Product created successfully');
        this.saved.emit(product);
        this.closed.emit();
      },
      error: (error) => {
        this.saving = false;
        this.toastr.error(error.error?.message || (this.isEdit ? 'Failed to update product' : 'Failed to create product'));
      },
    });
  }
}
