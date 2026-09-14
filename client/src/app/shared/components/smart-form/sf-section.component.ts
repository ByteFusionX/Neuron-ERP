import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sf-section',
  // A `title` input must not leak onto the host as a native browser tooltip.
  host: { '[attr.title]': 'null' },
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="title" class="mb-3">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ title }}</h3>
      <p *ngIf="description" class="mt-0.5 text-xs text-gray-500 dark:text-gray-500">{{ description }}</p>
    </div>
    <div class="grid gap-4" [ngClass]="gridClass"><ng-content></ng-content></div>
  `,
  styles: [`
    :host { display: block; padding: 1.25rem 0; border-bottom: 1px solid #f3f4f6; }
    :host(:first-of-type) { padding-top: 0; }
    :host(:last-of-type) { border-bottom: 0; }
    :host-context(html.dark) { border-bottom-color: #262626; }
  `],
})
export class SfSectionComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() columns: 1 | 2 | 3 | '1' | '2' | '3' = 1;

  get gridClass(): string {
    return { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3' }[+this.columns as 1 | 2 | 3];
  }
}
