import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailTone } from './detail-tone';
import { DetailBadgeComponent } from './detail-badge.component';

/**
 * The verdict card that opens a report tab: a toned badge, a sentence of plain English, and an
 * optional action cluster on the right.
 *
 *   <app-detail-callout [tone]="rep.headline.tone" [label]="rep.headline.label" [summary]="rep.headline.summary">
 *     <app-dp-icon-button calloutActions icon="download" label="Download PDF" (click)="..."></app-dp-icon-button>
 *   </app-detail-callout>
 */
@Component({
  selector: 'app-detail-callout',
  standalone: true,
  imports: [CommonModule, DetailBadgeComponent],
  template: `
    <div class="min-w-0 flex-1">
      <app-detail-badge [label]="label" [tone]="tone" dot></app-detail-badge>
      <p *ngIf="summary" class="mt-2 text-[13px] leading-relaxed text-gray-700 dark:text-gray-200">{{ summary }}</p>
      <ng-content></ng-content>
    </div>
    <div class="flex items-center gap-1"><ng-content select="[calloutActions]"></ng-content></div>
  `,
  styles: [`
    :host { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 1.5rem;
      padding: 0.875rem 1rem; border: 1px solid #e5e7eb; border-radius: 0.75rem; background: #fff; }
    :host-context(html.dark) { background: #1a1a1a; border-color: #262626; }
  `],
})
export class DetailCalloutComponent {
  @Input() label = '';
  @Input() summary = '';
  @Input() tone: DetailTone = 'neutral';
}
