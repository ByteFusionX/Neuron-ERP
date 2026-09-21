import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';

export interface StatusUpdateModalData {
  quoteId?: string;
  currentStatus: QuoteStatus;
  /** Status the user already picked (e.g. from the grid chip); preselected in the form. */
  targetStatus?: QuoteStatus;
}

export interface StatusUpdateResult {
  status: QuoteStatus;
  reason: string;
}

/** Statuses can't go back before "Under negotiation" once a quote is past them. */
const STATUS_ORDER = [
  QuoteStatus.Draft, QuoteStatus.WorkInProgress, QuoteStatus.QuoteSubmitted, QuoteStatus.UnderNegotiation,
  QuoteStatus.UnderReview, QuoteStatus.ReadyForSubmission, QuoteStatus.Won, QuoteStatus.Lost,
];

export function canSelectQuoteStatus(current: QuoteStatus, target: QuoteStatus): boolean {
  const limit = STATUS_ORDER.indexOf(QuoteStatus.UnderNegotiation);
  const t = STATUS_ORDER.indexOf(target);
  if (t === -1 || t >= limit) return true;
  const c = STATUS_ORDER.indexOf(current);
  return c === -1 || t >= c;
}

/** Records the customer's response: new status + a note. Closes with `{ status, reason }` or null. */
@Component({
  selector: 'app-status-update-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalLayoutComponent, SmartFormModule],
  template: `
    <app-modal-layout
      title="Update status"
      subtitle="Record the customer's response. Quote content is not changed."
      [onClose]="onCancel.bind(this)"
      [footerButtons]="footerButtons"
    >
      <div class="flex flex-col gap-4 p-4">
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>Current status</span>
          <span class="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-900 dark:border-erp-border-dark dark:text-gray-100">{{ data.currentStatus }}</span>
        </div>

        <app-sf-field label="New status" required>
          <app-sf-select [ngModelOptions]="{ standalone: true }" [(ngModel)]="status" [options]="options"></app-sf-select>
        </app-sf-field>

        <app-sf-field [label]="status === 'Lost' ? 'Reason for losing' : 'Note'" [required]="status === 'Lost'" [optional]="status !== 'Lost'">
          <app-sf-textarea [ngModelOptions]="{ standalone: true }" [(ngModel)]="reason" [rows]="4"
            [placeholder]="status === 'Lost' ? 'Why did we lose this quote?' : 'What did the customer say?'"></app-sf-textarea>
        </app-sf-field>

        <p *ngIf="status === 'Won'" class="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 dark:border-erp-border-dark dark:text-gray-400">
          Marking as Won clears any deal sheet and LPO files on this quote. Upload the LPO next to continue.
        </p>
      </div>
    </app-modal-layout>
  `,
})
export class StatusUpdateModalComponent {
  status: QuoteStatus | null;
  reason = '';
  readonly options: SfOption<QuoteStatus>[];

  constructor(
    public dialogRef: MatDialogRef<StatusUpdateModalComponent, StatusUpdateResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: StatusUpdateModalData,
  ) {
    this.status = data.targetStatus && data.targetStatus !== data.currentStatus ? data.targetStatus : null;
    this.options = Object.values(QuoteStatus)
      .filter((s) => s !== QuoteStatus.Expired && s !== data.currentStatus)
      .map((s) => ({ label: s, value: s, disabled: !canSelectQuoteStatus(data.currentStatus, s) }));
  }

  get canSave(): boolean {
    return !!this.status && (this.status !== QuoteStatus.Lost || !!this.reason.trim());
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.onCancel() },
      { label: 'Update status', theme: 'primary', disabled: !this.canSave, onClick: () => this.onSave() },
    ];
  }

  onSave(): void {
    if (!this.canSave) return;
    this.dialogRef.close({ status: this.status as QuoteStatus, reason: this.reason.trim() });
  }
}
