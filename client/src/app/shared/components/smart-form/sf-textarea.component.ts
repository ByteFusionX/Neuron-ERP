import { Component, Input, booleanAttribute, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

@Component({
  selector: 'app-sf-textarea',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfTextareaComponent), multi: true }],
  template: `
    <textarea #ta class="sf-input block py-2 leading-5" [style.resize]="autoresize ? 'none' : 'vertical'"
      [id]="inputId" [rows]="rows" [value]="value ?? ''" [placeholder]="placeholder" [disabled]="disabled" [readOnly]="readonly"
      [attr.maxlength]="maxlength" (input)="update(ta.value); resize(ta)" (blur)="touch()"></textarea>
    <p *ngIf="maxlength" class="mt-1 text-right text-[11px] tabular-nums"
      [ngClass]="(value?.length || 0) >= maxlength ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'">{{ value?.length || 0 }} / {{ maxlength }}</p>
  `,
  styles: [SF_STYLES],
})
export class SfTextareaComponent extends SfControl<string> {
  @Input() rows = 3;
  @Input() maxlength: number | null = null;
  @Input({ transform: booleanAttribute }) autoresize = false;

  resize(ta: HTMLTextAreaElement): void {
    if (!this.autoresize) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }
}
