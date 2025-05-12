import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';

@Component({
  selector: 'app-pending-suppliers',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    SearchComponent,
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
  statusOptions: string[] = ['Pending', 'Approved', 'Rejected'];
  
  selectedLocation = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<Array<string>>(['Pending', 'Rejected']);

  ngOnInit(): void {
    this.setupTableColumns();
    this.checkCurrentRoute();
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
      },
      {
        key: 'supplierName',
        label: 'Supplier Name',
        type: 'text',
        sortable: true
      },
      {
        key: 'address.location',
        label: 'Location',
        type: 'text'
      },
      {
        key: 'supplierType',
        label: 'Type',
        type: 'text'
      },
      {
        key: 'creditDays',
        label: 'Credit Days',
        type: 'number'
      },
      {
        key: 'creditValue',
        label: 'Credit Value',
        type: 'text',
        pipeParams: { currency: 'USD', format: '1.2-2' }
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center'
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
          }
        ]
      }
    ];

    this.defaultColumns = [
      'createdDate', 'supplierName', 'address.location', 'supplierType',
      'creditDays', 'creditValue', 'status', 'actions'
    ];
  }

  loadData(): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    this.supplierService.getSuppliers({
      page: paginationState.page,
      row: paginationState.row,
      status: this.selectedStatus(),
      category: this.selectedCategory(),
      supplierType: this.selectedLocation()
    }).subscribe({
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

  onSearch(searchInput: string) {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: 1, 
      row: currentState.row, 
      total: currentState.total 
    });
    this.supplierService.getSuppliers({
      page: 1,
      row: currentState.row,
      status: this.selectedStatus(),
      category: this.selectedCategory(),
      supplierType: this.selectedLocation(),
      search: searchInput
    }).subscribe({
      next: (response) => {
        this.tableData.set(response.data.suppliers);
        this.totalItems.set(response.data.pagination.total);
        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to search suppliers');
        console.error('Error searching suppliers:', error);
        this.isLoading.set(false);
      }
    });
  }

  onFilterChange() {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: 1, 
      row: currentState.row, 
      total: currentState.total 
    });
    this.loadData();
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
    }
  }

  viewSupplierDetails(supplier: Supplier): void {
    // console.log(supplier);
    this.router.navigate(['/suppliers', supplier._id]);
  }

  editSupplier(supplier: Supplier): void {
    this.router.navigate(['/suppliers', 'edit', supplier._id]);
  }

  viewDocuments(supplier: Supplier): void {
    // Implement document viewing logic
    console.log('Viewing documents for supplier:', supplier);
  }

  onRowClick(row: Supplier): void {
    this.viewSupplierDetails(row);
  }
}