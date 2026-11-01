import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SmartFormModule } from 'src/app/shared/components/smart-form';

type PodFilter = 'rejected' | 'accepted' | 'errors';

/**
 * The item-entry layout for proof of delivery: a work toolbar (search, filter chips, collapse, density),
 * one card with a row per DN line, and a sticky totals bar — the same shape as `app-grn-item-entry`.
 *
 * It binds the host's `lines` FormArray as is. Each group carries `description`, `partNo`, `total` and `rejected`;
 * accepted is total less rejected.
 */
@Component({
  selector: 'app-pod-item-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgIcon, SmartFormModule],
  styles: [SF_STYLES + `
    :host { display: block; }
    .pe-strip { display: grid; gap: 0.375rem; grid-template-columns: minmax(0, 1fr) repeat(3, 5rem); }
    .pe-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    :host-context(html.dark) .pe-labels { color: #6b7280; }
    .pe-cell { display: flex; align-items: center; align-self: start; justify-content: flex-end; height: 2.25rem; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; font-variant-numeric: tabular-nums; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .pe-cell { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
  `],
  template: `
    <div class="flex flex-col gap-4">
      <div class="sticky top-0 z-20 -mx-1 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div class="flex flex-wrap items-center gap-2">
          <app-sf-input class="block w-full sm:w-48" type="search" placeholder="Search lines…" clearable
            [ngModel]="lineSearch" (ngModelChange)="lineSearch = $event ?? ''"></app-sf-input>
          <button *ngFor="let chip of chips" type="button" (click)="toggleFilter(chip.key)" [disabled]="!count(chip.key) && lineFilter !== chip.key"
            [attr.title]="chip.hint" class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-40"
            [ngClass]="lineFilter === chip.key
              ? 'border-violet-600 bg-violet-600 text-white'
              : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-erp-border-dark dark:text-gray-300 dark:hover:bg-gray-800'">
            {{ chip.label }}
            <span class="rounded-full px-1.5 tabular-nums" [ngClass]="lineFilter === chip.key ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800'">{{ count(chip.key) }}</span>
          </button>
          <button *ngIf="filterActive" type="button" (click)="clearFilters()" class="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-400">Clear</button>
          <div class="ml-auto flex items-center gap-1">
            <button type="button" [title]="compact ? 'Comfortable rows' : 'Compact rows'" (click)="compact = !compact"
              class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              [ngClass]="compact ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' : ''">
              <ng-icon [name]="compact ? 'heroTableCells' : 'heroListBullet'" class="h-4 w-4"></ng-icon> {{ compact ? 'Compact' : 'Comfortable' }}
            </button>
          </div>
        </div>
      </div>

      <p *ngIf="!lines.length" class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-erp-border-dark">No items on this delivery note.</p>
      <p *ngIf="lines.length && filterActive && !visibleCount" class="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-500 dark:border-erp-border-dark">
        No lines match. <button type="button" (click)="clearFilters()" class="font-medium text-violet-700 hover:underline dark:text-violet-400">Clear filters</button>
      </p>

      <div *ngIf="lines.length" class="rounded-xl border border-gray-200 bg-white dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div class="flex items-center gap-2 border-gray-100 px-3 py-2 dark:border-erp-border-dark" [class.border-b]="!collapsed">
          <button type="button" (click)="collapsed = !collapsed" [attr.aria-label]="collapsed ? 'Expand items' : 'Collapse items'" [attr.aria-expanded]="!collapsed"
            class="grid h-6 w-6 shrink-0 place-content-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
            <ng-icon [name]="collapsed ? 'heroChevronRight' : 'heroChevronDown'" class="h-4 w-4"></ng-icon>
          </button>
          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{{ title }}</span>
          <span class="shrink-0 text-[11px] tabular-nums text-gray-500">{{ lines.length }} line{{ lines.length === 1 ? '' : 's' }}</span>
          <span *ngIf="errorCount" class="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
            [title]="errorCount + ' line(s) need attention'">
            <ng-icon name="heroExclamationTriangle" class="h-3 w-3"></ng-icon>{{ errorCount }}
          </span>
        </div>

        <ng-container *ngIf="!collapsed">
          <div class="flex items-start gap-2 px-3 pt-2">
            <span class="w-6 shrink-0"></span>
            <div class="pe-strip pe-labels min-w-0 flex-1">
              <span>Item</span><span class="text-right">Total</span><span class="text-right">Accepted</span><span>Rejected</span>
            </div>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-erp-border-dark">
            <ng-container *ngFor="let line of lines; let i = index">
              <div *ngIf="visible(line)" [formGroup]="line" class="flex items-start gap-2 px-3"
                [ngClass]="[compact ? 'py-1.5' : 'py-2.5', hasError(line) ? 'bg-red-50/50 dark:!bg-red-950/20' : '']">
                <span class="mt-2 grid h-6 w-6 shrink-0 place-content-center rounded-md bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">{{ i + 1 }}</span>
                <div class="pe-strip min-w-0 flex-1">
                  <div class="min-w-0 py-1.5">
                    <p [title]="text(line, 'description')" class="line-clamp-2 whitespace-pre-line text-xs font-normal text-gray-900 dark:text-gray-100">{{ text(line, 'description') || '-' }}</p>
                    <p *ngIf="text(line, 'partNo') && text(line, 'partNo') !== '-'" class="text-xs text-gray-500">{{ text(line, 'partNo') }}</p>
                  </div>
                  <div class="pe-cell" title="Total">{{ num(line, 'total') }}</div>
                  <div class="pe-cell font-medium !text-emerald-700 dark:!text-emerald-400" title="Accepted">{{ accepted(line) }}</div>
                  <div>
                    <app-sf-number formControlName="rejected" [min]="0" [max]="num(line, 'total')" [stepper]="false" placeholder="0"
                      [attr.aria-label]="'Rejected qty for ' + text(line, 'description')"></app-sf-number>
                    <p *ngIf="hasError(line)" class="mt-1 text-[11px] text-red-600">Max {{ num(line, 'total') }}</p>
                  </div>
                  <div *ngIf="num(line, 'rejected') > 0" class="col-span-full">
                    <app-sf-input formControlName="reason" placeholder="Rejected reason (optional)"
                      [attr.aria-label]="'Rejected reason for ' + text(line, 'description')"></app-sf-input>
                  </div>
                </div>
              </div>
            </ng-container>
          </div>
        </ng-container>
      </div>

    </div>
  `,
})
export class PodItemEntryComponent {
  @Input({ required: true }) items!: FormArray;
  @Input() title = 'Items delivered';

