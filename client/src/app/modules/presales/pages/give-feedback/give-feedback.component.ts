import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

export interface GiveFeedbackModalData {
  /** Enquiry the feedback is about, shown as a chip in the header. */
  context?: string;
  /** What the presale engineer asked, shown above the answer field. */
  question?: string;
}

export interface GiveFeedbackResult {
  feedback: string;
  action: 'send' | 'revise';
}

/**
 * Answer to a feedback request. Approving sends the job back to the salesperson; asking for a revision
 * returns it to the presale engineer. Closes with the answer, or undefined on cancel.
 */
@Component({
  selector: 'app-give-feedback',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="chat" tone="emerald" title="Give feedback"
      contextLabel="Enquiry" [context]="data?.context" contextEmptyText="Answer the presale engineer's request."
      formId="give-feedback-form" [invalid]="form.invalid && submitted"
      submitLabel="Submit feedback" submitIcon="send" submitShortcutVerb="submit"
      (closed)="close()">
      <form id="give-feedback-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div *ngIf="data?.question" class="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <span class="font-semibold">Asked:</span> {{ data?.question }}
        </div>
        <app-sf-section title="Your answer" columns="1">
          <app-sf-field label="Decision" [control]="form.controls.action">
            <app-sf-radio-group formControlName="action" [options]="actions"></app-sf-radio-group>
          </app-sf-field>
          <app-sf-field label="Feedback" [control]="form.controls.feedback">
            <app-sf-textarea formControlName="feedback" [rows]="4" [maxlength]="1000" autoresize
              placeholder="Add your feedback"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class GiveFeedbackComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<GiveFeedbackResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as GiveFeedbackModalData | null;

  readonly actions: SfOption[] = [
    { value: 'send', label: 'Approve', description: 'Send the job back to the salesperson.' },
    { value: 'revise', label: 'Request revision', description: 'Return it to the presale engineer.' },
  ];

  submitted = false;
  form = this.fb.group({
    action: ['revise' as 'send' | 'revise',Validators.required],
    feedback: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.feedback?.trim()) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close({ feedback: v.feedback.trim(), action: v.action ?? 'send' });
  }
}
