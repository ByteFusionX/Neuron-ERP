import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { dealData, Quotatation } from 'src/app/shared/interfaces/quotation.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { SfDrawerComponent, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { DealCost } from 'src/app/shared/utils/deal-pricing.util';

export type CostType = 'Additional Cost' | 'Supplier Discount' | 'Customer Discount';

/**
 * Convert-to-deal-sheet form, hosted in a wide slide-over. Two steps: (1) tick and reprice the quoted
 * lines with `app-item-entry` in deal mode, (2) payment terms, attachments and adjustments.
 * The host binds `quotation` to open it and reacts to `saved` (server response) / `closed`.
 */
@Component({
  selector: 'app-deal-form',
  templateUrl: './deal-form.component.html',
  imports: [NgIf, NgFor, NgClass, NgSwitch, NgSwitchCase, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ItemEntryComponent],
})
export class DealFormComponent implements OnInit, OnChanges {
  @Input() quotation: Quotatation | null = null;
  @Output() saved = new EventEmitter<Quotatation>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  private fb = inject(FormBuilder);
  private quoteService = inject(QuotationService);
  private supplierService = inject(SupplierService);

  /** Last quotation shown. Kept after `quotation` is cleared so the panel content survives the slide-out. */
  q: Quotatation | null = null;
  private built: Quotatation | null = null;
  form!: FormGroup;
  /** One entry per build: swapping it re-creates item-entry, which seeds itself once on init. */
  forms: FormGroup[] = [];
  seed: ItemEntryOptionValue[] = [];
  selectedOption = 0;
  saving = false;
  bulkSupplier: string | null = null;
  step: 1 | 2 = 1;
  readonly steps = [{ n: 1, label: 'Line items' }, { n: 2, label: 'Terms & adjustments' }];

  supplierOptions: SfOption<string>[] = [];
  discountSupplierOptions: SfOption<string>[] = [];
  readonly costTypes: CostType[] = ['Additional Cost', 'Supplier Discount', 'Customer Discount'];
  /** One-tap starting points for the terms wording; the text stays editable afterwards. */
  readonly termPresets = [
    '100% advance with the purchase order',
    '50% advance, 50% on delivery',
    '30 days from invoice date',
    '60 days from invoice date',
    'Against delivery',
  ];

  /** Adjustments folded into the item-entry summary: net extra cost, and customer discount. */
  costAdjustment = 0;
  discountAdjustment = 0;
  selectedCount = 0;
  lineCount = 0;
  allSelected = false;
  /** Blocks "Next". */
  lineIssues: string[] = [];
  /** Blocks "Convert". */
  termIssues: string[] = [];
  private recomputeQueued = false;

