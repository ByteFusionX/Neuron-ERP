import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, Validators } from '@angular/forms';
import { PAYMENT_METHODS, PI_STATUS_LIST, ProformaInvoice, ProformaStatus, ProformaStatusPayload } from 'src/app/core/services/proforma-invoice.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

/**
 * Status + note; moving to Received also collects how the payment arrived. Closes with the payload or undefined.
 * Opened through ModalService, the same way as the event-create modal:
 *   modal.open<ProformaStatusPayload>(PiStatusModalComponent, { width: '560px', data: pi })
 */
@Component({
  selector: 'app-pi-status-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="refresh" tone="violet" title="Update status"
      [context]="data.piNo + ' · ' + data.status" contextEmptyText="Move this proforma invoice to a new status."
      formId="pi-status-form" [invalid]="form.invalid && submitted"
      submitLabel="Update status" submitShortcutVerb="update"
      (closed)="close()">
      <form id="pi-status-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="New status" columns="1">
          <app-sf-field label="Status" [control]="form.controls.status">
            <app-sf-combobox formControlName="status" [options]="statusOptions" placeholder="Select status"></app-sf-combobox>
          </app-sf-field>
          <app-sf-field label="Note" [required]="isRejected" [optional]="!isRejected" [control]="form.controls.note">
            <app-sf-textarea formControlName="note" [rows]="3" [maxlength]="1000" autoresize
              [placeholder]="isRejected ? 'Why was this proforma rejected?' : 'Add a note to the history'"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section *ngIf="isReceived" title="Payment" columns="1">
          <app-sf-field label="Payment method" [control]="form.controls.method">
            <app-sf-select formControlName="method" [options]="methodOptions" placeholder="Select payment method"></app-sf-select>
          </app-sf-field>
          <app-sf-field *ngIf="form.controls.method.value === 'Other'" label="Other method" [control]="form.controls.otherMethod">
            <app-sf-input formControlName="otherMethod" placeholder="How was it paid?" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Reference no" [optional]="form.controls.method.value === 'Open Credit'" [control]="form.controls.referenceNo">
            <app-sf-input formControlName="referenceNo" placeholder="Transfer / receipt / cheque reference" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Received date" [control]="form.controls.receivedDate">
            <app-sf-date formControlName="receivedDate" typeable displayFormat="dd/MM/yyyy"></app-sf-date>
          </app-sf-field>
          <app-sf-field label="Document" optional>
            <app-sf-file [ngModelOptions]="{ standalone: true }" [(ngModel)]="files" [multiple]="false" [maxSizeMb]="5"></app-sf-file>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class PiStatusModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<ProformaStatusPayload>>(ModalRef);
  data = inject(MODAL_DATA) as ProformaInvoice;

  submitted = false;
  files: File[] = [];

  readonly statusOptions: SfOption<string>[] = PI_STATUS_LIST.filter((s) => s !== this.data.status).map((s) => ({ label: s, value: s }));
  readonly methodOptions: SfOption<string>[] = PAYMENT_METHODS.map((m) => ({ label: m, value: m }));

  form = this.fb.group({
    status: [null as ProformaStatus | null, Validators.required],
    note: ['', Validators.maxLength(1000)],
    method: [null as string | null],
    otherMethod: [''],
    referenceNo: [''],
    receivedDate: [new Date().toLocaleDateString('en-CA'), Validators.required],
  });

  constructor() {
    // The note is required for Rejected, the payment fields for Received.
    this.form.controls.status.valueChanges.subscribe((status) => {
      const { note, method, referenceNo } = this.form.controls;
      note.setValidators(status === 'Rejected' ? [Validators.required, Validators.maxLength(1000)] : [Validators.maxLength(1000)]);
      method.setValidators(status === 'Received' ? Validators.required : null);
      this.syncOther();
      [note, method, referenceNo].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
    });
    this.form.controls.method.valueChanges.subscribe(() => this.syncOther());
  }

  get isRejected(): boolean { return this.form.controls.status.value === 'Rejected'; }
  get isReceived(): boolean { return this.form.controls.status.value === 'Received'; }

  private syncOther(): void {
    const other = this.form.controls.otherMethod;
    other.setValidators(this.isReceived && this.form.controls.method.value === 'Other' ? Validators.required : null);
    other.updateValueAndValidity({ emitEvent: false });
    // Open credit has no payment yet, so only the other methods need a reference.
    const ref = this.form.controls.referenceNo;
    ref.setValidators(this.isReceived && this.form.controls.method.value !== 'Open Credit' ? Validators.required : null);
    ref.updateValueAndValidity({ emitEvent: false });
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.dialogRef.close({
      status: v.status!,
      note: (v.note || '').trim(),
      paymentMethod: this.isReceived ? v.method ?? undefined : undefined,
      otherMethod: this.isReceived ? (v.otherMethod || '').trim() : '',
      referenceNo: this.isReceived ? (v.referenceNo || '').trim() : '',
      receivedDate: this.isReceived ? v.receivedDate || undefined : undefined,
      document: this.isReceived ? this.files[0] ?? null : null,
    });
  }
}
