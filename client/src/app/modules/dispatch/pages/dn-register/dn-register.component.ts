import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DeliveryNote, DnStatus } from 'src/app/shared/interfaces/delivery-note.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule } from '@angular/material/menu';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { CreateDnComponent } from '../create-dn/create-dn.component';
import { StockReturnDrawerComponent } from 'src/app/modules/stocks/pages/stock-return-drawer/stock-return-drawer.component';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  search?: string;
  customer?: string;
  fromDate?: string;
  toDate?: string;
  status?: string | string[];
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
    DataGridComponent,
    ActionButtonComponent,
    CreateDnComponent,
    StockReturnDrawerComponent,
    IconsModule,
    MatMenuModule
  ],
  templateUrl: './dn-register.component.html',
  styleUrl: './dn-register.component.css',
  providers: [PaginationService]
})
export class DnRegisterComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<DeliveryNote>;

  private _dnService = inject(DeliveryNoteService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _dialog = inject(MatDialog);
  private toaster = inject(ToastrService);
  paginationService = inject(PaginationService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();

  canCreateDn = signal<boolean>(false);
  canViewPendingDelivery = signal<boolean>(false);
  canViewInvoiceLinking = signal<boolean>(false);
  canViewInventoryDeduction = signal<boolean>(false);
  canSwitchDispatchView = signal<boolean>(false);

  tableData = signal<DeliveryNote[]>([]);
  tableColumns: DataGridColumn<DeliveryNote>[] = [];
  rowActions: DataGridRowAction<DeliveryNote>[] = [];
  views: DataGridView<DeliveryNote>[] = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.DRAFT }] },
    { id: 'ready', label: 'Ready', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.READY_FOR_DISPATCH }] },
    { id: 'delivered', label: 'Delivered', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.DELIVERED }] },
    {
      id: 'rejected',
      label: 'Rejected',
      filters: [
        { id: 1, key: 'status', op: 'is', value: DnStatus.REJECTED },
        { id: 2, key: 'status', op: 'is', value: DnStatus.PARTIALLY_REJECTED, or: true }
      ]
    },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Dispatch' }, { label: 'Delivery Notes' }];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  dnStatuses = Object.values(DnStatus);
  searchQuery = signal<string>('');
  private activeFilters: Partial<FilterParams> = {};
  formOpen = false;
  formEditId: string | null = null;

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
    this.setupRowActions();
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
    const baseColumns: DataGridColumn<DeliveryNote>[] = [
      {
        key: 'dnDate',
        label: 'DN Date',
        type: 'date',
        sortable: true,
        width: '120px'
      },
      {
        key: 'dnNo',
        label: 'DN No',
        sortable: true
      },
      {
        key: 'job.jobId',
        label: 'Job ID',
        valueGetter: (item) => item.job?.jobId || 'N/A'
      },
      {
        key: 'clientName',
        label: 'Customer',
      },
      { key: 'deliveryType', label: 'Type', type: 'badge' },
      { key: 'promisedDate', label: 'Promised', type: 'date', width: '120px' },
      {
        key: 'customerLpoNumber',
        label: 'LPO Number',
        valueGetter: (item) => item.customerLpoNumber || 'N/A'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        editorOptions: this.dnStatuses.map(status => ({ label: status, value: status }))
      }
    ];

    this.tableColumns = baseColumns;
  }

  setupRowActions(): void {
    this.rowActions = [
      { id: 'viewDn', label: 'Open full DN', icon: 'eye', quick: true, panel: true },
      { id: 'editDraft', label: 'Edit draft', icon: 'pencil', quick: true, hidden: row => row.status !== DnStatus.DRAFT },
      { id: 'customerReturn', label: 'Customer return', hidden: row => [DnStatus.DRAFT, DnStatus.CANCELLED, DnStatus.REJECTED].includes(row.status) }
    ];
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
    this.activeFilters = { ...filters };

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

  onQueryChange(query: DataGridQuery): void {
    this.isLoading.set(true);
    this.paginationService.updatePaginationState({
      page: query.page,
      row: query.pageSize,
      total: this.totalItems()
    });

    const filterParams: Partial<FilterParams> = {};
    if (query.search) filterParams.search = query.search;
    const statusValues: string[] = [];
    query.filters.forEach(filter => {
      if (filter.key === 'dnNo') filterParams.search = filter.value;
      else if (filter.key === 'job.jobId') filterParams.jobId = filter.value;
      else if (filter.key === 'clientName') filterParams.customer = filter.value;
      else if (filter.key === 'status') statusValues.push(filter.value);
      else if (filter.key === 'dnDate') {
        if (filter.op === 'on') {
          filterParams.fromDate = filter.value;
          filterParams.toDate = filter.value;
        }
      }
    });
    if (statusValues.length === 1) filterParams.status = statusValues[0];
    else if (statusValues.length > 1) filterParams.status = statusValues;

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

  onRowAction(event: DataGridRowActionEvent<DeliveryNote>): void {
    const { action, row } = event;

    switch (action.id) {
      case 'viewDn':
        this.viewDnDetails(row);
        break;
      case 'editDraft':
        this.openCreateDrawer(row._id || null);
        break;
      case 'customerReturn':
        this.returnDnId = row._id || '';
        this.returnOpen = true;
        break;
    }
  }

  viewDnDetails(dn: DeliveryNote): void {
    this._router.navigate(['/dispatch/delivery-note-register/view', dn._id]);
  }

  onRowClick(row: DeliveryNote): void {
    this.viewDnDetails(row);
  }

  dnTitle = (row: DeliveryNote): string => row.dnNo || 'Delivery Note';
  dnSubtitle = (row: DeliveryNote): string => row.clientName || '';

  /** Customer return: goods coming back against a posted delivery note. */
  returnOpen = false;
  returnDnId = '';

  openCreateDrawer(editId: string | null = null): void {
    this.formEditId = editId;
    this.formOpen = true;
  }

  closeCreateDrawer(): void {
    this.formOpen = false;
    this.formEditId = null;
  }

  onCreateSaved(): void {
    this.loadData();
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
      search: this.searchQuery() || undefined,
      ...this.activeFilters
    };

    this._dnService.getAllDeliveryNotes(filterParams).subscribe({
      next: (response) => {
        if (response.dns.length > 0) {
          void this.grid.exportToExcel(response.dns);
        }
      },
      error: (error) => {
        this.toaster.error('Failed to export delivery notes');
        console.error('Error exporting delivery notes:', error);
      }
    });
  }
}
