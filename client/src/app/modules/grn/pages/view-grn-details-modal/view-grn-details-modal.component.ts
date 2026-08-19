import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

export interface ViewGrnDetailsModalData {
  grn: any;
}

@Component({
  selector: 'app-view-grn-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-grn-details-modal.component.html',
  styleUrls: ['./view-grn-details-modal.component.css']
})
export class ViewGrnDetailsModalComponent {
  grn: any;

  constructor(
    public dialogRef: MatDialogRef<ViewGrnDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewGrnDetailsModalData
  ) {
    this.grn = data.grn;
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

  getTotalAcceptedQty(): number {
    if (!this.grn?.items || !Array.isArray(this.grn.items)) return 0;
    return this.grn.items.reduce((sum: number, item: any) => sum + (item.acceptedQty || 0), 0);
  }
}
