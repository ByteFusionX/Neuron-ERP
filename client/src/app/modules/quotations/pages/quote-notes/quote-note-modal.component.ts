import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface QuoteNoteModalData {
  /** Quote number, shown as a chip in the header. */
  context?: string;
  /** Present when editing an existing note. */
  note?: { title: string; note: string };
  /** Header text when there is no context chip. */
  hint?: string;
}

export interface QuoteNoteModalResult {
  title: string;
  note: string;
}

/** "Add note" modal for a quotation: a title and a free-text note. Closes with a QuoteNoteModalResult, or undefined on cancel. */
@Component({
  selector: 'app-quote-note-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="chat" tone="emerald" [title]="data?.note ? 'Edit note' : 'Add note'"
      [context]="data?.context" [contextLabel]="data?.note ? 'Editing on' : 'Adding to'"
      [contextEmptyText]="data?.hint || 'Write down anything worth remembering about this quotation.'"
      formId="quote-note-form" [invalid]="form.invalid && submitted"
      submitLabel="Save note" savingLabel="Saving..." [saving]="false" submitShortcutVerb="save"
      (closed)="close()">
      <form id="quote-note-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Note" columns="1">
          <app-sf-field label="Title" [control]="form.controls.title">
            <app-sf-input formControlName="title" placeholder="Short title" [maxlength]="150" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Note" [control]="form.controls.note">
            <app-sf-textarea formControlName="note" [rows]="5" [maxlength]="2000" autoresize placeholder="Write your note…"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class QuoteNoteModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<QuoteNoteModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as QuoteNoteModalData | null;

  submitted = false;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    note: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  constructor() {
    if (this.data?.note) this.form.patchValue({ title: this.data.note.title, note: this.data.note.note });
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.title?.trim() || !v.note?.trim()) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close({ title: v.title.trim(), note: v.note.trim() });
  }
}
