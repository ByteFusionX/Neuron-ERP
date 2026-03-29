import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/approve-deal/approve-deal.component';
import { PurchaseViewModalComponent } from 'src/app/shared/components/purchase-view-modal/purchase-view-modal.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-view-lpo',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    ButtonComponent
  ],
  templateUrl: './view-lpo.component.html',
  styleUrl: './view-lpo.component.css'
})
export class ViewLpoComponent implements OnInit {
  private purchaseOrderService = inject(PurchaseOrderService);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private quotationService = inject(QuotationService);

  lpoId!: string;
  lpo: any = null;
  purchase: any = null;
  quotation: any = null;
  isLoading = signal<boolean>(true);
  supplier: any = null;
  items = signal<any[]>([]);
  currency = signal<string>('QAR');
  isApproving = false;
  isRejecting = false;

  ngOnInit(): void {
    this.lpoId = <string>this.route.snapshot.paramMap.get('id');
    if (!this.lpoId) {
      this.notificationService.error('Invalid LPO ID');
      this.router.navigate(['/purchase-order/pending-approval']);
      return;
    }
    this.loadLpo();
  }

  loadLpo(): void {
    this.isLoading.set(true);
    this.purchaseOrderService.getPurchaseOrderById(this.lpoId).subscribe({
      next: (response: any) => {
        if (response.success || response._id) {
          const lpoData = response.success ? response.data : response;
          this.lpo = lpoData;
          this.supplier = lpoData.supplierId;
          this.items.set(lpoData.items || []);
          
          const currency = lpoData.quoteId?.currency || 
                          lpoData.quoteId?.dealData?.currency || 
                          lpoData.purchaseId?.jobId?.quoteId?.currency ||
                          lpoData.purchaseId?.jobId?.quoteId?.dealData?.currency ||
                          'QAR';
          this.currency.set(currency);
          
          if (lpoData.purchaseId) {
            const purchaseId = lpoData.purchaseId._id || lpoData.purchaseId;
            if (typeof purchaseId === 'string') {
              this.loadPurchase(purchaseId);
            } else {
              this.purchase = lpoData.purchaseId;
              this.isLoading.set(false);
            }
          } else {
            this.isLoading.set(false);
          }
        } else {
          this.notificationService.error('LPO not found');
          this.isLoading.set(false);
          this.router.navigate(['/purchase-order/pending-approval']);
        }
      },
      error: (error) => {
        this.notificationService.error('Failed to load LPO details');
        console.error('Error loading LPO:', error);
        this.isLoading.set(false);
        this.router.navigate(['/purchase-order/pending-approval']);
      }
    });
  }

