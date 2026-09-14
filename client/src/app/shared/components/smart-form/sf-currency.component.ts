import { Component, Input, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/** Numeric value, shown with thousand separators when not focused. */
@Component({
  selector: 'app-sf-currency',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfCurrencyComponent), multi: true }],
  template: `
    <div class="sf-input flex items-center gap-2" [class.sf-disabled]="disabled">
      <span class="shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500">{{ currency }}</span>
      <input class="sf-bare text-right tabular-nums" inputmode="decimal" [id]="inputId" [value]="display"
        [placeholder]="placeholder || '0.00'" [disabled]="disabled" [readOnly]="readonly"
        (focus)="focused = true; display = value === null ? '' : String(value)"
        (input)="onInput($any($event.target).value)" (blur)="focused = false; format(); touch()" />
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfCurrencyComponent extends SfControl<number> {
  @Input() currency = 'QAR';
  @Input() decimals = 2;
  display = '';
  focused = false;
  readonly String = String;

  protected override valueWritten(): void {
    if (!this.focused) this.format();
  }

  onInput(raw: string): void {
    this.display = raw;
    const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
    this.update(Number.isNaN(n) ? null : +n.toFixed(this.decimals));
  }

  format(): void {
    this.display = this.value === null || this.value === undefined ? ''
      : this.value.toLocaleString('en-US', { minimumFractionDigits: this.decimals, maximumFractionDigits: this.decimals });
  }
}
