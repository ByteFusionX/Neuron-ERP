import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from '../modal-layout/modal-layout.component';
import { QuoteItem } from '../../interfaces/quotation.interface';

export interface PreviousJobItemRow {
  jobId: string;
  itemName: string;
  itemDetails: any[];
  selected: boolean;
}

export interface PreviousJobsModalData {
  items: { jobId: string; item: QuoteItem }[];
}

@Component({
  selector: 'app-previous-jobs-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalLayoutComponent],
  templateUrl: './previous-jobs-modal.component.html',
})
export class PreviousJobsModalComponent {
  rows: PreviousJobItemRow[] = [];

  constructor(
    public dialogRef: MatDialogRef<PreviousJobsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PreviousJobsModalData,
  ) {
    this.rows = (data.items || []).map(({ jobId, item }) => ({
      jobId,
      itemName: item.itemName,
      itemDetails: item.itemDetails,
      selected: false,
    }));
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((r) => r.selected);
  }

  get someSelected(): boolean {
    return this.rows.some((r) => r.selected) && !this.allSelected;
  }

  toggleSelectAll(checked: boolean): void {
    this.rows.forEach((r) => (r.selected = checked));
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.dialogRef.close(null) },
      {
        label: 'Add to Quote',
        theme: 'primary',
        disabled: !this.rows.some((r) => r.selected),
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
