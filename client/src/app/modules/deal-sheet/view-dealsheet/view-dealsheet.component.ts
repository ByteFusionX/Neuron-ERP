import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute } from '@angular/router';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { dealData, priceDetails, Quotatation, QuoteItem, QuoteItemDetail } from 'src/app/shared/interfaces/quotation.interface';
import { UpdatedealsheetComponent } from '../updatedealsheet-component/updatedealsheet-component.component';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ViewCommentComponent } from '../../assigned-jobs/pages/view-comment/view-comment.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { HttpEventType } from '@angular/common/http';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { RejectDealComponent } from '../reject-deal/reject-deal.component';
import { CommonModule, DatePipe, NgFor, NgIf, NgSwitch, NgSwitchDefault } from '@angular/common';

import { NgIconsModule } from '@ng-icons/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParseBoldTextPipe } from '../../../shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from '../../../shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from '../../../shared/pipes/numFormatter.pipe';
import { SupplierService } from '../../../core/services/supplier.service';
import { Supplier } from '../../../shared/interfaces/suppliers.interface';
import { PurchaseOrderService } from '../../../core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseOrder } from '../../../shared/interfaces/purchase.interface';
import { FileUploadModalComponent, FileUploadModalData } from '../../../shared/components/file-upload-modal/file-upload-modal.component';

interface ViewDealsheetNavState {
  approval: boolean;
  quoteData: Quotatation;
  quoteItems: (QuoteItem | undefined)[];
  priceDetails: priceDetails;
  quoteView?: boolean;
  jobId?: string;
  returnUrl?: string;
}

@Component({
  selector: 'app-view-dealsheet',
  templateUrl: './view-dealsheet.component.html',
  styleUrls: ['./view-dealsheet.component.css'],
  standalone: true,
  imports: [DatePipe, ParseBoldTextPipe, ParseBracketsTextPipe, NumberFormatterPipe, NgIconsModule, MatTooltipModule, CommonModule]
})
export class ViewDealsheetComponent implements OnInit {
  isApproving: boolean = false;
  isRejecting: boolean = false;
  suppliers: Supplier[] = [];

  approvedPo: PurchaseOrder | null = null;
  viewMode: 'deal' | 'po' = 'deal';

