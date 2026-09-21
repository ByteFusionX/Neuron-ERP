import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailClause } from './detail-panel.model';

const CLAMP_LENGTH = 220;

/**
 * Numbered list of terms & conditions clauses for a detail view tab. Long clauses collapse
 * to a few lines with a "Show more" toggle, so the whole list stays scannable.
 *
 *   <app-detail-clause-list [clauses]="clauses"></app-detail-clause-list>
 */
@Component({
  selector: 'app-detail-clause-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ol *ngIf="clauses.length; else empty" class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-erp-border-dark dark:border-erp-border-dark">
      <li *ngFor="let c of clauses; let i = index; trackBy: trackById" class="flex gap-3 bg-white px-3 py-3 dark:bg-erp-surface-dark">
        <span class="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-full bg-gray-100 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-[13px] font-medium text-gray-900 dark:text-gray-100">{{ c.title }}</p>
            <span *ngIf="c.tag" class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ c.tag }}</span>
          </div>
          <p class="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gray-600 dark:text-gray-400" [class.line-clamp-3]="isLong(c) && !expanded.has(c.id)">{{ c.body }}</p>
          <button *ngIf="isLong(c)" type="button" (click)="toggle(c.id)" [attr.aria-expanded]="expanded.has(c.id)"
            class="mt-1 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400">
            {{ expanded.has(c.id) ? 'Show less' : 'Show more' }}
          </button>
        </div>
      </li>
    </ol>

    <ng-template #empty>
      <div class="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-erp-border-dark">
        <p class="text-[13px] text-gray-500 dark:text-gray-400">{{ emptyMessage }}</p>
      </div>
    </ng-template>
  `,
  styles: [':host{display:block}'],
})
export class DetailClauseListComponent {
  @Input() clauses: DetailClause[] = [];
  @Input() emptyMessage = 'No terms & conditions added yet.';

  expanded = new Set<string>();

  isLong(c: DetailClause): boolean {
    return c.body.length > CLAMP_LENGTH;
  }

  toggle(id: string): void {
    const next = new Set(this.expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    this.expanded = next;
  }

  trackById = (_: number, c: DetailClause) => c.id;
}
