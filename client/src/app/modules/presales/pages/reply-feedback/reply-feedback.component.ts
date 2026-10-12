import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface ReplyFeedbackModalData {
  /** Enquiry the reply is about, shown as a chip in the header. */
  context?: string;
  /** The feedback message being replied to. */
  feedback?: string;
}

/**
 * Presale engineer replies to feedback they received. The reply goes back to whoever assigned the job.
 * Closes with the reply, or undefined on cancel.
 */
@Component({
  selector: 'app-reply-feedback',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="chat" tone="sky" title="Reply to feedback"
      contextLabel="Enquiry" [context]="data?.context" contextEmptyText="Goes to the person who assigned this job."
      formId="reply-feedback-form" [invalid]="form.invalid && submitted"
      submitLabel="Send reply" submitIcon="send" submitShortcutVerb="send"
      (closed)="close()">
      <form id="reply-feedback-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div *ngIf="data?.feedback" class="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <span class="font-semibold">Feedback received:</span> {{ data?.feedback }}
        </div>
        <app-sf-section title="Your reply" columns="1">
          <app-sf-field label="Comment" [control]="form.controls.comment">
            <app-sf-textarea formControlName="comment" [rows]="4" [maxlength]="1000" autoresize
              placeholder="Add a note or reply"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class ReplyFeedbackComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<string>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as ReplyFeedbackModalData | null;

  submitted = false;
  form = this.fb.group({
    comment: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid || !this.form.controls.comment.value?.trim()) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(this.form.controls.comment.value.trim());
  }
}
