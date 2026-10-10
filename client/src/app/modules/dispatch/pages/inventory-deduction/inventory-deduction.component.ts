import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterModule } from '@angular/router';
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
  fromDate?: string;
  toDate?: string;
  customerName?: string;
  jobId?: string;
  dnNumber?: string;
  partNo?: string;
  status?: string[];
}

@Component({
  selector: 'app-inventory-deduction',
  standalone: true,
  imports: [CommonModule, RouterModule, DataGridComponent, ActionButtonComponent, MatMenuModule, IconsModule],
  templateUrl: './inventory-deduction.component.html',
  styleUrl: './inventory-deduction.component.css',
  providers: [PaginationService]
})
export class InventoryDeductionComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private dnService = inject(DeliveryNoteService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  paginationService = inject(PaginationService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();

  tableData = signal<any[]>([]);
  tableColumns: DataGridColumn<any>[] = [];
  isLoading = signal<boolean>(true);
  totalItems = signal<number>(0);

  canViewPendingDelivery = signal<boolean>(false);
  canViewInvoiceLinking = signal<boolean>(false);
  canSwitchDispatchView = signal<boolean>(false);

  statusOptions: string[] = ['Deducted', 'Reversed'];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Dispatch' }, { label: 'Inventory Deduction' }];

  ngOnInit(): void {
    this.subscriptions.add(this.employeeService.employeeData$.subscribe(emp => {
      const privileges = emp?.category?.privileges?.dispatch;
      this.canViewPendingDelivery.set(!!privileges?.viewPendingDelivery);
      this.canViewInvoiceLinking.set(!!privileges?.viewInvoiceLinking);
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
      { key: 'dnNumber', label: 'DN No', sortable: true },
      { key: 'date', label: 'DN Date', type: 'date', sortable: true },
      { key: 'jobId', label: 'Job ID / LPO' },
      { key: 'customerName', label: 'Customer' },
      { key: 'partNo', label: 'Part No' },
      { key: 'description', label: 'Item Description' },
      { key: 'uom', label: 'UOM' },
      { key: 'quantityDeducted', label: 'Deducted', type: 'number' },
      { key: 'requestedQty', label: 'Requested', type: 'number' },
      { key: 'hasShortfall', label: 'Shortfall', type: 'badge', valueGetter: (item) => item.hasShortfall ? 'Shortfall' : 'OK' },
      { key: 'stockBefore', label: 'Stock Before', type: 'number' },
      { key: 'stockAfter', label: 'Stock After', type: 'number' },
      { key: 'status', label: 'Status', type: 'badge', editorOptions: this.statusOptions.map(s => ({ label: s, value: s })) }
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    this.subscriptions.add(this.dnService.getInventoryDeductionReport({ page: paginationState.page, row: paginationState.row, ...filters }).subscribe({
      next: (response) => {
        this.tableData.set(response.data.items || []);
        const pagination = response.data.pagination;
        this.totalItems.set(pagination.total);
        this.paginationService.updatePaginationState({ page: pagination.page, row: pagination.limit, total: pagination.total });
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to load inventory deduction report');
        console.error('Error loading report:', error);
        this.isLoading.set(false);
      }
    }));
  }

  onQueryChange(query: DataGridQuery): void {
    this.paginationService.updatePaginationState({ page: query.page, row: query.pageSize, total: this.totalItems() });
    const filters: Partial<FilterParams> = {};
    if (query.search) filters.dnNumber = query.search;
    query.filters.forEach(filter => {
      if (filter.key === 'date' && filter.op === 'on') {
        filters.fromDate = filter.value;
        filters.toDate = filter.value;
      } else if (filter.key === 'status') filters.status = [filter.value];
      else if (filter.key === 'dnNumber') filters.dnNumber = filter.value;
      else if (filter.key === 'jobId') filters.jobId = filter.value;
      else if (filter.key === 'customerName') filters.customerName = filter.value;
      else if (filter.key === 'partNo') filters.partNo = filter.value;
    });
    this.loadData(filters);
  }

  onRowClick(row: any): void {
    if (row.dnId) this.router.navigate(['/dispatch/delivery-note-register/view', row.dnId]);
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (!total) {
      this.notificationService.warning('No data to export');
      return;
    }
    this.dnService.getInventoryDeductionReport({ page: 1, row: total }).subscribe({
      next: (response) => {
        const items = response.data.items || [];
        if (items.length) void this.grid.exportToExcel(items);
      },
      error: () => this.notificationService.error('Failed to export inventory deduction report')
    });
  }
}
