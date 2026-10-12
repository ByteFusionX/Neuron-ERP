import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface AskFeedbackModalData {
  /** Enquiry the request is about, shown as a chip in the header. */
  context?: string;
}

/**
 * Presale engineer asks for feedback on their estimate. The request goes back to whoever assigned the job,
 * so there is no recipient to pick. Closes with the comment, or undefined on cancel.
 */
@Component({
  selector: 'app-ask-feedback',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="chat" tone="sky" title="Ask for feedback"
      contextLabel="Enquiry" [context]="data?.context" contextEmptyText="Goes to the person who assigned this job."
      formId="ask-feedback-form" [invalid]="form.invalid && submitted"
      submitLabel="Ask for feedback" submitIcon="send" submitShortcutVerb="send"
      (closed)="close()">
      <form id="ask-feedback-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Your question" columns="1">
          <app-sf-field label="Comment" [control]="form.controls.comment">
            <app-sf-textarea formControlName="comment" [rows]="4" [maxlength]="1000" autoresize
              placeholder="What do you need feedback on?"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class AskFeedbackComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<string>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as AskFeedbackModalData | null;

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
