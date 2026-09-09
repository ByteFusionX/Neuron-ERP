import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { InvoiceService } from 'src/app/core/services/invoice.service';

export interface ViewInvoiceDetailsModalData {
  invoiceNo: string;
}

@Component({
  selector: 'app-view-invoice-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-invoice-details-modal.component.html',
  styleUrls: ['./view-invoice-details-modal.component.css']
})
export class ViewInvoiceDetailsModalComponent implements OnInit {
  invoice: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewInvoiceDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewInvoiceDetailsModalData,
    private invoiceService: InvoiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadInvoice();
  }

  loadInvoice(): void {
    this.isLoading.set(true);
    this.invoiceService.getInvoiceByInvoiceNo(this.data.invoiceNo).subscribe({
      next: (response: any) => {
        this.invoice = response?.data || response;
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching invoice details:', error);
        this.toastr.error('Failed to load invoice details');
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

  formatPlainNumber(value: any): string {
    const num = Number(value);
    if (isNaN(num)) return '-';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
