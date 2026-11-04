import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface AssignEngineerDialogData {
  engineerOptions: { label: string; value: string }[];
  priorityOptions: { label: string; value: string }[];
  /** Job id shown as context in the header. */
  jobId?: string;
  selectedEngineer?: string;
  selectedPriority?: string;
  assignComment?: string;
}

export interface AssignEngineerDialogResult {
  engineerId: string;
  priority: string;
  comment: string;
}

/** Picks the engineer and priority for a job. Closes with the choice, or undefined on cancel. */
@Component({
  selector: 'app-assign-engineer-dialog',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="user" tone="violet" title="Assign to engineer"
      contextLabel="Job" [context]="data?.jobId"
      formId="assign-engineer-form" [invalid]="form.invalid && submitted"
      submitLabel="Assign" submitIcon="check" submitShortcutVerb="submit"
      (closed)="close()">
      <form id="assign-engineer-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Assignment" columns="1">
          <app-sf-field label="Engineer" [control]="form.controls.engineerId">
            <app-sf-combobox formControlName="engineerId" [options]="engineerOptions" placeholder="Search engineer"></app-sf-combobox>
          </app-sf-field>
          <app-sf-field label="Priority" [control]="form.controls.priority">
            <app-sf-combobox formControlName="priority" [options]="priorityOptions" placeholder="Select priority"></app-sf-combobox>
          </app-sf-field>
          <app-sf-field label="Comment" optional [control]="form.controls.comment">
            <app-sf-textarea formControlName="comment" [rows]="3" [maxlength]="500" autoresize placeholder="Add a comment"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class AssignEngineerDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<AssignEngineerDialogResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as AssignEngineerDialogData | null;

  submitted = false;
  engineerOptions = [...(this.data?.engineerOptions ?? [])].sort((a, b) =>
    (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' }));
  priorityOptions = this.data?.priorityOptions ?? [];

  form = this.fb.group({
    engineerId: [this.data?.selectedEngineer ?? '', Validators.required],
    priority: [this.data?.selectedPriority ?? '', Validators.required],
    comment: [this.data?.assignComment ?? '', Validators.maxLength(500)],
  });

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
    this.dialogRef.close({ engineerId: v.engineerId!, priority: v.priority!, comment: (v.comment || '').trim() });
  }
}
