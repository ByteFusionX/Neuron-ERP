import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { Supplier, SupplierStatus } from 'src/app/shared/interfaces/suppliers.interface';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { FileService } from 'src/app/core/services/file.service';

@Component({
  selector: 'app-supplier-view',
  standalone: true,
  imports: [CommonModule, IconsModule, ButtonComponent],
  templateUrl: './supplier-view.component.html',
})
export class SupplierViewComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private fileService = inject(FileService);

  supplier: Supplier | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  downloadProgress: number = 0;
  isDownloading: boolean = false;

  constructor() {
    this.loadSupplier();
  }

  ngOnInit(): void {
  }

  loadSupplier() {
    const supplierId = this.route.snapshot.paramMap.get('id');
    if (!supplierId) {
      this.notificationService.error('Invalid supplier ID');
      this.router.navigate(['/suppliers']);
      return;
    }

    this.supplierService.getSupplierById(supplierId).subscribe({
      next: (response) => {
        this.supplier = response.data;
        this.isLoading = false;
      },
      error: (error) => {
        this.notificationService.error('Failed to load supplier details');
        console.error('Error loading supplier:', error);
        this.isLoading = false;
        this.router.navigate(['/suppliers']);
      }
    });
  }

  onApprove() {
    if (!this.supplier) return;

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      data: {
        title: 'Approve Supplier',
        description: 'Are you sure you want to approve this supplier? Please provide a comment explaining your decision.',
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
        if (this.supplier?._id) {
          this.supplierService.updateSupplierStatus(
            this.supplier?._id,
            SupplierStatus.APPROVED,
            result.comment
          ).subscribe({
            next: () => {
              this.notificationService.success('Supplier approved successfully');
              this.router.navigate(['/suppliers/pendings']);
            },
            error: (error) => {
              this.notificationService.error(error.error.message || 'Failed to approve supplier');
              this.isApproving = false;
            }
          });
        }
      }
    });
  }

  onReject() {
    if (!this.supplier?._id) return;

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      data: {
        title: 'Reject Supplier',
        description: 'Are you sure you want to reject this supplier? Please provide a reason for rejection.',
        icon: 'heroXCircle',
        iconColor: 'red',
        confirmButtonText: 'Reject',
        requireComment: false,
        commentLabel: 'Rejection Reason',
        commentPlaceholder: 'Enter your rejection reason here...'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.isConfirmed && this.supplier?._id) {
        this.isRejecting = true;
        this.supplierService.updateSupplierStatus(
          this.supplier?._id,
          SupplierStatus.REJECTED,
          result.comment
        ).subscribe({
          next: () => {
            this.notificationService.success('Supplier rejected successfully');
            this.router.navigate(['/suppliers/pendings']);
          },
          error: (error: any) => {
            this.notificationService.error(error.error?.message || 'Failed to reject supplier');
            this.isRejecting = false;
          }
        });
      }
    });
  }

  onEdit() {
    if (!this.supplier) return;
    this.router.navigate(['/suppliers', 'edit', this.supplier._id]);
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
          this.notificationService.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.');
        } else {
          this.notificationService.error('An error occurred while downloading the file. Please try again.');
        }
      }
    );
  }

  getStatusClass(status: string): string {
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
    if (!this.supplier?.rejectHistory?.length) return;

    const historyData = this.supplier.rejectHistory.map(item => ({
      rejectedBy: item.rejectedBy,
      comment: item.reason,
      rejectedAt: item.date.toString(),
      _id: Math.random().toString(),
      type: 'rejection' as const
    }));

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: 'Supplier Rejection History',
        history: historyData,
        type: 'rejection' as const
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }

  showApprovalHistory(): void {
    if (!this.supplier?.approvedHistory?.length) return;

    const historyData = this.supplier.approvedHistory.map(item => ({
      approvedBy: item.approvedBy,
      comment: item.reason,
      approvedAt: item.date.toString(),
      _id: Math.random().toString(),
      type: 'approval' as const
    }));

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: 'Supplier Approval History',
        history: historyData,
        type: 'approval' as const
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }
} 