import { Component, HostListener, Inject, Input, LOCALE_ID, booleanAttribute } from '@angular/core';
import { CommonModule, formatNumber } from '@angular/common';
import { DetailFootRow, DetailSummaryRow, DetailTableColumn } from './detail-panel.model';
import { DetailBadgeComponent } from './detail-badge.component';
import { DetailTone } from './detail-tone';
import { MatTooltipModule } from '@angular/material/tooltip';

/** One rendered line of the table: a group heading, a data row, or a per-group subtotal. */
interface DetailTableLine {
  kind: 'group' | 'data' | 'subtotal';
  row: Record<string, any>;
  /** 1-based position within the group, for the `numbered` column. */
  index: number;
  stripe: boolean;
  /** kind 'subtotal' only: the summed value per column key. */
  sums?: Record<string, number>;
  /** kind 'data' only: the row is outside the grand total, so it reads as muted. */
  excluded?: boolean;
  /** kind 'group' only: how many data rows the group holds, for the band's count chip. */
  groupCount?: number;
}

/**
 * Compact read-only table for line items inside a detail panel tab. Scrolls horizontally when the panel is narrow.
 *
 *   <app-detail-table title="Items" [columns]="cols" [rows]="row.items" showTotals numbered groupTotals></app-detail-table>
 */
