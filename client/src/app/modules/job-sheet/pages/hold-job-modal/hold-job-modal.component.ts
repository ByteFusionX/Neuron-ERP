import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { getJob } from 'src/app/shared/interfaces/job.interface';

export const ADVANCE_PAYMENT_HOLD = 'advance-payment';
export const OTHER_HOLD = 'other';

export interface HoldJobResult {
  /** advance-payment sends the job to Finance for a proforma; other is a free-form reason. */
  holdType: typeof ADVANCE_PAYMENT_HOLD | typeof OTHER_HOLD;
  reason: string;
  note: string;
}

/** Asks why a job is being held. Closes with the hold details, or undefined on cancel. */
@Component({
  selector: 'app-hold-job-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="flag" tone="amber" title="Put job on hold"
      contextLabel="Job" [context]="data?.jobId"
      formId="hold-job-form" [invalid]="form.invalid && submitted"
      submitLabel="Put on hold" submitIcon="check" submitShortcutVerb="submit"
      (closed)="close()">
      <form id="hold-job-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Reason" columns="1">
          <app-sf-field label="Why is this job on hold?" [control]="form.controls.holdType">
            <app-sf-select formControlName="holdType" [options]="options" placeholder="Select a reason"></app-sf-select>
          </app-sf-field>
          <div *ngIf="isAdvance" class="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
            The job appears in Finance &gt; Invoices &gt; New Jobs so a proforma can be raised. Once the payment is received the job returns to Pending.
          </div>
          <ng-container *ngIf="isOther">
            <app-sf-field label="Option" [control]="form.controls.option">
              <app-sf-input formControlName="option" placeholder="Enter the reason" [maxlength]="120" clearable></app-sf-input>
            </app-sf-field>
          </ng-container>
          <app-sf-field *ngIf="form.controls.holdType.value" label="Note" optional [control]="form.controls.note">
            <app-sf-textarea formControlName="note" [rows]="3" [maxlength]="1000" autoresize placeholder="Add a note"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class HoldJobModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<HoldJobResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as getJob | null;

  submitted = false;
  readonly options: SfOption<string>[] = [
    { label: 'Proceed for advance payment', value: ADVANCE_PAYMENT_HOLD },
    { label: 'Other', value: OTHER_HOLD },
  ];

  form = this.fb.group({
    holdType: [null as string | null, Validators.required],
    option: [''],
    note: ['', Validators.maxLength(1000)],
  });

  constructor() {
    this.form.controls.holdType.valueChanges.subscribe(() => {
      const option = this.form.controls.option;
      option.setValidators(this.isOther ? [Validators.required, Validators.maxLength(120)] : null);
      option.updateValueAndValidity({ emitEvent: false });
    });
  }

  get isAdvance(): boolean { return this.form.controls.holdType.value === ADVANCE_PAYMENT_HOLD; }
  get isOther(): boolean { return this.form.controls.holdType.value === OTHER_HOLD; }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    const v = this.form.getRawValue();
    const option = (v.option || '').trim();
    if (this.form.invalid || (this.isOther && !option)) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(this.isAdvance
      ? { holdType: ADVANCE_PAYMENT_HOLD, reason: 'Proceed for advance payment', note: (v.note || '').trim() }
      : { holdType: OTHER_HOLD, reason: option, note: (v.note || '').trim() });
  }
}
