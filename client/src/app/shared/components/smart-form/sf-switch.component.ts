import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/** On/off setting that applies immediately in meaning (notify, active). Use a checkbox for consent/agreement. */
@Component({
  selector: 'app-sf-switch',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfSwitchComponent), multi: true }],
  template: `
    <div class="flex items-start justify-between gap-4">
      <label [attr.for]="inputId" class="min-w-0 cursor-pointer select-none">
        <span class="block text-[13px] leading-5 text-gray-800 dark:text-gray-200">{{ label }}</span>
        <span *ngIf="description" class="block text-xs text-gray-500 dark:text-gray-500">{{ description }}</span>
      </label>
      <button type="button" role="switch" class="sf-focus relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50"
        [id]="inputId" [attr.aria-checked]="!!value" [disabled]="disabled || readonly"
        [ngClass]="value ? 'bg-violet-600' : 'bg-gray-200 dark:bg-gray-700'" (click)="update(!value); touch()">
        <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" [class.translate-x-4]="value"></span>
      </button>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfSwitchComponent extends SfControl<boolean> {
  @Input() label = '';
  @Input() description = '';
}
