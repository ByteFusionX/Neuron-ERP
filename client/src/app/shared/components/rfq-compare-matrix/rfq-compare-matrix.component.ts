import { DecimalPipe, DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  SALES_RFQ_BADGE_CLASSES,
  SalesRfqCompareCell,
  SalesRfqCompareColumn,
  SalesRfqCompareRow,
  SalesRfqComparison,
  salesRfqStatusLabel,
} from 'src/app/shared/interfaces/sales-rfq.interface';

/** One award click: the cell to award (or reopen, when `quoteId` is null). */
export interface RfqCompareAward {
  row: SalesRfqCompareRow;
  cell: SalesRfqCompareCell;
  quoteId: string | null;
  /** Split award: only this part of the quantity goes to the supplier; 0 with a null `quoteId` takes back just its share. */
  qty?: number;
}

interface RowGroup {
  name: string;
  rows: SalesRfqCompareRow[];
  awarded: number;
}

type RowFilter = 'all' | 'open' | 'awarded' | 'unawarded' | 'noQuote' | 'expired' | 'dearer' | 'partial';

/**
 * Supplier comparison grid: products down the side (grouped by item), one column per supplier request,
 * each cell that supplier's price. Shows which products are still open and who won the others.
 * Presentational only, so any request-for-quote flow can feed it the same shape.
 */
