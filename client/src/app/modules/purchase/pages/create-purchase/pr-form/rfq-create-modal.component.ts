import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';

/** The terms asked of one supplier when its RFQ is created. */
export interface RfqTabTerms {
  deadline?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  shippingTerms?: string;
  deliveryLocation?: string;
}

export interface RfqModalData {
  /** Suppliers that do not have an RFQ tab yet (new RFQ). */
  supplierOptions: SfOption[];
  /** Set when editing the terms of an existing supplier tab. */
  supplierName?: string;
  terms?: RfqTabTerms;
  /** How many selected products the RFQ will ask about (new RFQ). */
  lineCount?: number;
}

export interface RfqModalResult {
  supplierId: string | null;
  terms: RfqTabTerms;
}

/** New RFQ / edit terms: only the supplier and the terms. The products are the ones ticked on the Items tab. */
@Component({
  selector: 'app-rfq-create-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="send" tone="violet" [title]="editing ? 'RFQ terms' : 'New RFQ'"
      contextLabel="For" [context]="editing ? data.supplierName : (data.lineCount + (data.lineCount === 1 ? ' product' : ' products'))"
      formId="rfq-create-form" [invalid]="form.invalid && submitted"
      [submitLabel]="editing ? 'Save terms' : 'Create RFQ'" submitIcon="check" submitShortcutVerb="save"
      (closed)="close()">
      <form id="rfq-create-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Supplier" columns="1" *ngIf="!editing">
          <app-sf-field label="Supplier" [control]="form.controls.supplierId">
            <app-sf-combobox formControlName="supplierId" [options]="data.supplierOptions" placeholder="Search supplier"></app-sf-combobox>
          </app-sf-field>
        </app-sf-section>
        <app-sf-section title="Terms" columns="2">
          <app-sf-field label="Price needed by" [control]="form.controls.deadline">
            <app-sf-date formControlName="deadline" typeable displayFormat="dd/MM/yyyy" [min]="today"></app-sf-date>
          </app-sf-field>
          <app-sf-field label="Payment terms" [control]="form.controls.paymentTerms">
            <app-sf-input formControlName="paymentTerms" placeholder="e.g. 30 days credit"></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Delivery terms" [control]="form.controls.deliveryTerms">
            <app-sf-input formControlName="deliveryTerms" placeholder="e.g. within 2 weeks of PO"></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Shipping terms" [control]="form.controls.shippingTerms">
            <app-sf-input formControlName="shippingTerms" placeholder="e.g. FOB, CIF, Ex-works"></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Place of delivery" class="sm:col-span-2" [control]="form.controls.deliveryLocation">
            <app-sf-textarea formControlName="deliveryLocation" [rows]="2" placeholder="e.g. Our store, Doha"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class RfqCreateModalComponent {
  private fb = inject(FormBuilder);
  private ref = inject<ModalRef<RfqModalResult>>(ModalRef);
  data = inject(MODAL_DATA) as RfqModalData;

  readonly today = new Date().toISOString().slice(0, 10);
  readonly editing = !!this.data.supplierName;
  submitted = false;

  form = this.fb.nonNullable.group({
    supplierId: [''],
    deadline: [String(this.data.terms?.deadline ?? '').slice(0, 10), Validators.required],
    paymentTerms: [this.data.terms?.paymentTerms ?? ''],
    deliveryTerms: [this.data.terms?.deliveryTerms ?? ''],
    shippingTerms: [this.data.terms?.shippingTerms ?? ''],
    deliveryLocation: [this.data.terms?.deliveryLocation ?? ''],
  });

  constructor() {
    if (!this.editing) this.form.controls.supplierId.addValidators(Validators.required);
  }

  close(): void {
    this.ref.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { supplierId, ...terms } = this.form.getRawValue();
    this.ref.close({ supplierId: this.editing ? null : supplierId, terms });
  }
}
