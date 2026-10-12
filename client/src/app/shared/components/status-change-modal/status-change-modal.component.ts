import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormModalShellComponent } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

export interface StatusChangeModalData<T extends string = string> {
  currentStatus: T;
  /** Every status the user may pick from; the current one is filtered out. */
  statuses: readonly T[];
  /** Status the user already picked (e.g. from a grid chip); preselected in the form. */
  targetStatus?: T;
  /** Returns false to show `target` disabled (e.g. can't move backwards). Defaults to always selectable. */
  canSelect?: (current: T, target: T) => boolean;
  /** Statuses that need a non-empty note before saving. */
  requireReasonFor?: readonly T[];
  /** Info line shown when the given status is selected. */
  warnings?: Partial<Record<T, string>>;
  /** Overrides for the note field label/placeholder per status. */
  reasonLabels?: Partial<Record<T, { label: string; placeholder: string }>>;
  title?: string;
  subtitle?: string;
  /** The status is fixed to `targetStatus` (shown read-only) for confirm-style prompts such as Approve / Reject. */
  lockStatus?: boolean;
  /** Primary button text. Defaults to "Update status". */
  confirmLabel?: string;
  /** Display text for a status value (e.g. capitalise raw keys). Defaults to the raw value. */
  formatStatus?: (status: string) => string;
}

export interface StatusChangeResult<T extends string = string> {
  status: T;
  reason: string;
}

/** Generic "new status + note" dialog. Closes with `{ status, reason }` or null. */
@Component({
  selector: 'app-status-change-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FormModalShellComponent, SmartFormModule],
  template: `
    <app-form-modal-shell
      icon="refresh"
      tone="violet"
      [title]="data.title || 'Update status'"
      contextLabel="Current status"
      [context]="format(data.currentStatus)"
      [contextEmptyText]="data.subtitle || ''"
      formId="status-change-form"
      [invalid]="submitted && !canSave"
      [invalidText]="reasonRequired ? 'Reason is required for this status change' : 'Select the new status'"
      [submitLabel]="data.confirmLabel || 'Update status'"
      submitIcon="check"
      submitShortcutVerb="update"
      (closed)="onCancel()"
    >
      <form id="status-change-form" class="flex flex-col gap-4" (ngSubmit)="onSave()">
        <div *ngIf="data.lockStatus" class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>New status</span>
          <span class="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-900 dark:border-erp-border-dark dark:text-gray-100">{{ format(status || '') }}</span>
        </div>

        <app-sf-field *ngIf="!data.lockStatus" label="New status" required>
          <app-sf-select [ngModelOptions]="{ standalone: true }" [(ngModel)]="status" [options]="options"></app-sf-select>
        </app-sf-field>

        <app-sf-field [label]="reasonLabel" [required]="reasonRequired" [optional]="!reasonRequired">
          <app-sf-textarea [ngModelOptions]="{ standalone: true }" [(ngModel)]="reason" [rows]="4"
            [placeholder]="reasonPlaceholder"></app-sf-textarea>
        </app-sf-field>

        <p *ngIf="warning" class="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 dark:border-erp-border-dark dark:text-gray-400">
          {{ warning }}
        </p>
      </form>
    </app-form-modal-shell>
  `,
})
export class StatusChangeModalComponent {
  status: string | null;
  reason = '';
  submitted = false;
  readonly options: SfOption<string>[];

  constructor(
    public dialogRef: MatDialogRef<StatusChangeModalComponent, StatusChangeResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: StatusChangeModalData,
  ) {
    this.status = data.targetStatus && data.targetStatus !== data.currentStatus ? data.targetStatus : null;
    this.options = data.statuses
      .filter((s) => s !== data.currentStatus)
      .map((s) => {
        const disabled = data.canSelect ? !data.canSelect(data.currentStatus, s) : false;
        // A greyed-out option says why, instead of just looking broken.
        return { label: this.format(s), value: s, disabled, description: disabled ? `Not available from ${this.format(data.currentStatus)}` : undefined };
      });
  }

  format(status: string): string {
    return this.data.formatStatus ? this.data.formatStatus(status) : status;
  }

  get reasonRequired(): boolean {
    return !!this.status && !!this.data.requireReasonFor?.includes(this.status);
  }

  get reasonLabel(): string {
    return (this.status && this.data.reasonLabels?.[this.status]?.label) || (this.reasonRequired ? 'Reason' : 'Note');
  }

  get reasonPlaceholder(): string {
    return (this.status && this.data.reasonLabels?.[this.status]?.placeholder) || '';
  }

  get warning(): string {
    return (this.status && this.data.warnings?.[this.status]) || '';
  }

  get canSave(): boolean {
    return !!this.status && (!this.reasonRequired || !!this.reason.trim());
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSave(): void {
    this.submitted = true;
    if (!this.canSave) return;
    this.dialogRef.close({ status: this.status as string, reason: this.reason.trim() });
  }
}