  loadPurchase(purchaseId: string): void {
    this.purchaseService.getPurchaseById(purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
        if (this.purchase?.jobId?.quoteId && !this.currency() || this.currency() === 'QAR') {
          const quoteId = this.purchase.jobId.quoteId;
          const currency = quoteId?.currency || quoteId?.dealData?.currency || 'QAR';
          this.currency.set(currency);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading purchase:', error);
        this.isLoading.set(false);
      }
    });
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) {
      return partNo.partNo;
    }
    return '-';
  }

  formatDate(date: any): string {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatCurrency(value: number): string {
    const currency = this.currency();
    const formattedValue = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
    return `${formattedValue} ${currency}`;
  }

  getTotalLpoValue(): number {
    return this.items().reduce((total, item) => total + (item.totalCost || 0), 0);
  }

  getSubTotal(): number {
    return this.items().reduce((total, item) => total + (item.totalCost || 0), 0);
  }

  getTotalAfterDiscount(): number {
    const subtotal = this.getSubTotal();
    const discount = this.lpo?.discount || 0;
    return subtotal - discount;
  }

  /**
   * Open quotation preview (PDF) for the current LPO's quote reference.
   */
  onViewQuote(): void {
    let quoteData: any =
      this.lpo?.quoteId ||
      this.purchase?.jobId?.quoteId;

    if (!quoteData) {
      this.notificationService.error('Quotation details not available');
      return;
    }

    // Ensure the quotation has the enriched relational data expected by the PDF generator
    if (this.lpo?.quoteId) {
      quoteData = {
        ...quoteData,
        client: this.lpo.quoteId.client || quoteData.client,
        createdBy: this.lpo.quoteId.createdBy || quoteData.createdBy,
        attention: this.lpo.quoteId.attention || quoteData.attention,
        department: this.lpo.quoteId.department || quoteData.department
      };
    }

    const pdfDoc = this.quotationService.generatePDF(quoteData, true);
    pdfDoc.then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.dialog.open(PdfPreviewComponent, {
          data: { url, formatedQuote: quoteData }
        });
      });
    });
  }

  /**
   * Open deal sheet for the current Job (based on the linked quotation).
   * This mirrors the behaviour from job-sheet open-to-work.
   */
  onViewDealSheet(): void {
    let quoteData: any =
      this.lpo?.quoteId ||
      this.purchase?.jobId?.quoteId;

    if (!quoteData?.dealData?.updatedItems) {
      this.notificationService.error('Deal sheet data not available');
      return;
    }

    // Enrich quoteData with client and salesperson details for the deal sheet header
    if (this.lpo?.quoteId) {
      quoteData = {
        ...quoteData,
        client: this.lpo.quoteId.client || quoteData.client,
        createdBy: this.lpo.quoteId.createdBy || quoteData.createdBy
      };
    }

    const priceDetails = {
      totalSellingPrice: 0,
      totalCost: 0,
      profit: 0,
      perc: 0
    };

    const quoteItems = quoteData.dealData.updatedItems.map((item: any) => {
      let itemSelected = 0;

      item.itemDetails.map((itemDetail: any) => {
        if (itemDetail.dealSelected) {
          itemSelected++;
          priceDetails.totalSellingPrice += itemDetail.unitSellingPrice * itemDetail.quantity;
          priceDetails.totalCost += itemDetail.quantity * itemDetail.unitCost;
          return itemDetail;
        }
        return;
      });

      if (itemSelected) return item;
      return;
    });

    if (Array.isArray(quoteData.dealData.additionalCosts)) {
      quoteData.dealData.additionalCosts.forEach((cost: any) => {
        if (cost.type === 'Additional Cost') {
          priceDetails.totalCost += cost.value;
        } else if (cost.type === 'Supplier Discount') {
          priceDetails.totalCost -= cost.value;
        } else if (cost.type === 'Customer Discount') {
          priceDetails.totalSellingPrice -= cost.value;
        } else {
          priceDetails.totalCost += cost.value;
        }
      });
    }

    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = priceDetails.totalSellingPrice
      ? (priceDetails.profit / priceDetails.totalSellingPrice) * 100
      : 0;

    this.dialog.open(ApproveDealComponent, {
      data: { approval: false, quoteData, quoteItems, priceDetails },
      width: '1200x'
    });
  }

  onBack(): void {
    this.router.navigate(['/purchase-order/pending-approval']);
  }

  onApprove(): void {
    if (!this.lpo || this.lpo.poStatus !== 'Pending for Approval') return;

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      data: {
        title: 'Approve LPO',
        description: 'Are you sure you want to approve this LPO? Please provide a comment explaining your decision.',
        icon: 'heroCheckCircle',
        iconColor: 'green',
        confirmButtonText: 'Approve',
        requireComment: false,
        showComment: true,
        commentLabel: 'Approval Comment',
        commentPlaceholder: 'Enter your approval comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.purchaseOrderService.approvePurchaseOrder(this.lpoId, result.comment).subscribe({
          next: () => {
            this.notificationService.success('LPO approved successfully');
            this.router.navigate(['/purchase-order/approved']);
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to approve LPO');
            this.isApproving = false;
          }
        });
      }
    });
  }

  onReject(): void {
    if (!this.lpo || this.lpo.poStatus !== 'Pending for Approval') return;

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      data: {
        title: 'Reject LPO',
        description: 'Are you sure you want to reject this LPO? Please provide a reason for rejection.',
        icon: 'heroXCircle',
        iconColor: 'red',
        confirmButtonText: 'Reject',
        requireComment: false,
        showComment: true,
        commentLabel: 'Rejection Reason',
        commentPlaceholder: 'Enter your rejection reason here...'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.isConfirmed) {
        this.isRejecting = true;
        this.purchaseOrderService.rejectPurchaseOrder(this.lpoId, result.comment).subscribe({
          next: () => {
            this.notificationService.success('LPO rejected successfully');
            this.router.navigate(['/purchase-order/pending-approval']);
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to reject LPO');
            this.isRejecting = false;
          }
        });
      }
    });
  }

  canApproveOrReject(): boolean {
    return this.lpo?.poStatus === 'Pending for Approval';
  }

  onViewPurchase(): void {
    if (!this.purchase) {
      this.notificationService.error('Purchase details not available');
      return;
    }

    this.dialog.open(PurchaseViewModalComponent, {
      data: {
        purchase: this.purchase
      },
      width: '1400px',
      maxHeight: '90vh',
      panelClass: 'purchase-view-modal'
    });
  }
}

