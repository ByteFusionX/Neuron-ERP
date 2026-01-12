import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from '../button/button.component';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';
import { SupplierService } from 'src/app/core/services/supplier.service';

export interface PurchaseViewModalData {
  purchase: PurchaseData;
}

@Component({
  selector: 'app-purchase-view-modal',
  standalone: true,
  imports: [CommonModule, IconsModule, ButtonComponent],
  templateUrl: './purchase-view-modal.component.html',
  styleUrls: ['./purchase-view-modal.component.css']
})
export class PurchaseViewModalComponent implements OnInit {
  suppliersList = signal<any[]>([]);

  constructor(
    public dialogRef: MatDialogRef<PurchaseViewModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PurchaseViewModalData,
    private supplierService: SupplierService
  ) {}

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data);
      },
      error: (error) => {
        console.log(error);
      }
    });
  }

  get purchase(): PurchaseData | null {
    return this.data?.purchase || null;
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') {
      return partNo;
    }
    const code = partNo?.partNo || '';
    return code || '-';
  }

  getSelectedRows(items: any[]) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const rows: any[] = [];
    for (const item of items) {
      if (!item.itemDetails?.length) continue;

      for (const detail of item.itemDetails) {
        const selected = detail.comparisons?.find((c: any) => c.selected);
        if (selected) {
          const supplier = this.suppliersList().find(
            (s: any) => s._id === selected.supplierId
          );

          rows.push({
            itemName: item.itemName,
            detail,
            selectedSupplier: {
              supplierName: supplier?.supplierName ?? 'Unknown Supplier',
              unitPrice: selected.unitPrice,
              quantity: selected.quantity,
              etaTerms: selected.etaTerms,
            },
          });
        }
      }
    }

    return rows;
  }

  getItemStatus(detail: any): { label: string; class: string } | null {
    if (detail.merged) {
      return { label: 'Merged', class: 'bg-green-100 text-green-700' };
    }
    if (detail.isNewlyAdded) {
      return { label: 'Newly Added', class: 'bg-blue-100 text-blue-700' };
    }
    return null;
  }

  getProfitMargin(totalCost: number, discountedCost: number): number {
    if (!discountedCost || discountedCost <= 0) return 0;
    return (totalCost - discountedCost) || 0;
  }

  formatCurrency(value: number, currency: string = 'QAR'): string {
    const formattedValue = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
    return `${formattedValue} ${currency}`;
  }

  onClose(): void {
    this.dialogRef.close();
  }

  getStatusClass(status?: string): string {
    switch (status) {
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }
}




