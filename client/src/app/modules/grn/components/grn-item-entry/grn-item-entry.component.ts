import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SmartFormModule } from 'src/app/shared/components/smart-form';

type GrnFilter = 'discrepancy' | 'rejected' | 'errors' | 'done';

/**
 * The item-entry layout for receiving an LPO: a work toolbar (search, filter chips, collapse, density),
 * one card with a row per line, and a sticky totals bar — the same shape as `app-lpo-item-entry`.
 *
 * It binds the host's `items` FormArray as is. Quantity rules (accepted, discrepancy validators) stay with
 * the host's valueChanges subscriptions; this component only lays the controls out.
 */
@Component({
  selector: 'app-grn-item-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgIcon, SmartFormModule],
  styles: [SF_STYLES + `
    :host { display: block; }
    .ge-strip { display: grid; gap: 0.375rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (min-width: 900px) {
      .ge-strip { grid-template-columns: minmax(0, 5fr) repeat(2, minmax(0, 1.1fr)) minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 1.5fr) minmax(0, 1.4fr) minmax(0, 2fr) minmax(0, 2.5fr); }
    }
    .ge-sub { display: grid; gap: 0.375rem; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 900px) { .ge-sub { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .ge-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    :host-context(html.dark) .ge-labels { color: #6b7280; }
    .ge-cell { display: flex; align-items: center; align-self: start; height: 2.25rem; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; font-variant-numeric: tabular-nums; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .ge-cell { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
    .ge-num { justify-content: flex-end; }
  `],
  templateUrl: './grn-item-entry.component.html',
})
export class GrnItemEntryComponent {
  @Input({ required: true }) items!: FormArray;
  /** Editing a saved GRN: stock is already posted, so quantities, UoM and batch / serial numbers are read-only. */
  @Input() locked = false;
  /** The LPO is fully received: nothing on the list can be entered. */
  @Input() disabled = false;
  @Input() title = 'Items received';

  lineSearch = '';
  lineFilter: GrnFilter | null = null;
  collapsed = false;
  compact = false;

  readonly chips: { key: GrnFilter; label: string; hint: string }[] = [
    { key: 'discrepancy', label: 'Discrepancy', hint: 'Lines received short, over or with rejections' },
    { key: 'rejected', label: 'Rejected', hint: 'Lines with a rejected quantity' },
    { key: 'errors', label: 'Errors', hint: 'Lines with a field to fix' },
    { key: 'done', label: 'Fully received', hint: 'Lines with nothing left to receive' },
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

  /** Nothing left to receive on a new GRN; an edited GRN's lines are its own receipt, so never "done". */
  isDone(line: AbstractControl): boolean {
    return !this.locked && this.num(line, 'balanceQty') === 0;
  }

  /** Quantities can't be typed: the GRN is saved, the LPO is closed, or the line has no balance. */
  qtyReadonly(line: AbstractControl): boolean {
    return this.locked || this.disabled || this.isDone(line);
  }

  hasDiscrepancy(line: AbstractControl): boolean {
    return this.num(line, 'rejectedQty') > 0 || this.num(line, 'receivedQty') !== this.num(line, 'balanceQty');
  }

  variance(line: AbstractControl): number {
    return this.num(line, 'receivedQty') - this.num(line, 'balanceQty');
  }

  hasError(line: AbstractControl): boolean {
    return ['rejectedQty', 'uom', 'receivedQty'].some((n) => line.get(n)?.invalid);
  }

  total(name: string): number {
    return this.lines.reduce((sum, l) => sum + this.num(l, name), 0);
  }

  get errorCount(): number {
    return this.lines.filter((l) => this.hasError(l)).length;
  }

  get filterActive(): boolean {
    return !!this.lineFilter || !!this.lineSearch.trim();
  }

  count(key: GrnFilter): number {
    return this.lines.filter((l) => this.matchesFilter(l, key)).length;
  }

  private matchesFilter(l: AbstractControl, key: GrnFilter): boolean {
    switch (key) {
      case 'discrepancy': return this.hasDiscrepancy(l);
      case 'rejected': return this.num(l, 'rejectedQty') > 0;
      case 'errors': return this.hasError(l);
      case 'done': return this.isDone(l);
    }
  }

  visible(l: AbstractControl): boolean {
    if (this.lineFilter && !this.matchesFilter(l, this.lineFilter)) return false;
    const term = this.lineSearch.trim().toLowerCase();
    if (!term) return true;
    return `${this.text(l, 'itemDescription')} ${this.text(l, 'partNo')}`.toLowerCase().includes(term);
  }

  get visibleCount(): number {
    return this.lines.filter((l) => this.visible(l)).length;
  }

  toggleFilter(key: GrnFilter): void {
    this.lineFilter = this.lineFilter === key ? null : key;
  }

  clearFilters(): void {
    this.lineFilter = null;
    this.lineSearch = '';
  }
}