@Component({
  selector: 'app-detail-table',
  standalone: true,
  imports: [CommonModule, DetailBadgeComponent, MatTooltipModule],
  template: `
    <p *ngIf="title" class="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {{ title }} <span class="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ count }}</span>
    </p>
    <div class="overflow-x-auto rounded-xl border border-gray-200 shadow-sm ring-1 ring-black/[0.02] dark:border-erp-border-dark dark:ring-white/[0.03]">
      <table class="w-full border-collapse" [ngClass]="large ? 'text-[13.5px]' : 'text-[13px]'">
        <colgroup>
          <col *ngIf="numbered" style="width:3rem" />
          <col *ngFor="let c of columns" [style.width]="c.width || null" />
        </colgroup>
        <thead class="sticky top-0 z-10 bg-gray-50/95 backdrop-blur dark:bg-erp-surface-dark-alt/95">
          <tr>
            <th *ngIf="numbered" class="w-12 border-b border-gray-200 px-3 py-2.5 text-right text-xs font-medium text-gray-400 dark:border-erp-border-dark dark:text-gray-500">#</th>
            <!-- the first column soaks up the spare width, so every other column is exactly as wide as its content -->
            <th *ngFor="let c of columns; let first = first" [class.text-right]="isRight(c)" [class.w-full]="first && !c.width && !spread"
              class="whitespace-nowrap border-b border-gray-200 px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:border-erp-border-dark dark:text-gray-400">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-erp-surface-dark">
          <ng-container *ngFor="let line of lines">
            <!-- a row with _group set spans every column as a sub-heading: { _group: true, label, badge?, note? } -->
            <tr *ngIf="line.kind === 'group' && groupStyle !== 'band'" class="border-y border-gray-200 bg-gray-50/70 dark:border-erp-border-dark dark:bg-white/[0.04]">
              <td *ngIf="groupLead > 0" [attr.colspan]="groupLead"></td>
              <td [attr.colspan]="span - groupLead" [class.text-center]="centerGroups" class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                <span class="mr-2 inline-block h-3 w-[3px] shrink-0 -mb-[2px] rounded-full bg-gray-400 dark:bg-gray-500" *ngIf="!centerGroups"></span>
                {{ line.row['label'] }}
                <app-detail-badge *ngIf="line.row['badge']" class="ml-2 normal-case" [label]="line.row['badge']" tone="warn"></app-detail-badge>
                <span *ngIf="line.row['note']" class="ml-2 text-[11px] font-normal normal-case text-gray-500 dark:text-gray-400">{{ line.row['note'] }}</span>
              </td>
            </tr>

            <!-- band heading: the group name, an item-count chip and the group's own total on one tinted bar -->
            <tr *ngIf="line.kind === 'group' && groupStyle === 'band'" class="border-y border-violet-100 bg-violet-50/60 dark:border-white/10 dark:bg-white/[0.05]">
              <td [attr.colspan]="span" class="px-3 py-2">
                <div class="relative flex items-center gap-2">
                  <div class="flex items-center gap-2" [class.mx-auto]="centerGroups">
                    <span class="inline-block h-3.5 w-[3px] shrink-0 rounded-full bg-violet-400 dark:bg-violet-500"></span>
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">{{ line.row['label'] }}</span>
                    <span *ngIf="line.groupCount" class="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
                      {{ line.groupCount }} {{ line.groupCount === 1 ? 'item' : 'items' }}
                    </span>
                    <app-detail-badge *ngIf="line.row['badge']" [label]="line.row['badge']" tone="warn"></app-detail-badge>
                    <span *ngIf="line.row['note']" class="text-[11px] text-gray-500 dark:text-gray-400">{{ line.row['note'] }}</span>
                  </div>
                  <span *ngIf="bandTotal(line) as bt" class="text-[12px] font-semibold tabular-nums text-gray-700 dark:text-gray-200"
                    [ngClass]="centerGroups ? 'absolute right-0' : 'ml-auto'">{{ bt }}</span>
                </div>
              </td>
            </tr>

            <tr *ngIf="line.kind === 'data'" [class.bg-gray-50]="line.stripe" [class.opacity-60]="line.excluded"
              [ngClass]="line.stripe ? 'dark:bg-white/[0.02]' : ''"
              class="border-b border-gray-100 transition-colors last:border-0 hover:bg-violet-50/60 dark:border-white/5 dark:hover:bg-white/[0.06]">
              <td *ngIf="numbered" class="px-3 py-2.5 text-right align-top text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{{ line.index }}</td>
              <td *ngFor="let c of columns" [class.text-right]="isRight(c)" [class.text-center]="c.align === 'center'" [class.tabular-nums]="isRight(c) || c.type === 'date'"
                [ngClass]="[c.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap', c.truncate ? 'max-w-0 truncate' : '', c.emphasis ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-100']"
                [matTooltip]="c.truncate ? line.row[c.key] : ''" matTooltipPosition="above" matTooltipClass="dt-tooltip"
                class="px-3 py-2.5 align-top">
                <ng-container [ngSwitch]="c.type">
                  <ng-container *ngSwitchCase="'currency'">{{ line.row[c.key] | number: '1.2-2' }}</ng-container>
                  <ng-container *ngSwitchCase="'number'">{{ line.row[c.key] | number }}</ng-container>
                  <ng-container *ngSwitchCase="'date'">{{ line.row[c.key] | date: 'dd MMM yyyy' }}</ng-container>
                  <app-detail-badge *ngSwitchCase="'badge'" [label]="line.row[c.key]" [tone]="badgeTone(c, line.row)"></app-detail-badge>
                  <div *ngSwitchCase="'html'" [innerHTML]="line.row[c.key]" [class.dt-clamp]="c.clamp"
                    [attr.title]="c.tooltipKey ? line.row[c.tooltipKey] : null"></div>
                  <ng-container *ngSwitchCase="'image'">
                    <button *ngIf="line.row[c.key] && c.imagePreview" type="button" (click)="openImage(line.row[c.key], line.row[c.key + 'Alt'])"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 transition-colors hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-erp-border-dark dark:text-gray-300 dark:hover:bg-violet-500/10"
                      title="View item image" aria-label="View item image">
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12s3.5-6 9.75-6 9.75 6 9.75 6-3.5 6-9.75 6-9.75-6-9.75-6Z" />
                        <circle cx="12" cy="12" r="2.75" />
                      </svg>
                    </button>
                    <span *ngIf="!line.row[c.key]" class="text-gray-400">—</span>
                  </ng-container>
                  <ng-container *ngSwitchCase="'stack'">
                    <div [class.truncate]="c.truncate" class="font-medium text-gray-900 dark:text-white">{{ line.row[c.key] ?? '—' }}</div>
                    <div *ngIf="c.subKey && line.row[c.subKey]" [class.dt-clamp]="c.clamp"
                      class="mt-0.5 text-[12px] leading-snug text-gray-500 dark:text-gray-400">{{ line.row[c.subKey] }}</div>
                  </ng-container>
                  <ng-container *ngSwitchDefault>{{ line.row[c.key] ?? '—' }}</ng-container>
                </ng-container>
              </td>
            </tr>

            <!-- per-group subtotal, so a long option still reads group by group -->
            <tr *ngIf="line.kind === 'subtotal' && groupStyle !== 'band'" class="border-b border-gray-200 bg-gray-50/40 text-[12px] dark:border-erp-border-dark dark:bg-white/[0.02]">
              <td *ngIf="numbered"></td>
              <td *ngFor="let c of columns; let first = first" [class.text-right]="isRight(c)"
                class="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-500 dark:text-gray-400">
                <ng-container *ngIf="c.total">{{ line.sums![c.key] | number: (c.totalFormat || '1.0-0') }}</ng-container>
                <ng-container *ngIf="!c.total && first">Subtotal</ng-container>
              </td>
            </tr>
          </ng-container>

          <tr *ngIf="!count">
            <td [attr.colspan]="span" class="px-3 py-10 text-center">
              <svg class="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              <span class="text-gray-500 dark:text-gray-400">{{ emptyMessage }}</span>
            </td>
          </tr>
        </tbody>
        <!-- footer lines whose figures line up under their own columns -->
        <tfoot *ngIf="footRows.length && count" class="bg-gray-100 dark:bg-white/[0.06]">
          <tr *ngFor="let f of footRows; let first = first" [class.font-bold]="f.emphasis" [class.font-medium]="!f.emphasis">
            <td *ngIf="numbered" [class.border-t-2]="first" class="border-gray-300 dark:border-erp-border-dark"></td>
            <td *ngFor="let c of columns; let i = index" [class.text-right]="isRight(c)" [class.border-t-2]="first"
              class="whitespace-nowrap border-gray-300 px-3 py-2 tabular-nums text-gray-900 dark:border-erp-border-dark dark:text-gray-100">
              <ng-container *ngIf="i === 0">{{ f.label }}</ng-container>
              <ng-container *ngIf="f.cells[c.key] as cell">{{ footValue(cell) }}</ng-container>
            </td>
          </tr>
        </tfoot>
        <tfoot *ngIf="showTotals && count && !summary.length && !footRows.length" class="bg-gray-100 font-semibold dark:bg-white/[0.06]">
          <tr>
            <td *ngIf="numbered" class="border-t-2 border-gray-300 dark:border-erp-border-dark"></td>
            <td *ngFor="let c of columns; let first = first" [class.text-right]="isRight(c)"
              class="whitespace-nowrap border-t-2 border-gray-300 px-3 py-2.5 tabular-nums text-gray-900 dark:border-erp-border-dark dark:text-gray-100">
              <ng-container *ngIf="c.total; else label">
                {{ c.type === 'currency' ? ((sum(c) | number: (c.totalFormat || '1.2-2')) + ' ' + currency) : (sum(c) | number: (c.totalFormat || '1.0-3')) }}
              </ng-container>
              <ng-template #label>{{ c.totalLabel || (first ? 'Total' : '') }}</ng-template>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- totals as a right-aligned card instead of a footer row, so the figure people want is clear of the grid -->
    <div *ngIf="summary.length && count" class="mt-3 flex justify-end">
      <div class="w-full max-w-xs rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div *ngFor="let s of summary" class="flex items-baseline justify-between gap-4 py-1"
          [class.mt-1]="s.emphasis" [class.border-t]="s.emphasis" [class.border-gray-200]="s.emphasis" [class.pt-2]="s.emphasis"
          [ngClass]="s.emphasis ? 'dark:border-erp-border-dark' : ''">
          <div>
            <span [ngClass]="s.emphasis ? 'text-[13px] font-semibold text-gray-900 dark:text-white' : 'text-[12px] text-gray-500 dark:text-gray-400'">{{ s.label }}</span>
            <span *ngIf="s.note" class="ml-1 text-[11px] text-gray-400 dark:text-gray-500">{{ s.note }}</span>
          </div>
          <span class="tabular-nums" [ngClass]="s.emphasis ? 'text-base font-bold text-gray-900 dark:text-white' : 'text-[13px] font-medium text-gray-700 dark:text-gray-200'">{{ summaryValue(s) }}</span>
        </div>
      </div>
    </div>

    <div *ngIf="previewImageUrl" class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-6" (click)="closeImage()" role="dialog" aria-modal="true" aria-label="Item image preview">
      <div class="relative max-h-full max-w-5xl rounded-xl bg-white p-3 shadow-2xl dark:bg-erp-surface-dark" (click)="$event.stopPropagation()">
        <button type="button" (click)="closeImage()" class="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-2.5 py-1 text-lg leading-none text-white hover:bg-black" aria-label="Close image preview">&times;</button>
        <img [src]="previewImageUrl" [alt]="previewImageAlt" class="max-h-[82vh] max-w-[88vw] rounded-lg object-contain" />
        <p *ngIf="previewImageAlt" class="mt-2 max-w-[88vw] truncate px-1 text-center text-xs text-gray-500 dark:text-gray-400">{{ previewImageAlt }}</p>
      </div>
    </div>
  `,
  styles: [
    ':host{display:block}',
    '.dt-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  ],
})
export class DetailTableComponent {
  previewImageUrl = '';
  previewImageAlt = '';
  /** Roomier type for pages where the table is the main content. */
  @Input({ transform: booleanAttribute }) large = false;
  constructor(@Inject(LOCALE_ID) private locale: string) {}

  openImage(url: string, alt?: string): void {
    this.previewImageUrl = url;
    this.previewImageAlt = alt || 'Item image';
  }

  closeImage(): void {
    this.previewImageUrl = '';
    this.previewImageAlt = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeImage();
  }

  @Input() title = '';
  private _columns: DetailTableColumn[] = [];
  @Input() set columns(value: DetailTableColumn[]) {
    this._columns = value ?? [];
    this.build();
  }
  get columns(): DetailTableColumn[] {
    return this._columns;
  }

  private _rows: Record<string, any>[] = [];
  @Input() set rows(value: Record<string, any>[]) {
    this._rows = value ?? [];
    this.build();
  }
  get rows(): Record<string, any>[] {
    return this._rows;
  }

  @Input() currency = 'QAR';
  @Input() emptyMessage = 'No items.';
  @Input({ transform: booleanAttribute }) showTotals = false;
  /** Centers the `_group` sub-heading rows. */
  @Input({ transform: booleanAttribute }) centerGroups = false;
  /** Adds a leading '#' column numbering the data rows; the count restarts at each group. */
  @Input({ transform: booleanAttribute }) set numbered(value: boolean) {
    this._numbered = value;
    this.build();
  }
  get numbered(): boolean {
    return this._numbered;
  }
  private _numbered = false;
  /** Adds a subtotal line under each group, summing the same columns as the footer. */
  @Input({ transform: booleanAttribute }) set groupTotals(value: boolean) {
    this._groupTotals = value;
    this.build();
  }
  get groupTotals(): boolean {
    return this._groupTotals;
  }
  private _groupTotals = false;
  /** Leaves this many leading columns blank in `_group` rows, so the heading starts at the next column (e.g. 1 = start at Qty). */
  @Input() groupOffset = 0;
  /** Shares spare width across all columns instead of giving it to the first, so figures stay near their labels in a wide table. */
  @Input({ transform: booleanAttribute }) spread = false;
  /**
   * 'band' renders each `_group` row as a tinted bar carrying the name, an item-count chip and the group's
   * total, which replaces the separate subtotal line. Defaults to the plain heading row.
   */
  @Input() groupStyle: 'plain' | 'band' = 'plain';
  /** Replaces the footer totals row with a right-aligned summary card (subtotal, discount, VAT, grand total). */
  @Input() set summary(value: DetailSummaryRow[]) {
    this._summary = value ?? [];
  }
  get summary(): DetailSummaryRow[] {
    return this._summary;
  }
  private _summary: DetailSummaryRow[] = [];
  /** Totals / profit lines rendered in the table footer, each figure under its own column. */
  @Input() footRows: DetailFootRow[] = [];

  /** Rendered lines: group headings, data rows and any subtotals, in display order. */
  lines: DetailTableLine[] = [];
  /** Data rows only — what the header chip counts and what an empty table is judged on. */
  count = 0;

  /** Total column count, including the '#' column when numbering is on. */
  get span(): number {
    return this.columns.length + (this.numbered ? 1 : 0);
  }

  /** Blank leading cells before a group heading, shifted by the '#' column. */
  get groupLead(): number {
    if (this.centerGroups) return 0;
    return this.groupOffset + (this.numbered ? 1 : 0);
  }

  /**
   * Flattens `rows` into display lines once per input change: striping restarts at every group so the
   * banding stays even, and each group closes with a subtotal when `groupTotals` is on.
   */
  private build(): void {
    const lines: DetailTableLine[] = [];
    const totalCols = this._columns.filter((c) => c.total);
    let index = 0;
    let sums: Record<string, number> = {};
    let groupHasRows = false;
    let groupLine: DetailTableLine | null = null;

    const closeGroup = () => {
      // the band heading shows the group's count and total on its own bar, so it needs them attached here
      if (groupLine) {
        groupLine.groupCount = index;
        groupLine.sums = sums;
      }
      if (!this._groupTotals || !groupHasRows || !totalCols.length) return;
      lines.push({ kind: 'subtotal', row: {}, index: 0, stripe: false, sums });
    };

    for (const r of this._rows) {
      if (r['_group']) {
        closeGroup();
        groupLine = { kind: 'group', row: r, index: 0, stripe: false };
        lines.push(groupLine);
        index = 0;
        sums = {};
        groupHasRows = false;
        continue;
      }
      const excluded = !!r['_excludeFromTotal'];
      lines.push({ kind: 'data', row: r, index: ++index, stripe: index % 2 === 0, excluded });
      groupHasRows = true;
      if (!excluded) {
        for (const c of totalCols) sums[c.key] = (sums[c.key] || 0) + (Number(r[c.totalKey ?? c.key]) || 0);
      }
    }
    closeGroup();

    this.lines = lines;
    this.count = lines.reduce((n, l) => n + (l.kind === 'data' ? 1 : 0), 0);
  }

  /** Badge cells colour themselves from the column's `badgeTones` map; unmapped values fall back to neutral. */
  badgeTone(c: DetailTableColumn, r: Record<string, any>): DetailTone {
    return c.badgeTones?.[r[c.key]] ?? 'neutral';
  }

  isRight(c: DetailTableColumn): boolean {
    return c.align ? c.align === 'right' : c.type === 'number' || c.type === 'currency';
  }

  /** The group's own total for a band heading: the last summed column, formatted like the footer. */
  bandTotal(line: DetailTableLine): string {
    if (this.groupStyle !== 'band' || !line.sums) return '';
    const cols = this.columns.filter((c) => c.total);
    const c = cols[cols.length - 1];
    if (!c) return '';
    const value = line.sums[c.key];
    if (value == null) return '';
    return formatNumber(value, this.locale, c.totalFormat || '1.2-2') + (c.type === 'currency' ? ' ' + this.currency : '');
  }

  summaryValue(s: DetailSummaryRow): string {
    const n = Number(s.value);
    if (s.format === 'text' || s.format == null || Number.isNaN(n)) return String(s.value ?? '—');
    if (s.format === 'percent') return formatNumber(n, this.locale, '1.0-2') + '%';
    if (s.format === 'currency') return formatNumber(n, this.locale, '1.2-2') + ' ' + this.currency;
    return formatNumber(n, this.locale, '1.0-2');
  }

  footValue(cell: DetailFootRow['cells'][string]): string {
    return this.summaryValue({ label: '', value: cell.value, format: cell.format });
  }

  sum(c: DetailTableColumn): number {
    return this.rows.reduce((s, r) => (r['_group'] || r['_excludeFromTotal'] ? s : s + (Number(r[c.totalKey ?? c.key]) || 0)), 0);
  }
}
