import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { DetailClauseListComponent } from 'src/app/shared/components/detail-panel/detail-clause-list.component';
import { DetailRevisionChipComponent } from 'src/app/shared/components/detail-panel/detail-revision-chip.component';
import { DetailClause } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { QuoteRevision, QuoteRevisionSnapshot } from 'src/app/shared/interfaces/quotation.interface';

export interface RevisionHistoryModalData {
  quoteId: string;
  quoteRef?: string;
}

/** A revision as the rail renders it: the snapshot plus who produced it. */
interface RevisionRow {
  revision: number;
  current: boolean;
  /** Who made the edit that produced this revision, and when. Absent on the original. */
  by: string;
  at: string | null;
  reason: string;
  /** Field labels this revision changed against the one before it. */
  changed: string[];
  /** Line-level item changes against the previous revision. */
  itemChanges: ItemChange[];
  snapshot: QuoteRevisionSnapshot;
  /** Precomputed so the template doesn't rebuild them on every change-detection pass. */
  items: SnapshotItem[];
  clauses: DetailClause[];
}

/** One option's items, flattened for the snapshot table. */
interface SnapshotItem {
  name: string;
  detail: string;
  quantity: number | string;
  uom: string;
}

/** One item line that differs from the previous revision. */
interface ItemChange {
  kind: 'added' | 'removed' | 'qty';
  name: string;
  detail: string;
  /** Human text for the change, e.g. "10 nos → 12 nos". */
  text: string;
}

const FIELD_LABELS: Record<keyof QuoteRevisionSnapshot, string> = {
  subject: 'Subject',
  currency: 'Currency',
  optionalItems: 'Items',
  customerNote: 'Customer notes',
  termsAndCondition: 'Terms & conditions',
};

/**
 * Read-only browser for a quote's revisions: the rail lists them newest first, the pane shows
 * that revision's commercial content. Nothing here writes — restoring is not supported.
 */
@Component({
  selector: 'app-revision-history-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent, DetailClauseListComponent, DetailRevisionChipComponent],
  template: `
    <app-modal-layout
      title="Revision History"
      [subtitle]="data.quoteRef ? 'Commercial content of ' + data.quoteRef + ' at each revision' : 'Commercial content at each revision'"
      [onClose]="close.bind(this)"
      [footerButtons]="footerButtons"
    >
      <div class="p-4">
        <p *ngIf="loading" class="py-10 text-center text-[13px] text-gray-500 dark:text-gray-400">Loading revisions…</p>

        <p *ngIf="!loading && error" class="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-[13px] text-gray-500 dark:border-erp-border-dark dark:text-gray-400">
          {{ error }}
        </p>

        <div *ngIf="!loading && !error" class="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
          <!-- rail -->
          <ol class="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            <li *ngFor="let r of rows" class="shrink-0 md:shrink">
              <button
                type="button"
                (click)="selected = r"
                class="w-full rounded-lg border px-3 py-2.5 text-left transition-colors"
                [ngClass]="r === selected
                  ? 'border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-erp-border-dark dark:bg-white/[0.02] dark:hover:bg-white/[0.05]'"
              >
                <div class="flex items-center gap-2">
                  <app-detail-revision-chip [revision]="r.revision" [muted]="r !== selected"></app-detail-revision-chip>
                  <span *ngIf="r.current" class="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Current</span>
                </div>
                <p class="mt-1 truncate text-xs text-gray-600 dark:text-gray-400">{{ r.by || 'Original quotation' }}</p>
                <p *ngIf="r.at" class="text-[11px] text-gray-400 dark:text-gray-500">{{ r.at | date: 'dd MMM yyyy, h:mm a' }}</p>
              </button>
            </li>
          </ol>

          <!-- selected revision -->
          <div *ngIf="selected as s" class="min-w-0 space-y-4">
            <div class="rounded-lg border border-gray-200 p-3 dark:border-erp-border-dark">
              <div class="flex flex-wrap items-center gap-2">
                <app-detail-revision-chip [revision]="s.revision"></app-detail-revision-chip>
                <span class="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{{ s.snapshot.subject || 'No subject' }}</span>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                <ng-container *ngIf="s.by; else original">Saved by {{ s.by }}<span *ngIf="s.at"> on {{ s.at | date: 'dd MMM yyyy, h:mm a' }}</span></ng-container>
                <ng-template #original>The quotation as it was first created.</ng-template>
              </p>
              <p *ngIf="s.reason" class="mt-2 border-l-2 border-gray-200 pl-2.5 text-xs italic text-gray-600 dark:border-erp-border-dark dark:text-gray-400">“{{ s.reason }}”</p>

              <ul *ngIf="s.itemChanges.length" class="mt-2.5 space-y-1 border-t border-gray-100 pt-2.5 dark:border-erp-border-dark">
                <li class="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Changes in this revision</li>
                <li *ngFor="let c of s.itemChanges" class="flex items-baseline gap-2 text-xs">
                  <span class="w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase"
                    [ngClass]="c.kind === 'added' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : c.kind === 'removed' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'">{{ c.kind === 'qty' ? 'Qty' : c.kind }}</span>
                  <span class="min-w-0 text-gray-700 dark:text-gray-300">{{ c.name }}<span *ngIf="c.detail" class="text-gray-500 dark:text-gray-400"> — {{ c.detail }}</span></span>
                  <span *ngIf="c.text" class="ml-auto shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{{ c.text }}</span>
                </li>
              </ul>

              <div *ngIf="s.changed.length" class="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Changed</span>
                <span *ngFor="let c of s.changed" class="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{{ c }}</span>
              </div>
            </div>

            <div>
              <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Items <span class="normal-case tracking-normal text-gray-400">({{ s.snapshot.currency || '—' }})</span>
              </h4>
              <div *ngIf="s.items.length; else noItems" class="overflow-hidden rounded-lg border border-gray-200 dark:border-erp-border-dark">
                <table class="w-full text-[13px]">
                  <thead class="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">Item</th>
                      <th class="px-3 py-2 text-left font-medium">Detail</th>
                      <th class="px-3 py-2 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-erp-border-dark">
                    <tr *ngFor="let it of s.items">
                      <td class="px-3 py-2 align-top text-gray-900 dark:text-gray-100">{{ it.name }}</td>
                      <td class="px-3 py-2 align-top text-gray-600 dark:text-gray-400">{{ it.detail }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-gray-600 dark:text-gray-400">{{ it.quantity }} {{ it.uom }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ng-template #noItems>
                <p class="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-[13px] text-gray-500 dark:border-erp-border-dark dark:text-gray-400">No items recorded at this revision.</p>
              </ng-template>
            </div>

            <div>
              <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Notes &amp; Terms</h4>
              <app-detail-clause-list [clauses]="s.clauses" emptyMessage="No notes or terms at this revision."></app-detail-clause-list>
            </div>
          </div>
        </div>
      </div>
    </app-modal-layout>
  `,
})
export class RevisionHistoryModalComponent {
  rows: RevisionRow[] = [];
  selected: RevisionRow | null = null;
  loading = true;
  error = '';

