import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';

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
    ButtonComponent
  ],
  templateUrl: './pending-suppliers.component.html',
  styleUrl: './pending-suppliers.component.css',
})
export class PendingSuppliersComponent implements OnInit {
  tableData: any[] = [];
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading: boolean = true;
  isEmpty: boolean = false;
  totalItems: number = 0;
  currentPage: number = 1;
  pageSize: number = 10;

  locationOptions: string[] = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK'];
  categoryOptions: string[] = ['ICT', 'ELV', 'AV', 'CCTV', 'Oil & Gas', 'Others'];
  statusOptions: string[] = ['Pending', 'Approved', 'Rejected'];
  
  selectedLocation: string = '';
  selectedCategory: string = '';
  selectedStatus: string = 'Pending';

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadData();
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
        type: 'badge'
      },
      {
        key: 'category',
        label: 'Category',
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
        type: 'currency',
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
      'supplierId', 'supplierName', 'address.location', 'supplierType', 'category',
      'contactDetails', 'creditDays', 'status', 'createdDate', 'actions'
    ];
  }

  loadData(): void {
    // Simulate API call
    setTimeout(() => {
      this.tableData = this.generateMockData();
      this.totalItems = 38; // Total items for pagination demo
      this.isLoading = false;
    }, 1000);
  }

  generateMockData(): any[] {
    const supplierTypes = ['OEM', 'Distributor', 'Super Stockiest', 'Reseller'];
    const categories = ['ICT', 'ELV', 'AV', 'CCTV', 'Oil & Gas', 'Others'];
    const locations = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK'];
    const statuses = ['Pending', 'Approved', 'Rejected'];
    const productBrands = ['Cisco', 'HP', 'Dell', 'IBM', 'Microsoft', 'Oracle', 'SAP', 'Apple', 'Samsung', 'Huawei'];
    const paymentTerms = ['Net 30', '50% advance, 50% on delivery', 'Net 60', 'COD', '100% advance'];
    
    // Generate some mock data
    return Array(15).fill(0).map((_, i) => {
      const location = locations[Math.floor(Math.random() * locations.length)];
      const createdDate = new Date(2025, Math.floor(Math.random() * 3), Math.floor(Math.random() * 28) + 1);
      const status = i < 10 ? 'Pending' : statuses[Math.floor(Math.random() * statuses.length)];
      const approvedDate = status === 'Pending' ? null : new Date(createdDate.getTime() + Math.random() * 10 * 24 * 60 * 60 * 1000);
      
      return {
        _id: `sup_${i + 1}`,
        supplierId: `SUP_${location.substring(0, 3).toUpperCase()}_${createdDate.getMonth() + 1}${createdDate.getFullYear().toString().substring(2)}_${(i + 1).toString().padStart(3, '0')}`,
        supplierName: `Supplier ${i + 1} ${location}`,
        address: {
          streetNo: `${Math.floor(Math.random() * 100) + 1}`,
          zoneNo: `Zone ${Math.floor(Math.random() * 10) + 1}`,
          buildingNo: `B-${Math.floor(Math.random() * 100) + 1}`,
          poBox: `P.O. Box ${Math.floor(Math.random() * 10000) + 1000}`,
          location: location
        },
        supplierType: supplierTypes[Math.floor(Math.random() * supplierTypes.length)],
        category: categories[Math.floor(Math.random() * categories.length)],
        contactDetails: [
          {
            name: `Contact Person ${i + 1}`,
            email: `contact${i + 1}@supplier${i + 1}.com`,
            phoneNumber: `+971 5${Math.floor(Math.random() * 10)} ${Math.floor(Math.random() * 1000000) + 1000000}`
          },
          {
            name: `Secondary Contact ${i + 1}`,
            email: `secondary${i + 1}@supplier${i + 1}.com`,
            phoneNumber: `+971 5${Math.floor(Math.random() * 10)} ${Math.floor(Math.random() * 1000000) + 1000000}`
          }
        ],
        documents: i % 3 === 0 ? [] : Array(Math.floor(Math.random() * 3) + 1).fill(0).map((_, j) => ({
          fileName: `document_${j + 1}.pdf`,
          fileUrl: `https://example.com/documents/supplier_${i + 1}_${j + 1}.pdf`
        })),
        status: status,
        paymentTerms: Array(Math.floor(Math.random() * 2) + 1).fill(0).map(() => 
          paymentTerms[Math.floor(Math.random() * paymentTerms.length)]
        ),
        products: Array(Math.floor(Math.random() * 4) + 1).fill(0).map(() => 
          productBrands[Math.floor(Math.random() * productBrands.length)]
        ),
        creditDays: Math.floor(Math.random() * 60) + 30,
        creditValue: Math.floor(Math.random() * 100000) + 10000,
        createdDate: createdDate,
        updatedDate: new Date(createdDate.getTime() + Math.random() * 5 * 24 * 60 * 60 * 1000),
        createdBy: {
          _id: `user_${i % 5 + 1}`,
          firstName: `Admin`,
          lastName: `User ${i % 5 + 1}`
        },
        isDeleted: false,
        approvedDate: approvedDate
      };
    });
  }

  onSearch(searchInput: string) {
    this.isLoading = true;
    this.currentPage = 1;
    console.log('Searching for:', searchInput);
    // Call API with search term
    setTimeout(() => {
      this.tableData = this.generateMockData().filter(
        supplier => supplier.supplierName.toLowerCase().includes(searchInput.toLowerCase()) ||
                    supplier.supplierId.toLowerCase().includes(searchInput.toLowerCase())
      );
      this.isLoading = false;
    }, 500);
  }

  onFilterChange() {
    this.isLoading = true;
    this.currentPage = 1;
    console.log('Filters:', { 
      location: this.selectedLocation, 
      category: this.selectedCategory, 
      status: this.selectedStatus 
    });
    
    // Call API with filters
    setTimeout(() => {
      let filteredData = this.generateMockData();
      
      if (this.selectedLocation) {
        filteredData = filteredData.filter(item => item.address.location === this.selectedLocation);
      }
      
      if (this.selectedCategory) {
        filteredData = filteredData.filter(item => item.category === this.selectedCategory);
      }
      
      if (this.selectedStatus) {
        filteredData = filteredData.filter(item => item.status === this.selectedStatus);
      }
      
      this.tableData = filteredData;
      this.isLoading = false;
    }, 500);
  }

  onPageChange(event: any): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  onActionClick(event: any): void {
    console.log('Action clicked:', event.action, 'on item:', event.item);
    
    // Handle different actions
    switch (event.action) {
      case 'approveSupplier':
        this.approveSupplier(event.item);
        break;
      case 'rejectSupplier':
        this.rejectSupplier(event.item);
        break;
      case 'viewSupplier':
        this.viewSupplierDetails(event.item);
        break;
      case 'editSupplier':
        this.editSupplier(event.item);
        break;
      case 'viewDocuments':
        this.viewDocuments(event.item);
        break;
    }
  }

  approveSupplier(supplier: any): void {
    console.log('Approving supplier:', supplier);
    // Implementation for approving supplier
  }

  rejectSupplier(supplier: any): void {
    console.log('Rejecting supplier:', supplier);
    // Implementation for rejecting supplier
  }

  viewSupplierDetails(supplier: any): void {
    console.log('Viewing supplier details:', supplier);
    // Implementation for viewing supplier details
  }

  editSupplier(supplier: any): void {
    console.log('Editing supplier:', supplier);
    // Implementation for editing supplier
  }

  viewDocuments(supplier: any): void {
    console.log('Viewing documents for supplier:', supplier);
    // Implementation for viewing supplier documents
  }

  onRowClick(row: any): void {
    console.log('Row clicked:', row);
    this.viewSupplierDetails(row);
  }
}