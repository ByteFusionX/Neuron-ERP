import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';

@Component({
  selector: 'app-lpo-list',
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    FormsModule
  ],
  templateUrl: './lpo-list.component.html',
  styleUrl: './lpo-list.component.css',
  providers: [PaginationService]
})
export class LpoListComponent implements OnInit {
  @Input() purchaseId?: string; // Optional input for filtering by purchase ID
  
  private router = inject(Router);
  private paginationService = inject(PaginationService);
  private purchaseService = inject(PurchaseService);
  private purchaseOrderService = inject(PurchaseOrderService);
  private notificationService = inject(ToastrService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  selectedLocation = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string[]>([]);

  ngOnInit(): void {
    this.setupTableColumns()
    this.getPurchases()
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'poDate',
        label: 'PO Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
      },
      {
        key: 'supplierId.supplierName',
        label: 'Supplier Name',
        type: 'text',
      },
      {
        key: 'poNo',
        label: 'PO Number',
        type: 'text',
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
      },
      {
        key: 'totalLpoValue',
        label: 'LPO Value',
        type: 'text',
      },
      {
        key: 'createdBy.firstName',
        label: 'Created By',
        type: 'text',
      },
      {
        key: 'poStatus',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center'
      },
      {
        key: 'actions',
        label: 'View/Download',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View LPO',
            action: 'viewLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
          {
            icon: 'heroArrowDownTray',
            tooltip: 'Download LPO',
            action: 'downloadLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
        ]
      },
      {
        key: 'actions',
        label: 'Re issue',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroPaperAirplane',
            tooltip: 'Re Issue',
            action: 'reIssue',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-orange-500 hover:border-orange-700 text-orange-500 text-sm rounded-full font-medium'
          },
        ]
      },
      {
        key: 'actions',
        label: 'Supplier Invoice',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View Invoice',
            action: 'viewInvoice',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-violet-500 hover:border-violet-700 text-violet-500 text-sm rounded-full font-medium'
          },
        ],

      }
    ]

    this.defaultColumns = [
      'poDate', 'supplierId.supplierName', 'poNo', 'jobId.jobId', 'totalLpoValue', 'createdBy.firstName', 'poStatus', 'actions'
    ];
  }

  getPurchases() {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    
    const params: any = {
      page: currentState.page,
      row: currentState.row,
      status: this.selectedStatus(),
    };

    // Add purchaseId filter if provided
    if (this.purchaseId) {
      params.purchaseId = this.purchaseId;
    }
    
    this.purchaseOrderService.getAllPurchaseOrders(params).subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data);
          this.totalItems.set(response.pagination.total);
          this.isEmpty.set(this.tableData().length === 0);
        }
        this.isLoading.set(false);
      }, 
      error: (error) => {
        console.error('Error fetching purchase orders:', error);
        this.notificationService.error('Failed to load purchase orders');
        this.isLoading.set(false);
      }
    });
  }

  viewPurchaseDetails(purchase: any): void {
    this.router.navigate(['/purchase/view-purchase', purchase._id]);
  }

  onRowClick(row: any): void {
    // this.viewPurchaseDetails(row);
  }

  onActionClick(event: { action: string; item: any }): void {
    const { action, item } = event;
    switch (action) {
      case 'viewLpo':
        this.viewLpo(item);
        break;
      case 'downloadLpo':
        this.downloadLpo(item);
        break;
      case 'reIssue':
        this.reIssueLpo(item);
        break;
      case 'viewInvoice':
        this.viewInvoice(item);
        break;
      case 'viewPurchase':
        this.viewPurchaseDetails(item);
        break;
      case 'viewDocuments':
        this.viewDocuments(item);
        break;
    }
  }

  viewLpo(lpo: any): void {
    console.log('Viewing LPO:', lpo);

    this.purchaseService.generatePDF(lpo, true).then((pdf) => {
      pdf.download(lpo.poNo);
    });
  }

  downloadLpo(lpo: any): void {
    console.log('Downloading LPO:', lpo);
    this.notificationService.info('Download functionality will be implemented soon');
    // TODO: Implement PDF download functionality
  }

  reIssueLpo(lpo: any): void {
    console.log('Re-issuing LPO:', lpo);
    // Navigate to re-issue LPO page
    this.router.navigate(['/purchase-order/re-issue', lpo._id]);
  }

  viewInvoice(lpo: any): void {
    console.log('Viewing invoice for LPO:', lpo);
    this.notificationService.info('Invoice functionality will be implemented soon');
    // TODO: Implement invoice view functionality
  }

  viewDocuments(purchase: any): void {
    console.log('Viewing documents for purchase:', purchase);
  }

  onSearch(searchInput: any) {
    const searchTerm = typeof searchInput === 'string' ? searchInput : searchInput?.target?.value || '';
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    
    const searchParams: any = {
      page: 1,
      row: currentState.row,
      status: this.selectedStatus(),
      search: searchTerm
    };

    // Add purchaseId filter if provided
    if (this.purchaseId) {
      searchParams.purchaseId = this.purchaseId;
    }

    this.purchaseOrderService.getAllPurchaseOrders(searchParams).subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data);
          this.totalItems.set(response.pagination.total);
          this.isEmpty.set(this.tableData().length === 0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to search purchase orders');
        console.error('Error searching purchase orders:', error);
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(page: any): void {
    const pageNumber = typeof page === 'number' ? page : parseInt(page);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: pageNumber, 
      row: currentState.row, 
      total: currentState.total 
    });
    this.getPurchases();
  }

  onRowsPerPageChange(rows: any): void {
    const rowCount = typeof rows === 'number' ? rows : parseInt(rows);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: 1, 
      row: rowCount, 
      total: currentState.total 
    });
    this.getPurchases();
  }

  onStatusFilterChange(): void {
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({ 
      page: 1, 
      row: currentState.row, 
      total: currentState.total 
    });
    this.getPurchases();
  }
}
