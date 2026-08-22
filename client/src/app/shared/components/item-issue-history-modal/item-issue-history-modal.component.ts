import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { ViewCommentComponent } from 'src/app/modules/assigned-jobs/pages/view-comment/view-comment.component';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PdfPreviewComponent } from '../pdf-preview/pdf-preview.component';
import { LpoActionGates } from 'src/app/shared/utils/lpo-action-gates.util';

export interface ItemIssueEntry {
  grnNo: string;
  grnDate: any;
  poNo: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
}

export interface LpoStatusEntry {
  lpoId?: string;
  purchaseId?: string;
  poNo: string;
  poStatus: string;
  poDate: any;
  issuedQty: number;
  comment?: string;
  // Full LPO document, needed to generate the View/Download PDF the same way
  // lpo-list.component.ts does — the summary fields above aren't enough.
  lpo?: any;
}

export interface ItemIssueHistoryModalData {
  itemDetail: string;
  partNo: string;
  orderedQty: number;
  issues: ItemIssueEntry[];
  lpoStatuses: LpoStatusEntry[];
  deliveredQty: number;
  pendingDeliveryQty: number;
  canInitiateLPO?: boolean;
  canReissueAndRevoke?: boolean;
}

export interface CombinedIssueRow {
  lpoId?: string;
  purchaseId?: string;
  poNo: string;
  poDate: any;
  poStatus: string;
  issuedQty: number;
  comment?: string;
  lpo?: any;
  isFirstForPo: boolean;
  grnNo: string | null;
  grnDate: any;
  receivedQty: number | null;
  acceptedQty: number | null;
  rejectedQty: number | null;
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
  combinedRows: CombinedIssueRow[] = [];
  // Set to true whenever an action performed inside this modal mutates the
  // underlying LPO (send for approval / revoke), so the parent view knows to
  // reload the item's history instead of trusting this now-stale table.
  private needsRefresh = false;

  constructor(
    public dialogRef: MatDialogRef<ItemIssueHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ItemIssueHistoryModalData,
    private dialog: MatDialog,
    private router: Router,
    private toastr: ToastrService,
    private purchaseOrderService: PurchaseOrderService,
    private purchaseService: PurchaseService,
  ) {}

  ngOnInit(): void {
    // Issued: total qty across LPOs still pending approval, approved, or closed.
    this.totalIssuedQty = this.data.lpoStatuses
      .filter((lpo) => ['Pending for Approval', 'Approved', 'Closed'].includes(lpo.poStatus))
      .reduce((sum, lpo) => sum + (lpo.issuedQty || 0), 0);
    // Pending: qty on LPOs still awaiting approval.
    this.pendingQty = this.data.lpoStatuses
      .filter((lpo) => lpo.poStatus === 'Pending for Approval')
      .reduce((sum, lpo) => sum + (lpo.issuedQty || 0), 0);
    this.totalReceivedQty = this.data.issues.reduce((sum, issue) => sum + (issue.acceptedQty || 0), 0);
    // Balance: accepted into stock via GRN but not yet dispatched out on a DN.
    this.balanceQty = Math.max(0, this.totalReceivedQty - this.data.deliveredQty);
    this.combinedRows = this.buildCombinedRows();
  }

  private buildCombinedRows(): CombinedIssueRow[] {
    const rows: CombinedIssueRow[] = [];

    this.data.lpoStatuses.forEach((lpo) => {
      const matchingIssues = this.data.issues.filter((issue) => issue.poNo === lpo.poNo);

      if (matchingIssues.length === 0) {
        // LPO issued but no GRN raised against it yet.
        rows.push({
          lpoId: lpo.lpoId,
          purchaseId: lpo.purchaseId,
          poNo: lpo.poNo,
          poDate: lpo.poDate,
          poStatus: lpo.poStatus,
          issuedQty: lpo.issuedQty,
          comment: lpo.comment,
          lpo: lpo.lpo,
          isFirstForPo: true,
          grnNo: null,
          grnDate: null,
          receivedQty: null,
          acceptedQty: null,
          rejectedQty: null,
        });
        return;
      }

      matchingIssues.forEach((issue, index) => {
        rows.push({
          lpoId: lpo.lpoId,
          purchaseId: lpo.purchaseId,
          poNo: lpo.poNo,
          poDate: lpo.poDate,
          poStatus: lpo.poStatus,
          issuedQty: lpo.issuedQty,
          comment: lpo.comment,
          lpo: lpo.lpo,
          // Multiple GRNs can exist against the same LPO; the LPO-level
          // actions (edit/reissue/revoke) apply to the whole LPO, so only
          // render them once per LPO group rather than on every GRN row.
          isFirstForPo: index === 0,
          grnNo: issue.grnNo,
          grnDate: issue.grnDate,
          receivedQty: issue.receivedQty,
          acceptedQty: issue.acceptedQty,
          rejectedQty: issue.rejectedQty,
        });
      });
    });

    return rows;
  }

