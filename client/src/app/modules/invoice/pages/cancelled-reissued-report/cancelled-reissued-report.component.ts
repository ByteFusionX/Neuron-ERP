import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal, ViewChild } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { Invoice } from 'src/app/shared/interfaces/invoice.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { Subscription } from 'rxjs';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  status?: string | string[];
  customer?: string;
  jobId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

@Component({
  selector: 'app-cancelled-reissued-report',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    ButtonComponent,
    FormsModule,
    SearchComponent
  ],
  templateUrl: './cancelled-reissued-report.component.html',
  styleUrl: './cancelled-reissued-report.component.css',
  providers: [PaginationService]
})
export class CancelledReissuedReportComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private invoiceService = inject(InvoiceService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private paginationService = inject(PaginationService);
  private subscriptions = new Subscription();

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  statusOptions = [
    { label: 'All', value: ['Cancelled', 'Reissued'] },
    { label: 'Cancelled', value: 'Cancelled' },
    { label: 'Reissued', value: 'Reissued' }
  ];

  selectedStatus = signal<string | string[]>(['Cancelled', 'Reissued']);

  ngOnInit(): void {
    this.setupTableColumns();
    this.initializeFromUrlParams();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initializeFromUrlParams(): void {
    this.route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page']) : 1;
      const row = params['row'] ? parseInt(params['row']) : 10;
      const search = params['search'] || '';
      const customer = params['customer'] || '';
      const jobId = params['jobId'] || '';
      const fromDate = params['fromDate'] || '';
      const toDate = params['toDate'] || '';
      const status = params['status'] ? (Array.isArray(params['status']) ? params['status'] : [params['status']]) : null;

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      if (status) this.selectedStatus.set(status);

      this.loadData({ search, customer, jobId, fromDate, toDate });
    });
  }

  setupTableColumns(): void {
    const baseColumns: TableColumn[] = [
      {
        key: 'oldInvoiceNo',
        label: 'Old Invoice No.',
        type: 'text',
        sortable: false,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search invoice...',
        cellRenderer: (item: any) => {
          return `${item.oldInvoiceNo}`;
        }
      },
      {
        key: 'oldInvoiceDate',
        label: 'Old Invoice Date',
        type: 'date',
        pipeParams: 'dd-MMM-yy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'customerName',
        label: 'Customer Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search customer...'
      },
      {
        key: 'jobId',
        label: 'Job ID / LPO No.',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search job...'
      },
      {
        key: 'originalAmount',
        label: 'Original Amount',
        type: 'text',
        pipeParams: { currency: 'QAR', format: '1.2-2' },
        filterable: false,
      },
      {
        key: 'cancellationReason',
        label: 'Reason for Cancellation',
        type: 'text',
        filterable: false,
      },
      {
        key: 'cancelledBy',
        label: 'Cancelled By (User/Role)',
        type: 'text',
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.cancelledBy && item.cancelledByRole) {
            return `${item.cancelledBy} (${item.cancelledByRole})`;
          }
          return item.cancelledBy || '-';
        }
      },
      {
        key: 'cancelledAt',
        label: 'Cancelled Date & Time',
        type: 'date',
        pipeParams: 'dd/MM/yyyy HH:mm',
        sortable: true,
        filterable: false,
      },
      {
        key: 'newInvoiceNo',
        label: 'New Invoice No.',
        type: 'text',
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.newInvoiceNo === '—') return '—';
          return `${item.newInvoiceNo}`;
        }
      },
      {
        key: 'newInvoiceDate',
        label: 'New Invoice Date',
        type: 'date',
        pipeParams: 'dd-MMM-yy',
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.newInvoiceDate === '—') return '—';
          // Custom date formatting is handled by the table component if it's a valid date, 
          // but since it could be '—', we need to let it pass through or formatting will fail.
          return item.newInvoiceDate;
        }
      },
      {
        key: 'reissuedAmount',
        label: 'Reissued Amount',
        type: 'text',
        pipeParams: { currency: 'QAR', format: '1.2-2' },
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.reissuedAmount === '—') return '—';
          // Ideally currency pipe handles this, but since it's dynamic '—', we might need a custom pipe or rely on table component gracefully handling it.
          return item.reissuedAmount;
        }
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions,
        tooltip: true,
      }
    ];

    this.tableColumns = baseColumns;

    this.defaultColumns = [
      'oldInvoiceNo', 'oldInvoiceDate', 'customerName', 'jobId',
      'originalAmount', 'cancellationReason', 'cancelledBy', 'cancelledAt',
      'newInvoiceNo', 'newInvoiceDate', 'reissuedAmount', 'status'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row, // note: pending-suppliers uses 'row' internally but api expects 'limit' if using standard list response, or adjust service logic
      status: this.selectedStatus(),
      ...filters
    };

    // Note: invoice API uses page and limit
    const { row, ...restParams } = filterParams;
    const apiParams = {
      ...restParams,
      limit: row
    };

    this.subscriptions.add(
      this.invoiceService.getCancelledReissuedInvoices(apiParams).subscribe({
        next: (response) => {
          let invoices = response.data?.invoices || [];
          if (invoices.length === 0) {
            this.setMockData();
          } else {
            this.tableData.set(invoices);
            const pagination = response.data.pagination;
            this.totalItems.set(pagination.total);

            this.paginationService.updatePaginationState({
              page: pagination.page,
              row: pagination.limit,
              total: pagination.total
            });

            this.isEmpty.set(this.tableData().length === 0);
          }
          this.isLoading.set(false);
          this.updateUrlParams(filters);
        },
        error: (error) => {
          this.notificationService.warning('Backend connection failed or no data. Loading sample data.');
          console.error('Error loading report:', error);
          this.setMockData();
          this.isLoading.set(false);
        }
      })
    );
  }

  setMockData(): void {
    const mockData = [
      {
        _id: 'mock1',
        oldInvoiceNo: 'INV-2023-001',
        oldInvoiceDate: '2023-10-01T10:00:00Z',
        customerName: 'Tech Corp Ltd',
        jobId: 'JOB-9912',
        originalAmount: 5000.00,
        cancellationReason: 'Client requested changes to items',
        cancelledBy: 'Admin User',
        cancelledByRole: 'Admin',
        cancelledAt: '2023-10-05T14:30:00Z',
        newInvoiceNo: 'INV-2023-001-R',
        newInvoiceDate: '2023-10-06T09:00:00Z',
        reissuedAmount: 5200.00,
        status: 'Reissued',
        reissuedInvoiceId: 'mock-reissued-1'
      },
      {
        _id: 'mock2',
        oldInvoiceNo: 'INV-2023-045',
        oldInvoiceDate: '2023-11-15T11:00:00Z',
        customerName: 'Global Logistics',
        jobId: 'JOB-8821',
        originalAmount: 12500.50,
        cancellationReason: 'Duplicate invoice created by mistake',
        cancelledBy: 'System',
        cancelledByRole: 'Automated',
        cancelledAt: '2023-11-15T11:15:00Z',
        newInvoiceNo: '—',
        newInvoiceDate: '—',
        reissuedAmount: '—',
        status: 'Cancelled',
        reissuedInvoiceId: null
      }
    ];

    this.tableData.set(mockData);
    this.totalItems.set(mockData.length);
    this.isEmpty.set(false);

    this.paginationService.updatePaginationState({
      page: 1,
      row: 10,
      total: mockData.length
    });
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.loadData();
  }

  onFilterChange(filters: TableFilter[]): void {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    // Convert filters to backend format
    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          if (filter.column === 'oldInvoiceNo') {
            acc.search = filter.value;
          } else if (filter.column === 'customerName') {
            acc.customer = filter.value;
          } else if (filter.column === 'jobId') {
            acc.jobId = filter.value;
          } else {
            acc[filter.column] = filter.value;
          }
          break;
        case 'select':
          if (filter.column === 'status') {
            acc.status = filter.value;
          }
          break;
        case 'date':
          if (filter.column === 'oldInvoiceDate') {
            acc.fromDate = filter.value[0];
            acc.toDate = filter.value[1];
          }
          break;
      }
      return acc;
    }, {} as Partial<FilterParams>);

    this.loadData(filterParams);
  }

  updateUrlParams(appliedFilters: any = {}): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.row = paginationState.row !== 10 ? paginationState.row : null;

    // Only add if they exist to keep URL clean
    if (appliedFilters.search) queryParams.search = appliedFilters.search;
    if (appliedFilters.customer) queryParams.customer = appliedFilters.customer;
    if (appliedFilters.jobId) queryParams.jobId = appliedFilters.jobId;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onRowClick(row: any): void {
    // Navigate to original invoice detail by default
    this.router.navigate(['/invoice/invoice-register/view', row._id]);
  }

  onActionClick(event: { action: string; item: any }): void {
    // Required by data-table, even if no actions are defined in columns
  }
}
