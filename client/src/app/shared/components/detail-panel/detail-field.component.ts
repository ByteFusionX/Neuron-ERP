import { Component, HostBinding, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailPanelIconComponent } from './detail-panel-icon.component';
import { DetailTone, toneClasses } from './detail-tone';

/**
 * Label + value for detail panel bodies. Value is projected content ('—' when empty is up to the caller).
 * Default is an inline row (icon + label column, value); `stacked` puts the label above the value
 * for use in two-column grids.
 */
@Component({
  selector: 'app-detail-field',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  template: `
    <div class="dpf-label flex items-center gap-2 text-gray-500 dark:text-gray-500">
      <app-dp-icon *ngIf="icon" [name]="icon" size="w-3.5 h-3.5" class="text-gray-400 dark:text-gray-500"></app-dp-icon>
      <span class="truncate">{{ label }}</span>
    </div>
    <div class="min-w-0 flex-1 break-words" [class.tabular-nums]="numeric"
      [ngClass]="tone ? toneClass + ' font-medium' : 'text-gray-900 dark:text-gray-100'"><ng-content></ng-content></div>
  `,
  styles: [`
    :host { display: flex; align-items: center; gap: 0.75rem; min-height: 2.25rem; padding: 0.375rem 0.625rem;
      margin: 0 -0.625rem; border-radius: 0.5rem; font-size: 0.8125rem; transition: background-color 120ms ease; }
    :host(:not(.dpf-stacked)) .dpf-label { width: 8rem; flex-shrink: 0; }
    :host(.dpf-stacked) { flex-direction: column; align-items: stretch; gap: 0.125rem; min-height: 0;
      padding: 0; margin: 0; }
    :host(.dpf-stacked) .dpf-label { font-size: 0.75rem; }
  `],
})
export class DetailFieldComponent {
  @Input() label = '';
  @Input() icon = '';
  @HostBinding('class.dpf-stacked') @Input({ transform: booleanAttribute }) stacked = false;
  @HostBinding('class.dpf-no-hover') @Input({ transform: booleanAttribute }) noHover = false;
  /** Tabular figures, for ids and amounts. */
  @Input({ transform: booleanAttribute }) numeric = false;
  /** Highlights the value semantically instead of using the default text colour. */
  @Input() tone: DetailTone | null = null;

  get toneClass(): string {
    return toneClasses(this.tone).text;
  }
}
