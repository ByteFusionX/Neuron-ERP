import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailMixSegment } from './detail-panel.model';
import { toneClasses } from './detail-tone';

/**
 * The shape of a set as one segmented bar plus a legend — "of 40 projects, 6 are at risk".
 *
 *   <app-detail-bar-mix [segments]="pf.mix"></app-detail-bar-mix>
 */
@Component({
  selector: 'app-detail-bar-mix',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex h-2 gap-0.5 overflow-hidden rounded-full">
      <span *ngFor="let s of segments" class="h-full first:rounded-l-full last:rounded-r-full"
        [ngClass]="bar(s)" [style.width.%]="s.share" [attr.title]="s.label + (s.count !== undefined ? ': ' + s.count : '')"></span>
    </div>
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      <span *ngFor="let s of segments" class="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
        <span class="h-1.5 w-1.5 rounded-full" [ngClass]="dot(s)"></span>
        {{ s.label }} <span *ngIf="s.count !== undefined" class="tabular-nums font-medium">{{ s.count }}</span>
      </span>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class DetailBarMixComponent {
  @Input() segments: DetailMixSegment[] = [];

  bar(s: DetailMixSegment): string {
    return toneClasses(s.tone).bar;
  }

  dot(s: DetailMixSegment): string {
    return toneClasses(s.tone).dot;
  }
}
