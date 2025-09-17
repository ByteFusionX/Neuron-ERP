import { Component, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router, TitleStrategy } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FileService } from 'src/app/core/services/file.service';
import { Comparisons, PurchaseData, PurchaseStatus } from 'src/app/shared/interfaces/purchase.interface';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';

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
  private employeeService = inject(EmployeeService)
  private supplierService = inject(SupplierService)

  purchase: PurchaseData | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  downloadProgress = 0;
  isDownloading = false;
  purchaseId!: string;
  tokenData!: { id: string, employeeId: string };
  suppliersList = signal<any[]>([])

  ngOnInit(): void {
    this.loadPurchase();
    this.tokenData = this.employeeService.employeeToken();
    this.purchaseService.purchaseFormData$.subscribe({
      next: (data) => {
        if (data) {
          this.purchase = data;
          this.isLoading = false;
        }
      }, error: (error) => {
        console.error(error)
      }
    })

    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  loadPurchase() {
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (this.purchaseId == 'none') return
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase Id');
      this.router.navigate(['/purchase/pendings']);
      return;
    }

    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
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
          PurchaseStatus.APPROVED,
          this.tokenData.id,
          result.comment,
        ).subscribe({
          next: () => {
            this.notificationService.success('Purchase approved successfully');
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
        requireComment: false,
        commentLabel: 'Rejection Reason',
        commentPlaceholder: 'Enter your rejection reason here...'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.isConfirmed) {
        this.isRejecting = true;
        this.purchaseService.updatePurchaseStatus(
          this.purchaseId,
          PurchaseStatus.REJECTED,
          this.tokenData.id,
          result.comment,
        ).subscribe({
          next: () => {
            this.notificationService.success('Purchase rejected successfully');
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
    return ((totalCost - discountedCost) / discountedCost) * 100;
  }


  onEdit() {
    if (!this.purchase?._id) return;
    this.router.navigate(['/purchase', 'edit', this.purchase._id]);
    this.purchaseService.setPurchaseFormData(this.purchase)
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
        }
      }
    }

    return rows;
  }

  onExit() {
    if(this.purchaseId == 'none'){
      this.purchaseService.setPurchaseFormData(this.purchase)
      this.router.navigate(['/purchase/create'])
    }else{
      this.router.navigate(['/purchase/pendings'])
    }
  }

  onDestroy(): void {
    this.purchaseService.setPurchaseFormData(this.purchase)
  }
}
