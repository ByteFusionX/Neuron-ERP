import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

interface PurchaseRequest {
  _id: string;
  purchaseNo: string;
  status: string;
  createdAt: Date;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  items: Array<{
    itemName: string;
    quantity: number;
    estimatedCost: number;
  }>;
  totalLpo: number;
  mrRequest?: {
    engineer: {
      firstName: string;
      lastName: string;
    };
    message: string;
    createdDate: Date;
  };
}

@Component({
  selector: 'app-purchase-request-modal',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    ButtonComponent
  ],
  templateUrl: './purchase-request-modal.component.html',
  styleUrl: './purchase-request-modal.component.css'
})
export class PurchaseRequestModalComponent implements OnInit {
  
  purchaseRequests: PurchaseRequest[] = [];

  constructor(
    public dialogRef: MatDialogRef<PurchaseRequestModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { purchaseRequests: PurchaseRequest[] }
  ) {}

  ngOnInit(): void {
    this.purchaseRequests = this.data?.purchaseRequests || [];
  }

  onClose(): void {
    this.dialogRef.close();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'Pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'Approved':
        return 'text-green-600 bg-green-100';
      case 'Rejected':
        return 'text-red-600 bg-red-100';
      case 'Drafted':
        return 'text-gray-600 bg-gray-100';
      case 'ReadyToProcessLPO':
        return 'text-blue-600 bg-blue-100';
      case 'OnHoldCancelled':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }

  calculateTotalCost(items: any[]): number {
    return items.reduce((total, item) => {
      return total + (item.quantity * item.estimatedCost);
    }, 0);
  }
} 