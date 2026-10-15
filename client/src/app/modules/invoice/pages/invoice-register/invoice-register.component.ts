import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute } from '@angular/router';
import { ReasonPromptModalComponent } from 'src/app/shared/components/reason-prompt-modal/reason-prompt-modal.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridCellEditEvent, DataGridColumn, DataGridFilter, DataGridQuery } from 'src/app/shared/components/data-grid/data-grid.model';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Invoice, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';
import { CreateInvoiceComponent } from '../create-invoice/create-invoice.component';

@Component({
  selector: 'app-invoice-register',
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent,
    CreateInvoiceComponent
  ],
  templateUrl: './invoice-register.component.html',
  styleUrl: './invoice-register.component.css',
  providers: [PaginationService]
})
export class InvoiceRegisterComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<Invoice>;

  private invoiceService = inject(InvoiceService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public paginationService = inject(PaginationService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private dialog = inject(MatDialog);
  private subscriptions = new Subscription();

  // State
  viewMode = signal<'register' | 'customer-report' | 'salesperson-report'>('register');
  isLoading = signal<boolean>(false);
  tableData = signal<Invoice[]>([]);
  groupedData = signal<{ customerName: string, invoices: Invoice[] }[]>([]);
  salespersonReportData = signal<Invoice[]>([]);
  canCreateInvoice = signal<boolean>(false);
  createInvoiceOpen = signal<boolean>(false);

  // Register Columns
  registerColumns: DataGridColumn<Invoice>[] = [];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Finance' }, { label: 'Payable' }];

  // Report Filters
  reportFromDate = signal<string>('');
  reportToDate = signal<string>('');
  selectedSalesperson = signal<string>('');

  // Salespeople Options (Mocked for now or fetched if API exists)
  salespeople = signal<{ id: string, name: string }[]>([]);

  private readonly invoiceStatusOptions = [
    'Pending to submit',
    'PI Submitted',
    'Partial invoicing',
    'Submitted',
    'Hold',
    'Rejected by customer'
  ];

  private readonly paymentStatusOptions = [
    'Paid',
    'Partially paid',
    'Advance received',
    'Pending'
  ];

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
        locked: true
      },
      {
        key: 'date',
        label: 'Invoice Date',
        type: 'date',
        sortable: true
      },
      {
        key: 'customer.companyName',
        label: 'Customer Name',
        type: 'text',
        valueGetter: (item) => item.customer?.companyName || '-'
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
        valueGetter: (item) => item.jobId?.jobId || '-'
      },
      {
        key: 'salesperson',
        label: 'Salesperson Name',
        type: 'text',
        valueGetter: (item: Invoice) => {
          const sp = item.salesperson as any;
          if (!sp) return '-';
          return [sp.firstName, sp.lastName].filter(Boolean).join(' ') || '-';
        }
      },
      {
        key: 'amount',
        label: 'Invoice Amount',
        type: 'currency',
        currencyCode: 'QAR',
        valueGetter: (item: any) => item?.amount ?? 0,
        sortable: true,
        align: 'right'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        editable: true,
        editor: 'select',
        editorOptions: this.invoiceStatusOptions.map(status => ({ label: status, value: status })),
        filterOptions: this.invoiceStatusOptions.map(status => ({ label: status, value: status }))
      },
      {
        key: 'paymentStatus',
        label: 'Payment Status',
        type: 'badge',
        editable: true,
        editor: 'select',
        editorOptions: this.paymentStatusOptions.map(status => ({ label: status, value: status })),
        filterOptions: this.paymentStatusOptions.map(status => ({ label: status, value: status }))
      },

    ];
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

  onQueryChange(query: DataGridQuery): void {
    this.paginationService.updatePaginationState({
      page: query.page,
      row: query.pageSize,
      total: this.paginationService.paginationState().total
    });

    const params: Partial<InvoiceFilterParams> = {};
    if (query.search) params.search = query.search;
    query.filters.forEach(filter => this.applyGridFilter(params, filter));
    this.loadData(params);
  }

  openCreateInvoice(): void {
    this.createInvoiceOpen.set(true);
  }

  onCreateInvoiceSaved(): void {
    this.createInvoiceOpen.set(false);
    this.loadData();
  }

  private applyGridFilter(params: Partial<InvoiceFilterParams>, filter: DataGridFilter): void {
    if (filter.key === 'date') {
      if (filter.op === 'before') params.toDate = filter.value;
      else if (filter.op === 'after' || filter.op === 'on') params.fromDate = filter.value;
      return;
    }

    const apiKey = filter.key === 'customer.companyName'
      ? 'customer'
      : filter.key === 'jobId.jobId'
        ? 'jobId'
        : filter.key;
    (params as any)[apiKey] = filter.value;
  }

  onRowClick(row: Invoice) {
    this.router.navigate(['/finance/payables/invoice-register/view', row._id]);
  }

  onStatusChange(event: DataGridCellEditEvent<Invoice>) {
    const invoice = event.row;
    const update: any = {};
    if (event.column.key === 'status') {
      if (invoice.status === 'Cancelled' || invoice.status === 'Reissued') {
        (invoice as any)[event.column.key] = event.oldValue;
        this.notificationService.warning('Status cannot be changed for cancelled or reissued invoices');
        return;
      }

      if (event.newValue === 'Rejected by customer') {
        const dialogRef = this.dialog.open(ReasonPromptModalComponent, {
          width: '480px',
          data: {
            title: 'Reject Invoice',
            label: 'Rejection Reason',
            placeholder: 'Enter the reason the customer rejected this invoice',
            confirmLabel: 'Reject Invoice'
          }
        });

        dialogRef.afterClosed().subscribe((reason: string | null) => {
          if (!reason) {
            (invoice as any)[event.column.key] = event.oldValue;
            return;
          }
          this.invoiceService.rejectInvoiceByCustomer(invoice._id, { reason }).subscribe({
            next: () => {
              this.notificationService.success('Invoice marked as rejected by customer');
              this.loadData();
            },
            error: (error) => {
              (invoice as any)[event.column.key] = event.oldValue;
              this.notificationService.error(error?.error?.message || 'Failed to reject invoice');
            }
          });
        });
        return;
      }

      update.status = event.newValue;
    } else if (event.column.key === 'paymentStatus') {
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
        (invoice as any)[event.column.key] = event.oldValue;
        this.notificationService.error('Failed to update invoice');
      }
    });
  }

  onExportRequest(): void {
    const total = this.paginationService.paginationState().total;
    if (!total) {
      this.notificationService.warning('No invoices to export');
      return;
    }

    this.invoiceService.getInvoices({ page: 1, limit: total }).subscribe({
      next: (res) => {
        if (res.data.invoices?.length) void this.grid.exportToExcel(res.data.invoices);
      },
      error: () => this.notificationService.error('Failed to export invoices')
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
