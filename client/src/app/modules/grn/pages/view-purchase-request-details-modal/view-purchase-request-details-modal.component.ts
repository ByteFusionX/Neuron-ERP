import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormModalShellComponent } from 'src/app/shared/components/modal/form-modal-shell/form-modal-shell.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { ToastrService } from 'ngx-toastr';

export interface ViewPurchaseRequestDetailsModalData {
  purchaseId: string;
  purchaseOrderId?: string;
}

@Component({
  selector: 'app-view-purchase-request-details-modal',
  standalone: true,
  imports: [CommonModule, FormModalShellComponent, DetailTableComponent],
  templateUrl: './view-purchase-request-details-modal.component.html',
  styleUrls: ['./view-purchase-request-details-modal.component.css']
})
export class ViewPurchaseRequestDetailsModalComponent implements OnInit {
  readonly prItemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' }, { key: 'detail', label: 'Detail', wrap: true },
    { key: 'qty', label: 'Qty', type: 'number' }, { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
    { key: 'supplier', label: 'Supplier' },
  ];
  readonly lpoItemColumns: DetailTableColumn[] = [
    { key: 'partNo', label: 'Part No.' }, { key: 'description', label: 'Description', wrap: true },
    { key: 'orderedQty', label: 'Ordered', type: 'number' }, { key: 'issuedQty', label: 'Issued', type: 'number' },
    { key: 'pendingQty', label: 'Pending', type: 'number' }, { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
    { key: 'totalCost', label: 'Total', type: 'currency', total: true },
  ];
  purchaseRequest: any = null;
  purchaseOrder: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewPurchaseRequestDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewPurchaseRequestDetailsModalData,
    private purchaseService: PurchaseService,
    private purchaseOrderService: PurchaseOrderService,
    private notificationService: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadDetails();
  }

  loadDetails(): void {
    this.isLoading.set(true);

    this.purchaseService.getPurchaseById(this.data.purchaseId).subscribe({
      next: (response: any) => {
        this.purchaseRequest = response?.data || response;
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching PR details:', error);
        this.notificationService.error('Failed to load Purchase Request details');
        this.isLoading.set(false);
      }
    });

    if (this.data.purchaseOrderId) {
      this.purchaseOrderService.getPurchaseOrderById(this.data.purchaseOrderId).subscribe({
        next: (response: any) => {
          this.purchaseOrder = response?.data || response;
        },
        error: (error: any) => {
          console.error('Error fetching PO details:', error);
        }
      });
    }
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

  formatEmployeeName(employee: any): string {
    if (!employee) return '';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.firstName || employee.lastName || '';
  }

  getSelectedDetail(item: any): any {
    if (!item?.itemDetails || !Array.isArray(item.itemDetails)) return null;
    return item.itemDetails.find((d: any) => d.dealSelected) || item.itemDetails[0] || null;
  }

  prItemRows(): Record<string, any>[] {
    return (this.purchaseRequest?.items || []).map((item: any) => {
      const detail = this.getSelectedDetail(item) || {};
      return { item: item.itemName || '-', detail: detail.detail || '-', qty: detail.quantity || 0, unitCost: detail.unitCost || 0, supplier: detail.supplierName || '-' };
    });
  }

  lpoItemRows(): Record<string, any>[] {
    return (this.purchaseOrder?.items || []).map((item: any) => ({
      partNo: this.formatPartNumber(item.partNo), description: item.detail || '-', orderedQty: item.quantity || 0,
      issuedQty: item.issuedQty || 0, pendingQty: item.pendingQty || 0, unitCost: item.unitCost || 0, totalCost: item.totalCost || 0,
    }));
  }
}
