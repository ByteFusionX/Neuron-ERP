import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';

import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ClaimService } from 'src/app/core/services/claim.service';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AttachementsDialogComponent } from 'src/app/shared/components/attachements-dialog/attachements-dialog.component';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { NgIconComponent } from '@ng-icons/core';

@Component({
  selector: 'app-request-for-approvals',
  standalone: true,
  imports: [
    CommonModule,
    TableComponent,
    ButtonComponent,
    NgIconComponent
  ],
  templateUrl: './request-for-approvals.component.html',
  styleUrls: ['./request-for-approvals.component.css'],
  providers: [PaginationService]
})
export class RequestForApprovalsComponent implements OnInit {

  tableData: any[] = [];
  tableColumns: TableColumn[] = [];
  isLoading = false;
  isEmpty = false;
  totalItems = 0;
  currentFilters: any = {};

  private _claimService = inject(ClaimService);
  private _dialog = inject(MatDialog);
  private _router = inject(Router);
  private _toaster = inject(ToastrService);
  private _paginationService = inject(PaginationService);

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadApprovalRequests();
  }


  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'slNo',
        label: 'Sl No',
        type: 'text',
        cellRenderer: (item: any) => {
          const currentState = this._paginationService.paginationState();
          const index = this.tableData.indexOf(item);
          return (currentState.page - 1) * currentState.row + index + 1;
        }
      },
      {
        key: 'reason',
        label: 'Reason',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search reason...'
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'text',
        cellRenderer: (item: any) => `${item.amount?.toLocaleString() || 0} QAR`
      },
      {
        key: 'raisedDate',
        label: 'Raised Date',
        type: 'date',
        filterable: true,
        filterType: 'date',
        filterPlaceholder: 'Search date...',
      },
      {
        key: 'raisedBy.firstName',
        label: 'Raised By',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search raised by...',
        cellRenderer: (item: any) => `${item.raisedBy?.firstName || ''} ${item.raisedBy?.lastName || ''}`
      },
      {
        key: 'jobId',
        label: 'Job Id',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search job id...',
        clickable: true,
        clickableValue: (item: any) => {
          return item.job;
        },
        clickFunction: (item: any) => {
          if (item.job) {
            console.log(item.job);
          } else {
            this._toaster.error('Job not found');
          }
        },
      },
      {
        key: 'attachements',
        label: 'Attachments',
        type: 'action',
        actions: [
          {
            icon: 'heroPaperClip',
            tooltip: 'View Documents',
            action: 'viewDocuments',
            buttonClass: 'w-7 h-7 rounded-full border border-gray-300 hover:border-gray-500 flex justify-center items-center',
            condition: (item: any) => item.attachements?.length > 0
          }
        ]
      },
      {
        key: 'overallStatus',
        label: 'Status',
        type: 'status',
        filterable: true,
        filterType: 'select',
        filterPlaceholder: 'Search status...',
        filterOptions: [
          { label: 'Pending', value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Rejected', value: 'rejected' }
        ]
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        actions: [
          { icon: 'heroListBullet', tooltip: 'View Approval Status', action: 'viewDetails' },
          { icon: 'heroCheckCircle', tooltip: 'Apporve', action: 'approve' },
          { icon: 'heroXCircle', tooltip: 'Reject', action: 'reject' },

        ]
      }
    ];
  }

  loadApprovalRequests(filters?: any): void {
    this.isLoading = true;
    const currentState = this._paginationService.paginationState();

    const filterParams: any = {
      page: currentState.page,
      row: currentState.row,
      ...filters
    };

    this._claimService.getApprovalsByEmployee(filterParams).subscribe({
      next: (res) => {
        if (res && res.data) {
          this.tableData = res.data || [];
          this.totalItems = res.total;
          this.isEmpty = this.tableData.length === 0;
          this.isLoading = false;
        } else {
          this.isLoading = false;
          this.isEmpty = true;
          this.tableData = [];
          this.totalItems = 0;
        }
      },
      error: () => {
        this.isLoading = false;
        this.isEmpty = true;
        this._toaster.error('Failed to load approval requests');
      }
    });
  }

  onFilterChange(filters: TableFilter[]): void {
    this.isLoading = true;
    const currentState = this._paginationService.paginationState();
    this._paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    const filterParams: Partial<any> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          acc[filter.column] = filter.value;
          break;
      }
      return acc;
    }, {} as Partial<any>);

    this.currentFilters = filterParams;
    this.loadApprovalRequests(filterParams);
  }

  onActionClick(event: { action: string; item: any }): void {
    switch (event.action) {
      case 'viewDetails':
        this.onViewDetails(event.item);
        break;
      case 'approve':
        this.onApproveClaim(event.item);
        break;
      case 'reject':
        this.onRejectClaim(event.item);
        break;
      case 'viewDocuments':
        this.onViewDocuments(event.item);
        break;
    }
  }

  onViewDetails(claim: any): void {
    const dialogData: ApprovalStatusData = {
      entity: claim,
      entityType: 'claim'
    };
    
    this._dialog.open(ApprovalStatusComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: dialogData
    });
  }

  onViewDocuments(claim: any): void {
    this._dialog.open(AttachementsDialogComponent, {
      width: '500px',
      data: { attachments: claim.attachements, title: 'Documents' }
    });
  }

  onApproveClaim(claim: any): void {
    const dialogRef = this._dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Approve Claim',
        description: 'Are you sure you want to approve this claim?',
        icon: 'heroCheckCircle',
        IconColor: 'green',
        requireComment: false,
        commentLabel: 'Approval Comment',
        commentPlaceholder: 'Enter your approval comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._claimService.updateClaimStatus(claim._id, { status: 'approved', comment: result.comment }).subscribe({
          next: () => {
            this._toaster.success('Claim approved successfully');
            this.loadApprovalRequests(this.currentFilters);
          },
          error: () => {
            this._toaster.error('Failed to approve claim');
          }
        });
      }
    });
  }

  onRejectClaim(claim: any): void {
    const dialogRef = this._dialog.open(ActionConfirmationDialogComponent, {
      width: '600px',
      data: {
        title: 'Reject Claim',
        description: 'Are you sure you want to reject this claim?',
        icon: 'heroXCircle',
        IconColor: 'red',
        requireComment: true,
        commentLabel: 'Rejection Comment',
        commentPlaceholder: 'Enter your rejection comment here...'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._claimService.updateClaimStatus(claim._id, { status: 'rejected', comment: result.comment }).subscribe({
          next: () => {
            this._toaster.success('Claim rejected successfully');
            this.loadApprovalRequests(this.currentFilters);
          },
          error: () => {
            this._toaster.error('Failed to reject claim');
          }
        });
      }
    });
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.loadApprovalRequests(this.currentFilters);
  }

  onRefreshClaims(): void {
    this.loadApprovalRequests(this.currentFilters);
  }

  onBackToClaims(): void {
    this._router.navigate(['/claims']);
  }
}
