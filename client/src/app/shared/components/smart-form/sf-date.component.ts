import { Component, Input, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/**
 * Value is the native string: yyyy-MM-dd, yyyy-MM-ddTHH:mm, HH:mm or yyyy-MM. ISO strings are accepted on write.
 * By default the browser draws the field. Pass `displayFormat` (e.g. `dd/MM/yy`) on a plain `date` field to show a
 * fixed format instead; a hidden native input still supplies the calendar and the stored value is unchanged.
 */
@Component({
  selector: 'app-sf-date',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfDateComponent), multi: true }],
  template: `
    @if (type === 'date' && displayFormat) {
      <div class="relative">
        <input class="sf-input tabular-nums cursor-pointer pr-9" type="text" readonly [id]="inputId" [value]="display" [disabled]="disabled"
          [placeholder]="displayFormat.toLowerCase()" (click)="openPicker(picker)" (blur)="touch()" />
        <svg class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 6H4v8h12V8z" clip-rule="evenodd" />
        </svg>
        <input #picker type="date" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          [value]="native" [disabled]="disabled || readonly" [attr.min]="min" [attr.max]="max" (input)="update($any($event.target).value || null)" />
      </div>
    } @else {
      <input class="sf-input tabular-nums" [type]="type" [id]="inputId" [value]="native" [disabled]="disabled" [readOnly]="readonly"
        [attr.min]="min" [attr.max]="max" (input)="update($any($event.target).value || null)" (blur)="touch()" (click)="openPicker($any($event.target))" />
    }
  `,
  styles: [SF_STYLES],
})
export class SfDateComponent extends SfControl<string> {
  @Input() type: 'date' | 'datetime-local' | 'time' | 'month' = 'date';
  @Input() min: string | null = null;
  @Input() max: string | null = null;
  /** Fixed display for `type="date"`: `dd/MM/yy` or `dd/MM/yyyy`. Omit to use the browser's own format. */
  @Input() displayFormat: 'dd/MM/yy' | 'dd/MM/yyyy' | null = null;

  /** Browsers only open the picker from the calendar icon by default; open it from anywhere in the field. */
  openPicker(input: HTMLInputElement): void {
    if (this.disabled || this.readonly) return;
    try { input.showPicker?.(); } catch { /* not user-activated or unsupported: the native icon still works */ }
  }

  get native(): string {
    if (!this.value) return '';
    return this.value.slice(0, { date: 10, 'datetime-local': 16, month: 7, time: 5 }[this.type]);
  }

  get display(): string {
    const [y, m, d] = this.native.split('-');
    if (!y || !m || !d) return '';
    return this.displayFormat === 'dd/MM/yy' ? `${d}/${m}/${y.slice(-2)}` : `${d}/${m}/${y}`;
  }
}
