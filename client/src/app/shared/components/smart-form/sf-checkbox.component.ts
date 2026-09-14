import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

@Component({
  selector: 'app-sf-checkbox',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfCheckboxComponent), multi: true }],
  template: `
    <label class="inline-flex cursor-pointer select-none items-start gap-2.5" [class.cursor-not-allowed]="disabled" [attr.for]="inputId">
      <input type="checkbox" class="sf-check" [id]="inputId" [checked]="!!value" [disabled]="disabled || readonly"
        (change)="update($any($event.target).checked); touch()" />
      <span class="text-[13px] leading-5 text-gray-800 dark:text-gray-200" [ngClass]="disabled ? 'text-gray-400 dark:text-gray-500' : ''">
        {{ label }}<ng-content></ng-content>
        <span *ngIf="description" class="block text-xs text-gray-500 dark:text-gray-500">{{ description }}</span>
      </span>
    </label>
  `,
  styles: [SF_STYLES],
})
export class SfCheckboxComponent extends SfControl<boolean> {
  @Input() label = '';
  @Input() description = '';
}
