import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';
import { ProductService, Product, DuplicateMatch, PRODUCT_ALIAS_TYPES, ProductAliasType } from 'src/app/core/services/product/product.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { MasterListService } from 'src/app/core/services/master-list.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { PRODUCT_TYPES } from 'src/app/shared/interfaces/product.interface';
import { ModalService } from 'src/app/shared/components/modal';
import { QuickAddDialogComponent, QuickAddDialogData } from '../../modals/quick-add-dialog/quick-add-dialog.component';

/** Rejects whitespace-only text, which `Validators.required` lets through. */
const notBlank = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.length > 0 && !c.value.trim() ? { required: true } : null;

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
  private modal = inject(ModalService);
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
  brandOptions: SfOption[] = [];
  private optionsLoaded = false;

  aliasTypeOptions: SfOption[] = PRODUCT_ALIAS_TYPES.map((t) => ({ label: t, value: t }));
  /** Products that already use this part number or one of the aliases; refreshed as the user types. */
  duplicateMatches: DuplicateMatch[] = [];
  get blockingMatch(): DuplicateMatch | undefined { return this.duplicateMatches.find((m) => m.level === 'block'); }

  productForm = this.fb.group({
    isGeneric: [false],
    parentModel: [''],
    nickName: ['', [Validators.maxLength(100)]],
    aliases: this.fb.array<FormGroup<{ value: FormControl<string | null>; type: FormControl<string | null> }>>([]),
    partNo: ['', [Validators.required, notBlank, Validators.maxLength(100)]],
    itemCode: [{ value: '', disabled: true }],
    productName: ['', [Validators.required, notBlank, Validators.maxLength(200)]],
    productDescription: ['', [Validators.required, notBlank, Validators.maxLength(2000)]],
    type: ['' as string, Validators.required],
    productSegment: ['', Validators.required],
    productCategory: ['', Validators.required],
    warehouse: [''],
    brand: ['', [Validators.required, notBlank]],
    unitOfMeasure: [''],
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
      if (this.prefill?.productSegment) this.generateItemCode(this.prefill.productSegment);
    }
  }

  ngOnDestroy(): void {
    this.itemCodeRequest?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  /** Unit and brand come from Settings → Master Data → Product Data. */
  private loadMasterOptions(): void {
    const p = this.isEdit ? this.product : null;
    this.subscriptions.add(
      this.masterList.getOptions('unit', { current: p?.unitOfMeasure }).subscribe((o) => (this.unitOptions = o))
    );
    this.subscriptions.add(
      this.masterList.getOptions('brand', { current: p?.brand }).subscribe((o) => (this.brandOptions = o))
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

    // Services and generic items need neither a brand nor a part number.
    this.subscriptions.add(
      this.productForm.controls.isGeneric.valueChanges.subscribe((generic) => {
        const { partNo, brand } = this.productForm.controls;
        [partNo, brand].forEach((c) => {
          c.setValidators(generic ? [] : [Validators.required, notBlank]);
          c.updateValueAndValidity({ emitEvent: false });
        });
      })
    );

    this.subscriptions.add(
      this.productForm.valueChanges.pipe(
        debounceTime(400),
        switchMap(() => {
          const v = this.productForm.getRawValue();
          const part = (v.partNo ?? '').trim();
          const name = (v.productName ?? '').trim();
          if (!part && !name) return of({ matches: [] as DuplicateMatch[] });
          return this.productService.checkDuplicate(part, (v.brand ?? '').trim(), this.product?._id, name).pipe(catchError(() => of({ matches: [] as DuplicateMatch[] })));
        }),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      ).subscribe((r) => (this.duplicateMatches = r.matches))
    );

    this.subscriptions.add(
      this.productForm.controls.productSegment.valueChanges.subscribe((departmentId) => {
        if (!this.isEdit) departmentId ? this.generateItemCode(departmentId) : this.productForm.controls.itemCode.setValue('');
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

  private itemCodeRequest?: Subscription;

  /** Only the latest request may write the code, otherwise a slow earlier response overwrites the chosen segment's prefix. */
  private generateItemCode(departmentId?: string): void {
    this.itemCodeRequest?.unsubscribe();
    this.itemCodeRequest = this.productService.generateItemCode(departmentId).subscribe({
      next: (response) => this.productForm.controls.itemCode.setValue(response.itemCode),
      error: () => this.toastr.error('Failed to generate item code'),
    });
  }

  get aliasRows(): FormArray { return this.productForm.controls.aliases as unknown as FormArray; }

  addAlias(value = '', type: ProductAliasType = 'Supplier SKU'): void {
    this.aliasRows.push(this.fb.group({ value: [value], type: [type] }));
    this.productForm.markAsDirty();
  }

  removeAlias(index: number): void {
    this.aliasRows.removeAt(index);
    this.productForm.markAsDirty();
  }

  private seedAliases(aliases: any[] | undefined): void {
    this.aliasRows.clear();
    (aliases ?? []).forEach((a) => this.addAlias(a.value, a.type));
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
      isActive: product.isActive ?? true,
      isGeneric: product.isGeneric ?? false,
      parentModel: product.parentModel || '',
      nickName: product.nickName || '',
    });
    this.seedAliases(product.aliases);
    this.duplicateMatches = [];
    this.productForm.controls.itemCode.disable();
    // Identity fields are locked once the product exists.
    this.productForm.controls.partNo.disable();
    this.productForm.controls.isGeneric.disable();
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
      isActive: true, isGeneric: false, parentModel: '', nickName: '',
    });
    this.productForm.controls.partNo.enable({ emitEvent: false });
    this.productForm.controls.isGeneric.enable({ emitEvent: false });
    this.aliasRows.clear();
    this.duplicateMatches = [];
  }

  createCategory(): void {
    this.openQuickAdd('Category', (name) => this.productCategoryService.createProductCategory({ categoryName: name, createdDate: new Date() } as any))
      .subscribe((category) => {
        if (!category) return;
        this.toastr.success('Category created successfully');
        this.categoryOptions = [...this.categoryOptions, { label: category.categoryName, value: category._id }];
        this.productForm.patchValue({ productCategory: category._id });
      });
  }

  createBrand(): void {
    this.openQuickAdd('Brand', (name) => this.masterList.createItem('brand', { label: name, value: null }))
      .subscribe((res) => {
        const brand = res?.data;
        if (!brand) return;
        this.toastr.success('Brand created successfully');
        this.brandOptions = [...this.brandOptions, { label: brand.label, value: brand.label }];
        this.productForm.patchValue({ brand: brand.label });
      });
  }

  createUnit(): void {
    this.openQuickAdd('Unit of Measure', (name) => this.masterList.createItem('unit', { label: name, value: null }))
      .subscribe((res) => {
        const unit = res?.data;
        if (!unit) return;
        this.toastr.success('Unit created successfully');
        this.unitOptions = [...this.unitOptions, { label: unit.label, value: unit.label }];
        this.productForm.patchValue({ unitOfMeasure: unit.label });
      });
  }

  createWarehouse(): void {
    this.openQuickAdd('Warehouse', (name) => this.warehouseService.createWarehouse({ wareHouseName: name, createdDate: new Date() } as any))
      .subscribe((warehouse) => {
        if (!warehouse) return;
        this.toastr.success('Warehouse created successfully');
        this.warehouseOptions = [...this.warehouseOptions, { label: warehouse.wareHouseName, value: warehouse._id }];
        this.productForm.patchValue({ warehouse: warehouse._id });
      });
  }

  private openQuickAdd(title: string, create: QuickAddDialogData['create']) {
    return this.modal.open<any, QuickAddDialogData>(QuickAddDialogComponent, { width: '480px', data: { title, create } }).afterClosed();
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

    if (this.blockingMatch) {
      this.toastr.error(`${this.blockingMatch.reason}. Use the existing product instead.`);
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
      isActive: raw.isActive ?? true,
      isGeneric: raw.isGeneric ?? false,
      parentModel: raw.parentModel ?? '',
      nickName: (raw.nickName ?? '').trim(),
      aliases: (raw.aliases ?? []).filter((a) => (a.value ?? '').trim()).map((a) => ({ value: (a.value ?? '').trim(), type: (a.type ?? 'Superseded') as ProductAliasType })),
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
