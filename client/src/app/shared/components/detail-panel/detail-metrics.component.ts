import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailMetric } from './detail-panel.model';
import { DetailProgressComponent } from './detail-progress.component';
import { toneClasses } from './detail-tone';

/**
 * Grid of headline figures, each optionally with a track and a caption.
 *
 *   <app-detail-metrics [items]="rep.metrics"></app-detail-metrics>
 */
@Component({
  selector: 'app-detail-metrics',
  standalone: true,
  imports: [CommonModule, DetailProgressComponent],
  template: `
    <div [ngClass]="columns === '2' ? 'grid grid-cols-2 gap-x-6 gap-y-5' : 'space-y-5'">
      <div *ngFor="let m of items">
        <p class="text-[11px] text-gray-500 dark:text-gray-400">{{ m.label }}</p>
        <p class="mt-0.5 text-lg font-semibold tabular-nums leading-tight" [ngClass]="text(m)">{{ m.value }}</p>
        <app-detail-progress *ngIf="m.bar !== undefined" class="mt-1.5" [value]="m.bar" display=""
          [tone]="m.tone || 'neutral'" [marker]="m.marker ?? null"
          [markerLabel]="m.marker !== undefined ? 'Planned ' + m.marker + '%' : null"
          [caption]="m.caption || ''"></app-detail-progress>
        <p *ngIf="m.bar === undefined && m.caption" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ m.caption }}</p>
      </div>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class DetailMetricsComponent {
  @Input() items: DetailMetric[] = [];
  @Input() columns: '1' | '2' = '2';

  text(m: DetailMetric): string {
    return m.tone ? toneClasses(m.tone).text : 'text-gray-900 dark:text-gray-100';
  }
}
