import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { ActivatedRoute, Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';

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
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    ButtonComponent,
    FormsModule
  ],
  templateUrl: './inventory-deduction.component.html',
  styleUrl: './inventory-deduction.component.css',
  providers: [PaginationService]
})
export class InventoryDeductionComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private dnService = inject(DeliveryNoteService);
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

  statusOptions: string[] = ['Deducted', 'Reversed'];

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
      const row = params['row'] ? parseInt(params['row']) : 10;

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      // Map other params if needed for initial state
      // Logic for reading filters from URL to be strict could be added here similar to pending-suppliers

      this.loadData();
    });
  }

  setupTableColumns(): void {
    const columns: TableColumn[] = [
      {
        key: 'dnNumber',
        label: 'DN No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search DN...'
      },
      {
        key: 'date',
        label: 'DN Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'jobId',
        label: 'Job ID / LPO',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job...'
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
        key: 'partNo',
        label: 'Part No',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Part No...'
      },
      {
        key: 'description',
        label: 'Item Description',
        type: 'text',
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'uom',
        label: 'UOM',
        type: 'text',
        filterable: false
      },
      {
        key: 'quantityDeducted',
        label: 'Quantity Deducted',
        type: 'number',
        filterable: false
      },
      {
        key: 'requestedQty',
        label: 'Requested Qty',
        type: 'number',
        filterable: false
      },
      {
        key: 'hasShortfall',
        label: 'Shortfall',
        type: 'status',
        headerClass: 'text-center',
        filterable: false,
        cellRenderer: (item: any) => item.hasShortfall ? 'Shortfall' : 'OK'
      },
      {
        key: 'stockBefore',
        label: 'Stock Before',
        type: 'number',
        filterable: false
      },
      {
        key: 'stockAfter',
        label: 'Stock After',
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

    this.tableColumns = columns;
    this.defaultColumns = columns.map(c => c.key);
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      ...filters
    };

    this.subscriptions.add(
      this.dnService.getInventoryDeductionReport(filterParams).subscribe({
        next: (response) => {
          // Verify response structure matches expected
          this.tableData.set(response.data.items || []); // Assuming response.data.items
          const pagination = response.data.pagination;
          this.totalItems.set(pagination.total);

          this.paginationService.updatePaginationState({
            page: pagination.page,
            row: pagination.limit,
            total: pagination.total
          });

          this.isEmpty.set(this.tableData().length === 0);
          this.isLoading.set(false);
          this.updateUrlParams();
        },
        error: (error) => {
          this.notificationService.error('Failed to load inventory deduction report');
          console.error('Error loading report:', error);
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

    const filterParams: any = {};

    filters.forEach(filter => {
      if (filter.column === 'date') {
        if (filter.value && filter.value.length === 2) {
          filterParams.fromDate = filter.value[0];
          filterParams.toDate = filter.value[1];
        }
      } else if (filter.column === 'status') {
        filterParams.status = Array.isArray(filter.value) ? filter.value : [filter.value];
      } else if (filter.column === 'dnNumber') {
        filterParams.dnNumber = filter.value;
      } else if (filter.column === 'jobId') {
        filterParams.jobId = filter.value;
      } else if (filter.column === 'customerName') {
        filterParams.customerName = filter.value;
      } else if (filter.column === 'partNo') {
        filterParams.partNo = filter.value;
      } else {
        filterParams[filter.column] = filter.value;
      }
    });

    this.loadData(filterParams);
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.row = paginationState.row !== 10 ? paginationState.row : null;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onRowClick(row: any): void {
    // "Clicking a row must follow the existing navigation pattern, such as opening the related DN summary"
    if (row.dnId) { // Assuming dnId is available
      this.router.navigate(['/dispatch/delivery-note-register/view', row.dnId]); // Adjust path as per app structure
    }
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.notificationService.warning('No data to export');
      return;
    }

    // Re-fetch with all items or handle export logic
    this.notificationService.info('Export functionality to be implemented');
  }
}