  canViewOrDownload(row: CombinedIssueRow): boolean {
    return (row.poStatus === 'Approved' || row.poStatus === 'Closed') && !!row.lpo;
  }

  canEdit(row: CombinedIssueRow): boolean {
    return LpoActionGates.canEdit(row.poStatus);
  }

  canSendForApproval(row: CombinedIssueRow): boolean {
    return LpoActionGates.canSendForApproval(row.poStatus) && !!this.data.canInitiateLPO;
  }

  canReIssue(row: CombinedIssueRow): boolean {
    return LpoActionGates.canReIssue(row.poStatus) && !!this.data.canReissueAndRevoke;
  }

  canRevoke(row: CombinedIssueRow): boolean {
    return LpoActionGates.canRevoke(row.poStatus) && !!this.data.canReissueAndRevoke;
  }

  hasAnyAction(row: CombinedIssueRow): boolean {
    return (
      !!row.comment ||
      this.canViewOrDownload(row) ||
      this.canEdit(row) ||
      this.canSendForApproval(row) ||
      this.canReIssue(row) ||
      this.canRevoke(row)
    );
  }

  async onViewLpo(row: CombinedIssueRow): Promise<void> {
    if (!row.lpo) return;
    const pdfDoc = await this.purchaseService.generatePDF(row.lpo, true);
    pdfDoc.getBlob((blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      this.dialog.open(PdfPreviewComponent, { data: { url, formatedQuote: row.lpo, type: 'purchase' } });
    });
  }

  onDownloadLpo(row: CombinedIssueRow): void {
    if (!row.lpo) return;
    this.purchaseService.generatePDF(row.lpo, true).then((pdf) => {
      pdf.download(row.poNo);
    });
  }

  onViewComment(row: CombinedIssueRow): void {
    this.dialog.open(ViewCommentComponent, {
      width: '500px',
      data: { comment: row.comment },
    });
  }

  onEditLpo(row: CombinedIssueRow): void {
    if (!row.lpoId || !row.purchaseId) return;
    this.dialogRef.close({ refreshed: this.needsRefresh });
    this.router.navigate(['/purchase/issue-lpo', row.purchaseId, 'edit', row.lpoId]);
  }

  onReIssueLpo(row: CombinedIssueRow): void {
    if (!row.lpoId || !row.purchaseId) return;
    this.dialogRef.close({ refreshed: this.needsRefresh });
    this.router.navigate(['/purchase/issue-lpo', row.purchaseId, 'reissue', row.lpoId]);
  }

  onSendForApproval(row: CombinedIssueRow): void {
    if (!row.lpoId) return;
    this.purchaseOrderService.updatePurchaseOrderStatus(row.lpoId, 'Pending for Approval').subscribe({
      next: (response: any) => {
        if (response.success) {
          this.toastr.success('LPO sent for approval successfully');
          this.needsRefresh = true;
          this.dialogRef.close({ refreshed: true });
        } else {
          this.toastr.error('Failed to send LPO for approval');
        }
      },
      error: (error: any) => {
        console.error('Error sending LPO for approval:', error);
        this.toastr.error('Failed to send LPO for approval: ' + (error.error?.message || error.message));
      },
    });
  }

  onRevokeLpo(row: CombinedIssueRow): void {
    if (!row.lpoId) return;
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Revoke LPO',
        description: `Are you sure you want to revoke (permanently delete) LPO "${row.poNo}"? This action cannot be undone and will permanently delete the LPO.`,
        icon: 'heroExclamationCircle',
        IconColor: 'red',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (!confirmed || !row.lpoId) return;
      this.purchaseOrderService.revokePurchaseOrder(row.lpoId).subscribe({
        next: (response: any) => {
          if (response.success) {
            this.toastr.success('LPO revoked successfully');
            this.needsRefresh = true;
            this.dialogRef.close({ refreshed: true });
          } else {
            this.toastr.error('Failed to revoke LPO');
          }
        },
        error: (error: any) => {
          console.error('Error revoking LPO:', error);
          this.toastr.error('Failed to revoke LPO: ' + (error.error?.message || error.message));
        },
      });
    });
  }

  onClose(): void {
    this.dialogRef.close({ refreshed: this.needsRefresh });
  }

  formatStatus(poStatus: string): string {
    // Underlying value stays 'Pending for Approval' (used everywhere else in
    // the app for status gating/filtering) — only shortened for display here.
    return poStatus === 'Pending for Approval' ? 'Pending' : poStatus;
  }

  formatDate(date: any): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
