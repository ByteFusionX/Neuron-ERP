import { ALLOWED_UPLOAD_TYPES } from 'src/app/shared/constants/upload-types';
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import {
  priceDetails,
  Quotatation,
  QuoteItem,
} from 'src/app/shared/interfaces/quotation.interface';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ItemEntryComponent, ItemEntryItemValue, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { DealCost } from 'src/app/shared/utils/deal-pricing.util';
import { SupplierService } from '../../../../core/services/supplier.service';

export interface UpdateDealsheetData {
  approval: boolean;
  quoteData: Quotatation;
  quoteItems: (QuoteItem | undefined)[];
  priceDetails: priceDetails;
  quoteView?: boolean;
}

type CostType = 'Additional Cost' | 'Supplier Discount' | 'Customer Discount';

/**
 * Two-step drawer for editing a deal sheet, the same pattern as the convert-to-deal drawer: lines
 * (the shared `app-item-entry` in deal mode) first, then payment terms, adjustments and attachments.
 * Emits the multipart body on `saved`; the host performs the save.
 */
@Component({
  selector: 'app-update-dealsheet',
  standalone: true,
  templateUrl: './update-dealsheet.component.html',
  imports: [
    NgIcon,
    FormsModule,
    ReactiveFormsModule,
    NgIf,
    NgFor,
    NgClass,
    NgSwitch,
    NgSwitchCase,
    SmartFormModule,
    ActionButtonComponent,
    ItemEntryComponent,
  ],
})
export class UpdateDealsheetComponent implements OnInit, OnChanges {
  @Input() open = false;
  @Input() data: UpdateDealsheetData | null = null;
  @Output() saved = new EventEmitter<FormData>();
  @Output() closed = new EventEmitter<void>();

