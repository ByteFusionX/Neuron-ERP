import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';

export interface ItemIssueEntry {
  grnNo: string;
  grnDate: any;
  poNo: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
}

export interface ItemIssueHistoryModalData {
  itemDetail: string;
  partNo: string;
  orderedQty: number;
  issues: ItemIssueEntry[];
}

@Component({
  selector: 'app-item-issue-history-modal',
  standalone: true,
  imports: [CommonModule, IconsModule, ModalLayoutComponent],
  templateUrl: './item-issue-history-modal.component.html',
  styleUrls: ['./item-issue-history-modal.component.css'],
})
export class ItemIssueHistoryModalComponent implements OnInit {
  totalIssuedQty = 0;
  totalReceivedQty = 0;
  pendingQty = 0;
  balanceQty = 0;

  constructor(
    public dialogRef: MatDialogRef<ItemIssueHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ItemIssueHistoryModalData,
  ) {}

  ngOnInit(): void {
    this.totalIssuedQty = this.data.issues.reduce((sum, issue) => sum + (issue.acceptedQty || 0), 0);
    this.totalReceivedQty = this.data.issues.reduce((sum, issue) => sum + (issue.receivedQty || 0), 0);
    // Pending: nothing physically received against this item yet.
    this.pendingQty = Math.max(0, this.data.orderedQty - this.totalReceivedQty);
    // Balance: still owed as accepted stock (accounts for anything received but rejected).
    this.balanceQty = Math.max(0, this.data.orderedQty - this.totalIssuedQty);
  }

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(date: any): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
