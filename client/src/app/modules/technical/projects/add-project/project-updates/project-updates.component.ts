import { Component, Input, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { NgIconComponent } from '@ng-icons/core';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { MatDialog } from '@angular/material/dialog';
import { MailFormComponent } from '../../../../../shared/components/mail-form/mail-form.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Toast, ToastrService } from 'ngx-toastr';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';

@Component({
  selector: 'app-project-updates',
  imports: [TableComponent, ButtonComponent, NgIconComponent],
  templateUrl: './project-updates.component.html',
  styleUrl: './project-updates.component.css',
  providers: [PaginationService]
})
export class ProjectUpdatesComponent {

  technicalId: string = '';
  tableData: any[] = [];
  tableColumns: TableColumn[] = [];
  isLoading = false;
  isEmpty = false;
  totalItems = 0;
  currentFilters: any = {};

  private _technicalService = inject(TechnicalService);
  private _dialog = inject(MatDialog);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
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
      { key: 'subject', label: 'Project Description', type: 'text', filterable: true, filterType: 'text', filterPlaceholder: 'Search subject...' },
      { key: 'createdDate', label: 'Date', type: 'date', filterable: true, filterType: 'date', filterPlaceholder: 'Search date...' },
      { key: 'to', label: 'Sent To', type: 'text', filterable: true, filterType: 'text', filterPlaceholder: 'Search to...' },
      { key: 'from', label: 'Sent By', type: 'text', filterable: true, filterType: 'text', filterPlaceholder: 'Search from...' },
      { key: 'status', label: 'Status', type: 'status', filterable: true, filterType: 'select', filterOptions: [
          { label: 'Drafted', value: 'Drafted' },
          { label: 'Sent', value: 'Sent' },
      ] },
      { key: 'actions', label: 'Action', type: 'action', actions: [
        { icon: 'heroEye', tooltip: 'View Update', action: 'viewUpdate' },
        { icon: 'heroTrash', tooltip: 'Delete Update', action: 'deleteUpdate' }
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

    this._technicalService.getProjectUpdates(this.technicalId, filterParams).subscribe({
      next: (res) => {
        this.tableData = res.data || [];
        this.totalItems = res.total;
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
    console.log(filters)
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
    
    this.currentFilters = filterParams;
    this.loadIssues(filterParams);
  }
  
  onActionClick(event: { action: string; item: any }): void {
    if (event.action === 'viewUpdate') {
      this.onViewUpdate(event.item);
    } else if (event.action === 'deleteUpdate') {
      this.onDeleteUpdate(event.item);
    }
  }

  onViewUpdate(update: any): void {
    this._router.navigate([`/technical/project/updates/${this.technicalId}/${update._id}`]);
  } 

  onDeleteUpdate(update: any): void {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Update',
        description: 'Are you sure you want to delete this update?',
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this._technicalService.deleteProjectUpdate(this.technicalId, update._id).subscribe((res) => {
          this._toaster.success('Update deleted successfully');
          this.loadIssues();
        });
      }
    });
  }

  sendMail(mailData: any): void {
    this._technicalService.createProjectUpdate(this.technicalId, mailData).subscribe((res) => {
      this.loadIssues();
    });
  }

  onSendMail(): void {
    const dialogRef = this._dialog.open(MailFormComponent, {
      width: '800px',
      data: { technicalId: this.technicalId }
    });
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this.sendMail(result);
        this._toaster.success('Mail being senting...');
      }
    });
  }

  onPaginationChange(event: { page: number, row: number }): void {
    // Preserve current filters when pagination changes
    this.loadIssues(this.currentFilters);
  }
 }
