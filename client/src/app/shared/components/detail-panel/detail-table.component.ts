import { Component, ElementRef, HostListener, Inject, Input, LOCALE_ID, OnInit, booleanAttribute } from '@angular/core';
import { CommonModule, formatNumber } from '@angular/common';
import { DetailFootRow, DetailSummaryRow, DetailTableColumn } from './detail-panel.model';
import { DetailBadgeComponent } from './detail-badge.component';
import { DetailTone } from './detail-tone';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { SfInputComponent } from '../smart-form/sf-input.component';

/** One rendered line of the table: a group heading, a data row, or a per-group subtotal. */
interface DetailTableLine {
  kind: 'group' | 'data' | 'subtotal';
  row: Record<string, any>;
  /** Position in the rendered list; the search jumps to a line by this. */
  pos: number;
  /** 1-based position within the group, for the `numbered` column. */
  index: number;
  /** Which group the line belongs to (0-based); -1 for lines before the first group heading. */
  group?: number;
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
  imports: [CommonModule, FormsModule, DetailBadgeComponent, MatTooltipModule, SfInputComponent],
  template: `
    <p *ngIf="title" class="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {{ title }} <span class="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ count }}</span>
    </p>
    <div [ngClass]="bare ? 'bare-scroll min-h-0 flex-1 overflow-auto' : 'overflow-x-auto rounded-xl border border-gray-200 shadow-sm ring-1 ring-black/[0.02] dark:border-erp-border-dark dark:ring-white/[0.03]'">
      <table class="w-full border-collapse" [ngClass]="large ? 'text-[13.5px]' : 'text-[13px]'">
        <colgroup>
          <col *ngIf="numbered" style="width:3rem" />
          <col *ngFor="let c of columns" [style.width]="c.width || null" />
        </colgroup>
        <thead class="sticky top-0 z-10 backdrop-blur" [ngClass]="bare ? 'bg-white dark:bg-[#111111]' : 'bg-gray-50/95 dark:bg-erp-surface-dark-alt/95'">
          <tr>
            <th *ngIf="numbered" [class.h-11]="bare" [class.bare-head]="bare" class="w-12 border-b border-gray-200 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:border-erp-border-dark dark:text-gray-500">#</th>
            <!-- the first column soaks up the spare width, so every other column is exactly as wide as its content -->
            <th *ngFor="let c of columns; let first = first; let last = last" [class.h-11]="bare" [class.bare-head]="bare" [class.text-right]="isRight(c)" [class.text-center]="c.align === 'center'" [class.w-full]="first && !c.width && !spread"
              class="relative whitespace-nowrap border-b border-gray-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:border-erp-border-dark dark:text-gray-400">
              <div *ngIf="searchKey && c.key === searchKey; else plainLabel" class="flex items-center justify-between gap-3">
                <span>{{ c.label }}</span>
                <app-sf-input type="search" clearable class="block w-72 font-normal normal-case tracking-normal"
                  [ngModel]="query" (ngModelChange)="onSearch($event ?? '')" [ngModelOptions]="{ standalone: true }"
                  [suffix]="query ? (matches.length ? (matchPos + 1) + ' of ' + matches.length + (matches.length === 1 ? ' item' : ' items') : 'No items') : ''"
                  (keydown.enter)="$event.preventDefault(); step($any($event).shiftKey ? -1 : 1)"
                  (keydown.arrowdown)="$event.preventDefault(); step(1)"
                  (keydown.arrowup)="$event.preventDefault(); step(-1)"
                  placeholder="Search item or category"></app-sf-input>
              </div>
              <ng-template #plainLabel>{{ c.label }}</ng-template><button *ngIf="tools && last" type="button" (click)="openColMenu($event)" class="dt-dots absolute right-2 top-1/2 -translate-y-1/2" title="Show or hide columns" aria-label="Show or hide columns" aria-haspopup="true" [attr.aria-expanded]="colMenuOpen">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
              </button></th>
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
            <!-- a one-item group repeats its line's figures, so the count chip and total only show for two or more -->
            <tr *ngIf="line.kind === 'group' && groupStyle === 'band'" [attr.data-line]="line.pos" [class.dt-hit]="activeLine === line.pos" class="border-t border-gray-200 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03]">
              <td *ngIf="numbered && !centerGroups" class="px-3 py-1.5"></td>
              <td [attr.colspan]="centerGroups ? span : span - (numbered ? 1 : 0)" class="px-3 py-1.5">
                <div class="relative flex items-center gap-2">
                  <div class="flex min-w-0 items-center gap-2" [class.mx-auto]="centerGroups">
                    <span class="inline-block h-3 w-[3px] shrink-0 rounded-full bg-violet-400 dark:bg-violet-500"></span>
                    <span class="truncate text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">{{ line.row['label'] }}</span>
                    <span *ngIf="(line.groupCount ?? 0) > 1" class="rounded-full bg-gray-200/70 px-1.5 py-px text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      {{ line.groupCount }} items
                    </span>
                    <app-detail-badge *ngIf="line.row['badge']" [label]="line.row['badge']" tone="warn"></app-detail-badge>
                    <span *ngIf="line.row['note']" class="truncate text-[11px] text-gray-500 dark:text-gray-400">{{ line.row['note'] }}</span>
                  </div>
                  <span *ngIf="(line.groupCount ?? 0) > 1 && bandTotal(line) as bt" class="text-[12px] font-semibold tabular-nums text-gray-600 dark:text-gray-300"
                    [ngClass]="centerGroups ? 'absolute right-0' : 'ml-auto'">{{ bt }}</span>
                </div>
              </td>
            </tr>

            <tr *ngIf="line.kind === 'data'" [attr.data-line]="line.pos" [class.dt-hit]="activeLine === line.pos" [class.bg-gray-50]="line.stripe" [class.opacity-60]="line.excluded"
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
                  <textarea *ngSwitchCase="'textarea'" readonly rows="1" [value]="line.row[c.key] || ''"
                    (focus)="expandTextarea($event)" (blur)="collapseTextarea($event)"
                    class="min-h-[2.25rem] w-full min-w-52 resize-none rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-[12px] leading-5 text-gray-700 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-500/10 dark:border-erp-border-dark dark:bg-white/[0.04] dark:text-gray-200 dark:focus:border-violet-500 dark:focus:bg-erp-surface-dark"></textarea>
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
        <tfoot *ngIf="footRows.length && count" [ngClass]="bare ? 'bg-white dark:bg-[#111111]' : 'bg-gray-50/95 dark:bg-erp-surface-dark-alt/95'">
          <tr *ngFor="let f of footRows; let first = first">
            <td *ngIf="numbered" [class.h-11]="bare" [class.bare-foot]="bare && first" [class.border-t]="!bare && first" class="border-gray-200 dark:border-erp-border-dark"></td>
            <td *ngFor="let c of columns; let i = index" [class.h-11]="bare" [class.bare-foot]="bare && first" [class.border-t]="!bare && first" [class.text-right]="isRight(c)" [class.text-center]="c.align === 'center'"
              class="whitespace-nowrap border-gray-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider tabular-nums text-gray-500 dark:border-erp-border-dark dark:text-gray-400">
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


    <div *ngIf="tools && colMenuOpen" class="fixed z-50 w-52 rounded-lg border border-gray-200 bg-white py-1 text-[13px] shadow-lg dark:border-erp-border-dark dark:bg-erp-surface-dark" [style.top.px]="menuTop" [style.right.px]="menuRight">
      <p class="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Columns</p>
      <label *ngFor="let c of allColumns" draggable="true" (dragstart)="dragKey = c.key" (dragover)="$event.preventDefault()" (drop)="dropColumn(c.key)" (dragend)="dragKey = ''"
        class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5" [class.opacity-40]="dragKey === c.key">
        <span class="cursor-grab select-none text-gray-400" title="Drag to reorder" aria-hidden="true">&#8942;&#8942;</span>
        <input type="checkbox" class="h-3.5 w-3.5 accent-violet-600" [checked]="!hiddenKeys.has(c.key)" [disabled]="!hiddenKeys.has(c.key) && columns.length === 1" (change)="toggleColumn(c.key)" />
        <span class="truncate">{{ c.label || c.key }}</span>
      </label>
      <button type="button" *ngIf="hiddenKeys.size" (click)="showAllColumns()" class="mt-1 w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs font-medium text-violet-600 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">Show all columns</button>
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
  host: { '[class.dt-col]': 'bare && tools' },
  styles: [
    ':host{display:block}',
    '.bare-scroll{scrollbar-width:thin;scrollbar-color:#d1d5db transparent}',
    '.bare-scroll::-webkit-scrollbar{width:6px;height:6px}',
    '.bare-scroll::-webkit-scrollbar-track{background:transparent}',
    '.bare-scroll::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:9999px}',
    ':host-context(.dark) .bare-scroll{scrollbar-color:#404040 transparent}',
    ':host-context(.dark) .bare-scroll::-webkit-scrollbar-thumb{background:#404040}',
    '.bare-head{border-bottom-color:transparent;box-shadow:inset 0 -1px 0 #d1d5db}',
    ':host-context(.dark) .bare-head{box-shadow:inset 0 -1px 0 #404040}',
    '.bare-foot{box-shadow:inset 0 1px 0 #d1d5db}',
    ':host-context(.dark) .bare-foot{box-shadow:inset 0 1px 0 #404040}',
    ':host(.dt-col){display:flex;flex-direction:column}',
        '.dt-dots{display:inline-flex;align-items:center;justify-content:center;border-radius:.375rem;padding:.125rem;color:#6b7280}',
    /* the 3-dot button sits in the last header cell's right gutter; every row reserves the same gutter so values line up under their headers */
    ':host(.dt-col) tr>*:last-child:not([colspan]){padding-right:2.5rem}',
    '.dt-dots:hover{background:rgba(124,58,237,.1);color:#6d28d9}',
    'tr.dt-hit>td{background:rgba(124,58,237,.14)!important;box-shadow:inset 0 1px 0 #a78bfa,inset 0 -1px 0 #a78bfa}',
    '.dt-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  ],
})
export class DetailTableComponent implements OnInit {
  previewImageUrl = '';
  previewImageAlt = '';
  /** Roomier type for pages where the table is the main content. */
  @Input({ transform: booleanAttribute }) large = false;
  /** Adds a bar above the table to collapse groups and to show or hide columns (for long tables). */
  @Input({ transform: booleanAttribute }) tools = false;
  /** When set, hidden columns are remembered in this browser under this key. */
  @Input() storageKey = '';
  constructor(@Inject(LOCALE_ID) private locale: string, private host: ElementRef<HTMLElement>) {}

  /** Every column the caller passed, hidden or not; `columns` is the visible subset. */
  allColumns: DetailTableColumn[] = [];
  hiddenKeys = new Set<string>();
  colMenuOpen = false;

  ngOnInit(): void {
    // Columns hidden by default are hidden once; after that the user's choice (saved per browser) wins.
    let seen = new Set<string>();
    if (this.storageKey) {
      try {
        const saved = JSON.parse(localStorage.getItem('dt-hidden:' + this.storageKey) || '[]');
        if (Array.isArray(saved)) this.hiddenKeys = new Set(saved.map(String));
        const known = JSON.parse(localStorage.getItem('dt-seen:' + this.storageKey) || '[]');
        if (Array.isArray(known)) seen = new Set(known.map(String));
        const order = JSON.parse(localStorage.getItem('dt-order:' + this.storageKey) || '[]');
        if (Array.isArray(order)) this.colOrder = order.map(String);
      } catch {}
    }
    for (const c of this.allColumns) {
      if (c.hiddenByDefault && !seen.has(c.key)) this.hiddenKeys.add(c.key);
      seen.add(c.key);
    }
    if (this.storageKey) {
      try {
        localStorage.setItem('dt-seen:' + this.storageKey, JSON.stringify([...seen]));
      } catch {}
      this.persistHidden();
    }
    this.applyColumns();
  }

  private colOrder: string[] = [];
  dragKey = '';

  private applyColumns(): void {
    if (this.colOrder.length) {
      const pos = (k: string) => { const i = this.colOrder.indexOf(k); return i < 0 ? this.colOrder.length : i; };
      this.allColumns = [...this.allColumns].sort((a, b) => pos(a.key) - pos(b.key));
    }
    this._columns = this.allColumns.filter((c) => !this.hiddenKeys.has(c.key));
    this.build();
  }

  /** Dropping a dragged column onto another moves it into that spot. */
  dropColumn(targetKey: string): void {
    const from = this.dragKey;
    this.dragKey = '';
    if (!from || from === targetKey) return;
    const keys = this.allColumns.map((c) => c.key);
    keys.splice(keys.indexOf(from), 1);
    keys.splice(keys.indexOf(targetKey), 0, from);
    this.colOrder = keys;
    this.persistHidden();
    this.applyColumns();
  }

  toggleColumn(key: string): void {
    if (this.hiddenKeys.has(key)) this.hiddenKeys.delete(key);
    else if (this.columns.length > 1) this.hiddenKeys.add(key);
    this.persistHidden();
    this.applyColumns();
  }

  showAllColumns(): void {
    this.hiddenKeys.clear();
    this.persistHidden();
    this.applyColumns();
  }

  private persistHidden(): void {
    if (!this.storageKey) return;
    try {
      localStorage.setItem('dt-hidden:' + this.storageKey, JSON.stringify([...this.hiddenKeys]));
      localStorage.setItem('dt-order:' + this.storageKey, JSON.stringify(this.colOrder));
    } catch {}
  }

  menuTop = 0;
  menuRight = 0;

  openColMenu(e: MouseEvent): void {
    e.stopPropagation();
    if (this.colMenuOpen) {
      this.colMenuOpen = false;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuTop = r.bottom + 4;
    this.menuRight = Math.max(8, window.innerWidth - r.right);
    this.colMenuOpen = true;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (this.colMenuOpen && !this.host.nativeElement.contains(e.target as Node)) this.colMenuOpen = false;
  }

  openImage(url: string, alt?: string): void {
    this.previewImageUrl = url;
    this.previewImageAlt = alt || 'Item image';
  }

  closeImage(): void {
    this.previewImageUrl = '';
    this.previewImageAlt = '';
  }

  expandTextarea(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  collapseTextarea(event: Event): void {
    (event.target as HTMLTextAreaElement).style.height = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeImage();
  }

  @Input() title = '';
  private _columns: DetailTableColumn[] = [];
  @Input() set columns(value: DetailTableColumn[]) {
    this.allColumns = value ?? [];
    this.applyColumns();
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
  /** Drops the bordered, rounded wrapper so the table sits flush in its parent card. */
  @Input({ transform: booleanAttribute }) bare = false;
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
    let groupCount = 0;
    let sums: Record<string, number> = {};
    let groupHasRows = false;
    let groupLine: DetailTableLine | null = null;
    let group = -1;

    const closeGroup = () => {
      // the band heading shows the group's count and total on its own bar, so it needs them attached here
      if (groupLine) {
        groupLine.groupCount = groupCount;
        groupLine.sums = sums;
      }
      if (!this._groupTotals || !groupHasRows || !totalCols.length) return;
      lines.push({ kind: 'subtotal', row: {}, index: 0, pos: lines.length, stripe: false, sums, group });
    };

    for (const r of this._rows) {
      if (r['_group']) {
        closeGroup();
        groupLine = { kind: 'group', row: r, index: 0, pos: lines.length, stripe: false, group: ++group };
        lines.push(groupLine);
        groupCount = 0;
        sums = {};
        groupHasRows = false;
        continue;
      }
      const excluded = !!r['_excludeFromTotal'];
      groupCount++;
      lines.push({ kind: 'data', row: r, index: ++index, pos: lines.length, stripe: groupCount % 2 === 0, excluded, group });
      groupHasRows = true;
      if (!excluded) {
        for (const c of totalCols) sums[c.key] = (sums[c.key] || 0) + (Number(r[c.totalKey ?? c.key]) || 0);
      }
    }
    closeGroup();

    this.lines = lines;
    this.count = lines.reduce((n, l) => n + (l.kind === 'data' ? 1 : 0), 0);
    this.runSearch(false);
  }

  /** Column whose header carries a search box (matches group names and the row's plain text). */
  @Input() searchKey = '';
  /** Row field holding the searchable plain text for a line; falls back to the column's own value. */
  @Input() searchTextKey = '';
  query = '';
  matches: number[] = [];
  matchPos = 0;
  activeLine = -1;

  onSearch(value: string): void {
    this.query = value;
    this.runSearch(true);
  }

  private runSearch(jump: boolean): void {
    const q = this.query.trim().toLowerCase();
    this.matches = [];
    this.matchPos = 0;
    this.activeLine = -1;
    if (!q) return;
    for (const l of this.lines) {
      let text = '';
      if (l.kind === 'group') text = String(l.row['label'] ?? '');
      else if (l.kind === 'data') text = String(l.row[this.searchTextKey] ?? l.row[this.searchKey] ?? '').replace(/<[^>]*>/g, ' ');
      else continue;
      if (text.toLowerCase().includes(q)) this.matches.push(l.pos);
    }
    if (this.matches.length) {
      this.activeLine = this.matches[0];
      if (jump) this.scrollToActive();
    }
  }

  /** Enter goes to the next match, Shift+Enter to the previous one, wrapping around. */
  step(dir: 1 | -1): void {
    if (!this.matches.length) return;
    this.matchPos = (this.matchPos + dir + this.matches.length) % this.matches.length;
    this.activeLine = this.matches[this.matchPos];
    this.scrollToActive();
  }

  private scrollToActive(): void {
    // Wait for the highlight class to render, then bring the line to the middle of the scroll area.
    setTimeout(() => {
      this.host.nativeElement.querySelector(`tr[data-line="${this.activeLine}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
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
