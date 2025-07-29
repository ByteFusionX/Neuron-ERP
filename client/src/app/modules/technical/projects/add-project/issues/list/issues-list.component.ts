import { Component, Input, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { NgIconComponent } from '@ng-icons/core';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { MatDialog } from '@angular/material/dialog';
import { IssueFormComponent } from '../issue-form/issue-form.component';
import { ActivatedRoute } from '@angular/router';
import { Toast, ToastrService } from 'ngx-toastr';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';

@Component({
  selector: 'app-issues-list',
  standalone: true,
  imports: [TableComponent, ButtonComponent, NgIconComponent],
  templateUrl: './issues-list.component.html',
  styleUrl: './issues-list.component.css',
  providers: [PaginationService]
})
export class IssuesListComponent implements OnInit {
  
  technicalId: string = '';
  tableData: any[] = [];
  tableColumns: TableColumn[] = [];
  isLoading = false;
  isEmpty = false;
  totalItems = 0;

  private _technicalService = inject(TechnicalService);
  private _dialog = inject(MatDialog);
  private _route = inject(ActivatedRoute);
  private _toaster = inject(ToastrService);
  private _paginationService = inject(PaginationService);
  private _employeeService = inject(EmployeeService);
  private _customerService = inject(CustomerService);

  constructor() {}

  ngOnInit(): void {
    this._route.params.subscribe((params) => {
      this.technicalId = params['id'];
    });
    this.setupTableColumns();
    this.loadIssues();
    this.getAllCustomers();
  }

  getAllCustomers() {
    this._employeeService.employeeData$.subscribe((data) => {
      if(data?._id) {
        this._customerService.getAllCustomers(data?._id).subscribe((customers) => {
          this.tableColumns[2].filterOptions = customers.map((customer: any) => ({ label: customer.companyName, value: customer._id }));
        });
      }
    })
  }

  setupTableColumns(): void {
    this.tableColumns = [
      { key: 'subject', label: 'Subject', type: 'text', filterable: true, filterType: 'text', filterPlaceholder: 'Search subject...' },
      { key: 'issueType', label: 'Type', type: 'text', filterable: true, filterType: 'select', filterOptions: [
        { label: 'Hardware', value: 'Hardware' },
        { label: 'Software', value: 'Software' },
        { label: 'Network', value: 'Network' },
        { label: 'Other', value: 'Other' }
      ] },
      { key: 'customer.companyName', label: 'Customer', type: 'text', filterable: true, filterType: 'select', filterOptions: [], filterPlaceholder: 'Search customer...' },
      { key: 'status', label: 'Status', type: 'status', filterable: true, filterType: 'select', filterOptions: [
        { label: 'Pending', value: 'Pending' },
        { label: 'Resolved', value: 'Resolved' },
        { label: 'Closed', value: 'Closed' }
      ] },
      { key: 'actions', label: 'Action', type: 'action', actions: [
        { icon: 'heroPencilSquare', tooltip: 'Edit Issue', action: 'editIssue' },
        { icon: 'heroTrash', tooltip: 'Delete Issue', action: 'deleteIssue' }
      ] }
    ];
  }

  loadIssues(filters?: any): void {
    this.isLoading = true;

    const currentState = this._paginationService.paginationState();

    const filterParams: any = {
      page: currentState.page,
      row: currentState.row,
      ...filters
    };

    this._technicalService.getIssues(this.technicalId, filterParams).subscribe({
      next: (res) => {
        this.tableData = res.data || [];
        this.totalItems = this.tableData.length;
        this.isEmpty = this.tableData.length === 0;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.isEmpty = true;
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

    // Convert filters to backend format
    const filterParams: Partial<any> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          acc[filter.column] = filter.value;
          break;
        case 'select':
          acc[filter.column] = filter.value;
          break;
        case 'date':
          if (filter.column === 'createdDate') {
            acc['fromDate'] = filter.value[0];
            acc['toDate'] = filter.value[1];
          }
          break;
        case 'number':
          acc[filter.column] = filter.value;
          break;
      }
      return acc;
    }, {} as Partial<any>);
    this.loadIssues(filterParams);
  }
  
  onActionClick(event: { action: string; item: any }): void {
    if (event.action === 'editIssue') {
      this.onEditIssue(event.item);
    } else if (event.action === 'deleteIssue') {
      this.onDeleteIssue(event.item);
    }
  }

  onEditIssue(issue: any): void {
    const dialogRef = this._dialog.open(IssueFormComponent, {
      width: '800px',
      height: '90vh',
      data: { technicalId: this.technicalId, issue }
    });
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._toaster.success('Issue updated successfully');
        this.loadIssues();
      }
    });
  }

  onDeleteIssue(issue: any): void {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Issue',
        description: 'Are you sure you want to delete this issue?',
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._technicalService.deleteIssue(this.technicalId, issue._id).subscribe((res) => {
          this._toaster.success('Issue deleted successfully');
          this.loadIssues();
        });
      }
    });
  }

  onAddIssue(): void {
    const dialogRef = this._dialog.open(IssueFormComponent, {
      width: '800px',
      data: { technicalId: this.technicalId }
    });
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._toaster.success('Issue created successfully');
        this.loadIssues();
      }
    });
  }
} 