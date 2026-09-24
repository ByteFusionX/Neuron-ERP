import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { Estimations } from 'src/app/shared/interfaces/enquiry.interface';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ItemEntryComponent, ItemEntryOptionValue, ItemEntryTotals } from 'src/app/shared/components/item-entry';

/**
 * Two-step drawer for uploading/editing a job's presale estimation, mirroring the quotation
 * create/edit wizard: items first, then the totals-affecting fields (currency, discount, note).
 */
@Component({
  selector: 'app-estimation-form-drawer',
  standalone: true,
  templateUrl: './estimation-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, NgIcon, DecimalPipe, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ItemEntryComponent],
})
export class EstimationFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() estimation: Estimations | null = null;
  @Input() enqId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;

  saving = false;
  step: 1 | 2 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Items', hint: 'Line items and pricing' },
    { n: 2 as const, label: 'Terms & Notes', hint: 'Currency, discount and presale note' },
  ];
  seedOptionalItems: ItemEntryOptionValue[] | null = null;
  itemTotals: ItemEntryTotals = { totalCost: 0, sellingPrice: 0, totalProfit: 0, discount: 0 };

  currencyOptions: SfOption[] = [
    { label: 'QAR', value: 'QAR' },
    { label: 'USD', value: 'USD' },
  ];

  private fb = inject(FormBuilder);
  private toast = inject(ToastrService);
  private _enquiryService = inject(EnquiryService);

  form = this.fb.group({
    currency: ['QAR', Validators.required],
    optionalItems: this.fb.array([] as any[]),
    totalDiscount: ['0', Validators.required],
    presaleNote: ['', Validators.required],
  });

  private readonly stepControls: Record<1 | 2, string[]> = {
    1: ['optionalItems'],
    2: ['currency', 'totalDiscount', 'presaleNote'],
  };

  get optionalItems(): FormArray {
    return this.form.get('optionalItems') as FormArray;
  }

  get isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string { return this.isEdit ? 'Edit Estimation' : 'Upload Estimation'; }

  get subtitle(): string { return this.steps[this.step - 1].hint; }

  get netAmount(): number {
    return this.itemTotals.sellingPrice - (Number(this.form.controls.totalDiscount.value) || 0);
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.form.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open;
    if (!this.open || !(opened || changes['estimation'] || changes['mode'])) return;

    this.step = 1;
    if (this.isEdit && this.estimation) {
      this.seedFromEstimation(this.estimation);
    } else {
      this.resetWizard();
    }
  }

  ngOnDestroy(): void {}

  private seedFromEstimation(estimation: Estimations): void {
    this.resetWizard();
    this.form.patchValue({
      currency: (estimation as any).currency ?? 'QAR',
      totalDiscount: String(estimation.totalDiscount ?? '0'),
      presaleNote: estimation.presaleNote ?? '',
    });
    this.seedOptionalItems = JSON.parse(JSON.stringify(estimation.optionalItems ?? []));
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private resetWizard(): void {
    this.seedOptionalItems = null;
    this.itemEntry ? this.itemEntry.reset() : this.optionalItems.clear();
    this.form.reset({ currency: 'QAR', totalDiscount: '0', presaleNote: '' });
    this.step = 1;
  }

  onDrawerClosed(discarded: boolean): void {
    if (discarded || this.isEdit) this.resetWizard();
    this.closed.emit();
  }

  cancel(): void {
    this.onDrawerClosed(false);
  }

  isStepValid(step: 1 | 2): boolean {
    return this.stepControls[step].every((name) => this.form.get(name)?.valid);
  }

  private markStepTouched(step: 1 | 2): void {
    this.stepControls[step].forEach((name) => this.form.get(name)?.markAllAsTouched());
  }

  goToStep(step: 1 | 2): void {
    if (step > this.step && !this.isStepValid(this.step)) {
      this.markStepTouched(this.step);
      return;
    }
    this.step = step;
  }

  nextStep(): void {
    if (this.step < 2) this.goToStep(2);
  }

  previousStep(): void {
    if (this.step > 1) this.step = 1;
  }

  onItemTotals(totals: ItemEntryTotals): void {
    this.itemTotals = totals;
  }

  submit(): void {
    if (this.form.invalid || !this.enqId) {
      this.form.markAllAsTouched();
      const firstIncomplete = ([1, 2] as const).find((s) => !this.isStepValid(s));
      if (firstIncomplete) this.step = firstIncomplete;
      return;
    }

    this.saving = true;
    const v = this.form.getRawValue();
    const optionalItems = JSON.parse(JSON.stringify(v.optionalItems ?? []));
    optionalItems.forEach((option: any) => {
      option.totalDiscount = Number(option.totalDiscount) || 0;
      (option.items || []).forEach((item: any) => {
        (item.itemDetails || []).forEach((detail: any) => {
          delete detail.unitPrice;
          if (!detail.supplierId) delete detail.supplierId;
        });
      });
    });

    const postBody = {
      optionalItems,
      enquiryId: this.enqId,
      currency: v.currency,
      preSaleNote: v.presaleNote,
      totalDiscount: v.totalDiscount,
    };

    this._enquiryService.uploadEstimations(postBody).subscribe({
      next: (res) => {
        this.saving = false;
        if (res.success) {
          this.toast.success('Estimation Updated!', 'Success');
          this.finish();
        } else {
          this.toast.warning('Something went Wrong!', 'Warning');
        }
      },
      error: () => { this.saving = false; },
    });
  }

  private finish(): void {
    this.resetWizard();
    this.closed.emit();
    this.saved.emit();
  }
}
