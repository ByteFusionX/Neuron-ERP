import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';

import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ClaimService } from 'src/app/core/services/claim.service';

import { ClaimFormComponent } from './claim-form/claim-form.component';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { NgIconComponent } from '@ng-icons/core';
import { AttachementsDialogComponent } from 'src/app/shared/components/attachements-dialog/attachements-dialog.component';

@Component({
  selector: 'app-claims',
  standalone: true,
  imports: [
    CommonModule,
    TableComponent,
    ButtonComponent,
    NgIconComponent
  ],
  templateUrl: './claims.component.html',
  styleUrls: ['./claims.component.css'],
  providers: [PaginationService]
})
export class ClaimsComponent implements OnInit {

  claimType: 'normal' | 'project' = 'normal';
  tableData: any[] = [];
  tableColumns: TableColumn[] = [];
  isLoading = false;
  isEmpty = false;
  totalItems = 0;
  currentFilters: any = {};

  private _claimService = inject(ClaimService);
  private _dialog = inject(MatDialog);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _toaster = inject(ToastrService);
  private _paginationService = inject(PaginationService);

  ngOnInit(): void {
    this._route.params.subscribe(params => {
      if (params['id']) {
        this.claimType = 'project';
        this.currentFilters['technicalId'] = params['id'];
      }
    });

    this.setupTableColumns();
    this.loadClaims(this.currentFilters);
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
      }
    ];
    if(this.claimType == 'normal'){
      this.tableColumns.push({
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
          if(item.job){
            console.log(item.job);
          }else{
            this._toaster.error('Job not found');
          }
        },
      });
    }

    this.tableColumns.push(
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
        ],
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        actions: [
          { icon: 'heroListBullet', tooltip: 'View Approval Status', action: 'viewApprovalStatus' },
          {
            icon: 'heroPaperAirplane',
            tooltip: 'Resubmit Claim',
            action: 'resubmitClaim',
            condition: (item: any) => item.approvalStatus?.some((status: any) => status.status === 'rejected')
          },
          { icon: 'heroTrash', tooltip: 'Delete Claim', action: 'deleteClaim' }
        ]
      }
    );
  }

  loadClaims(filters?: any): void {
    this.isLoading = true;
    const currentState = this._paginationService.paginationState();

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
          this.isEmpty = this.tableData.length === 0;
          this.isLoading = false;
        }else{
          this.isLoading = false;
          this.isEmpty = true;
          this.tableData = [];
          this.totalItems = 0;
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        this.isEmpty = true;
        this._toaster.error('Failed to load claims');
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
        case 'date':
          if (filter.column === 'raisedDate') {
            acc['fromDate'] = filter.value[0];
            acc['toDate'] = filter.value[1];
          }
          break;
        case 'select':
          acc[filter.column] = filter.value;
          break;
      }
      return acc;
    }, {} as Partial<any>);

    const includesTechnicalId = {technicalId: this.currentFilters['technicalId']};

    this.currentFilters = {...filterParams, ...includesTechnicalId};

    this.loadClaims(this.currentFilters);
  }

  onActionClick(event: { action: string; item: any }): void {
    switch (event.action) {
      case 'viewApprovalStatus':
        this.onViewApprovalStatus(event.item);
        break;
      case 'resubmitClaim':
        this.onResubmitClaim(event.item);
        break;
      case 'deleteClaim':
        this.onDeleteClaim(event.item);
        break;
      case 'viewDocuments':
        this.onViewDocuments(event.item);
        break;
    }
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

  onRequestForApprovals(): void {
    this._router.navigate(['/claims/request-for-approvals']);
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.loadClaims(this.currentFilters);
  }

  onRefreshClaims(): void {
    this.loadClaims(this.currentFilters);
  }

  get pageTitle(): string {
    return this.claimType === 'project' ? 'Project Claims' : 'Claims';
  }
}
