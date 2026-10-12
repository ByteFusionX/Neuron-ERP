import { Component, Input, booleanAttribute, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

@Component({
  selector: 'app-sf-number',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfNumberComponent), multi: true }],
  template: `
    <div class="sf-input flex items-center gap-2 !pr-1" [class.sf-disabled]="disabled">
      <input class="sf-bare text-right tabular-nums" inputmode="decimal" [id]="inputId" [value]="value ?? ''"
        [placeholder]="placeholder" [disabled]="disabled" [readOnly]="readonly"
        (input)="onInput($any($event.target))" (blur)="touch()" (keydown.arrowup)="step(1, $event)" (keydown.arrowdown)="step(-1, $event)" />
      <span *ngIf="suffix" class="shrink-0 text-gray-400 dark:text-gray-500">{{ suffix }}</span>
      <div *ngIf="stepper" class="flex shrink-0 flex-col">
        <button type="button" tabindex="-1" class="h-3.5 px-1 text-[9px] leading-none text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" [disabled]="disabled" aria-label="Increase" (click)="step(1)">&#9650;</button>
        <button type="button" tabindex="-1" class="h-3.5 px-1 text-[9px] leading-none text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" [disabled]="disabled" aria-label="Decrease" (click)="step(-1)">&#9660;</button>
      </div>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfNumberComponent extends SfControl<number> {
  @Input() min: number | null = null;
  @Input() max: number | null = null;
  @Input() stepSize = 1;
  @Input() suffix = '';
  /** Opt-in: stops typing more than this many decimal places (e.g. 2 for money shown to 2 places). */
  @Input() decimals: number | null = null;
  @Input({ transform: booleanAttribute }) stepper = true;

  onInput(el: HTMLInputElement): void {
    const allowSign = this.min === null || this.min < 0;
    // A minus sign in a field that cannot go below zero (or its minimum) lands on the minimum, so "-5" is 0, not 5.
    const negative = !allowSign && el.value.includes('-');
    let clean = negative ? String(Math.max(this.min ?? 0, 0)) : el.value.replace(allowSign ? /[^0-9.-]/g : /[^0-9.]/g, '').replace(/(?!^)-/g, '').replace(/\.(?=.*\.)/g, '');
    if (this.decimals !== null && clean.includes('.')) {
      const [whole, fraction] = clean.split('.');
      clean = `${whole}.${fraction.slice(0, this.decimals)}`;
    }
    if (clean !== el.value) el.value = clean;
    let n = parseFloat(clean);
    if (!Number.isNaN(n) && this.max !== null && n > this.max) {
      n = this.max;
      el.value = String(n);
    }
    this.update(Number.isNaN(n) ? null : n);
  }

  step(dir: 1 | -1, e?: Event): void {
    if (this.disabled || this.readonly) return;
    e?.preventDefault();
    let n = +((this.value ?? 0) + dir * this.stepSize).toFixed(6);
    if (this.min !== null) n = Math.max(this.min, n);
    if (this.max !== null) n = Math.min(this.max, n);
    this.update(n);
    this.touch();
  }
}
