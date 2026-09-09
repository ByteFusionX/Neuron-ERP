import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { ToastrService } from 'ngx-toastr';

export interface ViewLpoDetailsModalData {
  purchaseOrderId: string;
}

@Component({
  selector: 'app-view-lpo-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-lpo-details-modal.component.html',
  styleUrls: ['./view-lpo-details-modal.component.css']
})
export class ViewLpoDetailsModalComponent implements OnInit {
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
}
