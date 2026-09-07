import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';

export interface ViewPoDetailsModalData {
  poNo: string;
}

@Component({
  selector: 'app-view-po-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-po-details-modal.component.html',
  styleUrls: ['./view-po-details-modal.component.css']
})
export class ViewPoDetailsModalComponent implements OnInit {
  po: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewPoDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewPoDetailsModalData,
    private purchaseOrderService: PurchaseOrderService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadPurchaseOrder();
  }

  loadPurchaseOrder(): void {
    this.isLoading.set(true);
    this.purchaseOrderService.getPurchaseOrderByPoNo(this.data.poNo).subscribe({
      next: (response: any) => {
        this.po = response?.data || response;
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching purchase order details:', error);
        this.toastr.error('Failed to load purchase order details');
        this.isLoading.set(false);
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    return partNo.partNo || '-';
  }

  formatPlainNumber(value: any): string {
    const num = Number(value);
    if (isNaN(num)) return '-';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
