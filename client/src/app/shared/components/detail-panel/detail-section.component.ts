import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Titled group inside a detail panel tab. Put <app-detail-field> rows (or anything) inside;
 * `columns="2"` lays stacked fields out in a two-column grid.
 *
 *   <app-detail-section title="General" columns="2">
 *     <button sectionActions>Edit</button>
 *     <app-detail-field label="Customer" stacked>...</app-detail-field>
 *   </app-detail-section>
 */
@Component({
  selector: 'app-detail-section',
  // A `title` input must not leak onto the host as a native browser tooltip.
  host: { '[attr.title]': 'null' },
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="title" class="flex items-center justify-between gap-3 mb-2">
      <h3 class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ title }}</h3>
      <div class="flex items-center gap-2"><ng-content select="[sectionActions]"></ng-content></div>
    </div>
    <div [ngClass]="columns === '2' ? 'grid grid-cols-2 gap-x-6 gap-y-4' : ''"><ng-content></ng-content></div>
  `,
  styles: [`
    :host { display: block; }
    :host + :host { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid #f3f4f6; }
  `],
})
export class DetailSectionComponent {
  @Input() title = '';
  @Input() columns: '1' | '2' = '1';
}
