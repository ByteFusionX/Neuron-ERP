import { Component, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';

import { PaginationService } from 'src/app/core/services/pagination.service';
import { ClaimService } from 'src/app/core/services/claim.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridFilter,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
import { AttachementsDialogComponent } from 'src/app/shared/components/attachements-dialog/attachements-dialog.component';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';

@Component({
  selector: 'app-request-for-approvals',
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent
  ],
  templateUrl: './request-for-approvals.component.html',
  styleUrls: ['./request-for-approvals.component.css'],
  providers: [PaginationService]
})
export class RequestForApprovalsComponent implements OnInit {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  tableData: any[] = [];
  tableColumns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  breadcrumbs: DataGridBreadcrumb[] = [
    { label: 'Home', link: '/' },
    { label: 'Claims' }
  ];
  isLoading = false;
  totalItems = 0;
  currentFilters: any = {};

  private _claimService = inject(ClaimService);
  private _employeeService = inject(EmployeeService);
  private _dialog = inject(MatDialog);
  private _router = inject(Router);
  private _toaster = inject(ToastrService);
  paginationService = inject(PaginationService);
  canApprove = false;

  ngOnInit(): void {
    this.checkPrivileges();
    this.setupTableColumns();
    this.setupRowActions();
    this.loadApprovalRequests();
  }

  checkPrivileges(): void {
    this._employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canApprove = data.category.privileges.claims?.canApprove || false;
      }
    });
  }


  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'reason',
        label: 'Reason',
        type: 'text',
        sortable: true,
        locked: true
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'currency',
        currencyCode: 'QAR',
        align: 'right',
        sortable: true,
        aggregate: 'sum'
      },
      {
        key: 'raisedDate',
        label: 'Raised Date',
        type: 'date',
        sortable: true
      },
      {
        key: 'raisedBy.firstName',
        label: 'Raised By',
        type: 'text',
        valueGetter: (item: any) => `${item.raisedBy?.firstName || ''} ${item.raisedBy?.lastName || ''}`.trim() || '-'
      },
      {
        key: 'jobId',
        label: 'Job Id',
        type: 'text'
      },
      {
        key: 'attachements',
        label: 'Attachments',
        type: 'text',
        align: 'center',
        valueGetter: (item: any) => item.attachements?.length ? `${item.attachements.length} file${item.attachements.length === 1 ? '' : 's'}` : '-'
      },
      {
        key: 'overallStatus',
        label: 'Status',
        type: 'badge',
        filterOptions: [
          { label: 'Pending', value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Rejected', value: 'rejected' }
        ],
        badgeClasses: {
          pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          rejected: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
        }
      }
    ];
  }

  setupRowActions(): void {
    this.rowActions = [
      { id: 'viewDetails', label: 'View Approval Status', icon: 'list', quick: true },
      { id: 'viewDocuments', label: 'View Documents', icon: 'files', hidden: (item) => !item.attachements?.length },
      { id: 'approve', label: 'Approve', icon: 'check', hidden: () => !this.canApprove },
      { id: 'reject', label: 'Reject', icon: 'close', variant: 'danger', hidden: () => !this.canApprove }
    ];
  }

  loadApprovalRequests(filters?: any): void {
    this.isLoading = true;
    const currentState = this.paginationService.paginationState();

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
          this.paginationService.updatePaginationState({
            page: currentState.page,
            row: currentState.row,
            total: this.totalItems
          });
          this.isLoading = false;
        } else {
          this.isLoading = false;
          this.tableData = [];
          this.totalItems = 0;
        }
      },
      error: () => {
        this.isLoading = false;
        this._toaster.error('Failed to load approval requests');
      }
    });
  }

  onQueryChange(query: DataGridQuery): void {
    this.paginationService.updatePaginationState({
      page: query.page,
      row: query.pageSize,
      total: this.paginationService.paginationState().total
    });

    const filterParams: any = {};
    if (query.search) filterParams.reason = query.search;
    query.filters.forEach((filter) => this.applyGridFilter(filterParams, filter));
    this.currentFilters = filterParams;
    this.loadApprovalRequests(filterParams);
  }

  private applyGridFilter(params: any, filter: DataGridFilter): void {
    if (filter.key === 'raisedDate') {
      if (filter.op === 'before') params.toDate = filter.value;
      if (filter.op === 'after' || filter.op === 'on') params.fromDate = filter.value;
      return;
    }
    if (filter.key === 'raisedBy.firstName') {
      params.firstName = filter.value;
      return;
    }
    params[filter.key] = filter.value;
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    switch (event.action.id) {
      case 'viewDetails':
        this.onViewDetails(event.row);
        break;
      case 'approve':
        this.onApproveClaim(event.row);
        break;
      case 'reject':
        this.onRejectClaim(event.row);
        break;
      case 'viewDocuments':
        this.onViewDocuments(event.row);
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

  onExportRequest(): void {
    const total = this.totalItems || this.tableData.length;
    this._claimService.getApprovalsByEmployee({ ...this.currentFilters, page: 1, row: total }).subscribe({
      next: (res) => this.grid?.exportToExcel(res?.data || []),
      error: () => this._toaster.error('Failed to export approval requests')
    });
  }

  onBackToClaims(): void {
    this._router.navigate(['/claims']);
  }
}
