import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/** Free-text chips. Enter or comma adds, Backspace on an empty input removes the last one. */
@Component({
  selector: 'app-sf-tags',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfTagsComponent), multi: true }],
  template: `
    <div class="sf-input flex cursor-text flex-wrap items-center gap-1" [class.py-1]="tags.length" [class.sf-disabled]="disabled" (click)="input.focus()">
      <span *ngFor="let t of tags; let i = index" class="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 py-0.5 pl-1.5 pr-1 text-xs text-gray-700 dark:text-gray-300">
        {{ t }}
        <button type="button" class="sf-focus rounded px-0.5 hover:bg-gray-200 dark:hover:bg-gray-700" [disabled]="disabled" [attr.aria-label]="'Remove ' + t"
          (click)="remove(i); $event.stopPropagation()">&times;</button>
      </span>
      <input #input class="sf-bare min-w-[6rem]" [class.!h-7]="tags.length" [id]="inputId" [placeholder]="tags.length ? '' : placeholder"
        [disabled]="disabled" [readOnly]="readonly" (keydown)="onKey($event, input)" (blur)="add(input); touch()" />
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfTagsComponent extends SfControl<string[]> {
  @Input() max: number | null = null;

  get tags(): string[] {
    return this.value ?? [];
  }

  onKey(e: KeyboardEvent, input: HTMLInputElement): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.add(input);
    } else if (e.key === 'Backspace' && !input.value && this.tags.length) {
      this.remove(this.tags.length - 1);
    }
  }

  add(input: HTMLInputElement): void {
    const t = input.value.trim();
    input.value = '';
    if (!t || this.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    if (this.max !== null && this.tags.length >= this.max) return;
    this.update([...this.tags, t]);
  }

  remove(i: number): void {
    this.update(this.tags.filter((_, idx) => idx !== i));
  }
}
