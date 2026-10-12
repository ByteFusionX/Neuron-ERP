import { Component, Input, booleanAttribute, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/**
 * Value is the native string: yyyy-MM-dd, yyyy-MM-ddTHH:mm, HH:mm or yyyy-MM. ISO strings are accepted on write.
 * A plain `date` field shows `dd/MM/yy` by default (or the `displayFormat` you pass); a hidden native input still
 * supplies the calendar and the stored value is unchanged. Other types are drawn by the browser.
 */
@Component({
  selector: 'app-sf-date',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfDateComponent), multi: true }],
  template: `
    @if (type === 'date' && displayFormat) {
      <div class="relative">
        @if (typeable && !readonly) {
          <!-- Typed dates: dd/mm/yyyy is parsed as you type; the calendar opens from the icon. -->
          <input class="sf-input tabular-nums pr-9" type="text" inputmode="numeric" autocomplete="off" [id]="inputId" [value]="editing ? text : display" [disabled]="disabled"
            [placeholder]="displayFormat.toLowerCase()" (focus)="startEdit()" (input)="onType($any($event.target).value)" (keydown)="onTypedKeydown($event, picker)" (blur)="endEdit()" />
          <button type="button" tabindex="-1" class="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-content-center rounded text-gray-500 hover:text-violet-600 dark:text-gray-400" aria-label="Open calendar" [disabled]="disabled" (click)="openPicker(picker)">
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 6H4v8h12V8z" clip-rule="evenodd" />
            </svg>
          </button>
        } @else {
          <input class="sf-input tabular-nums cursor-pointer pr-9" type="text" readonly [id]="inputId" [value]="display" [disabled]="disabled"
            [placeholder]="displayFormat.toLowerCase()" (click)="openPicker(picker)" (keydown)="onKeydown($event, picker)" (blur)="closePopup(); touch()" />
          <svg class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 6H4v8h12V8z" clip-rule="evenodd" />
          </svg>
        }
        <input #picker type="date" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          [value]="native" [disabled]="disabled || readonly" [attr.min]="min" [attr.max]="max" (input)="pick($any($event.target).value || null)" />
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
  /** Fixed display for `type="date"`: `dd/MM/yy` (default) or `dd/MM/yyyy`. Pass `null` to use the browser's own format. */
  @Input() displayFormat: 'dd/MM/yy' | 'dd/MM/yyyy' | null = 'dd/MM/yy';

  /** Lets the user type the date (dd/mm/yyyy) as well as pick it; off by default so other screens keep the picker-only field. */
  @Input({ transform: booleanAttribute }) typeable = false;
  editing = false;
  text = '';

  startEdit(): void {
    this.editing = true;
    this.text = this.display;
  }

  /** Commits as soon as the text is a complete, real date inside min/max; anything else waits for blur. */
  onType(raw: string): void {
    this.text = raw;
    const iso = this.parseTyped(raw);
    if (iso && (!this.min || iso >= this.min) && (!this.max || iso <= this.max)) this.update(iso);
    else if (!raw.trim()) this.update(null);
  }

  /** A date chosen in the calendar replaces whatever was being typed. */
  pick(iso: string | null): void {
    this.pickerOpen = false;
    this.update(iso);
    this.text = this.display;
  }

  endEdit(): void {
    this.editing = false;
    this.pickerOpen = false;
    this.touch();
  }

  /** True while the calendar popup is open: Escape then closes only the popup, not the drawer around the field. */
  private pickerOpen = false;

  /** Returns true when the key was spent closing the popup or undoing a half-typed date. */
  private swallowEscape(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (this.pickerOpen) {
      this.pickerOpen = false;
    } else if (this.editing && this.text !== this.display) {
      this.text = this.display;
    } else {
      return false;
    }
    event.stopPropagation();
    return true;
  }

  onTypedKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (this.swallowEscape(event)) return;
    if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); this.openPicker(input); }
  }

  private parseTyped(raw: string): string | null {
    const m = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\s*$/.exec(raw);
    if (!m) return null;
    const day = Number(m[1]), month = Number(m[2]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /** Browsers only open the picker from the calendar icon by default; open it from anywhere in the field. */
  openPicker(input: HTMLInputElement): void {
    if (this.disabled || this.readonly) return;
    this.pickerOpen = true;
    try { input.showPicker?.(); } catch { /* not user-activated or unsupported: the native icon still works */ }
  }

  /** The visible field is a readonly text input with no native keyboard path to the picker — without this,
   * Enter/Space on a focused field just submits the surrounding form instead of opening the calendar. */
  onKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (this.swallowEscape(event)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openPicker(input);
  }

  closePopup(): void { this.pickerOpen = false; }

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
