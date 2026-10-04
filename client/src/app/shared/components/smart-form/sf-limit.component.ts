import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

export type SfLimitType = 'time' | 'amount' | 'percent';

const LIMIT_UNITS: Record<SfLimitType, { label: string; suffix: string; placeholder: string }> = {
  time: { label: 'Hours', suffix: 'h', placeholder: 'Hours' },
  amount: { label: 'Amount', suffix: 'QAR', placeholder: 'Amount' },
  percent: { label: 'Percent', suffix: '%', placeholder: 'Percent' },
};

/**
 * One number box with a unit: time (hours), amount or percentage. Value is the number;
 * the chosen unit is exposed through [(unit)]. Pass [types] to limit which units are offered —
 * a single type hides the picker and shows a fixed suffix.
 */
@Component({
  selector: 'app-sf-limit',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfLimitComponent), multi: true }],
  template: `
    <div class="sf-input flex items-center gap-1.5 !pr-1" [class.sf-disabled]="disabled">
      <input class="sf-bare text-right tabular-nums" inputmode="decimal" [id]="inputId" [value]="value ?? ''"
        [placeholder]="placeholder || units[unit].placeholder" [disabled]="disabled" [readOnly]="readonly"
        (input)="onInput($any($event.target).value)" (blur)="touch()" />
      <span *ngIf="types.length < 2" class="shrink-0 pr-2 text-gray-400 dark:text-gray-500">{{ units[unit].suffix }}</span>
      <select *ngIf="types.length > 1" #sel class="sf-unit shrink-0" [disabled]="disabled || readonly" [attr.aria-label]="'Limit type'"
        (change)="setUnit(types[sel.selectedIndex])">
        <option *ngFor="let t of types" [selected]="t === unit">{{ units[t].label }}</option>
      </select>
    </div>
  `,
  styles: [SF_STYLES, `
    .sf-unit { height: 1.625rem; border: 0; border-radius: 0.375rem; background: #f3f4f6; color: #374151; font-size: 0.75rem; padding: 0 0.375rem; outline: none; cursor: pointer; }
    .sf-unit:disabled { cursor: not-allowed; opacity: 0.6; }
    :host-context(html.dark) .sf-unit { background: #1f1f1f; color: #e5e7eb; }
  `],
})
export class SfLimitComponent extends SfControl<number> {
  readonly units = LIMIT_UNITS;

  @Input() types: SfLimitType[] = ['time', 'amount', 'percent'];
  @Input() min: number | null = 0;
  @Input() max: number | null = null;

  private _unit: SfLimitType = 'time';
  @Input()
  get unit(): SfLimitType { return this.types.includes(this._unit) ? this._unit : this.types[0]; }
  set unit(u: SfLimitType) { this._unit = u; }
  @Output() unitChange = new EventEmitter<SfLimitType>();

  setUnit(u: SfLimitType): void {
    this._unit = u;
    this.unitChange.emit(u);
    this.onInput(String(this.value ?? ''));
  }

  onInput(raw: string): void {
    let n = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (Number.isNaN(n)) { this.update(null); return; }
    if (this.min !== null) n = Math.max(this.min, n);
    const cap = this.unit === 'percent' ? Math.min(100, this.max ?? 100) : this.max;
    if (cap !== null) n = Math.min(cap, n);
    this.update(n);
  }
}
