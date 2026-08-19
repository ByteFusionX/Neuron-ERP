import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
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
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-purchase-request-details-modal.component.html',
  styleUrls: ['./view-purchase-request-details-modal.component.css']
})
export class ViewPurchaseRequestDetailsModalComponent implements OnInit {
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
}
