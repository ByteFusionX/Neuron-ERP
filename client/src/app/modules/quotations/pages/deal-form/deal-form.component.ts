import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { dealData, priceDetails, Quotatation, QuoteItem } from 'src/app/shared/interfaces/quotation.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { SfDrawerComponent, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { SupplierFormDrawerComponent } from 'src/app/modules/suppliers/pages/supplier-form-drawer/supplier-form-drawer.component';
import { DealCost } from 'src/app/shared/utils/deal-pricing.util';

export type CostType = 'Additional Cost' | 'Supplier Discount' | 'Customer Discount';

/** Seed for editing an existing deal sheet: the quotation plus the deal's own saved lines. */
export interface UpdateDealsheetData {
  approval: boolean;
  quoteData: Quotatation;
  quoteItems: (QuoteItem | undefined)[];
  priceDetails: priceDetails;
  quoteView?: boolean;
}

/**
 * Deal sheet form, hosted in a wide slide-over. Two steps: (1) tick and reprice the lines with
 * `app-item-entry` in deal mode, (2) payment terms, attachments and adjustments.
 * Convert: bind `quotation`; the form saves itself and emits the server response on `saved`.
 * Update: bind `update`; the form emits the multipart body on `updated` and the host saves it.
 */
@Component({
  selector: 'app-deal-form',
  templateUrl: './deal-form.component.html',
  imports: [NgIf, NgFor, NgClass, NgSwitch, NgSwitchCase, NgIcon, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ItemEntryComponent, SupplierFormDrawerComponent],
})
export class DealFormComponent implements OnInit, OnChanges {
  @Input() quotation: Quotatation | null = null;
  @Input() update: UpdateDealsheetData | null = null;
  @Output() saved = new EventEmitter<Quotatation>();
  @Output() updated = new EventEmitter<FormData>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  private fb = inject(FormBuilder);
  private quoteService = inject(QuotationService);
  private supplierService = inject(SupplierService);
  private toastr = inject(ToastrService);

  /** Last quotation shown. Kept after `quotation` is cleared so the panel content survives the slide-out. */
  q: Quotatation | null = null;
  private built: Quotatation | UpdateDealsheetData | null = null;
  mode: 'convert' | 'update' = 'convert';
  /** Update mode: files already on the deal, and the ones the user took off it. */
  existingFiles: any[] = [];
  removedFiles: any[] = [];
  // Empty until a quotation is passed in; the template renders (closed) before buildForm runs.
  form: FormGroup = this.fb.group({});
  /** One entry per build: swapping it re-creates item-entry, which seeds itself once on init. */
  forms: FormGroup[] = [];
  seed: ItemEntryOptionValue[] = [];
  selectedOption = 0;
  saving = false;
  bulkSupplier: string | null = null;
  step: 1 | 2 = 1;
  /** Stretches the drawer to the full viewport width. */
  fullView = false;
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
  lineTotal = 0;
  lineCount = 0;
  allSelected = false;
  /** Blocks "Next". */
  lineIssues: string[] = [];
  /** Blocks "Convert". */
  termIssues: string[] = [];
  private recomputeQueued = false;

  supplierFormOpen = false;

  ngOnInit(): void {
    this.loadSuppliers();
  }

