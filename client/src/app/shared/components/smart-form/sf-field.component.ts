import { Component, HostBinding, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, Validators } from '@angular/forms';

/** Label, required marker, hint and inline error for one control. Errors show once the control is touched. */
@Component({
  selector: 'app-sf-field',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="label" class="mb-1 flex items-baseline justify-between gap-2">
      <label [attr.for]="for || null" class="text-xs font-medium text-gray-700 dark:text-gray-300">
        {{ label }}<span *ngIf="isRequired" class="ml-0.5 text-red-500 dark:text-red-400" aria-hidden="true">*</span>
      </label>
      <span *ngIf="optional && !isRequired" class="text-[11px] text-gray-400 dark:text-gray-500">Optional</span>
    </div>
    <ng-content></ng-content>
    <p *ngIf="error as e; else hintTpl" class="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{{ e }}</p>
    <ng-template #hintTpl><p *ngIf="hint" class="mt-1 text-xs text-gray-500 dark:text-gray-500">{{ hint }}</p></ng-template>
  `,
  styles: [`:host { display: block; min-width: 0; }`],
})
export class SfFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() for = '';
  @Input() control: AbstractControl | null = null;
  /** Override messages per error key, e.g. { min: 'Budget must be at least QAR 1,000' } */
  @Input() messages: Record<string, string> = {};
  @Input({ transform: booleanAttribute }) required = false;
  @Input({ transform: booleanAttribute }) optional = false;
  @HostBinding('style.gridColumn') get gridColumn() { return this.full ? '1 / -1' : null; }
  @Input({ transform: booleanAttribute }) full = false;

  get isRequired(): boolean {
    return this.required || !!this.control?.hasValidator(Validators.required);
  }

  get error(): string | null {
    const c = this.control;
    if (!c || c.disabled || !c.invalid || !c.touched || !c.errors) return null;
    const [key, detail] = Object.entries(c.errors)[0];
    if (this.messages[key]) return this.messages[key];
    switch (key) {
      case 'required': return 'This field is required';
      case 'email': return 'Enter a valid email address';
      case 'minlength': return `Enter at least ${detail.requiredLength} characters`;
      case 'maxlength': return `Keep it under ${detail.requiredLength} characters`;
      case 'min': return `Must be at least ${detail.min}`;
      case 'max': return `Must be ${detail.max} or less`;
      case 'pattern': return 'Invalid format';
      default: return typeof detail === 'string' ? detail : 'Invalid value';
    }
  }
}
