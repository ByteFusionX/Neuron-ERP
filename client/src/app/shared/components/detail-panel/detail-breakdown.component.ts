import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailBreakdownRow } from './detail-panel.model';
import { DetailProgressComponent } from './detail-progress.component';

/**
 * A "how the total splits" list: label · meta on the left, a figure on the right, a share bar under both.
 *
 *   <app-detail-breakdown [rows]="rep.delivery"></app-detail-breakdown>
 */
@Component({
  selector: 'app-detail-breakdown',
  standalone: true,
  imports: [CommonModule, DetailProgressComponent],
  template: `
    <div *ngFor="let r of rows" class="py-1.5">
      <div class="flex items-baseline justify-between gap-3 text-[13px]">
        <span class="min-w-0 truncate text-gray-700 dark:text-gray-200">
          {{ r.label }}<span *ngIf="r.meta !== undefined && r.meta !== null" class="text-gray-400"> · {{ r.meta }}</span>
        </span>
        <span *ngIf="r.value !== undefined && r.value !== null"
          class="shrink-0 tabular-nums text-gray-600 dark:text-gray-300">{{ r.value }}</span>
      </div>
      <app-detail-progress *ngIf="r.share !== undefined && r.share !== null" class="mt-1"
        [value]="r.share" display="" [tone]="r.tone || 'active'"></app-detail-progress>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class DetailBreakdownComponent {
  @Input() rows: DetailBreakdownRow[] = [];
}
