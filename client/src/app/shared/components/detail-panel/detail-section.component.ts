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
      <h3 class="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{{ title }}</h3>
      <div class="flex items-center gap-2"><ng-content select="[sectionActions]"></ng-content></div>
    </div>
    <div [ngClass]="columns === '2' ? 'grid grid-cols-2 gap-x-6 gap-y-4' : ''"><ng-content></ng-content></div>
  `,
  styles: [`
    :host { display: block; --dp-rule: #d1d5db; }
    :host-context(html.dark) { --dp-rule: #3f3f46; }
    /* Full-bleed rule: cancel the tab body's horizontal padding so the line spans the panel. */
    :host + :host { margin: 1.5rem calc(var(--dp-pad, 1.25rem) * -1) 0; padding: 1.5rem var(--dp-pad, 1.25rem) 0;
      border-top: 1px solid var(--dp-rule); }
  `],
})
export class DetailSectionComponent {
  @Input() title = '';
  @Input() columns: '1' | '2' = '1';
}
