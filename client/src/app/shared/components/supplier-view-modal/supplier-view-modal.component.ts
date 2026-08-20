import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from '../button/button.component';
import { ModalLayoutComponent, ModalFooterButton } from '../modal-layout/modal-layout.component';
import { ActionConfirmationDialogComponent } from '../action-confirmation-dialog/action-confirmation-dialog.component';
import { StatusHistoryModalComponent } from '../status-history-modal/status-history-modal.component';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Supplier, SupplierStatus } from 'src/app/shared/interfaces/suppliers.interface';
import { FileService } from 'src/app/core/services/file.service';

export interface SupplierViewModalData {
  supplier: Supplier;
}

@Component({
  selector: 'app-supplier-view-modal',
  standalone: true,
  imports: [CommonModule, IconsModule, ButtonComponent, ModalLayoutComponent],
  templateUrl: './supplier-view-modal.component.html',
})
export class SupplierViewModalComponent implements OnInit {
  supplier: Supplier | null = null;
  canApproveSupplier = false;
  isApproving = false;
  isRejecting = false;
  downloadProgress = 0;
  isDownloading = false;
  refreshNeeded = false;

  constructor(
    public dialogRef: MatDialogRef<SupplierViewModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SupplierViewModalData,
    private supplierService: SupplierService,
    private employeeService: EmployeeService,
    private notificationService: ToastrService,
    private dialog: MatDialog,
    private fileService: FileService
  ) {}

  ngOnInit(): void {
    this.supplier = this.data?.supplier || null;
    this.checkPrivileges();
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canApproveSupplier = data.category.privileges.supplier?.canApproveSupplier || false;
      }
    });
  }

  get footerButtons(): ModalFooterButton[] {
    if (!this.supplier) return [];
    const buttons: ModalFooterButton[] = [];

    if (this.supplier.status === 'Pending') {
      buttons.push({
        label: 'Reject',
        theme: 'danger',
        icon: 'heroXCircle',
        loading: this.isRejecting,
        onClick: () => this.onReject()
      });
    }

    if (this.supplier.status === 'Pending' && this.canApproveSupplier) {
      buttons.push({
        label: 'Approve',
        theme: 'primary',
        icon: 'heroCheckCircle',
        loading: this.isApproving,
        onClick: () => this.onApprove()
      });
    }

    return buttons;
  }

  onApprove(): void {
    if (!this.supplier?._id) return;

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
      if (result?.isConfirmed && this.supplier?._id) {
        this.isApproving = true;
        this.supplierService.updateSupplierStatus(
          this.supplier._id,
          SupplierStatus.APPROVED,
          result.comment
        ).subscribe({
          next: () => {
            this.notificationService.success('Supplier approved successfully');
            this.refreshNeeded = true;
            this.dialogRef.close({ refresh: true });
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to approve supplier');
            this.isApproving = false;
          }
        });
      }
    });
  }

  onReject(): void {
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
          this.supplier._id,
          SupplierStatus.REJECTED,
          result.comment
        ).subscribe({
          next: () => {
            this.notificationService.success('Supplier rejected successfully');
            this.refreshNeeded = true;
            this.dialogRef.close({ refresh: true });
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to reject supplier');
            this.isRejecting = false;
          }
        });
      }
    });
  }

  onDownloadFile(file: any): void {
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

  onClose(): void {
    this.dialogRef.close(this.refreshNeeded ? { refresh: true } : undefined);
  }
}
