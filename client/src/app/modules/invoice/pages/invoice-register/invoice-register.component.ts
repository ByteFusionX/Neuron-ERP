import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { Invoice, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-invoice-register',
  standalone: true,
  imports: [
    CommonModule,
    TableComponent,
    ButtonComponent,
    IconsModule,
    MatMenuModule,
    RouterModule,
    FormsModule,
    NgSelectModule,
    SearchComponent
  ],
  templateUrl: './invoice-register.component.html',
  styleUrl: './invoice-register.component.css',
  providers: [PaginationService]
})
export class InvoiceRegisterComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private invoiceService = inject(InvoiceService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public paginationService = inject(PaginationService);
  private notificationService = inject(ToastrService);
  private subscriptions = new Subscription();

  // State
  viewMode = signal<'register' | 'customer-report' | 'salesperson-report'>('register');
  isLoading = signal<boolean>(false);
  tableData = signal<Invoice[]>([]);
  groupedData = signal<{ customerName: string, invoices: Invoice[] }[]>([]);
  salespersonReportData = signal<Invoice[]>([]);

  // Register Columns
  registerColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  // Report Filters
  reportFromDate = signal<string>('');
  reportToDate = signal<string>('');
  selectedSalesperson = signal<string>('');

  // Salespeople Options (Mocked for now or fetched if API exists)
  salespeople = signal<{ id: string, name: string }[]>([]);

  constructor() {
    this.setupRegisterColumns();
  }

  ngOnInit(): void {
    // Check query params to restore state if needed
    this.loadData();
    // this.loadSalespeople(); // To be implemented if API available
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  setupRegisterColumns(): void {
    this.registerColumns = [
      {
        key: 'invoiceNo',
        label: 'Invoice No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'date',
        label: 'Invoice Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'customer.clientName',
        label: 'Customer Name',
        type: 'text',
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'amount',
        label: 'Invoice Amount',
        type: 'currency',
        pipeParams: { currency: 'QAR', format: '1.2-2' },
        sortable: true,
        filterable: false
      },
      {
        key: 'salesperson.firstName', // Assuming structure
        label: 'Salesperson Name',
        type: 'text',
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        statusOptions: ['Paid', 'Unpaid', 'Partially Paid'],
        filterable: true,
        filterType: 'select',
        filterOptions: [
          { label: 'Paid', value: 'Paid' },
          { label: 'Unpaid', value: 'Unpaid' },
          { label: 'Partially Paid', value: 'Partially Paid' }
        ]
      }
    ];

    this.defaultColumns = ['invoiceNo', 'date', 'customer.clientName', 'jobId.jobId', 'amount', 'salesperson.firstName', 'status'];
  }

  loadData(filters?: Partial<InvoiceFilterParams>): void {
    if (this.viewMode() !== 'register' && this.viewMode() !== 'customer-report') return;

    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const params: InvoiceFilterParams = {
      page: paginationState.page,
      limit: paginationState.row,
      ...filters
    };

    // If report mode, we might want to fetch all or handle pagination differently
    // For Customer-wise report, we likely want all data to group it locally or handle grouping on backend
    // For now, let's assume we fetch standard list and group locally for the current page, 
    // or if the user wants a full report, we might need a different API. 
    // Given the constraints, I will use the list API.

    this.invoiceService.getInvoices(params).subscribe({
      next: (res) => {
        this.tableData.set(res.data.invoices);
        this.paginationService.updatePaginationState({
          page: res.data.pagination.page,
          row: res.data.pagination.limit,
          total: res.data.pagination.total
        });

        if (this.viewMode() === 'customer-report') {
          this.groupDataByCustomer(res.data.invoices);
        }

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
        this.notificationService.error('Failed to load invoices');
      }
    });
  }

  loadSalespersonReport(): void {
    if (!this.selectedSalesperson() || !this.reportFromDate() || !this.reportToDate()) {
      // Ideally validation message
      return;
    }

    this.isLoading.set(true);
    const params: InvoiceFilterParams = {
      salesperson: this.selectedSalesperson(),
      fromDate: this.reportFromDate(),
      toDate: this.reportToDate(),
      limit: 1000 // Fetch all for report
    };

    this.invoiceService.getInvoices(params).subscribe({
      next: (res) => {
        this.salespersonReportData.set(res.data.invoices);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load report data');
      }
    });
  }

  groupDataByCustomer(data: Invoice[]) {
    const grouped = data.reduce((acc, curr) => {
      const customerName = curr.customer?.clientName || 'Unknown';
      if (!acc[customerName]) {
        acc[customerName] = [];
      }
      acc[customerName].push(curr);
      return acc;
    }, {} as { [key: string]: Invoice[] });

    this.groupedData.set(Object.keys(grouped).map(key => ({
      customerName: key,
      invoices: grouped[key]
    })));
  }

  setViewMode(mode: 'register' | 'customer-report' | 'salesperson-report') {
    this.viewMode.set(mode);
    if (mode === 'register') {
      this.loadData();
    } else if (mode === 'customer-report') {
      this.loadData({ limit: 100 });
    } else {
      this.salespersonReportData.set([]);
    }
  }

  onFilterChange(filters: TableFilter[]) {
    // Map TableFilters to InvoiceFilterParams
    const params: any = {};
    filters.forEach(f => {
      if (f.type === 'date' && f.column === 'date') {
        params.fromDate = f.value[0];
        params.toDate = f.value[1];
      } else {
        params[f.column] = f.value;
      }
    });
    this.loadData(params);
  }

  onPaginationChange(event: { page: number, row: number }) {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.paginationService.paginationState().total
    });
    this.loadData();
  }

  onSearch(value: string): void {
    this.paginationService.updatePaginationState({
      page: 1,
      row: this.paginationService.paginationState().row,
      total: this.paginationService.paginationState().total
    });
    this.loadData({ search: value });
  }

  onRowClick(row: Invoice) {
    // Navigate to details
    // this.router.navigate(['/invoice/view', row._id]); 
    // Existing pattern usually navigates to some view
  }

  getTotalInvoiceValue(): number {
    return this.salespersonReportData().reduce((sum, inv) => sum + (inv.amount || 0), 0);
  }

  exportToExcel() {
    const data = this.salespersonReportData().map((inv, index) => ({
      'Sl No': index + 1,
      'Job ID': inv.jobId?.jobId,
      'Customer Name': inv.customer?.clientName,
      'Invoice No': inv.invoiceNo,
      'DN No': inv.items?.[0]?.dnId || '-', // Simplification
      'Invoice Value': inv.amount
    }));

    // Add Total Row
    data.push({
      'Sl No': '',
      'Job ID': '',
      'Customer Name': '',
      'Invoice No': '',
      'DN No': 'Total',
      'Invoice Value': this.getTotalInvoiceValue()
    } as any);

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salesperson Report');
    XLSX.writeFile(wb, 'Salesperson_Incentive_Report.xlsx');
  }
}
