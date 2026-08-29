import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from '../modal-layout/modal-layout.component';

export interface RejectDnItemRow {
  itemId: string;
  description: string;
  partNo: string;
  deliveredQty: number;
  alreadyRejectedQty: number;
  rejectedQty: number;
  reason: string;
  selected: boolean;
}

export interface RejectDnItemsModalData {
  items: {
    itemId: string;
    description: string;
    partNo: string;
    deliveredQty: number;
    rejectedQty?: number;
  }[];
}

export interface RejectDnItemsModalResult {
  items: { itemId: string; rejectedQty: number; reason: string }[];
  reason: string;
}

@Component({
  selector: 'app-reject-dn-items-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalLayoutComponent],
  templateUrl: './reject-dn-items-modal.component.html'
})
export class RejectDnItemsModalComponent {
  rows: RejectDnItemRow[] = [];
  overallReason = '';
  touched = false;

  constructor(
    public dialogRef: MatDialogRef<RejectDnItemsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RejectDnItemsModalData
  ) {
    this.rows = (data.items || []).map(item => ({
      itemId: item.itemId,
      description: item.description,
      partNo: item.partNo,
      deliveredQty: item.deliveredQty,
      alreadyRejectedQty: item.rejectedQty || 0,
      rejectedQty: 0,
      reason: '',
      selected: false
    }));
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.dialogRef.close(null) },
      { label: 'Reject Selected', theme: 'primary', onClick: () => this.onConfirm() }
    ];
  }

  maxRejectable(row: RejectDnItemRow): number {
    return Math.max(0, row.deliveredQty - row.alreadyRejectedQty);
  }

  isRowValid(row: RejectDnItemRow): boolean {
    if (!row.selected) return true;
    return row.rejectedQty > 0 && row.rejectedQty <= this.maxRejectable(row) && !!row.reason.trim();
  }

  onConfirm(): void {
    this.touched = true;
    const selectedRows = this.rows.filter(r => r.selected);

    if (selectedRows.length === 0) {
      return;
    }

    if (!this.overallReason.trim() || selectedRows.some(r => !this.isRowValid(r))) {
      return;
    }

    const result: RejectDnItemsModalResult = {
      items: selectedRows.map(r => ({
        itemId: r.itemId,
        rejectedQty: r.rejectedQty,
        reason: r.reason.trim()
      })),
      reason: this.overallReason.trim()
    };

    this.dialogRef.close(result);
  }
}
