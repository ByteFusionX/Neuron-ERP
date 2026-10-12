import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormModalShellComponent } from 'src/app/shared/components/modal/form-modal-shell/form-modal-shell.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { ToastrService } from 'ngx-toastr';

export interface ViewLpoDetailsModalData {
  purchaseOrderId: string;
}

@Component({
  selector: 'app-view-lpo-details-modal',
  standalone: true,
  imports: [CommonModule, FormModalShellComponent, DetailTableComponent],
  templateUrl: './view-lpo-details-modal.component.html',
  styleUrls: ['./view-lpo-details-modal.component.css']
})
export class ViewLpoDetailsModalComponent implements OnInit {
  readonly itemColumns: DetailTableColumn[] = [
    { key: 'partNo', label: 'Part No.' },
    { key: 'description', label: 'Description', wrap: true },
    { key: 'orderedQty', label: 'Ordered', type: 'number' },
    { key: 'issuedQty', label: 'Issued', type: 'number' },
    { key: 'pendingQty', label: 'Pending', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
    { key: 'totalCost', label: 'Total', type: 'currency', total: true },
  ];
  purchaseOrder: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewLpoDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewLpoDetailsModalData,
    private purchaseOrderService: PurchaseOrderService,
    private notificationService: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadDetails();
  }

  loadDetails(): void {
    this.isLoading.set(true);

    this.purchaseOrderService.getPurchaseOrderById(this.data.purchaseOrderId).subscribe({
      next: (response: any) => {
        this.purchaseOrder = response?.data || response;
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching LPO details:', error);
        this.notificationService.error('Failed to load LPO details');
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

  formatEmployeeName(employee: any): string {
    if (!employee) return 'N/A';
    if (typeof employee === 'string') return employee;
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim();
    return name || employee.userName || employee.email || 'N/A';
  }

  itemRows(): Record<string, any>[] {
    return (this.purchaseOrder?.items || []).map((item: any) => ({
      partNo: this.formatPartNumber(item.partNo), description: item.detail || '-',
      orderedQty: item.quantity || 0, issuedQty: item.issuedQty || 0,
      pendingQty: item.pendingQty || 0, unitCost: item.unitCost || 0,
      totalCost: item.totalCost || 0,
    }));
  }
}
