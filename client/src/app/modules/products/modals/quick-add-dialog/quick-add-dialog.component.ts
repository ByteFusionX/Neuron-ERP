import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface QuickAddDialogData {
  /** Singular noun, e.g. "Category". */
  title: string;
  /** Saves the trimmed name; the dialog closes with whatever it returns. */
  create: (name: string) => Observable<any>;
  /** Existing name: the dialog renames instead of adding. */
  initial?: string;
}

/** One-field "add a name" modal on the shared form-modal shell (product category, warehouse). A failed save stays open with the error under the field. */
@Component({
  selector: 'app-quick-add-dialog',
  standalone: true,
  imports: [SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="plus" tone="violet" [title]="(data.initial ? 'Edit ' : 'Add ') + data.title"
      contextEmptyText="Available to every product."
      formId="quick-add-form" [invalid]="form.invalid && submitted" [saving]="saving"
      [submitLabel]="data.initial ? 'Save' : 'Add'" [submitShortcutVerb]="data.initial ? 'save' : 'add'"
      (closed)="close()">
      <form id="quick-add-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Details" columns="1">
          <app-sf-field [label]="data.title + ' name'" [control]="form.controls.name">
            <app-sf-input formControlName="name" placeholder="Enter a name" [maxlength]="60" clearable></app-sf-input>
          </app-sf-field>
          @if (serverError) {
            <p class="text-xs text-red-600 dark:text-red-400" role="alert">{{ serverError }}</p>
          }
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class QuickAddDialogComponent {
  private fb = inject(FormBuilder);
  private ref = inject<ModalRef<any>>(ModalRef);
  data = inject<QuickAddDialogData>(MODAL_DATA);

  submitted = false;
  saving = false;
  serverError = '';

  form = this.fb.group({
    name: [this.data.initial ?? '', [Validators.required, Validators.maxLength(60), (c: { value: string | null }) => ((c.value ?? '').trim() ? null : { required: true })]],
  });

  close(): void {
    this.ref.close();
  }

  submit(): void {
    this.submitted = true;
    this.serverError = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.data.create((this.form.value.name ?? '').trim()).subscribe({
      next: (result) => this.ref.close(result),
      error: (error) => {
        this.saving = false;
        this.serverError = error?.error?.message || `Could not add the ${this.data.title.toLowerCase()}`;
      },
    });
  }
}
