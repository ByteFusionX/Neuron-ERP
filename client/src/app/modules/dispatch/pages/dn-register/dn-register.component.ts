import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DeliveryNote, DnStatus } from 'src/app/shared/interfaces/delivery-note.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule } from '@angular/material/menu';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  search?: string;
  customer?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  jobId?: string;
}

@Component({
  selector: 'app-dn-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TableComponent,
    ButtonComponent,
    IconsModule,
    MatMenuModule
  ],
  templateUrl: './dn-register.component.html',
  styleUrl: './dn-register.component.css',
  providers: [PaginationService]
})
export class DnRegisterComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private _dnService = inject(DeliveryNoteService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _dialog = inject(MatDialog);
  private toaster = inject(ToastrService);
  private paginationService = inject(PaginationService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();

  canCreateDn = signal<boolean>(false);
  canViewPendingDelivery = signal<boolean>(false);
  canViewInvoiceLinking = signal<boolean>(false);
  canViewInventoryDeduction = signal<boolean>(false);
  canSwitchDispatchView = signal<boolean>(false);

  tableData = signal<DeliveryNote[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  dnStatuses = Object.values(DnStatus);
  searchQuery = signal<string>('');

  ngOnInit(): void {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe(emp => {
        const privileges = emp?.category?.privileges?.dispatch;
        if (privileges?.createDeliveryNote) {
          this.canCreateDn.set(true);
        }
        this.canViewPendingDelivery.set(!!privileges?.viewPendingDelivery);
        this.canViewInvoiceLinking.set(!!privileges?.viewInvoiceLinking);
        this.canViewInventoryDeduction.set(!!privileges?.viewInventoryDeduction);
        this.canSwitchDispatchView.set(
          !!(privileges?.viewPendingDelivery || privileges?.viewInvoiceLinking || privileges?.viewInventoryDeduction)
        );
      })
    );
    this.setupTableColumns();
    this.initializeFromUrlParams();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initializeFromUrlParams(): void {
    this._route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page']) : 1;
      const row = params['row'] ? parseInt(params['row']) : 10;
      const search = params['search'] || '';
      const customer = params['customer'] || '';
      const status = params['status'] || '';
      const jobId = params['jobId'] || '';
      const fromDate = params['fromDate'] || '';
      const toDate = params['toDate'] || '';

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      if (search) this.searchQuery.set(search);

      this.loadData();
    });
  }

  setupTableColumns(): void {
    const baseColumns: TableColumn[] = [
      {
        key: 'dnDate',
        label: 'DN Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'dnNo',
        label: 'DN No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search DN No...',
        cellClass: 'text-purple-600 font-medium'
      },
      {
        key: 'job.jobId',
        label: 'Job ID',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job ID...',
        cellRenderer: (item: DeliveryNote) => item.job?.jobId || 'N/A'
      },
      {
        key: 'clientName',
        label: 'Customer',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search customer...'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.dnStatuses.map(status => ({ label: status, value: status }))
      },
      {
        key: 'actions',
        label: 'Action',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View Details',
            action: 'viewDn',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full border border-gray-300 hover:border-gray-500 flex justify-center items-center'
          }
        ]
      }
    ];

    this.tableColumns = baseColumns;
    this.defaultColumns = ['dnDate', 'dnNo', 'job.jobId', 'clientName', 'status', 'actions'];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      search: this.searchQuery() || undefined,
      ...filters
    };

    this.subscriptions.add(
      this._dnService.getAllDeliveryNotes(filterParams).subscribe({
        next: (response) => {
          this.tableData.set(response.dns || []);
          this.totalItems.set(response.total || 0);

          this.paginationService.updatePaginationState({
            page: paginationState.page,
            row: paginationState.row,
            total: response.total || 0
          });

          this.isEmpty.set(this.tableData().length === 0);
          this.isLoading.set(false);
          this.updateUrlParams();
        },
        error: (error) => {
          this.toaster.error('Failed to load delivery notes');
          console.error('Error loading delivery notes:', error);
          this.isLoading.set(false);
          this.isEmpty.set(true);
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

    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          if (filter.column === 'dnNo') {
            acc.search = filter.value;
          } else if (filter.column === 'job.jobId') {
            acc.jobId = filter.value;
          } else {
            acc[filter.column] = filter.value;
          }
          break;
        case 'select':
          if (filter.column === 'status') {
            acc.status = filter.value;
          }
          break;
        case 'date':
          if (filter.column === 'dnDate') {
            acc.fromDate = filter.value[0];
            acc.toDate = filter.value[1];
          }
          break;
      }
      return acc;
    }, {} as Partial<FilterParams>);

    this.loadData(filterParams);
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.row = paginationState.row !== 10 ? paginationState.row : null;
    queryParams.search = this.searchQuery() || null;

    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onActionClick(event: { action: string; item: DeliveryNote }): void {
    const { action, item } = event;

    switch (action) {
      case 'viewDn':
        this.viewDnDetails(item);
        break;
    }
  }

  viewDnDetails(dn: DeliveryNote): void {
    this._router.navigate(['/dispatch/delivery-note-register/view', dn._id]);
  }

  onRowClick(row: DeliveryNote): void {
    this.viewDnDetails(row);
  }

  onSearchSubmit(searchTerm: string): void {
    this.searchQuery.set(searchTerm || '');
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.loadData();
    this.updateUrlParams();
  }

  generateJobReport(): void {
    // For now, open dialog without pre-filtering
    // In future, can pass jobId from filters
    this.toaster.info('Please select a Job ID filter first');
  }

  generateCustomerReport(): void {
    // For now, open dialog without pre-filtering
    this.toaster.info('Please select a Customer filter first');
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.toaster.warning('No data to export');
      return;
    }

    const filterParams: FilterParams = {
      page: 1,
      row: total,
      search: this.searchQuery() || undefined
    };

    this._dnService.getAllDeliveryNotes(filterParams).subscribe({
      next: (response) => {
        if (this.tableComponent && response.dns.length > 0) {
          this.tableComponent.exportAllData(response.dns);
        }
      },
      error: (error) => {
        this.toaster.error('Failed to export delivery notes');
        console.error('Error exporting delivery notes:', error);
      }
    });
  }
}
