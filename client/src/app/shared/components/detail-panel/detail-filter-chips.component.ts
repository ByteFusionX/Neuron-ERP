import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Single-select pill filter, e.g. a transaction-type filter above a table.
 *
 *   <app-detail-filter-chips [options]="types" [value]="type" (valueChange)="setType($event)"></app-detail-filter-chips>
 */
@Component({
  selector: 'app-detail-filter-chips',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-wrap gap-1.5" role="group">
      <button *ngFor="let o of options" type="button" (click)="valueChange.emit(o)" [attr.aria-pressed]="o === value"
        class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
        [ngClass]="o === value ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'">{{ o }}</button>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class DetailFilterChipsComponent {
  @Input() options: string[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
}
