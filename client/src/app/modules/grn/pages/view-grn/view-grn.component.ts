import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-view-grn',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    ButtonComponent
  ],
  templateUrl: './view-grn.component.html',
  styleUrl: './view-grn.component.css'
})
export class ViewGrnComponent implements OnInit {
  private grnService = inject(GrnService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);

  grnId!: string;
  grn: any = null;
  isLoading = signal<boolean>(true);
  purchaseId: string = '';
  selectedItems = new Set<number>();
  isGenerating = signal<boolean>(false);

  headerSubtitle = '';
  detailFields: { label: string; value: string }[] = [];

  /** Where "Back" should land, when the caller passed one (e.g. the GRN list). */
  private returnUrl = '';

  ngOnInit(): void {
    this.grnId = <string>this.route.snapshot.paramMap.get('id');
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '';

    if (!this.grnId) {
      this.toastr.error('Invalid GRN ID');
      this.navigateAway();
      return;
    }
    this.loadGRN();
  }

  loadGRN(): void {
    this.isLoading.set(true);
    this.grnService.getGRNById(this.grnId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.grn = response.data;
          this.purchaseId = this.grn.purchaseOrderId?._id || this.grn.purchaseOrderId || '';
          this.buildDetails();
          this.isLoading.set(false);
        } else {
          this.toastr.error('GRN not found');
          this.isLoading.set(false);
          this.purchaseId = this.purchaseId || response.data?.purchaseOrderId?._id || response.data?.purchaseOrderId || '';
          this.navigateAway();
        }
      },
      error: (error) => {
        this.toastr.error('Failed to load GRN details');
        console.error('Error loading GRN:', error);
        this.isLoading.set(false);
        this.purchaseId = this.purchaseId
          || this.grn?.purchaseOrderId?._id || this.grn?.purchaseOrderId
          || error?.error?.data?.purchaseOrderId?._id || error?.error?.data?.purchaseOrderId
          || '';
        this.navigateAway();
      }
    });
  }

  private buildDetails(): void {
    const supplier = this.grn?.purchaseOrderId?.supplierId?.supplierName;
    const grnDate = this.formatDate(this.grn?.grnDate);
    const lpoNo = this.grn?.purchaseOrderId?.poNo;

    this.headerSubtitle = [supplier, lpoNo ? 'LPO ' + lpoNo : '', grnDate]
      .filter(Boolean)
      .join('  •  ');

    this.detailFields = [
      { label: 'GRN Date', value: grnDate },
      { label: 'Supplier Name', value: supplier || 'N/A' },
      { label: 'Linked LPO Number', value: lpoNo || 'N/A' },
      { label: 'Job ID', value: this.grn?.jobId?.jobId || this.grn?.purchaseOrderId?.purchaseId?.jobId?.jobId || 'N/A' },
      { label: 'Location / Warehouse', value: this.grn?.warehouse?.wareHouseName || 'N/A' },
      { label: 'Received By', value: this.formatEmployeeName(this.grn?.receivedBy) || 'N/A' },
      { label: 'Supplier Invoice No.', value: this.grn?.supplierInvoiceNo || 'N/A' },
      { label: 'Supplier Invoice Date', value: this.formatDate(this.grn?.supplierInvoiceDate) },
      { label: 'Supplier Delivery Note No.', value: this.grn?.supplierDeliveryNoteNo || 'N/A' },
      { label: 'Created By', value: this.formatEmployeeName(this.grn?.createdBy) || 'N/A' },
    ];
  }

  private navigateAway(): void {
    if (this.returnUrl) {
      this.router.navigateByUrl(this.returnUrl);
    } else if (this.purchaseId) {
      this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
    } else {
      this.router.navigate(['/purchase/approves']);
    }
  }

  onBack(): void {
    this.navigateAway();
  }

  viewInvoices(): void {
    if (!this.grn?.supplierInvoices?.length) {
      this.toastr.info('No invoices uploaded for this GRN');
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Supplier Invoices - ${this.grn.grnNo}`,
      existingFiles: this.grn.supplierInvoices,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false }
    };

    this.dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  viewDeliveryNotes(): void {
    if (!this.grn?.supplierDeliveryNotes?.length) {
      this.toastr.info('No delivery notes uploaded for this GRN');
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Supplier Delivery Notes - ${this.grn.grnNo}`,
      existingFiles: this.grn.supplierDeliveryNotes,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false }
    };

    this.dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) return partNo.partNo;
    return '-';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return '';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    if (employee.firstName) return employee.firstName;
    if (employee.lastName) return employee.lastName;
    return '';
  }

  getRejectedQty(item: any): number {
    if (item?.rejectedQty !== undefined && item?.rejectedQty !== null) {
      return item.rejectedQty;
    }
    return Math.max(0, (item?.receivedQty || 0) - (item?.acceptedQty || 0));
  }

  private sumItems(selector: (item: any) => number): number {
    if (!this.grn?.items || !Array.isArray(this.grn.items)) return 0;
    return this.grn.items.reduce((sum: number, item: any) => sum + (selector(item) || 0), 0);
  }

  getTotalOrderedQty(): number {
    return this.sumItems(item => item.orderedQty);
  }

  getTotalReceivedQty(): number {
    return this.sumItems(item => item.receivedQty);
  }

  getTotalAcceptedQty(): number {
    return this.sumItems(item => item.acceptedQty);
  }

  getTotalRejectedQty(): number {
    return this.sumItems(item => this.getRejectedQty(item));
  }

  toggleItemSelection(index: number): void {
    if (this.selectedItems.has(index)) {
      this.selectedItems.delete(index);
    } else {
      this.selectedItems.add(index);
    }
  }

  isItemSelected(index: number): boolean {
    return this.selectedItems.has(index);
  }

  areAllItemsSelected(): boolean {
    const count = this.grn?.items?.length || 0;
    return count > 0 && this.selectedItems.size === count;
  }

  toggleAllItems(): void {
    if (this.areAllItemsSelected()) {
      this.selectedItems.clear();
      return;
    }
    this.selectedItems = new Set((this.grn?.items || []).map((_: any, index: number) => index));
  }

  hasSelectedItems(): boolean {
    return this.selectedItems.size > 0;
  }

  onGenerateReceipt(): void {
    if (!this.hasSelectedItems()) {
      this.toastr.warning('Please select items to generate receipt');
      return;
    }

    this.isGenerating.set(true);
    const selectedItemsData = Array.from(this.selectedItems).map(index => this.grn.items[index]);

    this.grnService.generateGRNReceiptPDF(this.grn, selectedItemsData).then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.isGenerating.set(false);
        this.dialog.open(PdfPreviewComponent, {
          data: { url: url, formatedQuote: this.grn, type: 'grn' }
        });
      });
    }).catch((error) => {
      console.error('Error generating PDF:', error);
      this.toastr.error('Failed to generate GRN receipt');
      this.isGenerating.set(false);
    });
  }

  getCompanyName(): string {
    if (!this.grn) return '';
    return this.grn.purchaseOrderId?.purchaseId?.customerId?.companyName ||
           this.grn.purchaseOrderId?.quoteId?.client?.companyName ||
           this.grn.purchaseOrderId?.purchaseId?.jobId?.quoteId?.client?.companyName ||
           '';
  }
}
