import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailMilestone } from './detail-panel.model';

/**
 * Plan strip: one card per milestone, filled dot once done.
 *
 *   <app-detail-milestones [milestones]="milestones"></app-detail-milestones>
 */
@Component({
  selector: 'app-detail-milestones',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ol class="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
      <li *ngFor="let m of milestones" class="rounded-lg px-3 py-2 text-[13px] bg-gray-50 dark:bg-gray-800/40">
        <div class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" [ngClass]="m.done ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'"></span>
          <span [ngClass]="m.done ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">{{ m.label }}</span>
        </div>
        <p class="mt-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">{{ m.date | date: 'dd MMM yyyy' }}</p>
      </li>
    </ol>
    <p *ngIf="!milestones.length" class="text-[13px] text-gray-500 dark:text-gray-400">{{ emptyMessage }}</p>
  `,
  styles: [':host{display:block}'],
})
export class DetailMilestonesComponent {
  @Input() milestones: DetailMilestone[] = [];
  @Input() emptyMessage = 'No milestones planned.';
}
