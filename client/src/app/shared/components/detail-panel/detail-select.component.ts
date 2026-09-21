import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

let nextId = 0;

/**
 * Labelled native select for a tab toolbar (currency, location, period…).
 *
 *   <app-detail-select label="Currency" [options]="currencies" [value]="currency" (valueChange)="setCurrency($event)"></app-detail-select>
 */
@Component({
  selector: 'app-detail-select',
  standalone: true,
  imports: [CommonModule],
  template: `
    <label *ngIf="label" class="text-xs text-gray-500 dark:text-gray-400" [attr.for]="id">{{ label }}</label>
    <select [id]="id" class="dps-select" (change)="valueChange.emit($any($event.target).value)">
      <option *ngFor="let o of options" [value]="o" [selected]="o === value">{{ o }}</option>
    </select>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 0.5rem; }
    .dps-select { height: 2rem; border-radius: 0.5rem; border: 1px solid #e5e7eb; padding: 0 0.625rem;
      font-size: 0.8125rem; color: #111827; background: #fff; }
    .dps-select:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15); }
    :host-context(html.dark) .dps-select { border-color: #2e2e2e; background: #141414; color: #ededed; }
  `],
})
export class DetailSelectComponent {
  @Input() label = '';
  @Input() options: string[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  readonly id = `dps-${nextId++}`;
}
