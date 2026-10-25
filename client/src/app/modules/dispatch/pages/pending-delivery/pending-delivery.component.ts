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
  supplierName?: string;
  supplierLpoNo?: string;
  status?: string[];
}

@Component({
  selector: 'app-pending-delivery',
  standalone: true,
  imports: [CommonModule, RouterModule, DataGridComponent, ActionButtonComponent, IconsModule, MatMenuModule],
  templateUrl: './pending-delivery.component.html',
  styleUrl: './pending-delivery.component.css',
  providers: [PaginationService]
})
export class PendingDeliveryComponent implements OnInit, OnDestroy {
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

  canSwitchDispatchView = signal<boolean>(false);

  statusOptions: string[] = ['Not Delivered', 'Partially Delivered'];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Dispatch' }, { label: 'Pending Delivery' }];

  ngOnInit(): void {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe(emp => {
        const privileges = emp?.category?.privileges?.dispatch;
        this.canSwitchDispatchView.set(!!privileges?.viewPendingDelivery);
      })
    );
    this.setupTableColumns();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  setupTableColumns(): void {
    this.tableColumns = [
      { key: 'slNo', label: 'Sl No', type: 'number', width: '80px' },
      { key: 'customerName', label: 'Customer' },
      { key: 'jobId', label: 'Job Id' },
      { key: 'description', label: 'Item Description' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'supplierLpoNo', label: 'Supplier LPO' },
      { key: 'orderedQty', label: 'Ordered', type: 'number' },
      { key: 'receivedQty', label: 'Received', type: 'number' },
      { key: 'balanceQty', label: 'Balance', type: 'number' },
      { key: 'deliveredQty', label: 'Delivered', type: 'number' },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        editorOptions: this.statusOptions.map(s => ({ label: s, value: s }))
      }
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    const payload: FilterParams = { page: paginationState.page, row: paginationState.row, ...filters };

    this.dnService.getPendingDeliveries(payload).subscribe({
      next: (res) => {
        this.tableData.set(res.items || []);
        this.totalItems.set(res.total || 0);
        this.paginationService.updatePaginationState({ page: paginationState.page, row: paginationState.row, total: res.total || 0 });
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toaster.error('Failed to load pending deliveries');
        console.error('Error loading pending deliveries:', error);
        this.isLoading.set(false);
      }
    });
  }

  onQueryChange(query: DataGridQuery): void {
    this.paginationService.updatePaginationState({ page: query.page, row: query.pageSize, total: this.totalItems() });
    const filterParams: Partial<FilterParams> = {};
    if (query.search) filterParams.customerName = query.search;
    query.filters.forEach(filter => {
      if (filter.key === 'customerName') filterParams.customerName = filter.value;
      else if (filter.key === 'jobId') filterParams.jobId = filter.value;
      else if (filter.key === 'supplierName') filterParams.supplierName = filter.value;
      else if (filter.key === 'supplierLpoNo') filterParams.supplierLpoNo = filter.value;
      else if (filter.key === 'status') filterParams.status = [filter.value];
    });
    this.loadData(filterParams);
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.toaster.warning('No data to export');
      return;
    }
    this.dnService.getPendingDeliveries({ page: 1, row: total }).subscribe({
      next: (res) => {
        if (res.items?.length) void this.grid.exportToExcel(res.items);
      },
      error: (error) => {
        this.toaster.error('Failed to export pending deliveries');
        console.error('Error exporting pending deliveries:', error);
      }
    });
  }
}
