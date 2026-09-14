import { Component, Input, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/** Value is the native string: yyyy-MM-dd, yyyy-MM-ddTHH:mm, HH:mm or yyyy-MM. ISO strings are accepted on write. */
@Component({
  selector: 'app-sf-date',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfDateComponent), multi: true }],
  template: `
    <input class="sf-input tabular-nums" [type]="type" [id]="inputId" [value]="native" [disabled]="disabled" [readOnly]="readonly"
      [attr.min]="min" [attr.max]="max" (input)="update($any($event.target).value || null)" (blur)="touch()" />
  `,
  styles: [SF_STYLES],
})
export class SfDateComponent extends SfControl<string> {
  @Input() type: 'date' | 'datetime-local' | 'time' | 'month' = 'date';
  @Input() min: string | null = null;
  @Input() max: string | null = null;

  get native(): string {
    if (!this.value) return '';
    return this.value.slice(0, { date: 10, 'datetime-local': 16, month: 7, time: 5 }[this.type]);
  }
}