  private loadSuppliers(): void {
    // Pending suppliers are included: an RFQ can award a line to one, and it must stay selectable here.
    this.supplierService.supplierList(true).subscribe({
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

  onSupplierCreated(supplier: any): void {
    this.loadSuppliers();
    if (supplier?._id) this.bulkSupplier = supplier._id;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['quotation'] && !changes['update']) return;
    const next = this.update ?? this.quotation;
    if (!next) {
      // Closed: forget what was built so reopening the same deal starts from a clean form.
      this.built = null;
      return;
    }
    if (next !== this.built) {
      this.built = next;
      this.mode = this.update ? 'update' : 'convert';
      this.q = this.update ? this.update.quoteData : this.quotation;
      this.selectedOption = 0;
      this.step = 1;
      this.fullView = false;
      this.bulkSupplier = null;
      this.removedFiles = [];
      this.existingFiles = this.update ? [...((this.update.quoteData.dealData?.attachments as any[]) ?? [])] : [];
      this.buildForm();
    }
  }

  get open(): boolean { return !!(this.quotation || this.update); }
  get isUpdate(): boolean { return this.mode === 'update'; }
  get isResubmit(): boolean { return !this.isUpdate && (this.q as any)?.dealData?.status === 'rejected'; }
  get title(): string {
    return this.isUpdate ? 'Update Deal Sheet ' + ((this.q as any)?.dealData?.dealId ?? '') : 'Convert to Deal Sheet';
  }
  get dirty(): boolean { return this.form.dirty || this.removedFiles.length > 0; }
  get optionalItems(): FormArray { return this.form.get('optionalItems') as FormArray; }
  get costs(): FormArray { return this.form.get('costs') as FormArray; }
  get issues(): string[] { return this.step === 1 ? this.lineIssues : this.termIssues; }

  private buildForm(): void {
    // The quoted numbers are the starting point. Suppliers awarded in an RFQ are carried over, others are chosen here;
    // optional items the customer did not include never reach the deal.
    // Lines of the previous deal submission (a resubmit after rejection), keyed by item name + detail, so the
    // supplier and tick chosen then are carried over.
    const previous = new Map<string, any>();
    ((this.q as any).dealData?.updatedItems ?? []).forEach((it: any) =>
      (it.itemDetails ?? []).forEach((d: any) => previous.set(`${it.itemName}|${d.detail}`, d)));

    this.seed = this.update ? this.updateSeed(this.update) : this.q!.optionalItems.map((option) => ({
      totalDiscount: option.totalDiscount,
      items: option.items
        .filter((item) => !item.isOptional || !!item.includeInTotal)
        .map((item) => ({
          itemName: item.itemName,
          itemDetails: item.itemDetails.map((d) => {
            const prev = previous.get(`${item.itemName}|${d.detail}`);
            const prevSupplier = prev ? (prev.supplierId?._id ?? prev.supplierId) : null;
            return {
            productId: d.productId,
            itemCode: d.itemCode,
            partNo: d.partNo,
            detail: d.detail,
            quantity: d.quantity,
            unitCost: d.unitCost,
            profit: d.profit,
            unitSellingPrice: d.unitSellingPrice,
            availability: d.availability,
            // The supplier awarded in the RFQ is kept as the starting point; it can still be changed here.
            supplierId: (prevSupplier || (d as any).supplierId?._id || (d as any).supplierId) || null,
            uom: d.uom,
            dealSelected: prev ? !!prev.dealSelected : true,
            };
          }),
        })),
    }));

    this.form = this.fb.group({
      // Starts from the terms of the previous deal submission (a resubmit after rejection), else from the terms
      // agreed on the quote; the approver sees exactly what is typed here.
      paymentTerms: [String((this.q as any).dealData?.paymentTerms || this.q!.paymentTerms || '').slice(0, 200), Validators.required],
      optionalItems: this.fb.array([]),
      costs: this.fb.array([]),
      attachments: [[] as File[]],
    });
    // A resubmit after rejection starts from the adjustments entered on the previous submission.
    ((this.q as any).dealData?.additionalCosts ?? []).forEach((cost: any) => {
      const type = (cost.type || 'Additional Cost') as CostType;
      this.costs.push(this.fb.group({
        type: [type],
        ...(type === 'Additional Cost' ? { name: [cost.name ?? '', Validators.required] } : {}),
        ...(type === 'Supplier Discount' ? { supplierId: [cost.supplierId?._id ?? cost.supplierId ?? null, Validators.required] } : {}),
        value: [cost.value ?? null, Validators.required],
      }));
    });
    this.forms = [this.form];
    this.recompute();
    // item-entry fills `optionalItems` while the view updates, so state derived from it is refreshed
    // right after rather than mid-check.
    this.form.valueChanges.subscribe(() => this.queueRecompute());
  }

  /** Update mode: the deal's own saved lines are the starting point, ticks and suppliers included. */
  private updateSeed(data: UpdateDealsheetData): ItemEntryOptionValue[] {
    const saved = (data.quoteItems ?? []).filter((i): i is QuoteItem => !!i);
    const quoted = data.quoteData.optionalItems?.[0];
    return [{
      totalDiscount: quoted?.totalDiscount,
      items: (saved.length ? saved : (quoted?.items ?? [])).map((item) => ({
        itemName: item.itemName,
        itemDetails: (item.itemDetails ?? []).map((d: any) => ({
          productId: d.productId,
          itemCode: d.itemCode,
          partNo: d.partNo,
          detail: d.detail,
          quantity: d.quantity,
          unitCost: d.unitCost,
          profit: d.profit,
          unitSellingPrice: d.unitSellingPrice,
          availability: d.availability,
          supplierId: d.supplierId?._id ?? d.supplierId ?? null,
          uom: d.uom,
          dealSelected: !!d.dealSelected,
        })),
      })),
    }];
  }

  onExistingFileRemoved(index: number): void {
    this.removedFiles.push(...this.existingFiles.splice(index, 1));
  }

  fileLabel(file: any): string {
    return file?.name || file?.originalname || file?.fileName || 'Attachment';
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
    if (!this.form.get('optionalItems')) return;
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
    // The discount quoted to the customer is part of the deal value too, so the summary matches what is saved.
    this.discountAdjustment = sum('Customer Discount') + (Number(option?.totalDiscount) || 0);
    this.lineTotal = lines.filter((l) => l.selected).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitSellingPrice) || 0), 0);
    this.lineCount = lines.length;
    this.selectedCount = lines.filter((l) => l.selected).length;
    this.allSelected = this.lineCount > 0 && this.selectedCount === this.lineCount;

