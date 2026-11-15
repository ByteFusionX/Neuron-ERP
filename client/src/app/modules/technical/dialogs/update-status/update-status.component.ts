import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

export type AssignmentStatus = 'Pending' | 'In Progress' | 'Completed' | 'Lost' | 'Rejected';

export const ASSIGNMENT_STATUS_OPTIONS: SfOption[] = (
  ['Pending', 'In Progress', 'Completed', 'Lost', 'Rejected'] as AssignmentStatus[]
).map((s) => ({ label: s, value: s }));

export interface UpdateStatusDialogData {
  jobId?: string;
  currentStatus?: string;
}

export interface UpdateStatusDialogResult {
  status: AssignmentStatus;
  note: string;
}

/** Picks a status and a note. The note is required for Lost and Rejected, optional otherwise. */
@Component({
  selector: 'app-update-status',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="check" tone="violet" title="Update status"
      contextLabel="Job" [context]="data?.jobId"
      formId="update-status-form" [invalid]="form.invalid && submitted"
      submitLabel="Update" submitIcon="check" submitShortcutVerb="submit"
      (closed)="close()">
      <form id="update-status-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Status" columns="1">
          <app-sf-field label="Status" [control]="form.controls.status">
            <app-sf-select formControlName="status" [options]="statusOptions" placeholder="Select status"></app-sf-select>
          </app-sf-field>
          <app-sf-field [label]="noteRequired ? 'Note (required)' : 'Note (optional)'" [control]="form.controls.note">
            <app-sf-textarea formControlName="note" [rows]="4" placeholder="Add a note"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class UpdateStatusComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<UpdateStatusDialogResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as UpdateStatusDialogData | null;

  submitted = false;
  statusOptions = ASSIGNMENT_STATUS_OPTIONS;
  form = this.fb.group({ status: ['' as string, Validators.required], note: [''] });

  constructor() {
    this.form.controls.status.valueChanges.subscribe(() => {
      const note = this.form.controls.note;
      note.setValidators(this.noteRequired ? [Validators.required] : []);
      note.updateValueAndValidity();
    });
  }

  get noteRequired(): boolean {
    const s = this.form.controls.status.value;
    return s === 'Lost' || s === 'Rejected';
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
    const { status, note } = this.form.getRawValue();
    this.dialogRef.close({ status: status as AssignmentStatus, note: (note || '').trim() });
  }
}