  readonly footerButtons: ModalFooterButton[] = [
    { label: 'Close', theme: 'cancel', onClick: () => this.close() },
  ];

  constructor(
    public dialogRef: MatDialogRef<RevisionHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RevisionHistoryModalData,
    private quotationService: QuotationService,
  ) {
    this.quotationService.getQuoteRevisions(data.quoteId).subscribe({
      next: (res) => {
        this.rows = this.buildRows(res.revisions || []);
        this.selected = this.rows[0] || null;
        this.loading = false;
        if (!this.rows.length) this.error = 'No revisions recorded for this quotation.';
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load revisions.';
      },
    });
  }

  /**
   * The API stores, against each superseded revision, the edit that replaced it. The rail reads
   * better the other way round, so that metadata is shifted onto the revision the edit produced.
   */
  private buildRows(list: QuoteRevision[]): RevisionRow[] {
    return list.map((r, i) => {
      const producedBy = list[i + 1];
      const previous = list[i + 1]?.snapshot;
      const name = producedBy?.savedBy
        ? `${producedBy.savedBy.firstName ?? ''} ${producedBy.savedBy.lastName ?? ''}`.trim()
        : '';
      const snapshot = r.snapshot || ({} as QuoteRevisionSnapshot);
      return {
        revision: r.revision,
        current: !!r.current,
        by: name,
        at: producedBy?.savedAt ?? null,
        reason: producedBy?.reason ?? '',
        changed: previous ? this.changedFields(previous, snapshot) : [],
        itemChanges: previous ? this.diffItems(this.flattenItems(previous), this.flattenItems(snapshot)) : [],
        snapshot,
        items: this.flattenItems(snapshot),
        clauses: this.buildClauses(snapshot),
      };
    });
  }

  private changedFields(before: QuoteRevisionSnapshot, after: QuoteRevisionSnapshot): string[] {
    const keys = Object.keys(FIELD_LABELS) as (keyof QuoteRevisionSnapshot)[];
    return keys
      .filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null))
      .map((k) => FIELD_LABELS[k]);
  }

  /** Lines matched on name + detail; a matched line whose quantity moved is a "qty" change. */
  private diffItems(before: SnapshotItem[], after: SnapshotItem[]): ItemChange[] {
    const key = (i: SnapshotItem) => `${i.name}\u0000${i.detail}`;
    const qty = (i: SnapshotItem) => `${i.quantity} ${i.uom}`.trim();
    const prev = new Map(before.map((i) => [key(i), i]));
    const next = new Map(after.map((i) => [key(i), i]));
    const out: ItemChange[] = [];
    for (const [k, i] of next) {
      const old = prev.get(k);
      if (!old) out.push({ kind: 'added', name: i.name, detail: i.detail, text: qty(i) });
      else if (qty(old) !== qty(i)) out.push({ kind: 'qty', name: i.name, detail: i.detail, text: `${qty(old)} → ${qty(i)}` });
    }
    for (const [k, i] of prev) if (!next.has(k)) out.push({ kind: 'removed', name: i.name, detail: i.detail, text: qty(i) });
    return out;
  }

  /** Every option's items flattened to one row per detail line. */
  private flattenItems(snapshot: QuoteRevisionSnapshot): SnapshotItem[] {
    const out: SnapshotItem[] = [];
    for (const option of snapshot?.optionalItems || []) {
      for (const item of option?.items || []) {
        for (const d of item?.itemDetails || []) {
          out.push({ name: item.itemName, detail: d.detail, quantity: d.quantity ?? '', uom: d.uom ?? '' });
        }
      }
    }
    return out;
  }

  private buildClauses(snapshot: QuoteRevisionSnapshot): DetailClause[] {
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    return [
      { id: 'notes', title: 'Customer Notes', body: text(snapshot?.customerNote) },
      { id: 'terms', title: 'Terms and Conditions', body: text(snapshot?.termsAndCondition) },
    ].filter((c): c is DetailClause => !!c.body);
  }

  close(): void {
    this.dialogRef.close(null);
  }
}
