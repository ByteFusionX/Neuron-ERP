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

interface InvoiceLinkedDelivery {
  _id: string;
  invoiceNo?: string;
  invoiceDate?: string;
  customerName: string;
  jobId: string;
  lpoNo?: string;
  dnNo: string;
  dnDate: string;
  deliveredQty: number;
  invoicedQty: number;
  status: 'Fully Invoiced' | 'Partially Invoiced' | 'Pending Invoice';
}

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  status?: string[];
  customerName?: string;
  jobId?: string;
  dnNo?: string;
  invoiceNo?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

@Component({
  selector: 'app-invoice-linking',
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
  templateUrl: './invoice-linking.component.html',
  styleUrl: './invoice-linking.component.css',
  providers: [PaginationService]
})
export class InvoiceLinkingComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private paginationService = inject(PaginationService);
  private subscriptions = new Subscription();

  tableData = signal<InvoiceLinkedDelivery[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  statusOptions = [
    { label: 'All', value: 'All' },
    { label: 'Fully Invoiced', value: 'Fully Invoiced' },
    { label: 'Partially Invoiced', value: 'Partially Invoiced' },
    { label: 'Pending Invoice', value: 'Pending Invoice' }
  ];

  selectedStatus = signal<string>('All');
  globalSearch = signal<string>('');

  ngOnInit(): void {
    this.setupTableColumns();
    this.initializeFromUrlParams();
    this.loadSampleData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initializeFromUrlParams(): void {
    this.route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page']) : 1;
      const row = params['row'] ? parseInt(params['row']) : 10;
      const status = params['status'] || 'All';
      const search = params['search'] || '';

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      this.selectedStatus.set(status);
      this.globalSearch.set(search);
    });
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'invoiceNo',
        label: 'Invoice No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Invoice...',
        cellRenderer: (item: InvoiceLinkedDelivery) => item.invoiceNo || '--'
      },
      {
        key: 'invoiceDate',
        label: 'Invoice Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date',
        cellRenderer: (item: InvoiceLinkedDelivery) => item.invoiceDate || '--'
      },
      {
        key: 'customerName',
        label: 'Customer Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Customer...'
      },
      {
        key: 'jobId',
        label: 'Job ID / LPO No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job/LPO...',
        cellRenderer: (item: InvoiceLinkedDelivery) => `${item.jobId}${item.lpoNo ? ' / ' + item.lpoNo : ''}`
      },
      {
        key: 'dnNo',
        label: 'DN No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search DN...'
      },
      {
        key: 'dnDate',
        label: 'DN Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: false // Fallback logic will be handled in filtering
      },
      {
        key: 'deliveredQty',
        label: 'Delivered Qty',
        type: 'number',
        sortable: true,
        filterable: false
      },
      {
        key: 'invoicedQty',
        label: 'Invoiced Qty',
        type: 'number',
        sortable: true,
        filterable: false
      },
      {
        key: 'balanceQty',
        label: 'Balance Qty',
        type: 'number',
        sortable: false,
        filterable: false,
        cellRenderer: (item: InvoiceLinkedDelivery) => (item.deliveredQty - item.invoicedQty).toFixed(2)
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions.filter(opt => opt.value !== 'All'),
        tooltip: true
      },
      {
        key: 'actions',
        label: 'Action',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View DN',
            action: 'viewDn',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
          {
            icon: 'heroDocumentText',
            tooltip: 'View Invoice',
            action: 'viewInvoice',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium',
            condition: (item) => !!item.invoiceNo
          }
        ]
      }
    ];

    this.defaultColumns = [
      'invoiceNo', 'invoiceDate', 'customerName', 'jobId', 'dnNo', 'dnDate',
      'deliveredQty', 'invoicedQty', 'balanceQty', 'status', 'actions'
    ];
  }

  loadSampleData(): void {
    this.isLoading.set(true);
    // Simulating API delay
    setTimeout(() => {
      const sampleData: InvoiceLinkedDelivery[] = [
        {
          _id: '1',
          invoiceNo: 'INV-2024-001',
          invoiceDate: '2024-03-20',
          customerName: 'Global Tech Solutions',
          jobId: 'JOB-9872',
          lpoNo: 'LPO-5512',
          dnNo: 'DN-8821',
          dnDate: '2024-03-15',
          deliveredQty: 100,
          invoicedQty: 80,
          status: 'Partially Invoiced'
        },
        {
          _id: '2',
          invoiceNo: 'INV-2024-002',
          invoiceDate: '2024-03-22',
          customerName: 'Vertex Industries',
          jobId: 'JOB-9875',
          lpoNo: 'LPO-5515',
          dnNo: 'DN-8825',
          dnDate: '2024-03-18',
          deliveredQty: 50,
          invoicedQty: 50,
          status: 'Fully Invoiced'
        },
        {
          _id: '3',
          customerName: 'Vertex Industries',
          jobId: 'JOB-9875',
          lpoNo: 'LPO-5515',
          dnNo: 'DN-8826',
          dnDate: '2024-03-19',
          deliveredQty: 30,
          invoicedQty: 0,
          status: 'Pending Invoice'
        }
      ];

      this.tableData.set(sampleData);
      this.totalItems.set(sampleData.length);
      this.paginationService.updatePaginationState({
        page: 1,
        row: 10,
        total: sampleData.length
      });
      this.isEmpty.set(sampleData.length === 0);
      this.isLoading.set(false);
    }, 500);
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    // For now, we just reload sample data or filter locally
    this.updateUrlParams();
  }

  onFilterChange(filters: TableFilter[]): void {
    console.log('Filters changed:', filters);
    // In a real app, this would call the API. For now, we just log and update URL.
    this.updateUrlParams();
  }

  onGlobalSearch(searchTerm: string): void {
    this.globalSearch.set(searchTerm || '');
    this.updateUrlParams();
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {
      page: paginationState.page !== 1 ? paginationState.page : null,
      row: paginationState.row !== 10 ? paginationState.row : null,
      status: this.selectedStatus() !== 'All' ? this.selectedStatus() : null,
      search: this.globalSearch() || null
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onActionClick(event: { action: string; item: InvoiceLinkedDelivery }): void {
    const { action, item } = event;
    switch (action) {
      case 'viewDn':
        this.router.navigate(['/dispatch/delivery-note-register/view', item._id]);
        break;
      case 'viewInvoice':
        this.notificationService.info(`Viewing Invoice: ${item.invoiceNo}`);
        // Navigation would happen here if invoice view existed
        break;
    }
  }

  onRowClick(row: InvoiceLinkedDelivery): void {
    this.router.navigate(['/dispatch/delivery-note-register/view', row._id]);
  }

  onExportRequest(): void {
    if (this.tableComponent && this.tableData().length > 0) {
      this.tableComponent.exportAllData(this.tableData());
    } else {
      this.notificationService.warning('No data to export');
    }
  }
}
