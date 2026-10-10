import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from '../modal-layout/modal-layout.component';

export interface FormPromptField {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'email' | 'date' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  value?: string | number | null;
  hint?: string;
  /** Only for type 'select'. */
  options?: { label: string; value: string }[];
  /** Number minimum, or earliest date (yyyy-MM-dd). */
  min?: number | string;
}

export interface FormPromptConfig {
  title: string;
  message?: string;
  confirmLabel?: string;
  fields: FormPromptField[];
}

export type FormPromptResult = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generic "ask for a few values" dialog - the in-app replacement for window.prompt().
 * Closes with the entered values, or null when the user cancels.
 */
@Component({
  selector: 'app-form-prompt-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalLayoutComponent],
  template: `
    <app-modal-layout [title]="data.title" [onClose]="cancel.bind(this)" [footerButtons]="footerButtons">
      <form class="space-y-4 p-4" (ngSubmit)="confirm()" novalidate>
        <p *ngIf="data.message" class="text-sm text-gray-600 dark:text-gray-300">{{ data.message }}</p>
        <div *ngFor="let f of data.fields">
          <label [for]="'fp-' + f.key" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            {{ f.label }}<span *ngIf="f.required" class="text-red-500"> *</span>
          </label>
          <textarea *ngIf="f.type === 'textarea'" [id]="'fp-' + f.key" rows="3" [name]="f.key" [(ngModel)]="values[f.key]"
            [placeholder]="f.placeholder || ''" [class]="inputClass(f)"></textarea>
          <select *ngIf="f.type === 'select'" [id]="'fp-' + f.key" [name]="f.key" [(ngModel)]="values[f.key]" [class]="inputClass(f)">
            <option *ngIf="!f.required" value="">Select…</option>
            <option *ngFor="let o of f.options" [value]="o.value">{{ o.label }}</option>
          </select>
          <input *ngIf="f.type !== 'textarea' && f.type !== 'select'" [id]="'fp-' + f.key" [name]="f.key"
            [type]="f.type || 'text'" [(ngModel)]="values[f.key]" [placeholder]="f.placeholder || ''"
            [attr.min]="f.min ?? null" autocomplete="off" [class]="inputClass(f)" />
          <p *ngIf="touched && errorFor(f) as err" class="mt-1 text-xs text-red-600">{{ err }}</p>
          <p *ngIf="f.hint && !(touched && errorFor(f))" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ f.hint }}</p>
        </div>
        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
      </form>
    </app-modal-layout>
  `
})
export class FormPromptModalComponent {
  values: Record<string, any> = {};
  touched = false;

  constructor(
    public dialogRef: MatDialogRef<FormPromptModalComponent, FormPromptResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: FormPromptConfig
  ) {
    data.fields.forEach((f) => (this.values[f.key] = f.value ?? ''));
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.cancel() },
      { label: this.data.confirmLabel || 'Confirm', theme: 'primary', onClick: () => this.confirm() },
    ];
  }

  inputClass(f: FormPromptField): string {
    const invalid = this.touched && !!this.errorFor(f);
    return 'block w-full rounded border bg-gray-100 px-3 py-2 text-sm text-gray-700 focus:bg-white focus:outline-none dark:bg-gray-800 dark:text-gray-100 '
      + (invalid ? 'border-red-500' : 'border-gray-200 dark:border-gray-700');
  }

  errorFor(f: FormPromptField): string | null {
    const raw = this.values[f.key];
    const v = raw == null ? '' : String(raw).trim();
    if (!v) return f.required ? `${f.label} is required` : null;
    if (f.type === 'email' && !EMAIL_RE.test(v)) return 'Enter a valid email address';
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) return 'Enter a valid number';
      if (typeof f.min === 'number' && n < f.min) return `Must be ${f.min} or more`;
    }
    if (f.type === 'date' && typeof f.min === 'string' && v < f.min) return 'Date cannot be in the past';
    return null;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  confirm(): void {
    this.touched = true;
    if (this.data.fields.some((f) => this.errorFor(f))) return;
    const out: FormPromptResult = {};
    this.data.fields.forEach((f) => (out[f.key] = String(this.values[f.key] ?? '').trim()));
    this.dialogRef.close(out);
  }
}
