import { Component, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailTone, toneClasses } from './detail-tone';

/**
 * Status pill. Callers pass a label and a semantic tone — never classes.
 *
 *   <app-detail-badge [label]="row.status" [tone]="statusTone[row.status]" dot></app-detail-badge>
 */
@Component({
  selector: 'app-detail-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span *ngIf="label; else empty" class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset"
      [ngClass]="classes.chip">
      <span *ngIf="dot" class="h-1.5 w-1.5 rounded-full" [ngClass]="classes.dot"></span>
      {{ label }}
    </span>
    <ng-template #empty><span class="text-gray-400 dark:text-gray-600">—</span></ng-template>
  `,
  styles: [':host{display:inline-flex;min-width:0}'],
})
export class DetailBadgeComponent {
  @Input() label = '';
  @Input() tone: DetailTone = 'neutral';
  /** Adds a filled dot before the label, for verdict-style badges. */
  @Input({ transform: booleanAttribute }) dot = false;

  get classes() {
    return toneClasses(this.tone);
  }
}
