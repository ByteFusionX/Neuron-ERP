import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from '../modal-layout/modal-layout.component';
import { SmartFormModule } from '../smart-form';
import { QuoteItem } from '../../interfaces/quotation.interface';

export interface PreviousJobItemRow {
  jobId: string;
  jobStatus?: string;
  createdDate?: string;
  itemName: string;
  itemDetails: any[];
  selected: boolean;
}

export interface PreviousJobsModalData {
  items: { jobId: string; jobStatus?: string; createdDate?: string; item: QuoteItem }[];
}

interface JobGroup {
  jobId: string;
  jobStatus?: string;
  createdDate?: string;
  rows: PreviousJobItemRow[];
}

/** Picker for items from the client's earlier jobs. Closes with `{ items }` (the ticked ones) or null. */
@Component({
  selector: 'app-previous-jobs-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalLayoutComponent, SmartFormModule],
  templateUrl: './previous-jobs-modal.component.html',
})
export class PreviousJobsModalComponent {
  rows: PreviousJobItemRow[] = [];
  groups: JobGroup[] = [];
  private _search = '';

  constructor(
    public dialogRef: MatDialogRef<PreviousJobsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PreviousJobsModalData,
  ) {
    this.rows = (data.items || []).map(({ jobId, jobStatus, createdDate, item }) => ({
      jobId,
      jobStatus,
      createdDate,
      itemName: item.itemName,
      itemDetails: item.itemDetails,
      selected: false,
    }));
    this.regroup();
  }

  get search(): string { return this._search; }
  set search(value: string) {
    this._search = value;
    this.regroup();
  }

  /** Rows matching the search, grouped by job in their original order. */
  private regroup(): void {
    const q = this._search.trim().toLowerCase();
    const matches = (r: PreviousJobItemRow) =>
      !q ||
      r.jobId?.toLowerCase().includes(q) ||
      r.itemName?.toLowerCase().includes(q) ||
      r.itemDetails?.some((d) => String(d.detail ?? '').toLowerCase().includes(q));
    const byJob = new Map<string, JobGroup>();
    for (const r of this.rows.filter(matches)) {
      let g = byJob.get(r.jobId);
      if (!g) byJob.set(r.jobId, (g = { jobId: r.jobId, jobStatus: r.jobStatus, createdDate: r.createdDate, rows: [] }));
      g.rows.push(r);
    }
    this.groups = [...byJob.values()];
  }

  get visibleRows(): PreviousJobItemRow[] { return this.groups.flatMap((g) => g.rows); }
  get selectedCount(): number { return this.rows.filter((r) => r.selected).length; }
  get allSelected(): boolean { return this.visibleRows.length > 0 && this.visibleRows.every((r) => r.selected); }

  groupAllSelected(g: JobGroup): boolean { return g.rows.every((r) => r.selected); }

  toggleSelectAll(checked: boolean): void { this.visibleRows.forEach((r) => (r.selected = checked)); }
  toggleGroup(g: JobGroup, checked: boolean): void { g.rows.forEach((r) => (r.selected = checked)); }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  get footerButtons(): ModalFooterButton[] {
    const n = this.selectedCount;
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.dialogRef.close(null) },
      {
        label: n ? `Add ${n} item${n === 1 ? '' : 's'} to Quote` : 'Add to Quote',
        theme: 'primary',
        disabled: !n,
        onClick: () => this.onAddToQuote(),
      },
    ];
  }

  onAddToQuote(): void {
    const selected = this.rows.filter((r) => r.selected);
    if (!selected.length) {
      return;
    }
    const items: QuoteItem[] = selected.map((r) => ({
      itemName: r.itemName,
      itemDetails: r.itemDetails,
    }));
    this.dialogRef.close({ items });
  }
}
