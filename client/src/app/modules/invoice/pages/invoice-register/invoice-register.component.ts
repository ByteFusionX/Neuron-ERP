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
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
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
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();

  // State
  viewMode = signal<'register' | 'customer-report' | 'salesperson-report'>('register');
  isLoading = signal<boolean>(false);
  tableData = signal<Invoice[]>([]);
  groupedData = signal<{ customerName: string, invoices: Invoice[] }[]>([]);
  salespersonReportData = signal<Invoice[]>([]);
  canCreateInvoice = signal<boolean>(false);

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
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe(emp => {
        if (emp?.category?.privileges?.invoice?.createInvoice) {
          this.canCreateInvoice.set(true);
        }
      })
    );
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
        key: 'customer.companyName',
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
        key: 'salesperson',
        label: 'Salesperson Name',
        type: 'text',
        filterable: true,
        filterType: 'text',
        cellRenderer: (item: Invoice) => {
          const sp = item.salesperson as any;
          if (!sp) return '-';
          return [sp.firstName, sp.lastName].filter(Boolean).join(' ') || '-';
        }
      },
      {
        key: 'amount',
        label: 'Invoice Amount',
        type: 'text',
        cellRenderer: (item: any) => {
          const currency = item?.currency || 'QAR';
          const amount = item?.amount ?? 0;
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
        sortable: true,
        filterable: false
      },
      {
        key: 'status',
        label: 'Status',
        type: 'statusDropdown',
        statusOptions: [
          'Pending to submit',
          'PI Submitted',
          'Partial invoicing',
          'Submitted',
          'Hold',
          'Rejected by customer'
        ],
        filterable: true,
        filterType: 'select',
        filterOptions: [
          { label: 'Pending to submit', value: 'Pending to submit' },
          { label: 'PI Submitted', value: 'PI Submitted' },
          { label: 'Partial invoicing', value: 'Partial invoicing' },
          { label: 'Submitted', value: 'Submitted' },
          { label: 'Hold', value: 'Hold' },
          { label: 'Rejected by customer', value: 'Rejected by customer' }
        ]
      },
      {
        key: 'paymentStatus',
        label: 'Payment Status',
        type: 'statusDropdown',
        statusOptions: [
          'Paid',
          'Partially paid',
          'Advance received',
          'Pending'
        ],
        filterable: true,
        filterType: 'select',
        filterOptions: [
          { label: 'Paid', value: 'Paid' },
          { label: 'Partially paid', value: 'Partially paid' },
          { label: 'Advance received', value: 'Advance received' },
          { label: 'Pending', value: 'Pending' }
        ]
      },

    ];

    this.defaultColumns = ['invoiceNo', 'date', 'customer.companyName', 'jobId.jobId', 'amount', 'salesperson', 'status', 'paymentStatus'];
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
      const customerName = curr.customer?.companyName || 'Unknown';
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
    this.router.navigate(['/invoice/invoice-register/view', row._id]);
  }

  onStatusChange(event: { item: Invoice; column: string; oldValue: string; newValue: string }) {
    const invoice = event.item;
    const update: any = {};
    if (event.column === 'status') {
      if (invoice.status === 'Cancelled' || invoice.status === 'Reissued') {
        this.notificationService.warning('Status cannot be changed for cancelled or reissued invoices');
        return;
      }
      update.status = event.newValue;
    } else if (event.column === 'paymentStatus') {
      update.paymentStatus = event.newValue;
    }

    if (!Object.keys(update).length) {
      return;
    }

    this.invoiceService.updateInvoice(invoice._id, update).subscribe({
      next: () => {
        this.notificationService.success('Invoice updated successfully');
        this.loadData();
      },
      error: () => {
        this.notificationService.error('Failed to update invoice');
      }
    });
  }

  getTotalInvoiceValue(): number {
    return this.salespersonReportData().reduce((sum, inv) => sum + (inv.amount || 0), 0);
  }

  exportToExcel() {
    const data = this.salespersonReportData().map((inv, index) => ({
      'Sl No': index + 1,
      'Job ID': inv.jobId?.jobId,
      'Customer Name': inv.customer?.companyName,
      'Invoice No': inv.invoiceNo,
      'DN No': (inv.items?.[0]?.dnRefs && inv.items[0].dnRefs[0]?.dnId) || inv.items?.[0]?.dnId || '-', // Simplification
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
