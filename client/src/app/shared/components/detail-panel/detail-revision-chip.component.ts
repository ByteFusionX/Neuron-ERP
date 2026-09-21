import { Component, EventEmitter, Input, Output, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * "Rev 3" marker for a versioned record. Revision 0 is the original, so it reads as "Original"
 * unless `hideZero` drops the chip entirely. Give it a `(open)` handler to make it a button.
 *
 *   <app-detail-revision-chip [revision]="q.revision" (open)="onViewRevisions()"></app-detail-revision-chip>
 */
@Component({
  selector: 'app-detail-revision-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="revision !== null && revision !== undefined && !(hideZero && !revision)">
      <button
        *ngIf="open.observed; else plain"
        type="button"
        (click)="open.emit()"
        [attr.title]="title || 'View revision history'"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset transition-colors"
        [ngClass]="classes + ' hover:bg-violet-100 dark:hover:bg-violet-500/20'"
      >
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </button>

      <ng-template #plain>
        <span
          [attr.title]="title"
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset"
          [ngClass]="classes"
        >
          <ng-container *ngTemplateOutlet="body"></ng-container>
        </span>
      </ng-template>

      <ng-template #body>
        <span class="h-1.5 w-1.5 rounded-full bg-current opacity-60"></span>
        {{ revision ? 'Rev ' + revision : 'Original' }}
      </ng-template>
    </ng-container>
  `,
  styles: [':host{display:inline-flex;min-width:0}'],
})
export class DetailRevisionChipComponent {
  @Input() revision: number | null | undefined = null;
  /** Hide the chip on revision 0 rather than showing "Original". */
  @Input({ transform: booleanAttribute }) hideZero = false;
  /** Muted styling, for chips sitting inside a list row rather than a header. */
  @Input({ transform: booleanAttribute }) muted = false;
  @Input() title = '';

  /** Emitted on click. When nothing listens, the chip renders as static text. */
  @Output() open = new EventEmitter<void>();

  get classes(): string {
    return this.muted
      ? 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10'
      : 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20';
  }
}
