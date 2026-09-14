import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES, SfOption } from './sf.model';

/** Native select for short, fixed lists. Use app-sf-combobox when the list is long or searchable. */
@Component({
  selector: 'app-sf-select',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfSelectComponent), multi: true }],
  template: `
    <div class="relative">
      <select #sel class="sf-input appearance-none !pr-8" [id]="inputId" [disabled]="disabled || readonly"
        [ngClass]="selectedIndex < 0 ? 'text-gray-400 dark:text-gray-500' : ''" (change)="onSelect(sel.selectedIndex)" (blur)="touch()">
        <option value="" [selected]="selectedIndex < 0">{{ placeholder || 'Select…' }}</option>
        <option *ngFor="let o of options; let i = index" class="text-gray-900 dark:text-gray-100" [selected]="i === selectedIndex" [disabled]="o.disabled">{{ o.label }}</option>
      </select>
      <svg class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfSelectComponent extends SfControl {
  @Input() options: SfOption[] = [];

  get selectedIndex(): number {
    return this.options.findIndex((o) => o.value === this.value);
  }

  onSelect(index: number): void {
    this.update(index <= 0 ? null : this.options[index - 1].value);
  }
}
