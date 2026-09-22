import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgClass, NgIf } from '@angular/common';

/** How a metric moved against a comparison period. */
export interface KpiDelta {
  text: string;
  tone: 'up' | 'down' | 'flat';
}

/**
 * A single headline metric: label, big value with an optional unit, a small footnote and an
 * optional change-vs-previous indicator. The footnote can be replaced with projected content.
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [NgIf, NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.css'],
})
export class KpiCardComponent {
  @Input({ required: true }) label = '';
  @Input() value: string | number | null = '';
  @Input() unit = '';
  /** Extra classes for the value, e.g. a tone colour. */
  @Input() valueClass = '';
  @Input() foot = '';
  @Input() delta: KpiDelta | null = null;
  @Input() deltaNote = 'vs previous period';
  @Input() deltaTitle = 'Compared with the previous period of the same length';
}
