import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, TitleStrategy } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FileService } from 'src/app/core/services/file.service';
import { PurchaseData, PurchaseStatus } from 'src/app/shared/interfaces/purchase.interface';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';

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

  purchase: PurchaseData | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  downloadProgress = 0;
  isDownloading = false;
  purchaseId!: string;
  tokenData!: { id: string, employeeId: string };

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
  }

  loadPurchase() {
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (this.purchaseId == 'none') return
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase ID');
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
            this.router.navigate(['/purchase/approves']);
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

  onEdit() {
    if (!this.purchase?._id) return;
    this.router.navigate(['/purchases', 'edit', this.purchase._id]);
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
}
