import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { StockReturnKind, StockReturnLine, StockService } from 'src/app/core/services/stock/stock.service';

const CUSTOMER_REASONS = ['Wrong item', 'Damaged in transit', 'Not needed', 'Other'];
const SUPPLIER_REASONS = ['Wrong item', 'Quality issue', 'Excess delivered', 'Other'];

/**
 * Returns against a delivery note (customer return, stock comes back) or a GRN (supplier return, stock goes
 * back). Opened from the DN register or the GRN list; quantities are capped at what the document still has out.
 */
@Component({
  selector: 'app-stock-return-drawer',
  standalone: true,
  templateUrl: './stock-return-drawer.component.html',
  imports: [NgIf, NgFor, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class StockReturnDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() kind: StockReturnKind = 'customer';
  /** Id of the delivery note (customer return) or GRN (supplier return). */
  @Input() sourceId = '';
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  loading = false;
  saving = false;
  number = '';
  lines: StockReturnLine[] = [];
  readonly conditionOptions: SfOption[] = [
    { label: 'Good - back into stock', value: 'good' },
    { label: 'Needs inspection - quarantine', value: 'quarantine' },
  ];
  readonly resolutionOptions: SfOption[] = [
    { label: 'Replacement', value: 'Replacement' },
    { label: 'Credit Note', value: 'Credit Note' },
  ];

  private fb = inject(FormBuilder);
  private toast = inject(ToastrService);
  private stockService = inject(StockService);

  form = this.fb.group({
    quantities: this.fb.array([] as FormControl<number | null>[]),
    reason: ['', Validators.required],
    condition: ['good'],
    resolution: [''],
    remarks: [''],
  });

  get quantities(): FormArray<FormControl<number | null>> {
    return this.form.controls.quantities;
  }

  get isCustomer(): boolean { return this.kind === 'customer'; }

  get title(): string { return this.isCustomer ? 'Customer Return' : 'Return to Supplier'; }

  get subtitle(): string {
    return this.isCustomer
      ? `Goods coming back against delivery note ${this.number}`
      : `Rejected goods leaving quarantine against GRN ${this.number}`;
  }

  get reasonOptions(): SfOption[] {
    return (this.isCustomer ? CUSTOMER_REASONS : SUPPLIER_REASONS).map((reason) => ({ label: reason, value: reason }));
  }

  get hasQuantity(): boolean {
    return this.quantities.controls.some((control) => Number(control.value) > 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['sourceId'])) return;
    this.reset();
    if (!this.sourceId) return;
    this.loading = true;
    this.stockService.getReturnSource(this.kind, this.sourceId).subscribe({
      next: (res) => {
        this.loading = false;
        this.number = res.data.number;
        this.lines = res.data.lines;
        this.lines.forEach((line) => this.quantities.push(new FormControl<number | null>(null, [Validators.min(0), Validators.max(line.maxQuantity)])));
        if (!this.isCustomer) this.form.controls.resolution.setValidators(Validators.required);
        else this.form.controls.resolution.clearValidators();
        this.form.controls.resolution.updateValueAndValidity({ emitEvent: false });
        if (!this.lines.length) this.toast.info('Nothing is left to return on this document.');
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err?.error?.message || 'Could not load the document.');
        this.closed.emit();
      },
    });
  }

  onDrawerClosed(discarded: boolean): void {
    if (discarded) this.reset();
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || !this.hasQuantity) {
      this.form.markAllAsTouched();
      if (!this.hasQuantity) this.toast.warning('Enter a quantity for at least one item.');
      return;
    }
    const v = this.form.getRawValue();
    this.saving = true;
    this.stockService.createReturn({
      kind: this.kind,
      sourceId: this.sourceId,
      reason: v.reason as string,
      remarks: v.remarks?.trim() || undefined,
      toQuarantine: this.isCustomer && v.condition === 'quarantine',
      resolution: this.isCustomer ? undefined : v.resolution as 'Replacement' | 'Credit Note',
      lines: this.lines
        .map((line, i) => ({ product: line.product, quantity: Number(this.quantities.at(i).value) || 0 }))
        .filter((line) => line.quantity > 0),
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.toast.success(res.message || 'Return recorded');
        this.reset();
        this.closed.emit();
        this.saved.emit();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(err?.error?.message || 'Could not record the return.');
      },
    });
  }

  private reset(): void {
    this.lines = [];
    this.number = '';
    this.quantities.clear();
    this.form.reset({ reason: '', condition: 'good', resolution: '', remarks: '' });
  }
}
