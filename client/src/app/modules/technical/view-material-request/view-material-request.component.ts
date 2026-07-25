import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TechnicalService, MaterialRequest, MaterialRequestAttachment } from 'src/app/core/services/technical.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';

@Component({
  selector: 'app-view-material-request',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    MatTooltipModule,
  ],
  templateUrl: './view-material-request.component.html',
  styleUrl: './view-material-request.component.css'
})
export class ViewMaterialRequestComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private technicalService = inject(TechnicalService);
  private employeeService = inject(EmployeeService);
  private toaster = inject(ToastrService);
  private dialog = inject(MatDialog);
  canApproveMRRequests = false;

  technicalId: string = '';
  jobId: string = '';
  isLoading = false;
  isApproving = false;
  materialRequests: MaterialRequest[] = [];
  attachments: MaterialRequestAttachment[] = [];
  customerName: string = '';
  jobIdDisplay: string = '';

  ngOnInit(): void {
    this.checkPrivileges();
    this.route.params.subscribe(params => {
      this.technicalId = params['id'];
      if (this.technicalId) {
        this.loadMaterialRequests();
      }
    });
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data: getEmployee | undefined) => {
      if (data?.category?.privileges) {
        this.canApproveMRRequests = data.category.privileges.technical?.canApproveMRRequests || false;
      }
    });
  }

  loadMaterialRequests(): void {
    this.isLoading = true;
    this.technicalService.getTechnicalProjectById(this.technicalId).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success && res.data) {
          this.materialRequests = res.data.materialRequest || [];
          this.attachments = res.data.materialRequestAttachements || [];
          this.customerName = res.data.customer?.companyName || '';
          this.jobIdDisplay = res.data.jobId?.jobId || '';
          this.jobId = res.data.jobId?._id || res.data.jobId || '';
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error loading material requests:', error);
        this.toaster.error('Failed to load material requests');
      }
    });
  }

  getStatusClass(status?: string): string {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border border-red-200';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-700 border border-amber-200';
    }
  }

  getStatusLabel(status?: string): string {
    if (!status) return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  showStatusHistory(item: MaterialRequest | MaterialRequestAttachment, type: 'item' | 'file'): void {
    const statusHistory = (item as MaterialRequest).statusHistory || (item as MaterialRequestAttachment).statusHistory || [];

    if (statusHistory.length === 0) {
      this.toaster.info(`No status history available for this ${type}`);
      return;
    }

    const historyMapped = statusHistory.map((item: any) => {
      const isApproved = item.status === 'approved';
      return {
        comment: item.comment || '',
        type: isApproved ? 'approval' : 'rejection',
        approvedBy: isApproved && item.changedBy ? item.changedBy : undefined,
        rejectedBy: !isApproved && item.changedBy ? item.changedBy : undefined,
        approvedAt: isApproved && item.changedDate ? new Date(item.changedDate).toISOString() : undefined,
        rejectedAt: !isApproved && item.changedDate ? new Date(item.changedDate).toISOString() : undefined,
        _id: item._id || Math.random().toString()
      };
    });

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: `${type === 'item' ? 'Item' : 'File'} Status History`,
        history: historyMapped
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }

  calculateTotalCost(quantity: number, estimatedCost: number): number {
    return quantity * estimatedCost;
  }

  calculateGrandTotal(): number {
    return this.materialRequests.reduce((total, item) => {
      return total + this.calculateTotalCost(item.quantity || 0, item.estimatedCost || 0);
    }, 0);
  }

  onBack(): void {
    this.router.navigate(['/technical/mr-approval-requests']);
  }

  hasPendingItems(): boolean {
    return this.materialRequests.some(item => item.status === 'pending');
  }

  hasPendingFiles(): boolean {
    return this.attachments.some(file => file.status === 'pending');
  }

  hasAnyPending(): boolean {
    return this.hasPendingItems() || this.hasPendingFiles();
  }

  approveItem(item: MaterialRequest, index: number): void {
    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Approve Item',
        description: `Are you sure you want to approve "${item.itemName}"?`,
        icon: 'heroCheckCircle',
        iconColor: 'green',
        confirmButtonText: 'Approve',
        requireComment: false,
        commentLabel: 'Approval Comment',
        commentPlaceholder: 'Enter your approval comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.technicalService.approveMaterialRequestItem(
          this.technicalId,
          index,
          result.comment || ''
        ).subscribe({
          next: (response) => {
            if (response.success) {
              this.toaster.success('Item approved successfully');
              this.loadMaterialRequests();
              this.isApproving = false;
            } else {
              this.toaster.error(response.message || 'Failed to approve item');
              this.isApproving = false;
            }
          },
          error: (error) => {
            this.toaster.error(error.error?.message || 'Failed to approve item');
            this.isApproving = false;
          }
        });
      }
    });
  }

  rejectItem(item: MaterialRequest, index: number): void {
    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Reject Item',
        description: `Are you sure you want to reject "${item.itemName}"?`,
        icon: 'heroXCircle',
        iconColor: 'red',
        confirmButtonText: 'Reject',
        requireComment: true,
        commentLabel: 'Rejection Comment',
        commentPlaceholder: 'Enter your rejection comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.technicalService.rejectMaterialRequestItem(
          this.technicalId,
          index,
          result.comment || ''
        ).subscribe({
          next: (response) => {
            if (response.success) {
              this.toaster.success('Item rejected successfully');
              this.loadMaterialRequests();
              this.isApproving = false;
            } else {
              this.toaster.error(response.message || 'Failed to reject item');
              this.isApproving = false;
            }
          },
          error: (error) => {
            this.toaster.error(error.error?.message || 'Failed to reject item');
            this.isApproving = false;
          }
        });
      }
    });
  }

  approveFile(file: MaterialRequestAttachment, index: number): void {
    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Approve File',
        description: `Are you sure you want to approve "${file.originalname}"?`,
        icon: 'heroCheckCircle',
        iconColor: 'green',
        confirmButtonText: 'Approve',
        requireComment: false,
        commentLabel: 'Approval Comment',
        commentPlaceholder: 'Enter your approval comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.technicalService.approveMaterialRequestFile(
          this.technicalId,
          index,
          result.comment || ''
        ).subscribe({
          next: (response) => {
            if (response.success) {
              this.toaster.success('File approved successfully');
              this.loadMaterialRequests();
              this.isApproving = false;
            } else {
              this.toaster.error(response.message || 'Failed to approve file');
              this.isApproving = false;
            }
          },
          error: (error) => {
            this.toaster.error(error.error?.message || 'Failed to approve file');
            this.isApproving = false;
          }
        });
      }
    });
  }

  rejectFile(file: MaterialRequestAttachment, index: number): void {
    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Reject File',
        description: `Are you sure you want to reject "${file.originalname}"?`,
        icon: 'heroXCircle',
        iconColor: 'red',
        confirmButtonText: 'Reject',
        requireComment: true,
        commentLabel: 'Rejection Comment',
        commentPlaceholder: 'Enter your rejection comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.technicalService.rejectMaterialRequestFile(
          this.technicalId,
          index,
          result.comment || ''
        ).subscribe({
          next: (response) => {
            if (response.success) {
              this.toaster.success('File rejected successfully');
              this.loadMaterialRequests();
              this.isApproving = false;
            } else {
              this.toaster.error(response.message || 'Failed to reject file');
              this.isApproving = false;
            }
          },
          error: (error) => {
            this.toaster.error(error.error?.message || 'Failed to reject file');
            this.isApproving = false;
          }
        });
      }
    });
  }

  approveAllPending(): void {
    const pendingItemsCount = this.materialRequests.filter(item => item.status === 'pending').length;
    const pendingFilesCount = this.attachments.filter(file => file.status === 'pending').length;
    const totalPending = pendingItemsCount + pendingFilesCount;

    if (totalPending === 0) {
      this.toaster.info('No pending items or files to approve');
      return;
    }

    const dialogRef = this.dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Approve All Pending',
        description: `Are you sure you want to approve all pending items (${pendingItemsCount} items, ${pendingFilesCount} files)? This will only approve items/files that are currently pending and will skip any previously rejected items.`,
        icon: 'heroCheckCircle',
        iconColor: 'green',
        confirmButtonText: 'Approve All',
        requireComment: false,
        commentLabel: 'Approval Comment',
        commentPlaceholder: 'Enter your approval comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.isConfirmed) {
        this.isApproving = true;
        this.technicalService.approveAllPendingMaterialRequests(
          this.technicalId,
          result.comment || ''
        ).subscribe({
          next: (response) => {
            if (response.success) {
              this.toaster.success('All pending items approved successfully');
              this.loadMaterialRequests();
              this.isApproving = false;
            } else {
              this.toaster.error(response.message || 'Failed to approve all pending items');
              this.isApproving = false;
            }
          },
          error: (error) => {
            this.toaster.error(error.error?.message || 'Failed to approve all pending items');
            this.isApproving = false;
          }
        });
      }
    });
  }
}

