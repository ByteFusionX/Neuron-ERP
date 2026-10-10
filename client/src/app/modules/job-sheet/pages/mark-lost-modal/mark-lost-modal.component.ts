import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { getJob } from 'src/app/shared/interfaces/job.interface';

/** Asks why a job was lost. Closes with the reason, or undefined on cancel. */
@Component({
  selector: 'app-mark-lost-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="trash" tone="rose" title="Mark job as lost"
      contextLabel="Job" [context]="data?.jobId"
      formId="mark-lost-form" [invalid]="form.invalid && submitted"
      submitLabel="Mark as lost" submitIcon="check" submitShortcutVerb="submit"
      (closed)="close()">
      <form id="mark-lost-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          The quotation and enquiry behind this job are marked lost too, and its open purchase requests, purchase orders, delivery notes and invoices are cancelled.
        </div>
        <app-sf-section title="Reason" columns="1">
          <app-sf-field label="Why was this job lost?" [control]="form.controls.reason">
            <app-sf-textarea formControlName="reason" [rows]="4" [maxlength]="1000" autoresize
              placeholder="Add the reason"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class MarkLostModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<string>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as getJob | null;

  submitted = false;
  form = this.fb.group({ reason: ['', [Validators.required, Validators.maxLength(1000)]] });

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    const reason = this.form.controls.reason.value?.trim();
    if (this.form.invalid || !reason) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(reason);
  }
}
