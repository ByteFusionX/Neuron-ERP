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
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { Subscription } from 'rxjs';
import { InvoiceService } from 'src/app/core/services/invoice.service';

interface FilterParams {
  [key: string]: any;
  page: number;
  limit: number;
  status?: string[];
  fromDate?: string;
  toDate?: string;
  search?: string;
  customer?: string;
  jobId?: string;
  invoiceNo?: string;
}

@Component({
  selector: 'app-cancelled-invoices',
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
  templateUrl: './cancelled-invoices.component.html',
  styleUrl: './cancelled-invoices.component.css',
  providers: [PaginationService]
})
export class CancelledInvoicesComponent implements OnInit, OnDestroy {
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
    { label: 'All', value: 'all' },
    { label: 'Cancelled', value: 'Cancelled' },
    { label: 'Adjusted', value: 'Adjusted' }
  ];

  selectedStatus = signal<string[]>(['Cancelled', 'Adjusted']);
  searchTerm = signal<string>('');

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
      const limit = params['limit'] ? parseInt(params['limit']) : 10;
      const search = params['search'] || '';
      let status = params['status'] ? (Array.isArray(params['status']) ? params['status'] : [params['status']]) : ['Cancelled', 'Adjusted'];
      if (status.includes('all')) status = ['Cancelled', 'Adjusted'];

      this.paginationService.updatePaginationState({
        page,
        row: limit,
        total: this.totalItems()
      });

      if (search) this.searchTerm.set(search);
      this.selectedStatus.set(status);

      this.loadData();
    });
  }

  setupTableColumns(): void {
    // Columns specified: Invoice No, Invoice Date, Customer Name, Job ID / LPO, Original Amount, Adjusted Amount, 
    // Reason for Cancellation / Adjustment, Cancelled / Adjusted By, Date & Time, and Status.

    this.tableColumns = [
      {
        key: 'invoiceNo',
        label: 'Invoice No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search invoice...'
      },
      {
        key: 'invoiceDate',
        label: 'Invoice Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
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
        label: 'Job ID / LPO',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search job ID...'
      },
      {
        key: 'originalAmount',
        label: 'Original Amount',
        type: 'text',
        pipeParams: { currency: 'AED', format: '1.2-2' },
        filterable: false,
      },
      {
        key: 'adjustedAmount',
        label: 'Adjusted Amount',
        type: 'text',
        pipeParams: { currency: 'AED', format: '1.2-2' },
        filterable: false,
      },
      {
        key: 'reason',
        label: 'Reason for Cancellation / Adjustment',
        type: 'text',
        filterable: false,
      },
      {
        key: 'actionBy',
        label: 'Cancelled / Adjusted By',
        type: 'text',
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.actionBy && item.actionById) {
            return `${item.actionBy} (${item.actionById})`;
          } else if (item.actionBy) {
            return item.actionBy;
          }
          return '-';
        }
      },
      {
        key: 'actionDate',
        label: 'Date & Time',
        type: 'date',
        pipeParams: 'dd/MM/yyyy HH:mm:ss',
        sortable: true,
        filterable: false,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions
      }
    ];

    this.defaultColumns = [
      'invoiceNo', 'invoiceDate', 'customerName', 'jobId',
      'originalAmount', 'adjustedAmount', 'reason', 'actionBy', 'actionDate', 'status'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    let statusFilter = this.selectedStatus();
    if (statusFilter.includes('all')) {
      statusFilter = ['Cancelled', 'Adjusted'];
    }

    const filterParams: FilterParams = {
      page: paginationState.page,
      limit: paginationState.row,
      status: statusFilter,
      search: this.searchTerm() || undefined,
      ...filters
    };

    this.subscriptions.add(
      this.invoiceService.getCancelledAdjustedInvoices(filterParams).subscribe({
        next: (response: any) => {
          if (response.success && response.data) {
            this.tableData.set(response.data.report || []);
            const pagination = response.data.pagination;
            this.totalItems.set(pagination?.total || 0);

            this.paginationService.updatePaginationState({
              page: pagination?.page || 1,
              row: pagination?.limit || 10,
              total: pagination?.total || 0
            });

            this.isEmpty.set(this.tableData().length === 0);
          } else {
            this.tableData.set([]);
            this.isEmpty.set(true);
          }
          this.isLoading.set(false);
          this.updateUrlParams();
        },
        error: (error) => {
          this.notificationService.error('Failed to load cancelled invoices');
          console.error('Error loading data:', error);
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

    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          if (filter.column === 'invoiceNo') {
            acc.invoiceNo = filter.value;
          } else if (filter.column === 'customerName') {
            acc.customer = filter.value;
          } else if (filter.column === 'jobId') {
            acc.jobId = filter.value;
          }
          break;
        case 'select':
          if (filter.column === 'status') {
            acc.status = Array.isArray(filter.value) ? filter.value : [filter.value];
            if (acc.status.includes('all')) acc.status = ['Cancelled', 'Adjusted'];
          }
          break;
        case 'date':
          if (filter.column === 'invoiceDate') {
            acc.fromDate = filter.value[0];
            acc.toDate = filter.value[1];
          }
          break;
      }
      return acc;
    }, {} as Partial<FilterParams>);

    this.loadData(filterParams);
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.limit = paginationState.row !== 10 ? paginationState.row : null;
    queryParams.search = this.searchTerm() || null;

    const statuses = this.selectedStatus();
    if (statuses.length !== 2 || (!statuses.includes('Cancelled') || !statuses.includes('Adjusted'))) {
      queryParams.status = statuses;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onRowClick(row: any): void {
    // Implement navigation behavior exactly like other reports. Let's assume opening invoice detailing.
    this.router.navigate(['/invoice/view', row._id]);
  }

  onSearchTerm(searchTerm: string): void {
    this.searchTerm.set(searchTerm || '');
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.loadData();
    this.updateUrlParams();
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.notificationService.warning('No data to export');
      return;
    }

    const filterParams: FilterParams = {
      page: 1,
      limit: total,
      status: this.selectedStatus(),
      search: this.searchTerm() || undefined
    };

    this.invoiceService.getCancelledAdjustedInvoices(filterParams).subscribe({
      next: (response: any) => {
        if (response.success && this.tableComponent && response.data.report.length > 0) {
          this.tableComponent.exportAllData(response.data.report);
        }
      },
      error: (error) => {
        this.notificationService.error('Failed to export data');
        console.error('Error exporting data:', error);
      }
    });
  }
}
