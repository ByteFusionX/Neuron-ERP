import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailTone, toneClasses } from './detail-tone';

/**
 * A labelled meter: caption row, track, optional planned marker and footnote. Replaces the
 * hand-rolled `h-1.5 rounded-full bg-gray-100` bars that every module was re-writing.
 *
 *   <app-detail-progress label="Budget used" [value]="82" [tone]="'good'"></app-detail-progress>
 *   <app-detail-progress [value]="64" [marker]="80" display="QAR 1.2M" caption="of QAR 1.9M"></app-detail-progress>
 *
 * `value` is a percentage unless `max` is given. It is clamped to the track; `display` keeps the
 * true figure visible when the value overflows 100%.
 */
@Component({
  selector: 'app-detail-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="label || displayText" class="flex items-baseline justify-between gap-3 text-[13px] mb-1.5">
      <span class="min-w-0 truncate text-gray-500 dark:text-gray-400">{{ label }}</span>
      <span *ngIf="displayText" class="font-medium tabular-nums shrink-0" [ngClass]="classes.text">{{ displayText }}</span>
    </div>
    <div class="relative h-1.5 rounded-full bg-gray-100 dark:bg-erp-surface-dark-alt overflow-hidden">
      <div class="h-full rounded-full" [ngClass]="classes.bar" [style.width.%]="percent"></div>
      <span *ngIf="marker !== null && marker !== undefined" class="absolute top-0 h-full w-px bg-gray-500/70"
        [style.left.%]="clamp(marker)" [attr.title]="markerLabel"></span>
    </div>
    <p *ngIf="caption" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ caption }}</p>
  `,
  styles: [':host{display:block}'],
})
export class DetailProgressComponent {
  @Input() label = '';
  @Input() value = 0;
  /** When set, `value` is read against this instead of being a 0-100 percentage. */
  @Input() max: number | null = null;
  /** Text on the right of the label row. Defaults to the rounded percentage; pass '' to hide it. */
  @Input() display: string | null = null;
  @Input() tone: DetailTone = 'active';
  /** Percentage position of the "planned" tick on the track. */
  @Input() marker: number | null = null;
  @Input() markerLabel: string | null = null;
  @Input() caption = '';

  get classes() {
    return toneClasses(this.tone);
  }

  get displayText(): string {
    return this.display === null || this.display === undefined ? `${Math.round(this.ratio)}%` : this.display;
  }

  /** Raw percentage the value represents, before clamping — may exceed 100. */
  get ratio(): number {
    if (this.max === null || this.max === undefined) return this.value;
    return this.max === 0 ? 0 : (this.value / this.max) * 100;
  }

  get percent(): number {
    return this.clamp(this.ratio);
  }

  clamp(n: number): number {
    return Math.max(0, Math.min(100, n));
  }
}
