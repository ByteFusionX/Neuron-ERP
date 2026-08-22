import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';

export interface ViewGrnDetailsModalData {
  grn: any;
}

@Component({
  selector: 'app-view-grn-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent, IconsModule],
  templateUrl: './view-grn-details-modal.component.html',
  styleUrls: ['./view-grn-details-modal.component.css']
})
export class ViewGrnDetailsModalComponent {
  grn: any;

  constructor(
    public dialogRef: MatDialogRef<ViewGrnDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewGrnDetailsModalData,
    private dialog: MatDialog,
    private toastr: ToastrService
  ) {
    this.grn = data.grn;
  }

  onClose(): void {
    this.dialogRef.close();
  }

  viewInvoices(): void {
    if (!this.grn?.supplierInvoices || this.grn.supplierInvoices.length === 0) {
      this.toastr.info('No invoices uploaded for this GRN');
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Supplier Invoices - ${this.grn.grnNo}`,
      existingFiles: this.grn.supplierInvoices,
      allowMultiple: true,
      showActions: {
        upload: false,
        download: true,
        view: true,
        delete: false
      }
    };

    this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });
  }

  viewDeliveryNotes(): void {
    if (!this.grn?.supplierDeliveryNotes || this.grn.supplierDeliveryNotes.length === 0) {
      this.toastr.info('No delivery notes uploaded for this GRN');
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Supplier Delivery Notes - ${this.grn.grnNo}`,
      existingFiles: this.grn.supplierDeliveryNotes,
      allowMultiple: true,
      showActions: {
        upload: false,
        download: true,
        view: true,
        delete: false
      }
    };

    this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });
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
