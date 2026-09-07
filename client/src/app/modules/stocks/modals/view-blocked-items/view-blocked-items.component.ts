import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

export interface BlockedItem {
  _id?: string;
  salesPersonName: string;
  customerName: string;
  customerId?: any;
  quantity: number;
  fromDate: Date | string;
  toDate: Date | string;
  createdBy?: any;
  createdDate?: Date;
}

@Component({
  selector: 'app-view-blocked-items',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    ButtonComponent,
    ModalLayoutComponent
  ],
  templateUrl: './view-blocked-items.component.html',
  styleUrl: './view-blocked-items.component.css'
})
export class ViewBlockedItemsComponent {
  private dialogRef = inject(MatDialogRef<ViewBlockedItemsComponent>);
  private data = inject(MAT_DIALOG_DATA);

  blockedItems: BlockedItem[] = this.data?.blockedItems || [];
  stockEntry: any = this.data?.stockEntry || {};
  availableQuantity: number = this.data?.availableQuantity || 0;

  formatDate(date: Date | string): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  isActive(block: BlockedItem): boolean {
    if (!block.toDate) return false;
    const toDate = new Date(block.toDate);
    return toDate >= new Date();
  }

  getTotalBlockedQuantity(): number {
    return this.blockedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }

  onClose(): void {
    this.dialogRef.close();
  }

  getSubtitle(): string {
    return `Part No: ${this.stockEntry?.partNo?.partNo || 'N/A'} | Total Blocked: ${this.getTotalBlockedQuantity()} | Available: ${this.availableQuantity}`;
  }
}