  lineSearch = '';
  lineFilter: PodFilter | null = null;
  collapsed = false;
  compact = false;

  readonly chips: { key: PodFilter; label: string; hint: string }[] = [
    { key: 'rejected', label: 'Rejected', hint: 'Lines with a rejected quantity' },
    { key: 'accepted', label: 'Fully accepted', hint: 'Lines with nothing rejected' },
    { key: 'errors', label: 'Errors', hint: 'Lines with a field to fix' },
  ];

  get lines(): FormGroup[] {
    return this.items.controls as FormGroup[];
  }

  num(line: AbstractControl, name: string): number {
    return Number(line.get(name)?.value) || 0;
  }

  text(line: AbstractControl, name: string): string {
    return line.get(name)?.value || '';
  }

  accepted(line: AbstractControl): number {
    return Math.max(0, this.num(line, 'total') - this.num(line, 'rejected'));
  }

  hasError(line: AbstractControl): boolean {
    return !!line.get('rejected')?.invalid;
  }

  get totalQty(): number {
    return this.lines.reduce((sum, l) => sum + this.num(l, 'total'), 0);
  }

  get rejectedQty(): number {
    return this.lines.reduce((sum, l) => sum + this.num(l, 'rejected'), 0);
  }

  get errorCount(): number {
    return this.lines.filter((l) => this.hasError(l)).length;
  }

  get filterActive(): boolean {
    return !!this.lineFilter || !!this.lineSearch.trim();
  }

  count(key: PodFilter): number {
    return this.lines.filter((l) => this.matchesFilter(l, key)).length;
  }

  private matchesFilter(l: AbstractControl, key: PodFilter): boolean {
    switch (key) {
      case 'rejected': return this.num(l, 'rejected') > 0;
      case 'accepted': return this.num(l, 'rejected') === 0;
      case 'errors': return this.hasError(l);
    }
  }

  visible(l: AbstractControl): boolean {
    if (this.lineFilter && !this.matchesFilter(l, this.lineFilter)) return false;
    const term = this.lineSearch.trim().toLowerCase();
    if (!term) return true;
    return `${this.text(l, 'description')} ${this.text(l, 'partNo')}`.toLowerCase().includes(term);
  }

  get visibleCount(): number {
    return this.lines.filter((l) => this.visible(l)).length;
  }

  toggleFilter(key: PodFilter): void {
    this.lineFilter = this.lineFilter === key ? null : key;
  }

  clearFilters(): void {
    this.lineFilter = null;
    this.lineSearch = '';
  }
}
