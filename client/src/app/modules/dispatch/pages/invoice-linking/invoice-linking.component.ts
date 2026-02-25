import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  customerName?: string;
  jobId?: string;
  dnNo?: string;
  invoiceNo?: string;
  status?: string[];
}

@Component({
  selector: 'app-invoice-linking',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TableComponent,
    IconsModule
  ],
  templateUrl: './invoice-linking.component.html',
  styleUrl: './invoice-linking.component.css',
  providers: [PaginationService]
})
export class InvoiceLinkingComponent implements OnInit {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private dnService = inject(DeliveryNoteService);
  private toaster = inject(ToastrService);
  private paginationService = inject(PaginationService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  statusOptions: string[] = ['Pending Invoice', 'Partially Invoiced', 'Fully Invoiced'];

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadData();
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'customerName',
        label: 'Customer Name',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Customer...'
      },
      {
        key: 'jobId',
        label: 'Job ID',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job...'
      },
      {
        key: 'dnNo',
        label: 'DN No',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search DN...'
      },
      {
        key: 'dnDate',
        label: 'DN Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        filterable: false
      },
      {
        key: 'invoiceNo',
        label: 'Invoice No',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Invoice...'
      },
      {
        key: 'invoiceDate',
        label: 'Invoice Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        filterable: false
      },
      {
        key: 'deliveredQty',
        label: 'Delivered Qty',
        type: 'number',
        filterable: false
      },
      {
        key: 'invoicedQty',
        label: 'Invoice Qty',
        type: 'number',
        filterable: false
      },
      {
        key: 'balanceQty',
        label: 'Balance Qty',
        type: 'number',
        filterable: false
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions.map(s => ({ label: s, value: s }))
      }
    ];

    this.defaultColumns = this.tableColumns.map(c => c.key);
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const payload: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      ...filters
    };

    this.dnService.getInvoiceLinking(payload).subscribe({
      next: (res) => {
        this.tableData.set(res.items || []);
        this.totalItems.set(res.total || 0);

        this.paginationService.updatePaginationState({
          page: paginationState.page,
          row: paginationState.row,
          total: res.total || 0
        });

        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toaster.error('Failed to load invoice linking data');
        console.error('Error loading invoice linking:', error);
        this.isLoading.set(false);
        this.isEmpty.set(true);
      }
    });
  }

  onPaginationChange(event: { page: number; row: number }): void {
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

    const filterParams: any = {};

    filters.forEach(filter => {
      if (filter.column === 'customerName') {
        filterParams.customerName = filter.value;
      } else if (filter.column === 'jobId') {
        filterParams.jobId = filter.value;
      } else if (filter.column === 'dnNo') {
        filterParams.dnNo = filter.value;
      } else if (filter.column === 'invoiceNo') {
        filterParams.invoiceNo = filter.value;
      } else if (filter.column === 'status') {
        filterParams.status = Array.isArray(filter.value) ? filter.value : [filter.value];
      } else {
        filterParams[filter.column] = filter.value;
      }
    });

    this.loadData(filterParams);
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.toaster.warning('No data to export');
      return;
    }

    const payload = {
      page: 1,
      row: total
    };

    this.dnService.getInvoiceLinking(payload).subscribe({
      next: (res) => {
        if (this.tableComponent && res.items && res.items.length > 0) {
          this.tableComponent.exportAllData(res.items);
        }
      },
      error: (error) => {
        this.toaster.error('Failed to export invoice linking data');
        console.error('Error exporting invoice linking:', error);
      }
    });
  }
}
