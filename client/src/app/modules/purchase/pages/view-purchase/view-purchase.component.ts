import { Component, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router, TitleStrategy } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FileService } from 'src/app/core/services/file.service';
import { Comparisons, PurchaseData, PurchaseStatus } from 'src/app/shared/interfaces/purchase.interface';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/approve-deal/approve-deal.component';
import { Quotatation } from 'src/app/shared/interfaces/quotation.interface';

@Component({
  selector: 'app-view-purchase',
  imports: [IconsModule, ButtonComponent, CommonModule],
  templateUrl: './view-purchase.component.html',
  styleUrls: ['./view-purchase.component.css']
})
export class ViewPurchaseComponent {
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private fileService = inject(FileService);
  private supplierService = inject(SupplierService)
  private employeeService = inject(EmployeeService)

  purchase: PurchaseData | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  isMerging = false;
  isRevoking = false;
  downloadProgress = 0;
  isDownloading = false;
  purchaseId!: string;
  suppliersList = signal<any[]>([])
  canApprovePR = false;

  ngOnInit(): void {
    this.loadPurchase();

    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })

    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canApprovePR = data.category.privileges.purchase?.canApprovePR || false;
      }
    });
  }

  loadPurchase() {
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (this.purchaseId == 'none') {
      this.isLoading = false;
      return;
    }
    if (!this.purchaseId) {
      this.isLoading = false;
      this.notificationService.error('Invalid Purchase Id');
      this.router.navigate(['/purchase/pendings']);
      return;
    }

    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
        console.log(response, 'response') 
        console.log(this.purchase, 'this.purchase')
        this.isLoading = false;
      },
      error: (error) => {
        this.notificationService.error('Failed to load purchase details');
        console.error('Error loading purchase:', error);
        this.isLoading = false;
        this.router.navigate(['/purchase/pendings']);
      }
    });
  }

  /**
   * Open deal sheet for the job linked to this purchase (via job.quoteId.dealData).
   * This reuses the same dialog and calculation logic pattern used in job-sheet/open-to-work.
   */
  onViewDealSheet(): void {
    const quoteData: any = this.purchase?.jobId?.quoteId;

    if (!quoteData?.dealData?.updatedItems) {
      this.notificationService.error('Deal sheet data not available');
      return;
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
      data: {
        approval: false,
        quoteData: quoteData as Quotatation,
        quoteItems,
        priceDetails,
        quoteView: false
      },
      width: '1200x'
    });
  }

  hasNewItemsToMerge(): boolean {
    if (!this.purchase?.items) return false;
    
    return this.purchase.items.some((item: any) => 
      item.itemDetails?.some((detail: any) => detail.isNewlyAdded && !detail.merged)
    );
  }

  hasMergedItems(): boolean {
    if (!this.purchase?.items) return false;
    
    return this.purchase.items.some((item: any) => 
      item.itemDetails?.some((detail: any) => detail.merged)
    );
  }

  getItemStatus(detail: any): { label: string; class: string } | null {
    if (detail.merged) {
      return { label: 'Merged', class: 'bg-green-100 text-green-700' };
    }
    if (detail.isNewlyAdded) {
      return { label: 'New', class: 'bg-blue-100 text-blue-700' };
    }
    return null;
  }

  onMergeItems(): void {
    if (!this.purchase?._id) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Merge Items to Deal Sheet',
        description: 'Are you sure you want to merge all newly added items to the deal sheet?',
        icon: 'heroArrowRightCircle',
        IconColor: 'green'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.isMerging = true;
        this.purchaseService.mergeItemsToDealSheet(this.purchaseId).subscribe({
          next: () => {
            this.loadPurchase();
            this.isMerging = false;
            this.notificationService.success('Items merged to deal sheet successfully');
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to merge items');
            this.isMerging = false;
          }
        });
      }
    });
  }

  onRevokeMerge(): void {
    if (!this.purchase?._id) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Revoke Merged Items',
        description: 'Are you sure you want to revoke the merged items from the deal sheet?',
        icon: 'heroArrowLeftCircle',
        IconColor: 'orange'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.isRevoking = true;
        this.purchaseService.revokeMergedItems(this.purchaseId).subscribe({
          next: () => {
            this.loadPurchase();
            this.isRevoking = false;
            this.notificationService.success('Merged items revoked successfully');
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to revoke merged items');
            this.isRevoking = false;
          }
        });
      }
    });
  }

  onApprove() {
    if (!this.purchase?._id) return;

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      data: {
        title: 'Approve Purchase',
        description: 'Are you sure you want to approve this purchase? You can optionally add a comment.',
        icon: 'heroCheckCircle',
        iconColor: 'green',
        confirmButtonText: 'Approve',
        requireComment: false,
        commentLabel: 'Approval Comment',
        commentPlaceholder: 'Enter your approval comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.purchaseService.updatePurchaseStatus(
          this.purchaseId,
          'approved',
          result.comment,
        ).subscribe({
          next: (res) => {
            this.notificationService.success('Purchase approved successfully');
            this.isApproving = false;
            if (res?.data) {
              this.purchase = res.data;
            }
            this.router.navigate(['/purchase/pendings']);
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to approve purchase');
            this.isApproving = false;
          }
        });
      }
    });
  }

  onReject() {
    if (!this.purchase?._id) return;

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      data: {
        title: 'Reject Purchase',
        description: 'Are you sure you want to reject this purchase? Please provide a reason.',
        icon: 'heroXCircle',
        iconColor: 'red',
        confirmButtonText: 'Reject',
        requireComment: true,
        commentLabel: 'Rejection Reason',
        commentPlaceholder: 'Enter your rejection reason here...'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.isConfirmed) {
        if (!result.comment || result.comment.trim() === '') {
          this.notificationService.error('Rejection reason is required');
          return;
        }
        
        this.isRejecting = true;
        this.purchaseService.updatePurchaseStatus(
          this.purchaseId,
          'rejected',
          result.comment,
        ).subscribe({
          next: (res) => {
            this.notificationService.success('Purchase rejected successfully');
            this.isRejecting = false;
            if (res?.data) {
              this.purchase = res.data;
            }
            this.router.navigate(['/purchase/pendings']);
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to reject purchase');
            this.isRejecting = false;
          }
        });
      }
    });
  }

  getTotalUnitCost(items: any[]): number {
    if (!Array.isArray(items)) return 0;

    return items.reduce((total, item) => {
      if (Array.isArray(item.itemDetails)) {
        const itemTotal = item.itemDetails.reduce((subTotal: any, detail: any) => {
          return subTotal + (detail.unitCost || 0);
        }, 0);
        return total + itemTotal;
      }
      return total;
    }, 0);
  }

  getSelectedTotal(items: any[]): number {
    if (!Array.isArray(items)) return 0;

    return items.reduce((total, item) => {
      if (Array.isArray(item.itemDetails)) {
        const itemTotal = item.itemDetails.reduce((subTotal: any, detail: any) => {
          if (Array.isArray(detail.comparisons)) {
            const selected = detail.comparisons.find((c: any) => c.selected === true);
            if (selected) {
              return subTotal + (selected.unitPrice * selected.quantity);
            }
          }
          return subTotal;
        }, 0);
        return total + itemTotal;
      }
      return total;
    }, 0);
  }

  getProfitMargin(totalCost: number, discountedCost: number): number {
    if (!discountedCost || discountedCost <= 0) return 0;
    return (totalCost - discountedCost) || 0;
  }


  onEdit() {
    if (!this.purchase?._id) return;
    this.router.navigate(['/purchase', 'edit', this.purchase._id]);
  }

  onDownloadFile(file: any) {
    if (this.isDownloading) return;

    this.isDownloading = true;
    this.downloadProgress = 0;

    this.fileService.downloadFileWithProgress(
      file.fileName,
      file.originalname,
      (progress) => {
        this.downloadProgress = progress;
      },
      (error) => {
        this.isDownloading = false;
        if (error.status === 404) {
          this.notificationService.warning('File not found on server. Please check and try again.');
        } else {
          this.notificationService.error('An error occurred while downloading the file.');
        }
      }
    );
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
        } else {
          rows.push({
            itemName: item.itemName,
            detail,
            selectedSupplier: {
              supplierName: detail.supplierName ?? 'Unknown Supplier',
              unitPrice: detail.unitCost,
              quantity: detail.quantity,
              etaTerms: detail.availability,
            },
          });
        }
      }
    }

    return rows;
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') {
      return partNo;
    }
    const code = partNo?.partNo || '';
    return code || '-';
  }

  onExit() {
    this.router.navigate(['/purchase/pendings']);
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

  showStatusHistory(): void {
    if (!this.purchase?.rejectedReason?.length) return;

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: 'Purchase Rejection History',
        history: this.purchase.rejectedReason
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }
}
