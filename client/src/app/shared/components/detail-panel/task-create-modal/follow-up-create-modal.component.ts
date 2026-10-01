import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from '../../modal';
import { SmartFormModule } from '../../smart-form';
import { DetailPanelIconComponent } from '../detail-panel-icon.component';

export interface FollowUpCreateModalData {
  /** Record the follow-up belongs to, shown as a chip in the header, e.g. an enquiry or quotation number. */
  context?: string;
  /** `schedule` plans (or moves) the follow-up; `complete` records what happened on the open one. */
  mode: 'schedule' | 'complete';
  /** Schedule mode: pre-fills the date when rescheduling an open follow-up. */
  dueDate?: string | null;
  /** Complete mode: the date the open follow-up was planned for, shown as a reminder. Absent for an ad-hoc log. */
  plannedFor?: string | null;
}

export type FollowUpModalResult =
  | { mode: 'schedule'; dueDate: string; note: string }
  | { mode: 'complete'; date: string; outcome: string; note: string; nextFollowUpDate: string | null };

/**
 * Follow-up modal for detail panel "Follow-ups" tabs, built on the smart-form controls.
 * Closes with a FollowUpModalResult, or undefined on cancel.
 *
 *   modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, { width: '520px', data: { context: row.enquiryId, mode: 'schedule' } })
 */
@Component({
  selector: 'app-follow-up-create-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, DetailPanelIconComponent, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="clock" tone="emerald" [title]="isComplete ? 'Log follow-up' : (data?.dueDate ? 'Reschedule follow-up' : 'Schedule follow-up')"
      [context]="data?.context" [contextEmptyText]="isComplete ? 'Record what happened.' : 'Plan the next call, visit or update.'"
      formId="follow-up-create-form" [invalid]="form.invalid && submitted"
      [submitLabel]="isComplete ? 'Mark done' : 'Schedule'" savingLabel="Saving..." [saving]="saving" submitShortcutVerb="save"
      (closed)="close()">
      <form id="follow-up-create-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <ng-container *ngIf="isComplete; else scheduleFields">
          <div *ngIf="data?.plannedFor" class="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
            <app-dp-icon name="info" size="w-4 h-4" class="mt-0.5 shrink-0"></app-dp-icon>
            <span>Closes the follow-up planned for <strong>{{ data?.plannedFor }}</strong>.</span>
          </div>
          <app-sf-section title="What happened" columns="1">
            <app-sf-field label="Outcome" [control]="form.controls.outcome">
              <app-sf-input formControlName="outcome" placeholder="Called customer, waiting for BOQ, site visit done..." [maxlength]="200" clearable></app-sf-input>
            </app-sf-field>
            <app-sf-field label="Notes" optional [control]="form.controls.note">
              <app-sf-textarea formControlName="note" [rows]="3" [maxlength]="1000" autoresize placeholder="Additional notes…"></app-sf-textarea>
            </app-sf-field>
          </app-sf-section>
          <app-sf-section title="When" columns="2">
            <app-sf-field label="Done on" [control]="form.controls.date">
              <app-sf-date formControlName="date"></app-sf-date>
            </app-sf-field>
            <app-sf-field label="Next follow-up" optional [control]="form.controls.nextFollowUpDate">
              <app-sf-date formControlName="nextFollowUpDate" [min]="today"></app-sf-date>
            </app-sf-field>
          </app-sf-section>
          <p class="-mt-2 text-[11px] text-gray-500 dark:text-gray-400">Leave the next follow-up empty if nothing more is needed for now.</p>
        </ng-container>
        <ng-template #scheduleFields>
          <app-sf-section title="Follow-up" columns="1">
            <app-sf-field label="Follow-up date" [control]="form.controls.date">
              <app-sf-date formControlName="date" [min]="today"></app-sf-date>
            </app-sf-field>
            <app-sf-field label="Note" optional [control]="form.controls.note">
              <app-sf-textarea formControlName="note" [rows]="3" [maxlength]="1000" autoresize placeholder="What to follow up on…"></app-sf-textarea>
            </app-sf-field>
          </app-sf-section>
        </ng-template>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class FollowUpCreateModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<FollowUpModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as FollowUpCreateModalData | null;

  get today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  submitted = false;
  saving = false;

  get isComplete(): boolean {
    return this.data?.mode === 'complete';
  }

  /** `date` is "done on" when completing and the due date when scheduling. */
  form = this.fb.group({
    date: [this.data?.dueDate || new Date().toISOString().slice(0, 10), Validators.required],
    outcome: [''],
    note: ['', Validators.maxLength(1000)],
    nextFollowUpDate: [null as string | null],
  });

  constructor() {
    if (this.isComplete) {
      this.form.controls.outcome.addValidators([Validators.required, Validators.maxLength(200)]);
      this.form.controls.outcome.updateValueAndValidity();
    }
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
    const date = v.date || new Date().toISOString().slice(0, 10);
    this.dialogRef.close(this.isComplete
      ? { mode: 'complete', date, outcome: v.outcome!.trim(), note: v.note?.trim() || '', nextFollowUpDate: v.nextFollowUpDate || null }
      : { mode: 'schedule', dueDate: date, note: v.note?.trim() || '' });
  }
}
