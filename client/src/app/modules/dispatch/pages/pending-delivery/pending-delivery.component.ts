import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule } from '@angular/material/menu';

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
  imports: [
    CommonModule,
    RouterModule,
    TableComponent,
    IconsModule,
    MatMenuModule
  ],
  templateUrl: './pending-delivery.component.html',
  styleUrl: './pending-delivery.component.css',
  providers: [PaginationService]
})
export class PendingDeliveryComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private dnService = inject(DeliveryNoteService);
  private toaster = inject(ToastrService);
  private paginationService = inject(PaginationService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  canViewInvoiceLinking = signal<boolean>(false);
  canViewInventoryDeduction = signal<boolean>(false);
  canSwitchDispatchView = signal<boolean>(false);

  statusOptions: string[] = ['Not Delivered', 'Partially Delivered'];

  ngOnInit(): void {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe(emp => {
        const privileges = emp?.category?.privileges?.dispatch;
        this.canViewInvoiceLinking.set(!!privileges?.viewInvoiceLinking);
        this.canViewInventoryDeduction.set(!!privileges?.viewInventoryDeduction);
        this.canSwitchDispatchView.set(
          !!(privileges?.viewPendingDelivery || privileges?.viewInvoiceLinking || privileges?.viewInventoryDeduction)
        );
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
      {
        key: 'slNo',
        label: 'Sl No',
        type: 'number',
        filterable: false
      },
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
        label: 'Job Id',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job...'
      },
            {
        key: 'description',
        label: 'Item Description',
        type: 'text',
        truncateText: true,
        filterable: false
      },
      {
        key: 'supplierName',
        label: 'Supplier Name',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Supplier...'
      },
      {
        key: 'supplierLpoNo',
        label: 'Supplier LPO No',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search LPO...'
      },

      {
        key: 'orderedQty',
        label: 'Ordered Qty',
        type: 'number',
        filterable: false
      },
      {
        key: 'receivedQty',
        label: 'Received Qty',
        type: 'number',
        filterable: false
      },
      {
        key: 'balanceQty',
        label: 'Balance QTY',
        type: 'number',
        filterable: false
      },
      {
        key: 'deliveredQty',
        label: 'Delivered Qty',
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

    this.dnService.getPendingDeliveries(payload).subscribe({
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
        this.toaster.error('Failed to load pending deliveries');
        console.error('Error loading pending deliveries:', error);
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
      } else if (filter.column === 'supplierName') {
        filterParams.supplierName = filter.value;
      } else if (filter.column === 'supplierLpoNo') {
        filterParams.supplierLpoNo = filter.value;
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

    this.dnService.getPendingDeliveries(payload).subscribe({
      next: (res) => {
        if (this.tableComponent && res.items && res.items.length > 0) {
          this.tableComponent.exportAllData(res.items);
        }
      },
      error: (error) => {
        this.toaster.error('Failed to export pending deliveries');
        console.error('Error exporting pending deliveries:', error);
      }
    });
  }
}
