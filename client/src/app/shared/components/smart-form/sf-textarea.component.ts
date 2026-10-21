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
      [attr.maxlength]="maxlength" (input)="update(ta.value); resize(ta); fit(ta)" (focus)="fit(ta)" (blur)="touch(); collapse(ta)"
      (keydown.enter)="noEnter && $event.preventDefault(); bullets && onBulletEnter($event, ta)"></textarea>
    <p *ngIf="maxlength" class="mt-1 text-right text-[11px] tabular-nums"
      [ngClass]="(value?.length || 0) >= maxlength ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'">{{ value?.length || 0 }} / {{ maxlength }}</p>
  `,
  styles: [SF_STYLES],
})
export class SfTextareaComponent extends SfControl<string> {
  @Input() rows = 3;
  @Input() maxlength: number | null = null;
  @Input({ transform: booleanAttribute }) autoresize = false;
  @Input({ transform: booleanAttribute }) noEnter = false;

  /** Enter continues the list with a "*   " bullet; Enter on an empty bullet ends it. */
  @Input({ transform: booleanAttribute }) bullets = false;

  onBulletEnter(event: Event, ta: HTMLTextAreaElement): void {
    event.preventDefault();
    const value = ta.value;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const line = value.substring(lineStart, start);
    const bullet = line.match(/^\*\s+(.*)$/);
    let next: string;
    let pos: number;
    if (bullet && bullet[1].trim() === '') {
      next = value.substring(0, lineStart) + value.substring(start);
      pos = lineStart;
    } else if (line.trim() === '') {
      next = value.substring(0, start) + '\n' + value.substring(end);
      pos = start + 1;
    } else {
      const insert = '\n*   ';
      next = value.substring(0, start) + insert + value.substring(end);
      pos = start + insert.length;
    }
    ta.value = next;
    ta.selectionStart = ta.selectionEnd = pos;
    this.update(next);
  }

  /** Clicking in grows the box to show every line; leaving it returns to `rows`. */
  @Input({ transform: booleanAttribute }) expandOnFocus = false;

  fit(ta: HTMLTextAreaElement): void {
    if (!this.expandOnFocus) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  collapse(ta: HTMLTextAreaElement): void {
    if (this.expandOnFocus) ta.style.height = '';
  }

  resize(ta: HTMLTextAreaElement): void {
    if (!this.autoresize) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }
}
