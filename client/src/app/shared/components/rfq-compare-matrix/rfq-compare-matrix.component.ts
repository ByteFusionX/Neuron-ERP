import { DecimalPipe, NgClass } from '@angular/common';
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
}

interface RowGroup {
  name: string;
  rows: SalesRfqCompareRow[];
  awarded: number;
}

type RowFilter = 'all' | 'open' | 'awarded';

/**
 * Supplier comparison grid: products down the side (grouped by item), one column per supplier request,
 * each cell that supplier's price. Shows which products are still open and who won the others.
 * Presentational only, so any request-for-quote flow can feed it the same shape.
 */
@Component({
  selector: 'app-rfq-compare-matrix',
  standalone: true,
  imports: [NgClass, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rfq-compare-matrix.component.html',
})
export class RfqCompareMatrixComponent {
  readonly data = input.required<SalesRfqComparison>();
  readonly locked = input(false);
  readonly busy = input(false);

  readonly award = output<RfqCompareAward>();
  /** Award every still-open product of a group to one supplier column. */
  readonly awardGroup = output<{ group: string; column: SalesRfqCompareColumn; awards: RfqCompareAward[] }>();
  readonly openRfq = output<string>();

  readonly filter = signal<RowFilter>('all');

  readonly coveragePct = computed(() => {
    const c = this.data().coverage;
    return c.total ? Math.round(((c.awarded + c.unavailable) / c.total) * 100) : 0;
  });

  readonly groups = computed<RowGroup[]>(() => {
    const filter = this.filter();
    const map = new Map<string, RowGroup>();
    this.data().rows.forEach((row) => {
      const visible = filter === 'all'
        || (filter === 'awarded' ? row.status === 'awarded' : row.status === 'open' || row.status === 'waiting');
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

  cellFor(row: SalesRfqCompareRow, column: SalesRfqCompareColumn): SalesRfqCompareCell | undefined {
    return row.cells.find((c) => c.rfqId === column._id);
  }

  canAward(row: SalesRfqCompareRow, cell: SalesRfqCompareCell | undefined): boolean {
    return !!cell?.quote && cell.quote.availability !== 'Unavailable' && cell.lineStatus !== 'Confirmed' && cell.lineStatus !== 'Unavailable';
  }

  /** Open products of the group this column priced; empty when it cannot take the whole group. */
  groupAwards(group: RowGroup, column: SalesRfqCompareColumn): RfqCompareAward[] {
    const rows = this.data().rows.filter((r) => r.itemName === group.name && r.status !== 'awarded' && r.status !== 'unavailable');
    if (!rows.length) return [];
    const awards: RfqCompareAward[] = [];
    for (const row of rows) {
      const cell = this.cellFor(row, column);
      if (!cell || !this.canAward(row, cell)) return [];
      awards.push({ row, cell, quoteId: cell.quote!._id });
    }
    return awards;
  }

  onAwardGroup(group: RowGroup, column: SalesRfqCompareColumn): void {
    const awards = this.groupAwards(group, column);
    if (awards.length) this.awardGroup.emit({ group: group.name, column, awards });
  }

  onAward(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    this.award.emit({ row, cell, quoteId: cell.quote!._id });
  }

  onReopen(row: SalesRfqCompareRow, cell: SalesRfqCompareCell): void {
    this.award.emit({ row, cell, quoteId: null });
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

  rowBadge(row: SalesRfqCompareRow): { label: string; classes: string } {
    switch (row.status) {
      case 'awarded': return { label: `Won by ${this.supplierFor(row.awardedRfqId)}`, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' };
      case 'unavailable': return { label: 'Unavailable everywhere', classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
      case 'waiting': return { label: 'Waiting for prices', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' };
      default: return { label: 'Open', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' };
    }
  }
}
