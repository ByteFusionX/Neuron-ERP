import { Component, Input, booleanAttribute, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

@Component({
  selector: 'app-sf-input',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfInputComponent), multi: true }],
  template: `
    <div class="sf-input flex items-center gap-2" [class.sf-disabled]="disabled">
      <span *ngIf="prefix" class="shrink-0 text-gray-400 dark:text-gray-500">{{ prefix }}</span>
      <input class="sf-bare" [id]="inputId" [type]="type === 'password' && reveal ? 'text' : type"
        [value]="value ?? ''" [placeholder]="placeholder" [disabled]="disabled" [readOnly]="readonly"
        [attr.maxlength]="maxlength" [attr.autocomplete]="autocomplete"
        (input)="update($any($event.target).value)" (blur)="touch()" />
      <span *ngIf="suffix" class="shrink-0 text-gray-400 dark:text-gray-500">{{ suffix }}</span>
      <button *ngIf="clearable && value && !disabled" type="button" class="sf-focus shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        aria-label="Clear" (click)="update('')">&times;</button>
      <button *ngIf="type === 'password'" type="button" class="sf-focus shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        (click)="reveal = !reveal">{{ reveal ? 'Hide' : 'Show' }}</button>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfInputComponent extends SfControl<string> {
  @Input() type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' = 'text';
  @Input() prefix = '';
  @Input() suffix = '';
  @Input() maxlength: number | null = null;
  @Input() autocomplete = 'off';
  @Input({ transform: booleanAttribute }) clearable = false;
  reveal = false;
}
