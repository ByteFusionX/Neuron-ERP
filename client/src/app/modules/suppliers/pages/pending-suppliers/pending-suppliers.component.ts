import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatDialog } from '@angular/material/dialog';

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
    FormsModule
  ],
  templateUrl: './pending-suppliers.component.html',
  styleUrl: './pending-suppliers.component.css',
  providers: [PaginationService]
})
export class PendingSuppliersComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog );
  private paginationService = inject(PaginationService);

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

  ngOnInit(): void {
    this.checkCurrentRoute();
    this.setupTableColumns();
    this.loadData();
  }

  checkCurrentRoute(): void {
    const currentPath = this.router.url;
    this.isPendingView.set(currentPath.includes('/pendings'));
    this.selectedStatus.set(this.isPendingView() ? ['Pending', 'Rejected'] : ['Approved']);
  }

  setupTableColumns(): void {
    this.tableColumns = [
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
        label: 'Credit Value',
        type: 'text',
        pipeParams: { currency: 'USD', format: '1.2-2' },
        filterable: false,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions.filter(status => status !== 'Approved').map(status => ({ label: status, value: status })),
        tooltip: true,
      },
      {
        key: 'documents',
        label: 'Documents',
        type: 'action',
        actions: [
          {
            icon: 'heroPaperClip',
            tooltip: 'View Documents',
            action: 'viewDocuments',
            buttonClass: 'w-7 h-7 rounded-full border border-gray-300 hover:border-gray-500 flex justify-center items-center',
            condition: (item) => item.documents?.length > 0
          }
        ]
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
            condition: (item) => item.status !== 'Approved'
          },
          {
            icon: 'heroArrowUturnLeft',
            tooltip: 'Revoke Approval',
            action: 'revokeApproval',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full bg-red-600 flex justify-center items-center text-white',
            condition: (item) => item.status === 'Approved'
          }
        ]
      }
    ];
    

    this.defaultColumns = [
      'createdDate', 'supplierName', 'address.location', 'supplierType',
      'creditDays', 'creditValue', 'status', 'actions'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    
    // Combine existing filters with new filters
    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      status: this.selectedStatus(),
      category: this.selectedCategory(),
      supplierType: this.selectedLocation(),
      ...filters
    };

    this.supplierService.getSuppliers(filterParams).subscribe({
      next: (response) => {
        this.tableData.set(response.data.suppliers);
        this.totalItems.set(response.data.pagination.total);
        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to load suppliers');
        console.error('Error loading suppliers:', error);
        this.isLoading.set(false);
      }
    });
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
          acc[filter.column] = filter.value;
          break;
        case 'select':
          acc[filter.column] = filter.value;
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

  onActionClick(event: { action: string; item: Supplier }): void {
    const { action, item } = event;
    
    switch (action) {
      case 'viewSupplier':
        this.viewSupplierDetails(item);
        break;
      case 'editSupplier':
        this.editSupplier(item);
        break;
      case 'viewDocuments':
        this.viewDocuments(item);
        break;
      case 'revokeApproval':
        this.revokeApproval(item);
        break;
    }
  }

  viewSupplierDetails(supplier: Supplier): void {
    // console.log(supplier);
    this.router.navigate(['/suppliers', supplier._id]);
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

  viewDocuments(supplier: Supplier): void {
    // Implement document viewing logic
    console.log('Viewing documents for supplier:', supplier);
  }

  onRowClick(row: Supplier): void {
    this.viewSupplierDetails(row);
  }
}