import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES, SfOption } from './sf.model';

@Component({
  selector: 'app-sf-checkbox-group',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfCheckboxGroupComponent), multi: true }],
  template: `
    <div role="group" class="grid gap-x-4 gap-y-2" [ngClass]="columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'">
      <label *ngFor="let o of options; let i = index" class="inline-flex cursor-pointer select-none items-start gap-2.5" [attr.for]="inputId + '-' + i">
        <input type="checkbox" class="sf-check" [id]="inputId + '-' + i" [checked]="values.includes(o.value)"
          [disabled]="disabled || readonly || o.disabled" (change)="toggle(o.value)" (blur)="touch()" />
        <span class="text-[13px] leading-5 text-gray-800 dark:text-gray-200">
          {{ o.label }}<span *ngIf="o.description" class="block text-xs text-gray-500 dark:text-gray-500">{{ o.description }}</span>
        </span>
      </label>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfCheckboxGroupComponent extends SfControl<any[]> {
  @Input() options: SfOption[] = [];
  @Input() columns: 1 | 2 | 3 = 1;

  get values(): any[] {
    return this.value ?? [];
  }

  toggle(v: any): void {
    this.update(this.values.includes(v) ? this.values.filter((x) => x !== v) : [...this.values, v]);
  }
}