  ngOnInit(): void {
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        const list: any[] = res.data || res;
        this.supplierOptions = list
          .filter((s) => !!s._id)
          .map((s) => ({ label: s.supplierName, value: s._id as string }));
        this.recompute();
      },
      error: (err) => console.error('Error loading suppliers:', err),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const next = changes['quotation']?.currentValue as Quotatation | null;
    if (!next) {
      // Closed: forget what was built so reopening the same quotation starts from a clean form.
      this.built = null;
      return;
    }
    if (next !== this.built) {
      this.built = this.q = next;
      this.selectedOption = 0;
      this.step = 1;
      this.bulkSupplier = null;
      this.buildForm();
    }
  }

  get open(): boolean { return !!this.quotation; }
  get optionalItems(): FormArray { return this.form.get('optionalItems') as FormArray; }
  get costs(): FormArray { return this.form.get('costs') as FormArray; }
  get issues(): string[] { return this.step === 1 ? this.lineIssues : this.termIssues; }

  private buildForm(): void {
    // The quoted numbers are the starting point. Suppliers are chosen here, so none are carried over;
    // optional items the customer did not include never reach the deal.
    this.seed = this.q!.optionalItems.map((option) => ({
      totalDiscount: option.totalDiscount,
      items: option.items
        .filter((item) => !item.isOptional || !!item.includeInTotal)
        .map((item) => ({
          itemName: item.itemName,
          itemDetails: item.itemDetails.map((d) => ({
            itemCode: d.itemCode,
            partNo: (d as any).partNo,
            detail: d.detail,
            quantity: d.quantity,
            unitCost: d.unitCost,
            profit: d.profit,
            unitSellingPrice: d.unitSellingPrice,
            availability: d.availability,
            supplierId: null,
            uom: d.uom,
          })),
        })),
    }));

    this.form = this.fb.group({
      paymentTerms: ['', Validators.required],
      optionalItems: this.fb.array([]),
      costs: this.fb.array([]),
      attachments: [[] as File[]],
    });
    this.forms = [this.form];
    this.recompute();
    // item-entry fills `optionalItems` while the view updates, so state derived from it is refreshed
    // right after rather than mid-check.
    this.form.valueChanges.subscribe(() => this.queueRecompute());
  }

  // --- step 1 helpers --------------------------------------------------------

  /** Every line of the option being dealt. */
  private activeLines(): AbstractControl[] {
    const option = this.optionalItems.at(this.selectedOption);
    return ((option?.get('items') as FormArray)?.controls || []).flatMap((item) =>
      ((item.get('itemDetails') as FormArray).controls));
  }

  onOptionChanged(index: number): void {
    this.selectedOption = index;
    this.bulkSupplier = null;
    // A deal is built from one option, so ticks made in another are dropped (which restores the quote).
    this.optionalItems.controls.forEach((option, i) => {
      if (i === index) return;
      ((option.get('items') as FormArray).controls).forEach((item) =>
        (item.get('itemDetails') as FormArray).controls.forEach((d) => d.get('dealSelected')?.setValue(false)));
    });
    this.form.markAsDirty();
    this.queueRecompute();
  }

  toggleAll(checked: boolean): void {
    this.activeLines().forEach((d) => d.get('dealSelected')?.setValue(checked));
    this.form.markAsDirty();
  }

  applyBulkSupplier(): void {
    if (!this.bulkSupplier) return;
    this.activeLines().forEach((d) => {
      if (d.get('dealSelected')?.value) d.get('supplierId')?.setValue(this.bulkSupplier);
    });
    this.bulkSupplier = null;
    this.form.markAsDirty();
  }

  // --- step 2 helpers --------------------------------------------------------

  /** Replaces the terms when they are still untouched, otherwise appends on a new line. */
  useTermPreset(preset: string): void {
    const control = this.form.get('paymentTerms')!;
    const current = String(control.value ?? '').trim();
    control.setValue(current ? `${current}\n${preset}` : preset);
    control.markAsTouched();
    this.form.markAsDirty();
  }

  addCost(type: CostType): void {
    const group = this.fb.group({
      type: [type],
      ...(type === 'Additional Cost' ? { name: ['', Validators.required] } : {}),
      ...(type === 'Supplier Discount' ? { supplierId: [null as string | null, Validators.required] } : {}),
      value: [null as number | null, Validators.required],
    });
    this.costs.push(group);
    this.form.markAsDirty();
  }

  removeCost(i: number): void {
    this.costs.removeAt(i);
    this.form.markAsDirty();
  }

  // --- state -----------------------------------------------------------------

  private queueRecompute(): void {
    if (this.recomputeQueued) return;
    this.recomputeQueued = true;
    queueMicrotask(() => {
      this.recomputeQueued = false;
      this.recompute();
    });
  }

  private recompute(): void {
    if (!this.form) return;
    const v = this.form.getRawValue();
    const option = (v.optionalItems as any[])[this.selectedOption];
    const lines = ((option?.items as any[]) || []).flatMap((it) =>
      (it.itemDetails as any[]).map((d) => ({
        selected: !!d.dealSelected,
        quantity: d.quantity,
        unitCost: d.unitCost,
        unitSellingPrice: d.unitSellingPrice,
        supplierId: d.supplierId,
      })));
    const costs = v.costs as DealCost[];
    const sum = (type: string) => costs.filter((c) => c.type === type).reduce((s, c) => s + (Number(c.value) || 0), 0);
    this.costAdjustment = sum('Additional Cost') - sum('Supplier Discount');
    this.discountAdjustment = sum('Customer Discount');
    this.lineCount = lines.length;
    this.selectedCount = lines.filter((l) => l.selected).length;
    this.allSelected = this.lineCount > 0 && this.selectedCount === this.lineCount;

    const used = new Set(lines.filter((l) => l.selected && l.supplierId).map((l) => l.supplierId));
    this.discountSupplierOptions = this.supplierOptions.filter((o) => used.has(o.value));

    const lineIssues: string[] = [];
    if (!this.selectedCount) lineIssues.push('Select at least one line');
    const missing = lines.filter((l) => l.selected && !l.supplierId).length;
    if (missing) lineIssues.push(`${missing} selected line${missing === 1 ? ' needs' : 's need'} a supplier`);
    if (!missing && this.optionalItems.at(this.selectedOption)?.invalid) lineIssues.push('Fix the highlighted fields');
    this.lineIssues = lineIssues;

    const termIssues: string[] = [];
    if (!String(v.paymentTerms ?? '').trim()) termIssues.push('Enter the payment terms');
    if (this.costs.invalid) termIssues.push('Complete the adjustment rows');
    this.termIssues = termIssues;
  }

  next(): void {
    this.form.markAllAsTouched();
    this.recompute();
    if (!this.lineIssues.length) this.step = 2;
  }

  back(): void { this.step = 1; }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.recompute();
    if (this.lineIssues.length || this.termIssues.length || this.saving || !this.q?._id) return;
    this.saving = true;
    this.quoteService.saveDealSheet(this.buildFormData() as unknown as dealData, this.q._id).subscribe({
      next: (res) => {
        this.saving = false;
        this.form.markAsPristine();
        this.saved.emit(res);
      },
      error: () => { this.saving = false; },
    });
  }

  /** Same contract the backend has always received: `dealData` JSON plus `attachments` files. */
  private buildFormData(): FormData {
    const value = this.form.getRawValue();
    const option = (value.optionalItems as any[])[this.selectedOption];
    const formData = new FormData();
    formData.append('dealData', JSON.stringify({
      paymentTerms: value.paymentTerms,
      items: (option.items as any[]).map((item) => ({
        itemName: item.itemName,
        itemDetails: (item.itemDetails as any[]).map((d) => ({
          dealSelected: !!d.dealSelected,
          detail: d.detail,
          quantity: d.quantity,
          unitCost: d.unitCost,
          profit: d.profit,
          unitSellingPrice: d.unitSellingPrice,
          availability: d.availability,
          supplierId: d.supplierId ?? '',
        })),
      })),
      costs: (value.costs as any[]).map((c) => {
        if (c.type === 'Supplier Discount') return { type: c.type, supplierId: c.supplierId, value: c.value };
        if (c.type === 'Additional Cost') return { type: c.type, name: c.name, value: c.value };
        return { type: c.type, value: c.value };
      }),
      totalDiscount: option.totalDiscount,
    }));
    (value.attachments as File[]).forEach((f) => formData.append('attachments', f as Blob));
    return formData;
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }
}
