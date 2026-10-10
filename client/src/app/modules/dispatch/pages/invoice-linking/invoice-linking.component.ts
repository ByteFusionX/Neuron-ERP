import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery } from 'src/app/shared/components/data-grid/data-grid.model';

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
  imports: [CommonModule, RouterModule, DataGridComponent, ActionButtonComponent, IconsModule, MatMenuModule],
  templateUrl: './invoice-linking.component.html',
  styleUrl: './invoice-linking.component.css',
  providers: [PaginationService]
})
export class InvoiceLinkingComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private dnService = inject(DeliveryNoteService);
  private toaster = inject(ToastrService);
  paginationService = inject(PaginationService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();

  tableData = signal<any[]>([]);
  tableColumns: DataGridColumn<any>[] = [];
  isLoading = signal<boolean>(true);
  totalItems = signal<number>(0);

  canViewPendingDelivery = signal<boolean>(false);
  canViewInventoryDeduction = signal<boolean>(false);
  canSwitchDispatchView = signal<boolean>(false);

  statusOptions: string[] = ['Pending Invoice', 'Partially Invoiced', 'Fully Invoiced'];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Dispatch' }, { label: 'Invoice Linking' }];

  ngOnInit(): void {
    this.subscriptions.add(this.employeeService.employeeData$.subscribe(emp => {
      const privileges = emp?.category?.privileges?.dispatch;
      this.canViewPendingDelivery.set(!!privileges?.viewPendingDelivery);
      this.canViewInventoryDeduction.set(!!privileges?.viewInventoryDeduction);
      this.canSwitchDispatchView.set(!!(privileges?.viewPendingDelivery || privileges?.viewInvoiceLinking || privileges?.viewInventoryDeduction));
    }));
    this.setupTableColumns();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  setupTableColumns(): void {
    this.tableColumns = [
      { key: 'customerName', label: 'Customer' },
      { key: 'jobId', label: 'Job ID' },
      { key: 'dnNo', label: 'DN No' },
      { key: 'dnDate', label: 'DN Date', type: 'date' },
      { key: 'invoiceNo', label: 'Invoice No' },
      { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
      { key: 'deliveredQty', label: 'Delivered', type: 'number' },
      { key: 'invoicedQty', label: 'Invoiced', type: 'number' },
      { key: 'balanceQty', label: 'Balance', type: 'number' },
      { key: 'status', label: 'Status', type: 'badge', editorOptions: this.statusOptions.map(s => ({ label: s, value: s })) }
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    this.dnService.getInvoiceLinking({ page: paginationState.page, row: paginationState.row, ...filters }).subscribe({
      next: (res) => {
        this.tableData.set(res.items || []);
        this.totalItems.set(res.total || 0);
        this.paginationService.updatePaginationState({ page: paginationState.page, row: paginationState.row, total: res.total || 0 });
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toaster.error('Failed to load invoice linking data');
        console.error('Error loading invoice linking:', error);
        this.isLoading.set(false);
      }
    });
  }

  onQueryChange(query: DataGridQuery): void {
    this.paginationService.updatePaginationState({ page: query.page, row: query.pageSize, total: this.totalItems() });
    const filters: Partial<FilterParams> = {};
    if (query.search) filters.dnNo = query.search;
    query.filters.forEach(filter => {
      if (filter.key === 'customerName') filters.customerName = filter.value;
      else if (filter.key === 'jobId') filters.jobId = filter.value;
      else if (filter.key === 'dnNo') filters.dnNo = filter.value;
      else if (filter.key === 'invoiceNo') filters.invoiceNo = filter.value;
      else if (filter.key === 'status') filters.status = [filter.value];
    });
    this.loadData(filters);
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (!total) {
      this.toaster.warning('No data to export');
      return;
    }
    this.dnService.getInvoiceLinking({ page: 1, row: total }).subscribe({
      next: (res) => {
        if (res.items?.length) void this.grid.exportToExcel(res.items);
      },
      error: (error) => {
        this.toaster.error('Failed to export invoice linking data');
        console.error('Error exporting invoice linking:', error);
      }
    });
  }
}
