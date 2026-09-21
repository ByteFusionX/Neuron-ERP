import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { DetailMetaItem } from './detail-panel.model';
import { toneClasses } from './detail-tone';

/**
 * The key-facts strip under the panel header. Projected into <app-detail-panel>'s `[panelMeta]` slot,
 * whose `.dp-meta` grid owns the border and column sizing — so this host is `display: contents`
 * and each cell becomes a direct grid child.
 *
 *   <ng-template #detailMetaTemplate let-row>
 *     <app-detail-meta panelMeta [items]="metaFor(row)"></app-detail-meta>
 *   </ng-template>
 */
@Component({
  selector: 'app-detail-meta',
  standalone: true,
  imports: [CommonModule],
  providers: [CurrencyPipe, DatePipe],
  template: `
    <div class="dpm" *ngFor="let item of items">
      <p class="dpm-label">{{ item.label }}</p>
      <p class="dpm-value" [ngClass]="item.tone ? tone(item.tone) : ''">{{ format(item) }}</p>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .dpm { padding: 0.625rem 0.75rem; min-width: 0; }
    .dpm + .dpm { border-left: 1px solid #d1d5db; }
    .dpm-label { font-size: 0.6875rem; color: #6b7280; }
    .dpm-value { margin-top: 0.125rem; font-size: 0.8125rem; font-weight: 500; color: #111827;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
    :host-context(html.dark) .dpm + .dpm { border-left-color: #3f3f46; }
    :host-context(html.dark) .dpm-label { color: #a1a1a1; }
    :host-context(html.dark) .dpm-value { color: #ededed; }
  `],
})
export class DetailMetaComponent {
  @Input() items: DetailMetaItem[] = [];
  /** Currency code used by items with `format: 'currency'`. */
  @Input() currency = 'QAR';

  constructor(private readonly currencyPipe: CurrencyPipe, private readonly datePipe: DatePipe) {}

  tone(t: NonNullable<DetailMetaItem['tone']>): string {
    return toneClasses(t).text;
  }

  format(item: DetailMetaItem): string {
    const v = item.value;
    if (v === null || v === undefined || v === '') return '—';
    switch (item.format) {
      case 'currency':
        return this.currencyPipe.transform(v as number, this.currency, 'symbol-narrow', '1.0-0') ?? '—';
      case 'date':
        return this.datePipe.transform(v as string, 'dd MMM yyyy') ?? '—';
      case 'percent':
        return `${v}%`;
      default:
        return String(v);
    }
  }
}