    const used = new Set(lines.filter((l) => l.selected && l.supplierId).map((l) => l.supplierId));
    this.discountSupplierOptions = this.usedSupplierOptions(used as Set<string>);

    const lineIssues: string[] = [];
    if (!this.selectedCount) lineIssues.push('Select at least one line');
    const missing = lines.filter((l) => l.selected && !l.supplierId).length;
    if (missing) lineIssues.push(`${missing} selected line${missing === 1 ? ' needs' : 's need'} a supplier`);
    if (!missing && this.optionalItems.at(this.selectedOption)?.invalid) lineIssues.push('Fix the highlighted fields');
    this.lineIssues = lineIssues;

    const termIssues: string[] = [];
    if (!String(v.paymentTerms ?? '').trim()) termIssues.push('Enter the payment terms');
    if (this.costs.invalid) termIssues.push('Complete the adjustment rows');
    if (this.discountAdjustment > this.lineTotal + Math.max(this.costAdjustment, 0)) termIssues.push('Discounts cannot be more than the deal total');
    this.termIssues = termIssues;
  }

  /** Every supplier picked on a ticked line, even one the supplier list did not return. */
  private usedSupplierOptions(used: Set<string>): SfOption<string>[] {
    const known = new Set(this.supplierOptions.map((o) => o.value));
    return [
      ...this.supplierOptions.filter((o) => used.has(o.value)),
      ...[...used].filter((id) => !known.has(id)).map((id) => ({ label: 'Selected supplier', value: id })),
    ];
  }

  next(): void {
    // Only the lines are being checked here; the terms on step 2 should not show "required" before anyone has seen them.
    this.optionalItems.markAllAsTouched();
    this.recompute();
    if (!this.lineIssues.length) this.step = 2;
    else this.toastr.warning(this.lineIssues[0]);
  }

  back(): void { this.step = 1; }

  // Stepper header clicks: going forward runs the same line checks as Next.
  goTo(n: number): void {
    if (n === this.step) return;
    if (n === 2) this.next();
    else this.back();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.recompute();
    const blocking = [...this.lineIssues, ...this.termIssues];
    if (blocking.length && !this.saving) this.toastr.warning(blocking[0]);
    if (blocking.length || this.saving || !this.q?._id) return;
    if (this.isUpdate) {
      this.updated.emit(this.buildFormData());
      return;
    }
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
          uom: d.uom,
          supplierId: d.supplierId ?? '',
        })),
      })),
      costs: (value.costs as any[]).map((c) => {
        if (c.type === 'Supplier Discount') return { type: c.type, supplierId: c.supplierId, value: c.value };
        if (c.type === 'Additional Cost') return { type: c.type, name: c.name, value: c.value };
        return { type: c.type, value: c.value };
      }),
      ...(this.isUpdate ? { removedFiles: this.removedFiles, existingFiles: this.existingFiles } : {}),
      totalDiscount: option.totalDiscount ?? 0,
    }));
    (value.attachments as File[]).forEach((f) => formData.append('attachments', f as Blob));
    return formData;
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }
}
