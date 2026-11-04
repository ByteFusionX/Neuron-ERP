import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { SF_STYLES, SmartFormModule } from 'src/app/shared/components/smart-form';

import { expandDealComponents } from 'src/app/shared/utils/deal-pricing.util';

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
    :host ::ng-deep app-sf-number.ge-qty-exceeded .sf-input { border-color: #f97316 !important; }
    .ge-strip { display: grid; gap: 0.375rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (min-width: 900px) {
      .ge-strip { grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.3fr) repeat(2, minmax(0, 1.2fr)) minmax(0, 1.8fr) minmax(0, 2.2fr) minmax(0, 1.8fr); }
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
  @Input() purchaseOrder: any;

  /** The PO line behind a GRN line: by position on a new GRN, by item/part match on a saved one. */
  private poLineFor(line: AbstractControl, index: number): any {
    const poLines: any[] = this.purchaseOrder?.items || [];
    if (!this.locked) return poLines[index];
    const key = (value: any): string => String(value?._id ?? value ?? '').trim().toLowerCase();
    return poLines.find((item) =>
      key(item.detail) === key(line.get('itemDescription')?.value) &&
      (!line.get('partNo')?.value || key(item.partNo?.partNo ?? item.partNo) === key(line.get('partNo')?.value)));
  }

  unitCost(line: AbstractControl, index: number): number {
    return Number(this.poLineFor(line, index)?.unitCost) || 0;
  }

  /** Cost of what is accepted on this line. */
  lineCost(line: AbstractControl, index: number): number {
    return this.unitCost(line, index) * Math.max(0, this.num(line, 'acceptedQty'));
  }

  get costSummary(): { prCost: number; prPrice: number; prDiscount: number; jobCost: number; jobPrice: number; jobDiscount: number } {
    const po = this.purchaseOrder;
    const poLines: any[] = po?.items || [];
    const groups: any[] = po?.purchaseId?.items || [];
    const prLines: any[] = groups.flatMap((item: any) => item?.itemDetails || []);
    const deal = po?.quoteId?.dealData || po?.purchaseId?.jobId?.quoteId?.dealData;
    const dealGroups = expandDealComponents<any>(deal?.updatedItems);
    const dealLines: any[] = dealGroups.flatMap((item: any) => item.itemDetails || []);
    const key = (value: any): string => String(value?._id ?? value ?? '').trim().toLowerCase();
    const num = (value: any): number => Number(value) || 0;
    const totals = { prCost: 0, prPrice: 0, prDiscount: 0, jobCost: 0, jobPrice: 0, jobDiscount: 0 };
    const selectedJobCosts = new Map<string, number>();
    for (const [index, line] of this.lines.entries()) {
      const poLine = !this.locked ? poLines[index] : poLines.find((item) =>
        key(item.detail) === key(line.get('itemDescription')?.value) &&
        (!line.get('partNo')?.value || key(item.partNo?.partNo ?? item.partNo) === key(line.get('partNo')?.value)));
      if (!poLine) continue;
      const prLine = prLines.find((item) => poLine.prLineKey && key(item._id) === key(poLine.prLineKey))
        || prLines.find((item) => poLine.partNo && key(item.productId ?? item.partNo) === key(poLine.partNo))
        || prLines.find((item) => key(item.detail) === key(poLine.detail));
      const group = groups.find((item) => item.itemDetails?.includes(prLine));
      const sameGroup = dealGroups.find((item) => key(item.itemName) === key(group?.itemName));
      const candidates = dealLines.filter((item) => key(item.detail) === key(poLine.detail));
      const jobLine = sameGroup?.itemDetails?.find((item: any) => key(item.detail) === key(poLine.detail))
        || (candidates.length === 1 ? candidates[0] : undefined);
      const qty = Math.max(0, this.num(line, 'acceptedQty'));
      totals.prCost += num(poLine.unitCost) * qty;
      totals.prPrice += num(prLine?.unitSellingPrice) * qty;
      // A PR-only line has no job baseline; do not substitute its award for a job cost.
      const jobCost = num(jobLine?.unitCost ?? prLine?.dealUnitCost) * qty;
      totals.jobCost += jobCost;
      totals.jobPrice += num(jobLine?.unitSellingPrice) * qty;
      const supplier = key(jobLine?.supplierId);
      selectedJobCosts.set(supplier, (selectedJobCosts.get(supplier) || 0) + jobCost);
    }
    const poCost = poLines.reduce((sum, item) => sum + num(item.unitCost) * num(item.quantity), 0);
    totals.prDiscount = poCost > 0 ? Math.max(0, num(po?.discount)) * Math.min(totals.prCost / poCost, 1) : 0;
    // Allocate the job's supplier discounts only to the received share of that supplier's items.
    for (const adjustment of deal?.additionalCosts || []) {
      if (adjustment.type !== 'Supplier Discount') continue;
      const supplier = key(adjustment.supplierId);
      const supplierCost = dealLines.filter((item) => key(item.supplierId) === supplier)
        .reduce((sum, item) => sum + num(item.unitCost) * num(item.quantity), 0);
      if (supplierCost > 0) totals.jobDiscount += Math.max(0, num(adjustment.value))
        * Math.min((selectedJobCosts.get(supplier) || 0) / supplierCost, 1);
    }
    return totals;
  }
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
