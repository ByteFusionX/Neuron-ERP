import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal, ViewChild } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TableComponent } from 'src/app/shared/components/table/table.component';
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
    FormsModule
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
        cellRenderer: (item: any) => {
          const currency = item?.currency || 'QAR';
          const amount = item?.originalAmount ?? 0;
          try {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(amount);
          } catch {
            return `${currency} ${amount}`;
          }
        },
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
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.reissuedAmount === '—') return '—';
          const currency = item?.currency || 'QAR';
          const amount = item?.reissuedAmount ?? 0;
          try {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(amount);
          } catch {
            return `${currency} ${amount}`;
          }
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

    const selected = this.selectedStatus();
    const normalizedStatus = Array.isArray(selected) ? selected : [selected];
    const apiParams: any = {
      page: paginationState.page,
      limit: paginationState.row,
      status: normalizedStatus,
      ...filters
    };

    this.subscriptions.add(
      this.invoiceService.getCancelledReissuedInvoices(apiParams).subscribe({
        next: (response) => {
          const invoices = response.data?.invoices || [];
          this.tableData.set(invoices);
          const pagination = response.data.pagination;
          this.totalItems.set(pagination?.total || 0);

          this.paginationService.updatePaginationState({
            page: pagination?.page || 1,
            row: pagination?.limit || paginationState.row,
            total: pagination?.total || 0
          });

          this.isEmpty.set(this.tableData().length === 0);
          this.isLoading.set(false);
          this.updateUrlParams(filters);
        },
        error: (error) => {
          console.error('Error loading report:', error);
          this.tableData.set([]);
          this.totalItems.set(0);
          this.isEmpty.set(true);
          this.isLoading.set(false);
        }
      })
    );
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
