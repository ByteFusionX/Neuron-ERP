import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { GrnService } from 'src/app/core/services/grn/grn.service';

export interface ViewGrnDetailsModalData {
  grnId: string;
}

@Component({
  selector: 'app-view-grn-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-grn-details-modal.component.html',
  styleUrls: ['./view-grn-details-modal.component.css']
})
export class ViewGrnDetailsModalComponent implements OnInit {
  grn: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewGrnDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewGrnDetailsModalData,
    private grnService: GrnService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadGRN();
  }

  loadGRN(): void {
    this.isLoading.set(true);
    this.grnService.getGRNById(this.data.grnId).subscribe({
      next: (response: any) => {
        this.grn = response?.data || response;
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching GRN details:', error);
        this.toastr.error('Failed to load GRN details');
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
    if (!employee) return '';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.firstName || employee.lastName || '';
  }

  getRejectedQty(item: any): number {
    if (item?.rejectedQty !== undefined && item?.rejectedQty !== null) {
      return item.rejectedQty;
    }
    return Math.max(0, (item?.receivedQty || 0) - (item?.acceptedQty || 0));
  }
}
