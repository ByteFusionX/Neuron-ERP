import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal, ViewChild } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { SupplierViewModalComponent } from 'src/app/shared/components/supplier-view-modal/supplier-view-modal.component';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  status: string[];
  category?: string;
  supplierType?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  productName?: string;
}

@Component({
  selector: 'app-pending-suppliers',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    ButtonComponent,
    FormsModule,
    SearchComponent
  ],
  templateUrl: './pending-suppliers.component.html',
  styleUrl: './pending-suppliers.component.css',
  providers: [PaginationService]
})
export class PendingSuppliersComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private supplierService = inject(SupplierService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog );
  private paginationService = inject(PaginationService);
  private subscriptions = new Subscription();

  tableData = signal<Supplier[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  isPendingView = signal<boolean>(true);

  locationOptions: string[] = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK'];
  categoryOptions: string[] = ['ICT', 'ELV', 'AV', 'CCTV', 'Oil & Gas', 'Others'];
  supplierTypes = [
    { id: 'OEM', name: 'OEM' },
    { id: 'Distributor', name: 'Distributor' },
    { id: 'Super Stockiest', name: 'Super Stockiest' },
    { id: 'Reseller', name: 'Reseller' }
  ];
  statusOptions: string[] = ['Pending', 'Approved', 'Rejected'];
  
  selectedLocation = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<Array<string>>(['Pending', 'Rejected']);
  productNameSearch = signal<string>('');

  ngOnInit(): void {
    this.checkCurrentRoute();
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
      const search = params['search'] || '';
      const category = params['category'] || '';
      const supplierType = params['supplierType'] || '';
      const productName = params['productName'] || '';
      const fromDate = params['fromDate'] || '';
      const toDate = params['toDate'] || '';
      const status = params['status'] ? (Array.isArray(params['status']) ? params['status'] : [params['status']]) : null;

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      if (category) this.selectedCategory.set(category);
      if (supplierType) this.selectedLocation.set(supplierType);
      if (productName) this.productNameSearch.set(productName);
      if (status) this.selectedStatus.set(status);

      this.loadData();
    });
  }

  checkCurrentRoute(): void {
    const currentPath = this.router.url;
    this.isPendingView.set(currentPath.includes('/pendings'));
    this.selectedStatus.set(this.isPendingView() ? ['Pending', 'Rejected'] : ['Approved']);
  }

  setupTableColumns(): void {
    const baseColumns: TableColumn[] = [
      {
        key: 'supplierId',
        label: 'Supplier ID',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search supplier ID...'
      },
      {
        key: 'createdDate',
        label: 'Created Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'supplierName',
        label: 'Supplier Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search supplier...'
      },
      {
        key: 'address.location',
        label: 'Location',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search location...'
      },
      {
        key: 'supplierType',
        label: 'Type',
        type: 'text',
        filterable: true,
        filterType: 'select',
        filterOptions: this.supplierTypes.map(type => ({ label: type.name, value: type.id }))
      },
      {
        key: 'creditDays',
        label: 'Credit Days',
        type: 'number',
        filterable: false,
      },
      {
        key: 'creditValue',
        label: 'Credit Limit',
        type: 'text',
        pipeParams: { currency: 'USD', format: '1.2-2' },
        filterable: false,
      }
    ];

    if (!this.isPendingView()) {
      baseColumns.push({
        key: 'approvedBy',
        label: 'Approved By',
        type: 'text',
        filterable: false,
        cellRenderer: (item: Supplier) => {
          if (item.approvedHistory && item.approvedHistory.length > 0) {
            const lastApproval = item.approvedHistory[item.approvedHistory.length - 1];
            if (lastApproval.approvedBy) {
              return `${lastApproval.approvedBy.firstName} ${lastApproval.approvedBy.lastName}`;
            }
          }
          return '-';
        }
      });
    }

    baseColumns.push(
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: this.isPendingView(),
        filterType: this.isPendingView() ? 'select' : undefined,
        filterOptions: this.isPendingView() ? this.statusOptions.filter(status => status !== 'Approved').map(status => ({ label: status, value: status })) : undefined,
        tooltip: true,
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
            action: 'viewSupplier',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
          {
            icon: 'heroPencilSquare',
            tooltip: 'Edit Supplier',
            action: 'editSupplier',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium',
            condition: (item) => item.status === 'Pending'
          },
          {
            icon: 'heroArrowUturnLeft',
            tooltip: 'Revoke Approval',
            action: 'revokeApproval',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full bg-orange-500 flex justify-center items-center text-white',
            condition: (item) => item.status === 'Approved'
          },
          {
            icon: 'heroXMark',
            tooltip: 'Block Supplier',
            action: 'blockSupplier',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full bg-red-600 flex justify-center items-center text-white',
            condition: (item) => item.status === 'Approved' && item.hasOrders && !item.isBlocked
          },
          {
            icon: 'heroCheck',
            tooltip: 'Unblock Supplier',
            action: 'blockSupplier',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full bg-green-600 flex justify-center items-center text-white',
            condition: (item) => item.status === 'Approved' && item.hasOrders && !!item.isBlocked
          }
        ]
      }
    );

    this.tableColumns = baseColumns;

    const defaultCols = [
      'supplierId', 'createdDate', 'supplierName', 'address.location', 'supplierType',
      'creditDays', 'creditValue'
    ];

    if (!this.isPendingView()) {
      defaultCols.push('approvedBy');
    }

    defaultCols.push('status', 'actions');

    this.defaultColumns = defaultCols;
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    
    // Combine existing filters with new filters
    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      status: this.selectedStatus(),
      category: this.selectedCategory() || undefined,
      supplierType: this.selectedLocation() || undefined,
      productName: this.productNameSearch() || undefined,
      ...filters
    };

    this.subscriptions.add(
      this.supplierService.getSuppliers(filterParams).subscribe({
        next: (response) => {
          this.tableData.set(response.data.suppliers);
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
          this.notificationService.error('Failed to load suppliers');
          console.error('Error loading suppliers:', error);
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

    // Convert filters to backend format
    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          if (filter.column === 'supplierName') {
            acc.search = filter.value;
          } else if (filter.column === 'address.location') {
            acc['location'] = filter.value;
          } else {
            acc[filter.column] = filter.value;
          }
          break;
        case 'select':
          if (filter.column === 'supplierType') {
            acc.supplierType = filter.value;
          } else if (filter.column === 'status') {
            acc.status = Array.isArray(filter.value) ? filter.value : [filter.value];
          }
          break;
        case 'date':
          if (filter.column === 'createdDate') {
            acc.fromDate = filter.value[0];
            acc.toDate = filter.value[1];
          }
          break;
        case 'number':
          acc[filter.column] = filter.value;
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
    queryParams.productName = this.productNameSearch() || null;
    queryParams.category = this.selectedCategory() || null;
    queryParams.supplierType = this.selectedLocation() || null;
    

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onActionClick(event: { action: string; item: Supplier }): void {
    const { action, item } = event;
    
    switch (action) {
      case 'viewSupplier':
        this.viewSupplierDetails(item);
        break;
      case 'editSupplier':
        this.editSupplier(item);
        break;
      case 'revokeApproval':
        this.revokeApproval(item);
        break;
      case 'blockSupplier':
        this.toggleBlockSupplier(item);
        break;
    }
  }

  viewSupplierDetails(supplier: Supplier): void {
    const dialogRef = this.dialog.open(SupplierViewModalComponent, {
      data: { supplier },
      width: '1100px',
      maxHeight: '90vh',
      panelClass: 'supplier-view-modal'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.refresh) {
        this.loadData();
      }
    });
  }

  editSupplier(supplier: Supplier): void {
    this.router.navigate(['/suppliers', 'edit', supplier._id]);
  }

  revokeApproval(supplier: Supplier): void {
    const confirm = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Are you absolutely sure',
        description: `This action cannot be undone. This will permanently revoke the approval for this supplier.`,
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      }
    });

    confirm.afterClosed().subscribe((result: boolean) => {
      if(result) {
        this.supplierService.updateSupplierStatus(supplier._id, 'Pending').subscribe({
          next: () => {
            this.loadData();
            this.notificationService.success('Approval revoked successfully');
          }
        });
      }
    });
  }

  toggleBlockSupplier(supplier: Supplier): void {
    const willBlock = !supplier.isBlocked;
    const confirm = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Are you absolutely sure',
        description: willBlock
          ? 'This supplier has existing purchase orders, so approval cannot be revoked. Blocking will prevent any new purchase orders from being created for this supplier; existing orders are unaffected.'
          : 'This will unblock the supplier, allowing new purchase orders to be created for them again.',
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      }
    });

    confirm.afterClosed().subscribe((result: boolean) => {
      if (result && supplier._id) {
        this.supplierService.blockSupplier(supplier._id).subscribe({
          next: () => {
            this.loadData();
            this.notificationService.success(willBlock ? 'Supplier blocked successfully' : 'Supplier unblocked successfully');
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to update supplier block status');
          }
        });
      }
    });
  }

  onRowClick(row: Supplier): void {
    this.viewSupplierDetails(row);
  }

  onProductNameSearch(searchTerm: string): void {
    this.productNameSearch.set(searchTerm || '');
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: 1, 
      row: currentState.row, 
      total: currentState.total 
    });
    this.loadData();
    this.updateUrlParams();
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.notificationService.warning('No data to export');
      return;
    }

    const filterParams: FilterParams = {
      page: 1,
      row: total,
      status: this.selectedStatus(),
      category: this.selectedCategory(),
      supplierType: this.selectedLocation(),
      productName: this.productNameSearch() || undefined
    };

    this.supplierService.getSuppliers(filterParams).subscribe({
      next: (response) => {
        if (this.tableComponent && response.data.suppliers.length > 0) {
          this.tableComponent.exportAllData(response.data.suppliers);
        }
      },
      error: (error) => {
        this.notificationService.error('Failed to export suppliers');
        console.error('Error exporting suppliers:', error);
      }
    });
  }
}