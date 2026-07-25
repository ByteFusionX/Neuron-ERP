import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { PaginationService } from 'src/app/core/services/pagination.service';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  status: string[];
  search?: string;
}

@Component({
  selector: 'app-lpo-approval',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    MatMenuModule,
    IconsModule,
    ButtonComponent,
    FormsModule
  ],
  templateUrl: './lpo-approval.component.html',
  styleUrl: './lpo-approval.component.css',
  providers: [PaginationService]
})
export class LpoApprovalComponent implements OnInit {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private purchaseOrderService = inject(PurchaseOrderService);
  private employeeService = inject(EmployeeService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private paginationService = inject(PaginationService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  isPendingView = signal<boolean>(true);

  selectedStatus = signal<Array<string>>(['Pending for Approval']);
  currency = signal<string>('QAR');
  canApprovePOs = signal<boolean>(false);

  ngOnInit(): void {
    this.checkPrivileges();
    this.checkCurrentRoute();
    this.setupTableColumns();
    this.loadData();
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canApprovePOs.set(data.category.privileges.purchaseOrder?.canApprovePOs || false);
      }
    });
  }

  checkCurrentRoute(): void {
    const currentPath = this.router.url;
    this.isPendingView.set(currentPath.includes('/pending-approval'));
    this.selectedStatus.set(this.isPendingView() ? ['Pending for Approval'] : ['Open']);
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'poDate',
        label: 'Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'poNo',
        label: 'PO No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search PO No...'
      },
      {
        key: 'supplierId.supplierName',
        label: 'Supplier Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search supplier...'
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job ID...'
      },
      {
        key: 'totalLpoValue',
        label: 'LPO Value',
        type: 'text',
        sortable: true,
        filterable: false,
        cellRenderer: (item: any) => {
          const value =
            typeof item.totalLpoValue === 'number'
              ? item.totalLpoValue
              : parseFloat(item.totalLpoValue) || 0;
          const currency =
            item.currency ||
            item.quoteId?.currency ||
            item.quoteId?.dealData?.currency ||
            item.purchaseId?.jobId?.quoteId?.currency ||
            item.purchaseId?.jobId?.quoteId?.dealData?.currency ||
            '';
          const formattedValue = value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          if (currency) {
            return `${formattedValue} ${currency}`;
          }
          return formattedValue;
        }
      },
      {
        key: 'createdBy.firstName',
        label: 'Prepared By',
        type: 'text',
        sortable: true,
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.createdBy) {
            const firstName = item.createdBy.firstName || '';
            const lastName = item.createdBy.lastName || '';
            return `${firstName} ${lastName}`.trim() || '-';
          }
          return '-';
        }
      },
      {
        key: 'purchaseId.customerId.companyName',
        label: 'Customer',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search customer...',
        cellRenderer: (item: any) => {
          if (item.purchaseId?.customerId?.companyName) {
            return item.purchaseId.customerId.companyName;
          }
          return '-';
        }
      },
      {
        key: 'poStatus',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: [
          { label: 'Pending for Approval', value: 'Pending for Approval' },
          { label: 'Approved', value: 'Approved' },
          { label: 'Draft', value: 'Draft' }
        ]
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View LPO',
            action: 'viewLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          }
        ]
      }
    ];

    this.defaultColumns = [
      'poDate', 'poNo', 'supplierId.supplierName', 'jobId.jobId', 
      'totalLpoValue', 'createdBy.firstName', 'purchaseId.customerId.companyName', 'poStatus', 'actions'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    
    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      status: this.selectedStatus(),
      ...filters
    };

    this.purchaseOrderService.getAllPurchaseOrders(filterParams).subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data);
          this.totalItems.set(response.pagination.total);
          this.isEmpty.set(this.tableData().length === 0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to load LPOs');
        console.error('Error loading LPOs:', error);
        this.isLoading.set(false);
      }
    });
  }

  onFilterChange(filters: TableFilter[]): void {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: 1, 
      row: currentState.row, 
      total: currentState.total 
    });

    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          acc[filter.column] = filter.value;
          break;
        case 'select':
          acc[filter.column] = filter.value;
          break;
        case 'date':
          if (filter.column === 'poDate') {
            acc['fromDate'] = filter.value[0];
            acc['toDate'] = filter.value[1];
          }
          break;
      }
      return acc;
    }, {} as Partial<FilterParams>);

    this.loadData(filterParams);
  }

  onActionClick(event: { action: string; item: any }): void {
    const { action, item } = event;
    
    switch (action) {
      case 'viewLpo':
        this.viewLpo(item);
        break;
    }
  }

  viewLpo(lpo: any) {
    this.router.navigate(['/purchase-order/view-lpo', lpo._id]);
  }

  onRowClick(row: any): void {
    this.viewLpo(row);
  }

  onSearch(searchInput: any) {
    const searchTerm = typeof searchInput === 'string' ? searchInput : searchInput?.target?.value || '';
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();

    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    const searchParams: FilterParams = {
      page: 1,
      row: currentState.row,
      status: this.selectedStatus(),
      search: searchTerm
    };

    this.purchaseOrderService.getAllPurchaseOrders(searchParams).subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data);
          this.totalItems.set(response.pagination.total);
          this.isEmpty.set(this.tableData().length === 0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to search LPOs');
        console.error('Error searching LPOs:', error);
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(page: any): void {
    const pageNumber = typeof page === 'number' ? page : parseInt(page);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: pageNumber,
      row: currentState.row,
      total: currentState.total
    });
    this.loadData();
  }

  onRowsPerPageChange(rows: any): void {
    const rowCount = typeof rows === 'number' ? rows : parseInt(rows);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: rowCount,
      total: currentState.total
    });
    this.loadData();
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.notificationService.warning('No data to export');
      return;
    }

    const filterParams: FilterParams = {
      page: 1,
      row: total,
      status: this.selectedStatus()
    };

    this.purchaseOrderService.getAllPurchaseOrders(filterParams).subscribe({
      next: (response) => {
        if (this.tableComponent && response.data.length > 0) {
          this.tableComponent.exportAllData(response.data);
        }
      },
      error: (error) => {
        this.notificationService.error('Failed to export LPOs');
        console.error('Error exporting LPOs:', error);
      }
    });
  }
}


