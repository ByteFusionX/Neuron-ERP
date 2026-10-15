import { Component, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';

import { PaginationService } from 'src/app/core/services/pagination.service';
import { ClaimService } from 'src/app/core/services/claim.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridFilter,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
} from 'src/app/shared/components/data-grid/data-grid.model';

import { ClaimFormComponent } from './claim-form/claim-form.component';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AttachementsDialogComponent } from 'src/app/shared/components/attachements-dialog/attachements-dialog.component';

@Component({
  selector: 'app-claims',
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent
  ],
  templateUrl: './claims.component.html',
  styleUrls: ['./claims.component.css'],
  providers: [PaginationService]
})
export class ClaimsComponent implements OnInit {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  claimType: 'normal' | 'project' = 'normal';
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
  private _dialog = inject(MatDialog);
  private _route = inject(ActivatedRoute);
  private _toaster = inject(ToastrService);
  paginationService = inject(PaginationService);

  ngOnInit(): void {
    this._route.params.subscribe(params => {
      if (params['id']) {
        this.claimType = 'project';
        this.currentFilters['technicalId'] = params['id'];
      }
    });

    this.setupTableColumns();
    this.setupRowActions();
    this.loadClaims(this.currentFilters);
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
      }
    ];
    if(this.claimType == 'normal'){
      this.tableColumns.push({
        key: 'jobId',
        label: 'Job Id',
        type: 'text'
      });
    }

    this.tableColumns.push(
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
      },
      {
        key: 'paymentStatus',
        label: 'Payment Status',
        type: 'badge',
        valueGetter: (item: any) => item.paymentStatus || 'Pending',
        badgeClasses: {
          Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          Paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        }
      }
    );
  }

  setupRowActions(): void {
    this.rowActions = [
      { id: 'viewApprovalStatus', label: 'View Approval Status', icon: 'list', quick: true },
      { id: 'viewDocuments', label: 'View Documents', icon: 'files', hidden: (item) => !item.attachements?.length },
      { id: 'resubmitClaim', label: 'Resubmit Claim', icon: 'send', hidden: (item) => !item.approvalStatus?.some((status: any) => status.status === 'rejected') },
      { id: 'markAsPaid', label: 'Mark as Paid', icon: 'banknote', hidden: (item) => item.overallStatus !== 'approved' || item.paymentStatus === 'Paid' },
      { id: 'deleteClaim', label: 'Delete Claim', icon: 'trash', variant: 'danger', divider: true }
    ];
  }

  loadClaims(filters?: any): void {
    this.isLoading = true;
    const currentState = this.paginationService.paginationState();

    const filterParams: any = {
      page: currentState.page,
      row: currentState.row,
      type: this.claimType,
      ...filters
    };

    this._claimService.getClaims(filterParams).subscribe({
      next: (res) => {
        if(res && res.data){
          this.tableData = res.data || [];
          this.totalItems = res.total;
          this.paginationService.updatePaginationState({
            page: currentState.page,
            row: currentState.row,
            total: this.totalItems
          });
          this.isLoading = false;
        }else{
          this.isLoading = false;
          this.tableData = [];
          this.totalItems = 0;
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        this._toaster.error('Failed to load claims');
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
    if (this.currentFilters['technicalId']) filterParams.technicalId = this.currentFilters['technicalId'];

    this.currentFilters = filterParams;
    this.loadClaims(this.currentFilters);
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
      case 'viewApprovalStatus':
        this.onViewApprovalStatus(event.row);
        break;
      case 'resubmitClaim':
        this.onResubmitClaim(event.row);
        break;
      case 'deleteClaim':
        this.onDeleteClaim(event.row);
        break;
      case 'viewDocuments':
        this.onViewDocuments(event.row);
        break;
      case 'markAsPaid':
        this.onMarkAsPaid(event.row);
        break;
    }
  }

  onMarkAsPaid(claim: any): void {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Mark as Paid',
        description: 'Are you sure you want to mark this claim as paid?',
        icon: 'heroBanknotes',
        IconColor: 'green'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._claimService.markClaimAsPaid(claim._id, {}).subscribe({
          next: () => {
            this._toaster.success('Claim marked as paid');
            this.loadClaims(this.currentFilters);
          },
          error: () => {
            this._toaster.error('Failed to mark claim as paid');
          }
        });
      }
    });
  }

  onViewApprovalStatus(claim: any): void {
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

  onResubmitClaim(claim: any): void {
    const dialogRef = this._dialog.open(ClaimFormComponent, {
      width: '800px',
      data: {
        claim,
        type: this.claimType,
        mode: 'edit'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._claimService.updateClaimAndSubmit(claim._id, result).subscribe({
          next: () => {
            this._toaster.success('Claim resubmitted successfully');
            this.loadClaims(this.currentFilters);
          },
          error: () => {
            this._toaster.error('Failed to resubmit claim');
          }
        });
      }
    });
  }

  onDeleteClaim(claim: any): void {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Claim',
        description: 'Are you sure you want to delete this claim?',
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._claimService.deleteClaim(claim._id).subscribe({
          next: () => {
            this._toaster.success('Claim deleted successfully');
            this.loadClaims(this.currentFilters);
          },
          error: () => {
            this._toaster.error('Failed to delete claim');
          }
        });
      }
    });
  }

  onCreateClaim(): void {
    const dialogRef = this._dialog.open(ClaimFormComponent, {
      width: '800px',
      data: {
        type: this.claimType,
        mode: 'create'
      }
    });

    dialogRef.afterClosed().subscribe((result: FormData) => {
      if (result) {        
        if(this.claimType === 'project'){
          const technicalId = this.currentFilters['technicalId'];
          if(technicalId){
            result.set('technicalId', technicalId);
          }
        }

        this._claimService.createClaim(result).subscribe({
          next: (response) => {
            if (response.success) {
              this._toaster.success('Claim created successfully');
              this.loadClaims(this.currentFilters);
            }else{
              this._toaster.error(response.message);
            }
            },
            error: () => {
              this._toaster.error('Failed to create claim');
            }
          });
      }
    });
  }

  onExportRequest(): void {
    const total = this.totalItems || this.tableData.length;
    this._claimService.getClaims({ ...this.currentFilters, page: 1, row: total }).subscribe({
      next: (res) => this.grid?.exportToExcel(res?.data || []),
      error: () => this._toaster.error('Failed to export claims')
    });
  }

  get pageTitle(): string {
    return this.claimType === 'project' ? 'Project Claims' : 'Expenses';
  }
}
