import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PAYMENT_METHODS, PI_STATUS_LIST, ProformaInvoice, ProformaStatus, ProformaStatusPayload } from 'src/app/core/services/proforma-invoice.service';
import { FormModalShellComponent } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

/** Status + optional note; moving to Received also collects how the payment arrived. Closes with the payload or null. */
@Component({
  selector: 'app-pi-status-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FormModalShellComponent, SmartFormModule],
  template: `
    <app-form-modal-shell
      icon="refresh"
      tone="violet"
      [title]="'Update status — ' + data.piNo"
      contextLabel="Current status"
      [context]="data.status"
      formId="pi-status-form"
      [invalid]="submitted && !!error"
      [invalidText]="error"
      submitLabel="Update status"
      submitIcon="check"
      submitShortcutVerb="update"
      (closed)="dialogRef.close(null)">
      <form id="pi-status-form" class="flex flex-col gap-4" (ngSubmit)="save()">
        <app-sf-field label="New status" required>
          <app-sf-combobox [ngModelOptions]="{ standalone: true }" [(ngModel)]="status" [options]="statusOptions" placeholder="Select status"></app-sf-combobox>
        </app-sf-field>

        <ng-container *ngIf="status === 'Received'">
          <app-sf-field label="Payment method" required>
            <app-sf-select [ngModelOptions]="{ standalone: true }" [(ngModel)]="method" [options]="methodOptions" placeholder="Select payment method"></app-sf-select>
          </app-sf-field>
          <app-sf-field *ngIf="method === 'Other'" label="Other method" required>
            <app-sf-input [ngModelOptions]="{ standalone: true }" [(ngModel)]="otherMethod" placeholder="How was it paid?"></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Reference no" required>
            <app-sf-input [ngModelOptions]="{ standalone: true }" [(ngModel)]="referenceNo" placeholder="Transfer / receipt / cheque reference"></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Document" optional>
            <app-sf-file [ngModelOptions]="{ standalone: true }" [(ngModel)]="files" [multiple]="false" [maxSizeMb]="5"></app-sf-file>
          </app-sf-field>
        </ng-container>

        <app-sf-field label="Note" optional>
          <app-sf-textarea [ngModelOptions]="{ standalone: true }" [(ngModel)]="note" [rows]="3" placeholder="Add a note to the history"></app-sf-textarea>
        </app-sf-field>
      </form>
    </app-form-modal-shell>
  `,
})
export class PiStatusModalComponent {
  status: ProformaStatus | null = null;
  note = '';
  method: string | null = null;
  otherMethod = '';
  referenceNo = '';
  files: File[] = [];
  submitted = false;

  readonly statusOptions: SfOption<string>[];
  readonly methodOptions: SfOption<string>[] = PAYMENT_METHODS.map((m) => ({ label: m, value: m }));

  constructor(
    public dialogRef: MatDialogRef<PiStatusModalComponent, ProformaStatusPayload | null>,
    @Inject(MAT_DIALOG_DATA) public data: ProformaInvoice,
  ) {
    this.statusOptions = PI_STATUS_LIST.filter((s) => s !== data.status).map((s) => ({ label: s, value: s }));
  }

  get error(): string {
    if (!this.status) return 'Select the new status';
    if (this.status !== 'Received') return '';
    if (!this.method) return 'Select the payment method';
    if (this.method === 'Other' && !this.otherMethod.trim()) return 'Enter the payment method';
    if (!this.referenceNo.trim()) return 'Reference number is required';
    return '';
  }

  save(): void {
    this.submitted = true;
    if (this.error || !this.status) return;
    this.dialogRef.close({
      status: this.status,
      note: this.note.trim(),
      paymentMethod: this.method ?? undefined,
      otherMethod: this.otherMethod.trim(),
      referenceNo: this.referenceNo.trim(),
      document: this.files[0] ?? null,
    });
  }
}
