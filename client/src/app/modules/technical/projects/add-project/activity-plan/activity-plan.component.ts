import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { MatDialog } from '@angular/material/dialog';
import { AddPlanComponent } from './add-plan/add-plan.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ClosedPlanComponent } from './closed-plan/closed-plan.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ViewEmployeesComponent } from './view-employees/view-employees.component';
import { ViewCommentComponent } from './view-comment/view-comment.component';

@Component({
  selector: 'app-activity-plan',
  standalone: true,
  imports: [CommonModule, TableComponent, ButtonComponent],
  templateUrl: './activity-plan.component.html',
  styleUrl: './activity-plan.component.css',
  providers: [PaginationService]
})
export class ActivityPlanComponent implements OnInit {
  private technicalService = inject(TechnicalService);
  private _dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);

  activityPlans: any[] = [];
  technicalId: string = '';
  isLoading = false;
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  planStatus: string[] = ['Pending', 'Closed'];

  ngOnInit(): void {
    this.setupTableColumns();
    this.route.params.subscribe(params => {
      this.technicalId = params['id'];
      if (this.technicalId) {
        this.loadActivityPlans();
      }
    });
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'slNo',
        label: 'Sl No',
        type: 'text',
        cellRenderer: (item: any) => {
          const index = this.activityPlans.indexOf(item);
          return index + 1;
        }
      },
      {
        key: 'activityName',
        label: 'Activity Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'expectedStartDate',
        label: 'Expected Start Date',
        type: 'text',
        filterable: true,
        filterType: 'date',
        cellRenderer: (item: any) => {
          if (!item.startDate) return '-';
          const date = new Date(item.startDate);
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      },
      {
        key: 'expectedEndDate',
        label: 'Expected End Date',
        type: 'text',
        filterable: true,
        filterType: 'date',
        cellRenderer: (item: any) => {
          if (!item.endDate) return '-';
          const date = new Date(item.endDate);
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      },
      {
        key: 'actualStartDate',
        label: 'Actual Start Date',
        type: 'text',
        filterable: true,
        filterType: 'date',
        cellRenderer: (item: any) => {
          if (item.status !== 'Closed') {
            return '-';
          }
          if (!item.orginalStartDate) return '-';
          const date = new Date(item.orginalStartDate);
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      },
      {
        key: 'actualEndDate',
        label: 'Actual End Date',
        type: 'text',
        filterable: true,
        filterType: 'date',
        cellRenderer: (item: any) => {
          if (item.status !== 'Closed') {
            return '-';
          }
          if (!item.orginalEndDate) return '-';
          const date = new Date(item.orginalEndDate);
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      },
      {
        key: 'includedEmployees',
        label: 'Included Employees',
        type: 'action',
        headerClass: 'text-center',
        actions: [
          {
            icon: 'heroUserGroup',
            tooltip: 'View Employees',
            action: 'viewEmployees',
            buttonClass: 'w-7 h-7 rounded-full border border-gray-300 hover:border-gray-500 flex justify-center items-center cursor-pointer',
            condition: (item: any) => item.includedEmployees && item.includedEmployees.length > 0
          }
        ]
      },
      {
        key: 'status',
        label: 'Status',
        type: 'statusDropdown',
        statusOptions: this.planStatus,
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.planStatus.map(s => ({ label: s, value: s }))
      },
      {
        key: 'comments',
        label: 'Comments',
        type: 'action',
        headerClass: 'text-center',
        actions: [
          {
            icon: 'heroChatBubbleBottomCenterText',
            tooltip: 'View Comment',
            action: 'viewComment',
            buttonClass: 'w-7 h-7 rounded-full border border-gray-300 hover:border-gray-500 flex justify-center items-center cursor-pointer',
            condition: (item: any) => !!item.comment
          }
        ]
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroPencil',
            tooltip: 'Edit Activity Plan',
            action: 'editActivityPlan',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-blue-300 hover:border-blue-500 text-blue-600 text-sm rounded-full font-medium'
          }
        ]
      }
    ];

    this.defaultColumns = ['slNo', 'activityName', 'expectedStartDate', 'expectedEndDate', 'actualStartDate', 'actualEndDate', 'includedEmployees', 'status', 'comments', 'actions'];
  }

  loadActivityPlans(filters?: { 
    activityName?: string; 
    status?: string | string[]; 
    expectedStartDateFrom?: string; 
    expectedStartDateTo?: string;
    expectedEndDateFrom?: string;
    expectedEndDateTo?: string;
    actualStartDateFrom?: string;
    actualStartDateTo?: string;
    actualEndDateFrom?: string;
    actualEndDateTo?: string;
  }) {
    if (this.technicalId) {
      this.isLoading = true;
      this.technicalService.getActivityPlans(this.technicalId, filters).subscribe({
        next: (response) => {
          this.activityPlans = response.data || [];
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading activity plans:', error);
          this.isLoading = false;
        }
      });
    }
  }

  onFilterChange(filters: TableFilter[]): void {
    const filterParams: { 
      activityName?: string; 
      status?: string | string[]; 
      expectedStartDateFrom?: string; 
      expectedStartDateTo?: string;
      expectedEndDateFrom?: string;
      expectedEndDateTo?: string;
      actualStartDateFrom?: string;
      actualStartDateTo?: string;
      actualEndDateFrom?: string;
      actualEndDateTo?: string;
    } = {};

    filters.forEach(filter => {
      switch (filter.type) {
        case 'text':
          if (filter.column === 'activityName') {
            filterParams.activityName = filter.value;
          }
          break;
        case 'select':
          if (filter.column === 'status') {
            filterParams.status = Array.isArray(filter.value) ? filter.value : [filter.value];
          }
          break;
        case 'date':
          if (filter.value && Array.isArray(filter.value) && filter.value.length === 2) {
            const dateFrom = filter.value[0];
            const dateTo = filter.value[1];
            
            const formatDate = (date: any): string => {
              if (!date) return '';
              if (typeof date === 'string') return date;
              if (date instanceof Date) return date.toISOString().split('T')[0];
              return String(date);
            };
            
            if (filter.column === 'expectedStartDate') {
              if (dateFrom) {
                filterParams.expectedStartDateFrom = formatDate(dateFrom);
              }
              if (dateTo) {
                filterParams.expectedStartDateTo = formatDate(dateTo);
              }
            } else if (filter.column === 'expectedEndDate') {
              if (dateFrom) {
                filterParams.expectedEndDateFrom = formatDate(dateFrom);
              }
              if (dateTo) {
                filterParams.expectedEndDateTo = formatDate(dateTo);
              }
            } else if (filter.column === 'actualStartDate') {
              if (dateFrom) {
                filterParams.actualStartDateFrom = formatDate(dateFrom);
              }
              if (dateTo) {
                filterParams.actualStartDateTo = formatDate(dateTo);
              }
            } else if (filter.column === 'actualEndDate') {
              if (dateFrom) {
                filterParams.actualEndDateFrom = formatDate(dateFrom);
              }
              if (dateTo) {
                filterParams.actualEndDateTo = formatDate(dateTo);
              }
            }
          }
          break;
      }
    });

    this.loadActivityPlans(filterParams);
  }

  onTableStatusChange(event: any) {
    const activityPlan = event.item;

    if (event.newValue === 'Closed') {
      const dialogRef = this._dialog.open(ClosedPlanComponent, {
        width: '500px',
        data: { technicalId: this.technicalId, activityPlan: activityPlan }
      });
      dialogRef.afterClosed().subscribe((result) => {
        if (result?.success) {
          this.loadActivityPlans();
        }
      });
    }
  }

  onAddActivityPlan() {
    const dialogRef = this._dialog.open(AddPlanComponent, {
      width: '500px',
      data: { technicalId: this.technicalId }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.loadActivityPlans();
      }
    });
  }

  editActivityPlan(activityPlan: any) {
    const dialogRef = this._dialog.open(AddPlanComponent, {
      width: '500px',
      data: {
        technicalId: this.technicalId,
        activityPlan: activityPlan
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.loadActivityPlans();
      }
    });
  }

  onActionClick(event: { action: string, item: any, event: Event }) {
    event.event.stopPropagation();
    
    switch (event.action) {
      case 'viewEmployees':
        this.viewEmployees(event.item);
        break;
      case 'viewComment':
        this.viewComment(event.item);
        break;
      case 'editActivityPlan':
        this.editActivityPlan(event.item);
        break;
    }
  }

  viewEmployees(item: any) {
    if (!item.includedEmployees || item.includedEmployees.length === 0) {
      return;
    }
    
    const dialogRef = this._dialog.open(ViewEmployeesComponent, {
      width: '500px',
      data: { employees: item.includedEmployees }
    });
  }

  viewComment(item: any) {
    if (!item.comment) {
      return;
    }
    
    const dialogRef = this._dialog.open(ViewCommentComponent, {
      width: '500px',
      data: { comment: item.comment }
    });
  }

}