  data!: ViewDealsheetNavState;
  private returnUrl: string = '/deal-sheet/pendings';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private _dialog: MatDialog,
    private _quoteService: QuotationService,
    private _employeeService: EmployeeService,
    private _enquiryService: EnquiryService,
    private toast: ToastrService,
    private _notificationService: NotificationService,
    private supplierService: SupplierService,
    private _purchaseOrderService: PurchaseOrderService,
  ) {
  }

  userId!: string

  ngOnInit(): void {
    const state = history.state as ViewDealsheetNavState;

    if (!state || !state.quoteData) {
      this.toast.error('Deal sheet data is unavailable. Please open it again from the list.');
      this.router.navigate([this.returnUrl]);
      return;
    }

    this.data = state;
    if (state.returnUrl) this.returnUrl = state.returnUrl;

    this.loadSuppliers();
    this.loadApprovedPo();
    this._employeeService.employeeData$.subscribe((data) => {
      if (data?._id) {
        this.userId = data?._id;
        this.markQuotationSeenIfCreator();
      }
    })
  }

  // The PO-view tab only appears when an Approved LPO exists against this job -
  // silently skip the lookup if we weren't given a job to check.
  private loadApprovedPo(): void {
    if (!this.data.jobId) return;

    this._purchaseOrderService.getAllPurchaseOrders({ jobId: this.data.jobId, status: ['Approved'] }).subscribe({
      next: (response: any) => {
        const list = response?.data || response || [];
        this.approvedPo = list.length ? list[0] : null;
      },
      error: (error) => {
        console.error('Error loading approved purchase order:', error);
      }
    });
  }

  switchToPoView(): void {
    if (this.approvedPo) this.viewMode = 'po';
  }

  switchToDealView(): void {
    this.viewMode = 'deal';
  }

  private getPoItem(detail: QuoteItemDetail): { unitCost: number; totalCost: number } | undefined {
    return this.approvedPo?.items?.find(i => i.detail === detail.detail);
  }

  getPoUnitCost(detail: QuoteItemDetail): number {
    const match = this.getPoItem(detail);
    return match ? match.unitCost : detail.unitCost;
  }

  getPoItemTotalCost(detail: QuoteItemDetail): number {
    const match = this.getPoItem(detail);
    return match ? match.totalCost : detail.quantity * detail.unitCost;
  }

  get poSummaryTotalCost(): number {
    let total = 0;
    this.data.quoteItems.forEach((item: any) => {
      item?.itemDetails?.forEach((detail: QuoteItemDetail) => {
        if (detail.dealSelected) {
          total += this.getPoItemTotalCost(detail);
        }
      });
    });
    return total;
  }

  get poSummaryProfit(): number {
    return this.data.priceDetails.totalSellingPrice - this.poSummaryTotalCost;
  }

  get poSummaryPerc(): number {
    return this.data.priceDetails.totalSellingPrice
      ? (this.poSummaryProfit / this.data.priceDetails.totalSellingPrice) * 100
      : 0;
  }

  // Only the salesperson who created the quotation can mark it seen - other
  // roles (e.g. superadmin browsing all deals) can view it without this
  // firing, since createdBy won't match them and the server would 404.
  private markQuotationSeenIfCreator(): void {
    if (this.data.quoteData.dealData.seenedBySalsePerson !== false) return;

    const createdBy = this.data.quoteData.createdBy;
    const creatorId = typeof createdBy === 'string' ? createdBy : createdBy?._id;
    if (!creatorId || creatorId !== this.userId) return;

    this._quoteService.markAsQuotationSeen(this.data.quoteData._id, this.userId).subscribe({
      next: (res: any) => {
        if (res.success) {
        }
      },
      error: (error) => {
        console.error('Error marking quotation as seen:', error);
      }
    })
  }

  loadSuppliers() {
    this.supplierService.supplierList().subscribe({
      next: (response) => {
        this.suppliers = response.data || response;
      },
      error: (error) => {
        console.error('Error loading suppliers:', error);
      }
    });
  }

  onClose() {
    this.router.navigate([this.returnUrl]);
  }

  openAttachments(): void {
    const modalData: FileUploadModalData = {
      title: `Deal Sheet Attachments - ${this.data.quoteData.dealData.dealId}`,
      existingFiles: this.data.quoteData.dealData.attachments as any,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false }
    };

    this._dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  onUpdate() {
    const updateModal = this._dialog.open(UpdatedealsheetComponent, {
      data: this.data
    })

    updateModal.afterClosed().subscribe((dealData: dealData) => {
      if (dealData) {
        this._quoteService.saveDealSheet(dealData, this.data.quoteData._id).subscribe({
          next: (res) => {
            this.router.navigate([this.returnUrl]);
          },
          error: (error) => {
            console.error('Error saving deal sheet:', error);
            this.toast.error('Failed to save deal sheet');
          }
        })
      }
    })
  }

  calculateUnitPrice(item: any) {
    const decimalMargin = item.profit / 100;
    return Math.ceil(Number((item.unitCost / (1 - decimalMargin)).toFixed(2)));
  }

  onDownloadClicks(file: any) {
    this._enquiryService.downloadFile(file.fileName)
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
          } else if (event.type === HttpEventType.Response) {
            const fileContent: Blob = new Blob([event['body']])
            saveAs(fileContent, file.originalname)
          }
        },
        error: (error) => {
          if (error.status == 404) {
            this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
          }
        }
      })
  }

  openReview() {
    this._dialog.open(ViewCommentComponent, {
      data: { comment: this.data.quoteData.dealData.comments[0] },
      width: '500px'
    });
  }

  onApprove() {
    const rejectModal = this._dialog.open(RejectDealComponent, {
      data: { reject: false },
      width: '500px'
    })
    rejectModal.afterClosed().subscribe(({ submit, comment }) => {
      if (submit) {
        this.isApproving = true;
        this._quoteService.approveDeal(this.data.quoteData._id, comment, this.userId).subscribe({
          next: (res) => {
            this.isApproving = false;
            if (res.success) {
              this.router.navigate([this.returnUrl]);
            }
          },
          error: (error) => {
            this.isApproving = false;
            console.error('Error approving deal:', error);
            this.toast.error('Failed to approve deal');
          }
        })
      }
    })
  }

  onReject() {
    const rejectModal = this._dialog.open(RejectDealComponent, {
      data: { reject: true },
      width: '500px'
    })
    rejectModal.afterClosed().subscribe(({ submit, comment }) => {
      if (submit && comment) {
        this.isRejecting = true;
        this._quoteService.rejectDeal(comment, this.data.quoteData._id).subscribe({
          next: (res) => {
            this.isRejecting = false;
            if (res) {
              this.router.navigate([this.returnUrl]);
            }
          },
          error: (error) => {
            this.isRejecting = false;
            console.error('Error rejecting deal:', error);
            this.toast.error('Failed to reject deal');
          }
        })
      }
    })
  }

  checkAtLeastOneDealSelected(item: any) {
    return item?.itemDetails?.some((detail: any) => detail.dealSelected)
  }

  getSupplierById(supplierId: string): Supplier | undefined {
    return this.suppliers.find(supplier => supplier._id === supplierId);
  }

  getSupplierName(supplierId: string): string {
    const supplier = this.getSupplierById(supplierId);
    return supplier ? supplier.supplierName : '';
  }

  getSupplierEmail(supplierId: string): string {
    const supplier = this.getSupplierById(supplierId);
    return supplier && supplier.contactDetails ? supplier.contactDetails.email : '';
  }

  getSupplierPhone(supplierId: string): string {
    const supplier = this.getSupplierById(supplierId);
    return supplier && supplier.contactDetails ? supplier.contactDetails.phoneNumber : '';
  }

  onViewPDF(file: any) {
    // Check if the file is a PDF
    if (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) {

      this._enquiryService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']], { type: 'application/pdf' });

              // Create an object URL for the PDF blob
              const fileURL = URL.createObjectURL(fileContent);

              // Open the PDF in a new tab
              window.open(fileURL, '_blank');

              // Optionally revoke the object URL after some time
              setTimeout(() => {
                URL.revokeObjectURL(fileURL);
              }, 10000);
            }
          },
          error: (error) => {
            if (error.status === 404) {
              this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.');
            } else {
              this.toast.error('An error occurred while trying to view the PDF. Please try again later.');
            }
          }
        })
    } else {
      // If the file is not a PDF, show a toaster notification
      this.toast.warning('This file type is not supported for viewing. Please download and view the file.');
    }
  }

}
