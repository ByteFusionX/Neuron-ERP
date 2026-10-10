import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfCheckboxComponent } from 'src/app/shared/components/smart-form/sf-checkbox.component';

export interface MasterListItemDialogData {
  title: string;
  valueLabel?: string;
  /** Hide/Unhide wording (Visible) instead of Active. */
  hideStyle?: boolean;
  /** Editing an existing item; set when `label` holds an unsaved draft rather than a saved name. */
  edit?: boolean;
  label?: string;
  value?: number | null;
  isActive?: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface MasterListItemResult {
  label: string;
  value: number | null;
  isActive: boolean;
}

/** Add/edit modal for a master-list item, built on the shared form-modal shell and smart-form controls. */
@Component({
  selector: 'app-master-list-item-dialog',
  standalone: true,
  imports: [CommonModule, SmartFormModule, SfCheckboxComponent, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="plus" tone="violet" [title]="(isEdit ? 'Edit ' : 'Add ') + data.title"
      contextEmptyText="Shown in dropdowns across the app."
      formId="master-list-item-form" [invalid]="form.invalid && submitted"
      [submitLabel]="isEdit ? 'Save changes' : 'Add'" [submitIcon]="isEdit ? undefined : 'plus'"
      [submitShortcutVerb]="isEdit ? 'save' : 'add'"
      (closed)="close()">
      <form id="master-list-item-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Details" columns="1">
          <app-sf-field label="Name" [control]="form.controls.label">
            <app-sf-input formControlName="label" placeholder="Enter a name" [maxlength]="60" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field *ngIf="data.valueLabel" [label]="data.valueLabel" optional [control]="form.controls.value">
            <app-sf-number formControlName="value" [min]="0" [stepper]="false"></app-sf-number>
          </app-sf-field>
          <app-sf-checkbox formControlName="isActive" [label]="data.hideStyle ? 'Visible in dropdowns (uncheck to hide)' : 'Active'"></app-sf-checkbox>
        </app-sf-section>
        <app-sf-section title="Record" columns="2" *ngIf="isEdit">
          <app-sf-field label="Created by">
            <app-sf-input formControlName="createdBy"></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Created at">
            <app-sf-input formControlName="createdAt"></app-sf-input>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class MasterListItemDialog {
  private fb = inject(FormBuilder);
  private ref = inject<ModalRef<MasterListItemResult>>(ModalRef);
  data = inject<MasterListItemDialogData>(MODAL_DATA);

  submitted = false;
  readonly isEdit = this.data.edit ?? !!this.data.label;

  form = this.fb.group({
    label: [this.data.label ?? '', [Validators.required, Validators.maxLength(60), (c: { value: string | null }) => (c.value ?? '').trim() ? null : { required: true }]],
    value: [this.data.value ?? null as number | null, Validators.min(0)],
    isActive: [this.data.isActive ?? true],
    createdBy: [{ value: this.data.createdBy || '—', disabled: true }],
    createdAt: [{ value: this.data.createdAt ? new Date(this.data.createdAt).toLocaleString() : '—', disabled: true }],
  });

  close(): void {
    this.ref.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({ label: (v.label ?? '').trim(), value: this.data.valueLabel ? (v.value ?? null) : null, isActive: !!v.isActive });
  }
}
