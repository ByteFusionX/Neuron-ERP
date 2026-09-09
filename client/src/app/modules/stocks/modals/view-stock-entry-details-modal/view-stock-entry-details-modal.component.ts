import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { NgIcon } from '@ng-icons/core';
import { MatTooltip } from '@angular/material/tooltip';
import { ModalLayoutComponent, ModalFooterButton } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { StockEntry, StockEntryService } from 'src/app/core/services/stock-entry/stock-entry.service';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ResolveStockHoldComponent } from 'src/app/modules/grn/pages/stock-holds/modals/resolve-stock-hold/resolve-stock-hold.component';
import { DisputeStockHoldComponent } from 'src/app/modules/grn/pages/stock-holds/modals/dispute-stock-hold/dispute-stock-hold.component';
import { ResolveDisputeComponent } from 'src/app/modules/grn/pages/stock-holds/modals/resolve-dispute/resolve-dispute.component';

export interface ViewStockEntryDetailsModalData {
  stockEntry: StockEntry;
}

@Component({
  selector: 'app-view-stock-entry-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent, NgIcon, MatTooltip],
  templateUrl: './view-stock-entry-details-modal.component.html',
  styleUrls: ['./view-stock-entry-details-modal.component.css']
})
export class ViewStockEntryDetailsModalComponent implements OnInit {
  stockEntry: StockEntry;
  wasUpdated = false;
  stockHold: any = null;
  canInitiateHold = false;
  footerButtons: ModalFooterButton[] = [];

  constructor(
    public dialogRef: MatDialogRef<ViewStockEntryDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewStockEntryDetailsModalData,
    private stockEntryService: StockEntryService,
    private stockHoldService: StockHoldService,
    private employeeService: EmployeeService,
    private toastr: ToastrService,
    private dialog: MatDialog
  ) {
    this.stockEntry = data.stockEntry;
  }

  ngOnInit(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        const privileges = data.category.privileges as any;
        const hasGrnView = privileges.grn?.viewReport && privileges.grn.viewReport !== 'none';
        this.canInitiateHold = privileges.stockHold?.canInitiateHold || hasGrnView || false;
        this.loadStockHold();
      }
    });
  }

  loadStockHold(): void {
    if (!this.stockEntry?.isQuarantined) return;

    this.stockHoldService.getStockHolds({ stockEntryId: this.stockEntry._id }).subscribe({
      next: (response) => {
        const holds = response?.data || [];
        this.stockHold = holds.find((h: any) => (h.stockEntryId === this.stockEntry._id) || (h.stockEntryId?._id === this.stockEntry._id)) || null;
        this.setupFooterButtons();
      },
      error: () => {
        this.stockHold = null;
      }
    });
  }

  setupFooterButtons(): void {
    if (!this.stockHold || !this.canInitiateHold) {
      this.footerButtons = [];
      return;
    }

    const buttons: ModalFooterButton[] = [];

    if (this.stockHold.unresolvedQty > 0 && this.stockHold.disputeStatus !== 'SupplierDisputed') {
      buttons.push({ label: 'Resolve', theme: 'primary', icon: 'heroCheckCircle', onClick: () => this.onResolve() });
    }

    if (this.stockHold.disputeStatus === 'None') {
      buttons.push({ label: 'Dispute', theme: 'danger', icon: 'heroFlag', onClick: () => this.onDispute() });
    }

    if (this.stockHold.disputeStatus === 'SupplierDisputed') {
      buttons.push({ label: 'Resolve Dispute', theme: 'secondary', icon: 'heroShieldCheck', onClick: () => this.onResolveDispute() });
    }

    this.footerButtons = buttons;
  }

  onResolve(): void {
    const dialogRef = this.dialog.open(ResolveStockHoldComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: this.stockHold }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.wasUpdated = true;
        this.loadStockHold();
      }
    });
  }

  onDispute(): void {
    const dialogRef = this.dialog.open(DisputeStockHoldComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: this.stockHold }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.wasUpdated = true;
        this.loadStockHold();
      }
    });
  }

  onResolveDispute(): void {
    const dialogRef = this.dialog.open(ResolveDisputeComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: this.stockHold }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.wasUpdated = true;
        this.loadStockHold();
      }
    });
  }

  onClose(): void {
    this.dialogRef.close(this.wasUpdated ? 'updated' : undefined);
  }

  onEdit(): void {
    this.dialogRef.close('edit');
  }

  onDelete(): void {
    this.dialogRef.close('delete');
  }

  onBlock(): void {
    this.dialogRef.close('block');
  }

  onReleaseQuarantine(): void {
    this.dialogRef.close('release');
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatPlainNumber(value: any): string {
    const num = Number(value);
    if (isNaN(num)) return '-';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
