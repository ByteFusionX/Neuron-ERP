import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SfCheckboxComponent, SfComboboxComponent, SfInputComponent, SfNumberComponent, SfOption } from 'src/app/shared/components/smart-form';
import {
  LpoIssueLine,
  LpoSupplierTab,
  lineIsOpen,
  lineQtyError,
  lineRemaining,
  lineTotalQty,
  lineUnitPrice,
} from './lpo-item-entry.model';

type LpoFilter = 'selected' | 'unselected' | 'errors' | 'issued';

/**
 * The item-entry layout for choosing what goes on an LPO: supplier tabs, a work toolbar (search, filter
 * chips, collapse, density), one numbered card per supplier with a row per line, and a totals bar.
 *
 * It loads nothing. The host passes the tabs and the active tab's lines; this component edits only
 * `picked` and `qty` on those lines, in place.
 */
@Component({
  selector: 'app-lpo-item-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon, SfComboboxComponent, SfInputComponent, SfNumberComponent, SfCheckboxComponent],
  styles: [SF_STYLES + `
    :host { display: block; }
    .le-strip { display: grid; gap: 0.375rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    @media (min-width: 900px) {
      .le-strip { grid-template-columns: minmax(0, 5fr) repeat(4, minmax(0, 1.2fr)) minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1.6fr) minmax(0, 1fr); }
    }
    .le-labels { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; }
    :host-context(html.dark) .le-labels { color: #6b7280; }
    .le-cell { display: flex; align-items: center; min-height: 2.25rem; border-radius: 0.5rem; padding: 0 0.5rem; font-size: 0.75rem; font-variant-numeric: tabular-nums; background: #f9fafb; color: #111827; }
    :host-context(html.dark) .le-cell { background: rgba(31, 41, 55, 0.5); color: #f3f4f6; }
    .le-num { justify-content: flex-end; }
  `],
  templateUrl: './lpo-item-entry.component.html',
})
export class LpoItemEntryComponent implements OnChanges {
  @Input({ required: true }) tabs: LpoSupplierTab[] = [];
  @Input() activeKey = '';
  @Input() lines: LpoIssueLine[] = [];
  @Input() loading = false;
  @Input() currency = '';
  /** The supplier's approved discount, shown in the totals bar. */
  @Input() discount = 0;

  @Output() tabSelected = new EventEmitter<string>();
  @Output() historyClicked = new EventEmitter<LpoIssueLine>();

  supplierOptions: SfOption[] = [];

  lineSearch = '';
  lineFilter: LpoFilter | null = null;
  collapsed = false;
  compact = false;

  readonly remaining = lineRemaining;
  readonly unitPrice = lineUnitPrice;
  readonly isOpen = lineIsOpen;
  readonly qtyError = lineQtyError;
  readonly totalQty = lineTotalQty;

  readonly chips: { key: LpoFilter; label: string; hint: string }[] = [
    { key: 'selected', label: 'Selected', hint: 'Lines ticked for this LPO' },
    { key: 'unselected', label: 'Not selected', hint: 'Open lines left out of this LPO' },
    { key: 'errors', label: 'Errors', hint: 'Selected lines with a quantity problem' },
    { key: 'issued', label: 'Fully issued', hint: 'Lines with nothing left to order' },
  ];

  ngOnChanges(): void {
    // The host rebuilds `tabs` on every change-detection pass; keep the same options array unless the content changed.
    const options = this.tabs.map((t) => ({ value: t.key, label: `${t.label} (${t.count})` }));
    const same = options.length === this.supplierOptions.length
      && options.every((o, i) => o.value === this.supplierOptions[i].value && o.label === this.supplierOptions[i].label);
    if (!same) this.supplierOptions = options;
  }

  get activeTab(): LpoSupplierTab | undefined {
    return this.tabs.find((t) => t.key === this.activeKey) ?? this.tabs[0];
  }

  get openCount(): number {
    return this.lines.filter(lineIsOpen).length;
  }

  /** Every line already sits on an LPO: shown ticked, read-only, with its full quantities. */
  get allIssued(): boolean {
    return this.lines.length > 0 && this.openCount === 0;
  }

  get allPicked(): boolean {
    const open = this.lines.filter(lineIsOpen);
    return open.length > 0 && open.every((l) => l.picked);
  }

  get pickedLines(): LpoIssueLine[] {
    return this.lines.filter((l) => l.picked);
  }

  get pickedTotal(): number {
    return this.pickedLines.reduce((sum, l) => sum + l.qty * lineUnitPrice(l), 0);
  }

  /** What the summary counts: the ticked lines, or every line once the supplier is fully issued. */
  get summaryCount(): number {
    return this.allIssued ? this.lines.length : this.pickedLines.length;
  }

  get summaryOf(): number {
    return this.allIssued ? this.lines.length : this.openCount;
  }

  get summaryTotal(): number {
    return this.allIssued
      ? this.lines.reduce((sum, l) => sum + Number(lineTotalQty(l)) * lineUnitPrice(l), 0)
      : this.pickedTotal;
  }

  get errorCount(): number {
    return this.lines.filter((l) => lineQtyError(l)).length;
  }

  get filterActive(): boolean {
    return !!this.lineFilter || !!this.lineSearch.trim();
  }

  count(key: LpoFilter): number {
    return this.lines.filter((l) => this.matchesFilter(l, key)).length;
  }

  private matchesFilter(l: LpoIssueLine, key: LpoFilter): boolean {
    switch (key) {
      case 'selected': return l.picked;
      case 'unselected': return !l.picked && lineIsOpen(l);
      case 'errors': return !!lineQtyError(l);
      case 'issued': return !lineIsOpen(l);
    }
  }

  visible(l: LpoIssueLine): boolean {
    if (this.lineFilter && !this.matchesFilter(l, this.lineFilter)) return false;
    const term = this.lineSearch.trim().toLowerCase();
    if (!term) return true;
    return `${l.item.detail ?? ''} ${this.partNo(l)}`.toLowerCase().includes(term);
  }

  get visibleLines(): LpoIssueLine[] {
    return this.lines.filter((l) => this.visible(l));
  }

  toggleFilter(key: LpoFilter): void {
    this.lineFilter = this.lineFilter === key ? null : key;
  }

  clearFilters(): void {
    this.lineFilter = null;
    this.lineSearch = '';
  }

  togglePick(line: LpoIssueLine): void {
    if (!lineIsOpen(line)) return;
    line.picked = !line.picked;
    if (line.picked && !line.qty) line.qty = lineRemaining(line);
  }

  /** Ticks (or clears) every open line that is currently shown. */
  togglePickAll(): void {
    const shown = this.visibleLines.filter(lineIsOpen);
    const pick = !shown.every((l) => l.picked);
    shown.forEach((l) => {
      l.picked = pick;
      if (pick && !l.qty) l.qty = lineRemaining(l);
    });
  }

  get allShownPicked(): boolean {
    const shown = this.visibleLines.filter(lineIsOpen);
    return shown.length > 0 && shown.every((l) => l.picked);
  }

  setQty(line: LpoIssueLine, value: any): void {
    const n = value === '' || value === null ? 0 : Number(value);
    line.qty = isNaN(n) ? 0 : n;
  }

  partNo(line: LpoIssueLine): string {
    const p = line.item?.partNo;
    if (!p) return '';
    return typeof p === 'string' ? p : p.partNo || '';
  }

  trackTab = (_: number, t: LpoSupplierTab): string => t.key;

  selectTab(key: string): void {
    this.clearFilters();
    this.tabSelected.emit(key);
  }
}
