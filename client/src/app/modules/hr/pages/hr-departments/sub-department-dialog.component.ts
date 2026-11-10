import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { SfCheckboxComponent } from 'src/app/shared/components/smart-form/sf-checkbox.component';

export interface SubCategoryDialogData {
  /** Parent sales departments to pick from (active ones, plus the current parent when editing). */
  departments: SfOption[];
  /** Saves the trimmed name under the parent department; the dialog closes with whatever it returns. */
  save: (name: string, departmentId: string, isActive: boolean, headId: string) => Observable<any>;
  /** Employees to pick the head from, already sorted A–Z. */
  employees: SfOption[];
  initialName?: string;
  initialDepartment?: string;
  initialHead?: string;
  initialActive?: boolean;
}

/** Add / edit modal for a product sub department: name, parent sales department and active flag. */
@Component({
  selector: 'app-sub-category-dialog',
  standalone: true,
  imports: [SmartFormModule, SfCheckboxComponent, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="plus" tone="violet" [title]="data.initialName ? 'Edit Sub Department' : 'Add Sub Department'"
      contextEmptyText="Available under its parent sales department on every product."
      formId="sub-category-form" [invalid]="form.invalid && submitted" [saving]="saving"
      [submitLabel]="data.initialName ? 'Save' : 'Add'" [submitShortcutVerb]="data.initialName ? 'save' : 'add'"
      (closed)="close()">
      <form id="sub-category-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Details" columns="1">
          <app-sf-field label="Parent department" [control]="form.controls.department">
            <app-sf-combobox formControlName="department" [options]="data.departments" placeholder="Select department"></app-sf-combobox>
          </app-sf-field>
          <app-sf-field label="Sub department name" [control]="form.controls.name">
            <app-sf-input formControlName="name" placeholder="Enter a name" [maxlength]="100" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Department head" [control]="form.controls.head">
            <app-sf-combobox formControlName="head" [options]="data.employees" placeholder="Select employee (optional)"></app-sf-combobox>
          </app-sf-field>
          <app-sf-checkbox formControlName="isActive" label="Active"></app-sf-checkbox>
          @if (serverError) {
            <p class="text-xs text-red-600 dark:text-red-400" role="alert">{{ serverError }}</p>
          }
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class SubCategoryDialogComponent {
  private fb = inject(FormBuilder);
  private ref = inject<ModalRef<any>>(ModalRef);
  data = inject<SubCategoryDialogData>(MODAL_DATA);

  submitted = false;
  saving = false;
  serverError = '';

  form = this.fb.group({
    department: [this.data.initialDepartment ?? '', Validators.required],
    head: [this.data.initialHead ?? ''],
    isActive: [this.data.initialActive ?? true],
    name: [this.data.initialName ?? '', [Validators.required, Validators.maxLength(100), (c: { value: string | null }) => ((c.value ?? '').trim() ? null : { required: true })]],
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
    const v = this.form.value;
    this.data.save((v.name ?? '').trim(), v.department ?? '', v.isActive !== false, v.head ?? '').subscribe({
      next: (result) => this.ref.close(result),
      error: (error) => {
        this.saving = false;
        this.serverError = error?.error?.message || 'Could not save the sub department';
      },
    });
  }
}