  /** One entry per build: swapping it re-creates item-entry, which seeds itself once on init. */
  forms: FormGroup[] = [];
  form!: FormGroup;
  seed: ItemEntryOptionValue[] = [];
  step: 1 | 2 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Items', hint: 'Pick the lines in the deal and set their pricing' },
    { n: 2 as const, label: 'Terms & Attachments', hint: 'Payment terms, adjustments and supporting files' },
  ];
  selectedOption = 0;
  bulkSupplier: string | null = null;
  supplierOptions: SfOption<string>[] = [];
  discountSupplierOptions: SfOption<string>[] = [];
  readonly costTypes: CostType[] = ['Additional Cost', 'Supplier Discount', 'Customer Discount'];
  readonly fileAccept = ALLOWED_UPLOAD_TYPES;

  /** Adjustments folded into the item-entry summary: net extra cost, and customer discount. */
  costAdjustment = 0;
  discountAdjustment = 0;
  selectedCount = 0;
  lineCount = 0;
  allSelected = false;
  lineIssues: string[] = [];
  termIssues: string[] = [];
  submitted = false;
  private recomputeQueued = false;

  /** Files already on the deal, and the ones the user took off it. */
  existingFiles: any[] = [];
  removedFiles: any[] = [];
  /** Newly picked files, uploaded on save. */
  newFiles = new FormControl<File[]>([], { nonNullable: true });

  constructor(
    private fb: FormBuilder,
    private supplierService: SupplierService,
  ) {}

  get title(): string {
    return 'Update deal sheet ' + (this.data?.quoteData?.dealData?.dealId ?? '');
  }

  get subtitle(): string {
    return this.steps[this.step - 1].hint;
  }

  get dirty(): boolean {
    return !!this.form?.dirty || this.newFiles.dirty || this.removedFiles.length > 0;
  }

  get currency(): string {
    return this.data?.quoteData?.currency ?? '';
  }

  get optionalItems(): FormArray {
    return this.form.get('optionalItems') as FormArray;
  }

  get costs(): FormArray {
    return this.form.get('costs') as FormArray;
  }

  get issues(): string[] {
    return this.step === 1 ? this.lineIssues : this.termIssues;
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.dirty) event.preventDefault();
  }

  ngOnInit(): void {
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open && this.data) this.build(this.data);
  }

  /** The deal's own saved lines are the starting point, ticks and suppliers included. */
  private build(data: UpdateDealsheetData): void {
    this.step = 1;
    this.submitted = false;
    this.selectedOption = 0;
    this.bulkSupplier = null;
    this.removedFiles = [];
    this.newFiles.reset([]);
    this.existingFiles = [...((data.quoteData.dealData.attachments as any[]) ?? [])];

    const saved = (data.quoteItems ?? []).filter((i): i is QuoteItem => !!i);
    const quoted = data.quoteData.optionalItems?.[0];
    this.seed = [{
      totalDiscount: quoted?.totalDiscount,
      items: (saved.length ? saved : (quoted?.items ?? [])).map((item) => this.toSeedItem(item)),
    }];

    this.form = this.fb.group({
      paymentTerms: [data.quoteData.dealData.paymentTerms || '', Validators.required],
      optionalItems: this.fb.array([]),
      costs: this.fb.array([]),
    });
    (data.quoteData.dealData.additionalCosts ?? []).forEach((cost: any) => this.patchCost(cost));
    this.forms = [this.form];
    this.attach();
  }

  private attach(): void {
    this.recompute();
    // item-entry fills `optionalItems` while the view updates, so derived state is refreshed right after.
    this.form.valueChanges.subscribe(() => this.queueRecompute());
  }

  private toSeedItem(item: QuoteItem): ItemEntryItemValue {
    return {
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
        supplierId: d.supplierId ?? null,
        uom: d.uom,
        dealSelected: !!d.dealSelected,
      })),
    };
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }

  // --- step 1 helpers --------------------------------------------------------

  private activeLines(): AbstractControl[] {
    const option = this.optionalItems.at(this.selectedOption);
    return ((option?.get('items') as FormArray)?.controls || []).flatMap(
      (item) => (item.get('itemDetails') as FormArray).controls,
    );
  }

  onOptionChanged(index: number): void {
    this.selectedOption = index;
    this.bulkSupplier = null;
    // A deal is built from one option, so ticks made in another are dropped (which restores the quote).
    this.optionalItems.controls.forEach((option, i) => {
      if (i === index) return;
      (option.get('items') as FormArray).controls.forEach((item) =>
        (item.get('itemDetails') as FormArray).controls.forEach((d) => d.get('dealSelected')?.setValue(false)),
      );
    });
    this.form.markAsDirty();
    this.queueRecompute();
  }

  toggleAll(checked: boolean): void {
    this.activeLines().forEach((d) => d.get('dealSelected')?.setValue(checked));
    this.form.markAsDirty();
  }

  // --- step 2 helpers --------------------------------------------------------

  get paymentTermsControl(): AbstractControl {
    return this.form.get('paymentTerms')!;
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

  private patchCost(cost: { type?: string; value?: number | null; name?: string; supplierId?: string }): void {
    const type = (cost.type || 'Additional Cost') as CostType;
    this.costs.push(this.fb.group({
      type: [type],
      ...(type === 'Additional Cost' ? { name: [cost.name ?? '', Validators.required] } : {}),
      ...(type === 'Supplier Discount' ? { supplierId: [cost.supplierId || null, Validators.required] } : {}),
      value: [cost.value ?? null, Validators.required],
    }));
  }

  removeCost(i: number): void {
    this.costs.removeAt(i);
    this.form.markAsDirty();
  }

  onExistingFileRemoved(index: number): void {
    this.removedFiles.push(...this.existingFiles.splice(index, 1));
  }

  fileLabel(file: any): string {
    return file?.name || file?.originalname || file?.fileName || 'Attachment';
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
      (it.itemDetails as any[]).map((d) => ({ selected: !!d.dealSelected, supplierId: d.supplierId })),
    );
    const costs = v.costs as DealCost[];
    const sum = (type: string) => costs.filter((c) => c.type === type).reduce((s, c) => s + (Number(c.value) || 0), 0);
    this.costAdjustment = sum('Additional Cost') - sum('Supplier Discount');
    // The discount quoted to the customer is part of the deal value too, so the summary matches what is saved.
    this.discountAdjustment = sum('Customer Discount') + (Number(option?.totalDiscount) || 0);
    this.lineCount = lines.length;
    this.selectedCount = lines.filter((l) => l.selected).length;
    this.allSelected = this.lineCount > 0 && this.selectedCount === this.lineCount;

    const used = new Set(lines.filter((l) => l.selected && l.supplierId).map((l) => l.supplierId));
    // Every supplier picked on a ticked line, even one the supplier list did not return.
    const known = new Set(this.supplierOptions.map((o) => o.value));
    this.discountSupplierOptions = [
      ...this.supplierOptions.filter((o) => used.has(o.value)),
      ...([...used] as string[]).filter((id) => !known.has(id)).map((id) => ({ label: 'Selected supplier', value: id })),
    ];

    const lineIssues: string[] = [];
    if (!this.lineCount) lineIssues.push('This deal has no items to select');
    else if (!this.selectedCount) lineIssues.push('Select at least one line');
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
    this.submitted = true;
    if (!this.lineIssues.length) {
      this.submitted = false;
      this.step = 2;
    }
  }

  back(): void {
    this.step = 1;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.recompute();
    this.submitted = true;
    if (this.lineIssues.length || this.termIssues.length) {
      if (this.lineIssues.length) this.step = 1;
      return;
    }
    this.saved.emit(this.buildFormData());
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
      removedFiles: this.removedFiles,
      existingFiles: this.existingFiles,
      totalDiscount: option.totalDiscount ?? 0,
    }));
    for (const file of this.newFiles.value) formData.append('attachments', file as Blob);
    return formData;
  }
}
