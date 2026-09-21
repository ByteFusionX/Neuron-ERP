import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailTimelineEntry } from './detail-panel.model';
import { toneClasses } from './detail-tone';

/**
 * Activity feed: a ruled line with a dot per entry.
 *
 *   <app-detail-timeline [entries]="activityFor(row)"></app-detail-timeline>
 */
@Component({
  selector: 'app-detail-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ol class="relative ml-1 border-l border-gray-200 dark:border-erp-border-dark">
      <li *ngFor="let e of entries" class="relative pl-5 pb-5 last:pb-0">
        <span class="dpt-dot" [ngClass]="ring(e)"></span>
        <p class="text-[13px] text-gray-800 dark:text-gray-100">{{ e.text }}</p>
        <p *ngIf="e.meta" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ e.meta }}</p>
        <ul *ngIf="e.changes?.length" class="mt-2 space-y-1.5 rounded-md border border-gray-200 bg-gray-50 p-2.5 dark:border-erp-border-dark dark:bg-white/5">
          <li *ngFor="let c of e.changes" class="text-xs">
            <span class="font-medium text-gray-700 dark:text-gray-200">{{ c.label }}</span>
            <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span class="max-w-full break-words rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through dark:bg-red-500/10 dark:text-red-300">{{ c.from }}</span>
              <span class="text-gray-400">→</span>
              <span class="max-w-full break-words rounded bg-green-50 px-1.5 py-0.5 text-green-700 dark:bg-green-500/10 dark:text-green-300">{{ c.to }}</span>
            </div>
          </li>
        </ul>
      </li>
    </ol>
    <p *ngIf="!entries.length" class="text-[13px] text-gray-500 dark:text-gray-400">{{ emptyMessage }}</p>
  `,
  styles: [`
    :host { display: block; }
    .dpt-dot { position: absolute; left: -5px; top: 0.375rem; height: 0.625rem; width: 0.625rem;
      border-radius: 9999px; background: #fff; box-shadow: 0 0 0 2px currentColor; }
    :host-context(html.dark) .dpt-dot { background: #171717; }
  `],
})
export class DetailTimelineComponent {
  @Input() entries: DetailTimelineEntry[] = [];
  @Input() emptyMessage = 'No activity yet.';

  /** The dot's ring colour: the tone's text colour, since the ring is drawn from `currentColor`. */
  ring(e: DetailTimelineEntry): string {
    return e.tone ? toneClasses(e.tone).text : 'text-violet-500';
  }
}
