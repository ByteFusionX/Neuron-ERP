import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SmartFormModule } from 'src/app/shared/components/smart-form';

type DnFilter = 'selected' | 'pending' | 'unavailable' | 'done';

/**
 * The item-entry layout for a delivery note: a work toolbar (search, filter chips, collapse, density),
 * one card with a row per job line, and a sticky totals bar — the same shape as `app-grn-item-entry`.
 *
 * Selection stays with the host while each line's serial numbers live in its form control.
 */
@Component({
  selector: 'app-dn-item-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgIcon, SmartFormModule],
  styles: [SF_STYLES + `
    :host { display: block; }
    .de-strip { display: grid; gap: 0.375rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (min-width: 900px) {
      .de-strip { grid-template-columns: minmax(0, 5fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr) minmax(0, 2.5fr); }
    }
    .de-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    :host-context(html.dark) .de-labels { color: #6b7280; }
    .de-cell { display: flex; align-items: center; align-self: start; height: 2.25rem; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; font-variant-numeric: tabular-nums; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .de-cell { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
    .de-num { justify-content: flex-end; }
  `],
  templateUrl: './dn-item-entry.component.html',
})
export class DnItemEntryComponent {
  @Input({ required: true }) items!: FormArray;
  @Input({ required: true }) isSelected!: (index: number) => boolean;
  @Input() title = 'Items to deliver';

  @Output() toggle = new EventEmitter<number>();

  lineSearch = '';
  lineFilter: DnFilter | null = null;
  collapsed = false;
  compact = false;

  readonly chips: { key: DnFilter; label: string; hint: string }[] = [
    { key: 'selected', label: 'In this DN', hint: 'Lines selected for this delivery' },
    { key: 'pending', label: 'Open', hint: 'Lines with a balance still to deliver' },
    { key: 'unavailable', label: 'Not in inventory', hint: 'Lines with no PO or stock yet' },
    { key: 'done', label: 'Delivered', hint: 'Lines with nothing left to deliver' },
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

  balance(line: AbstractControl): number {
    return Math.max(0, this.num(line, 'orderedQty') - this.num(line, 'deliveredQty'));
  }

  isDone(line: AbstractControl): boolean {
    return this.text(line, 'status') === 'Delivered';
  }

  isUnavailable(line: AbstractControl): boolean {
    return this.text(line, 'status') === 'No PO / Not in Inventory';
  }

  /** Why a line is muted, shown as its tooltip. */
  lockReason(line: AbstractControl): string {
    if (this.isDone(line)) return 'Fully delivered - nothing left to deliver';
    if (this.isUnavailable(line)) return this.text(line, 'unavailableReason') || 'Not available to deliver yet';
    return '';
  }

  /** Delivered and not-in-inventory lines can't go on a DN. */
  locked(line: AbstractControl): boolean {
    return this.isDone(line) || this.isUnavailable(line);
  }

  hasError(line: AbstractControl): boolean {
    const qty = line.get('currentDeliveryQty');
    return !!qty?.invalid && !!qty?.touched;
  }

  total(name: string): number {
    return this.lines.reduce((sum, l) => sum + this.num(l, name), 0);
  }

  get totalBalance(): number {
    return this.lines.reduce((sum, l) => sum + this.balance(l), 0);
  }

  /** Quantity going out on this DN: selected lines only. */
  get thisDnTotal(): number {
    return this.lines.reduce((sum, l, i) => sum + (this.isSelected(i) ? this.num(l, 'currentDeliveryQty') : 0), 0);
  }

  get selectedCount(): number {
    return this.lines.filter((_, i) => this.isSelected(i)).length;
  }

  get filterActive(): boolean {
    return !!this.lineFilter || !!this.lineSearch.trim();
  }

  count(key: DnFilter): number {
    return this.lines.filter((l, i) => this.matchesFilter(l, i, key)).length;
  }

  private matchesFilter(l: AbstractControl, i: number, key: DnFilter): boolean {
    switch (key) {
      case 'selected': return this.isSelected(i);
      case 'pending': return !this.locked(l) && this.balance(l) > 0;
      case 'unavailable': return this.isUnavailable(l);
      case 'done': return this.isDone(l);
    }
  }

  visible(l: AbstractControl, i: number): boolean {
    if (this.lineFilter && !this.matchesFilter(l, i, this.lineFilter)) return false;
    const term = this.lineSearch.trim().toLowerCase();
    if (!term) return true;
    return `${this.text(l, 'description')} ${this.text(l, 'partNo')}`.toLowerCase().includes(term);
  }

  get visibleCount(): number {
    return this.lines.filter((l, i) => this.visible(l, i)).length;
  }

  toggleFilter(key: DnFilter): void {
    this.lineFilter = this.lineFilter === key ? null : key;
  }

  clearFilters(): void {
    this.lineFilter = null;
    this.lineSearch = '';
  }
}