@Component({
  selector: 'app-rfq-compare-matrix',
  standalone: true,
  imports: [NgClass, DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rfq-compare-matrix.component.html',
})
export class RfqCompareMatrixComponent {
  readonly data = input.required<SalesRfqComparison>();
  readonly locked = input(false);
  readonly busy = input(false);
  /** Lets one product be shared between suppliers, each taking part of the quantity (purchase requests). */
  readonly allowSplit = input(false);
  /** Lets a not fully awarded product be marked short (purchase requests). */
  readonly allowShort = input(false);

  readonly award = output<RfqCompareAward>();
  /** Award every still-open product of a group to one supplier column. */
  readonly awardGroup = output<{ group: string; column: SalesRfqCompareColumn; awards: RfqCompareAward[] }>();
  /** Award every still-open product this supplier priced, across all groups. */
  readonly awardSupplier = output<{ column: SalesRfqCompareColumn; awards: RfqCompareAward[]; skipped: number }>();
  /** Award every still-open product to whichever supplier priced it lowest. */
  readonly awardCheapest = output<{ awards: RfqCompareAward[]; skipped: number }>();
  readonly openRfq = output<string>();
  /** Mark a product short, or clear the mark (`short: false`). */
  readonly markShort = output<{ row: SalesRfqCompareRow; short: boolean }>();

  readonly filter = signal<RowFilter>('all');
  /** Item groups folded away by the user. */
  readonly collapsed = signal<ReadonlySet<string>>(new Set());

  readonly coveragePct = computed(() => {
    const c = this.data().coverage;
    return c.total ? Math.round(((c.awarded + c.unavailable) / c.total) * 100) : 0;
  });

  /** Row counts per status, for the summary tiles and the segmented bar. */
  readonly stats = computed(() => {
    const s = { total: 0, awarded: 0, partial: 0, open: 0, waiting: 0, unavailable: 0 };
    this.data().rows.forEach((r) => { s.total++; s[r.status]++; });
    return s;
  });

  /** Cell being given a part of the quantity (`rfqId|lineKey`), and the quantity typed for it. */
  readonly splitKey = signal<string | null>(null);
  readonly splitQty = signal(0);

  readonly segments = computed(() => {
    const s = this.stats();
    const pct = (n: number) => (s.total ? (n / s.total) * 100 : 0);
    return [
      { key: 'awarded', label: 'Awarded', hint: 'Supplier picked', count: s.awarded, pct: pct(s.awarded), dot: 'bg-emerald-500' },
      { key: 'open', label: 'Ready to award', hint: s.partial ? `${s.partial} part-awarded` : 'Priced, not picked', count: s.open + s.partial, pct: pct(s.open + s.partial), dot: 'bg-sky-500' },
      { key: 'waiting', label: 'Waiting', hint: 'No price yet', count: s.waiting, pct: pct(s.waiting), dot: 'bg-amber-500' },
      { key: 'unavailable', label: 'Unavailable', hint: 'No supplier can supply', count: s.unavailable, pct: pct(s.unavailable), dot: 'bg-gray-400' },
    ];
  });

  readonly filterTabs = computed(() => {
    const s = this.stats();
    return [
      { key: 'all' as RowFilter, label: 'All', count: s.total },
      { key: 'open' as RowFilter, label: 'Open', count: s.open + s.waiting + s.partial },
      { key: 'awarded' as RowFilter, label: 'Awarded', count: s.awarded },
    ];
  });

  /** Exception views for long requests: each shows only the rows that need a look, and hides itself when empty. */
  readonly exceptionTabs = computed(() => {
    const rows = this.data().rows;
    const count = (f: RowFilter) => rows.filter((r) => this.matches(r, f)).length;
    return ([
      { key: 'unawarded', label: 'Unawarded' },
      { key: 'noQuote', label: 'No quote yet' },
      { key: 'expired', label: 'Expired quote' },
      { key: 'dearer', label: 'Dearer than last PO' },
      { key: 'partial', label: 'Part-awarded' },
    ] as { key: RowFilter; label: string }[])
      .map((t) => ({ ...t, count: count(t.key) }))
      .filter((t) => t.count > 0 || this.filter() === t.key);
  });

  matches(row: SalesRfqCompareRow, filter: RowFilter): boolean {
    switch (filter) {
      case 'all': return true;
      case 'awarded': return row.status === 'awarded';
      case 'open': return !row.short && (row.status === 'open' || row.status === 'waiting' || row.status === 'partial');
      case 'unawarded': return row.status === 'open' || row.status === 'waiting';
      case 'noQuote': return row.status === 'waiting';
      case 'partial': return row.status === 'partial';
      case 'expired': return row.cells.some((c) => c.quote && c.lineStatus !== 'Unavailable' && this.isExpired(c.quote.validityDate));
      case 'dearer': return row.cells.some((c) => this.isDearer(row, c));
    }
  }

  /** This supplier's unit price is above what we last paid on a purchase order. */
  isDearer(row: SalesRfqCompareRow, cell: SalesRfqCompareCell | undefined): boolean {
    const last = row.lastPaid?.priceQar;
    const mine = cell?.quote?.unitPriceQar;
    return last != null && last > 0 && mine != null && cell!.quote!.availability !== 'Unavailable' && mine > last + 0.0001;
  }

  readonly groups = computed<RowGroup[]>(() => {
    const filter = this.filter();
    const map = new Map<string, RowGroup>();
    this.data().rows.forEach((row) => {
      const visible = this.matches(row, filter);
      if (!map.has(row.itemName)) map.set(row.itemName, { name: row.itemName, rows: [], awarded: 0 });
      const group = map.get(row.itemName)!;
      if (row.status === 'awarded') group.awarded++;
      if (visible) group.rows.push(row);
    });
    return Array.from(map.values()).filter((g) => g.rows.length);
  });

  readonly groupTotals = computed(() => {
    const totals = new Map<string, number>();
    this.data().rows.forEach((row) => totals.set(row.itemName, (totals.get(row.itemName) || 0) + 1));
    return totals;
  });

  /** A quote past its valid-until date is warned about, never blocked. */
  isExpired(date?: string): boolean {
    return !!date && new Date(date).getTime() < Date.now();
  }

  cellFor(row: SalesRfqCompareRow, column: SalesRfqCompareColumn): SalesRfqCompareCell | undefined {
    return row.cells.find((c) => c.rfqId === column._id);
  }

  canAward(row: SalesRfqCompareRow, cell: SalesRfqCompareCell | undefined): boolean {
    return !!cell?.quote && cell.quote.availability !== 'Unavailable' && cell.lineStatus !== 'Confirmed' && cell.lineStatus !== 'Unavailable';
  }

  /** Open products of the group this column priced; empty when it cannot take the whole group. */
  groupAwards(group: RowGroup, column: SalesRfqCompareColumn): RfqCompareAward[] {
    const rows = this.data().rows.filter((r) => r.itemName === group.name && r.status !== 'awarded' && r.status !== 'partial' && r.status !== 'unavailable');
    if (!rows.length) return [];
    const awards: RfqCompareAward[] = [];
    for (const row of rows) {
      const cell = this.cellFor(row, column);
      if (!cell || !this.canAward(row, cell)) return [];
      awards.push({ row, cell, quoteId: cell.quote!._id });
    }
    return awards;
  }

  /** Every open product this supplier can take, plus how many open ones it cannot. */
  supplierAwards(column: SalesRfqCompareColumn): { awards: RfqCompareAward[]; skipped: number } {
    const awards: RfqCompareAward[] = [];
    let skipped = 0;
    for (const row of this.data().rows) {
      if (row.status === 'awarded' || row.status === 'partial' || row.status === 'unavailable') continue;
      const cell = this.cellFor(row, column);
      if (cell && this.canAward(row, cell)) awards.push({ row, cell, quoteId: cell.quote!._id });
      else skipped++;
    }
    return { awards, skipped };
  }

  /** Each open product to its lowest priced supplier; part-awarded products are left for a manual pick. */
  readonly cheapestAwards = computed<{ awards: RfqCompareAward[]; skipped: number }>(() => {
    const awards: RfqCompareAward[] = [];
    let skipped = 0;
    for (const row of this.data().rows) {
      if (row.status !== 'open') continue;
      const cell = row.cells.find((c) => c.rfqId === row.lowestRfqId);
      if (cell && this.canAward(row, cell)) awards.push({ row, cell, quoteId: cell.quote!._id });
      else skipped++;
    }
    return { awards, skipped };
  });

  onAwardCheapest(): void {
    const { awards, skipped } = this.cheapestAwards();
    if (awards.length) this.awardCheapest.emit({ awards, skipped });
  }

  onAwardSupplier(column: SalesRfqCompareColumn): void {
    const { awards, skipped } = this.supplierAwards(column);
    if (awards.length) this.awardSupplier.emit({ column, awards, skipped });
  }

  onAwardGroup(group: RowGroup, column: SalesRfqCompareColumn): void {
    const awards = this.groupAwards(group, column);
    if (awards.length) this.awardGroup.emit({ group: group.name, column, awards });
  }

  onAward(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    this.award.emit({ row, cell, quoteId: cell.quote!._id });
  }

  onReopen(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    // A share of a split product is taken back on its own; a whole-product award reopens the product everywhere.
    const share = this.allowSplit() && (cell.awardedQty ?? 0) < row.quantity;
    this.award.emit({ row, cell, quoteId: null, ...(share ? { qty: 0 } : {}) });
  }

  /** Quantity of the product still without a supplier. */
  remaining(row: SalesRfqCompareRow): number {
    return Math.max(0, row.quantity - (row.allocatedQty ?? 0));
  }

  /** The most this supplier can take now: what is left, and no more than it quoted. */
  maxFor(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): number {
    const offered = cell.quote?.quantity ?? 0;
    const left = row.status === 'awarded' ? row.quantity : this.remaining(row);
    return offered > 0 ? Math.min(offered, left) : left;
  }

  cellKey(cell: SalesRfqCompareCell): string {
    return `${cell.rfqId}|${cell.lineKey}`;
  }

  openSplit(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    this.splitQty.set(this.maxFor(row, cell));
    this.splitKey.set(this.cellKey(cell));
  }

  confirmSplit(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    const qty = Math.floor(Number(this.splitQty()) || 0);
    if (qty <= 0 || qty > this.maxFor(row, cell)) return;
    this.splitKey.set(null);
    this.award.emit({ row, cell, quoteId: cell.quote!._id, qty });
  }

  /** Gives the supplier what is left of a part-awarded product (no more than it quoted). */
  awardRemaining(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    this.award.emit({ row, cell, quoteId: cell.quote!._id, qty: this.maxFor(row, cell) });
  }

  supplierFor(rfqId: string | null): string {
    return this.data().rfqs.find((r) => r._id === rfqId)?.supplierName ?? '';
  }

  statusLabel(column: SalesRfqCompareColumn): string {
    return salesRfqStatusLabel(column.status, !!column.quotationId);
  }

  statusClasses(column: SalesRfqCompareColumn): string {
    return SALES_RFQ_BADGE_CLASSES[this.statusLabel(column)] || SALES_RFQ_BADGE_CLASSES['Draft'];
  }

  rowBadge(row: SalesRfqCompareRow): { label: string; classes: string; dot: string } {
    if (row.short && row.status !== 'awarded') {
      const got = row.allocatedQty ? `${row.allocatedQty} of ${row.quantity}` : 'None';
      return { label: `Short · ${got} awarded`, classes: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300', dot: 'bg-orange-500' };
    }
    switch (row.status) {
      case 'awarded': {
        const winners = row.cells.filter((c) => c.lineStatus === 'Confirmed');
        const label = winners.length > 1
          ? `Split: ${winners.map((c) => `${this.supplierFor(c.rfqId)} ${c.awardedQty}`).join(' + ')}`
          : `Won by ${this.supplierFor(row.awardedRfqId)}`;
        return { label, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', dot: 'bg-emerald-500' };
      }
      case 'partial': return { label: `${row.allocatedQty} of ${row.quantity} awarded · ${this.remaining(row)} to go`, classes: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', dot: 'bg-amber-500' };
      case 'unavailable': return { label: 'Unavailable everywhere', classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-400' };
      case 'waiting': return { label: 'Waiting for prices', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', dot: 'bg-amber-500' };
      default: return { label: 'Ready to award', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300', dot: 'bg-sky-500' };
    }
  }

  toggleGroup(name: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  initials(name: string): string {
    const words = (name || '?').trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] || '?') + (words[1]?.[0] || '')).toUpperCase();
  }

  /** Comparable unit price in QAR, or null when it cannot be converted. */
  private priceQar(cell: SalesRfqCompareCell | undefined): number | null {
    const q = cell?.quote;
    if (!q) return null;
    if (q.unitLandedQar != null) return q.unitLandedQar;
    return q.currency === 'QAR' ? (q.unitLanded ?? q.unitPrice ?? null) : null;
  }

  private pricedCount(row: SalesRfqCompareRow): number {
    return row.cells.filter((c) => c.quote && c.quote.availability !== 'Unavailable' && c.lineStatus !== 'Unavailable').length;
  }

  /** Lowest price on a line that more than one supplier priced. */
  isBest(row: SalesRfqCompareRow, column: SalesRfqCompareColumn): boolean {
    return row.lowestRfqId === column._id && this.pricedCount(row) > 1;
  }

  /** How far this price sits above the line's lowest, in percent. */
  deltaPct(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): number | null {
    if (!row.lowestRfqId || row.lowestRfqId === cell.rfqId) return null;
    const low = this.priceQar(row.cells.find((c) => c.rfqId === row.lowestRfqId));
    const mine = this.priceQar(cell);
    if (low == null || mine == null || low <= 0) return null;
    return ((mine - low) / low) * 100;
  }
}
