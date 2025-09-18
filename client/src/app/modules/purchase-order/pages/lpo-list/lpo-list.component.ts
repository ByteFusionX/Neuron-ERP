import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { QuotationPreviewComponent } from 'src/app/shared/components/quotation-preview/quotation-preview.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';

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

  constructor(
    private _dialog: MatDialog
  ) { }

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
        type: 'statusDropdown',
        headerClass: 'text-center',
        statusOptions: ['Open', 'Hold', 'Closed', 'Cancelled'],
        confirmationMessage: (oldValue: string, newValue: string) => 
          `Are you sure you want to change Purchase Order status from "${oldValue}" to "${newValue}"?`
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
            icon: 'heroCloudArrowUp',
            tooltip: 'Upload Invoice',
            action: 'uploadInvoice',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-violet-500 hover:border-violet-700 text-violet-500 text-sm rounded-full font-medium',
            condition: (item: any) => item.poStatus === 'Closed'
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
      case 'uploadInvoice':
        this.uploadInvoice(item);
        break;
      case 'viewPurchase':
        this.viewPurchaseDetails(item);
        break;
      case 'viewDocuments':
        this.viewDocuments(item);
        break;
    }
  }

  async viewLpo(lpo: any) {
    const pdfDoc = await this.purchaseService.generatePDF(lpo, true)
    pdfDoc.getBlob((blob: Blob) => {
      let url = window.URL.createObjectURL(blob);
      this._dialog.open(QuotationPreviewComponent, { data: { url: url, formatedQuote: lpo, type: 'purchase' } });
    });
  }

  downloadLpo(lpo: any): void {
    this.purchaseService.generatePDF(lpo, true).then((pdf) => {
      pdf.download(lpo.poNo);
    });
  }

  reIssueLpo(lpo: any): void {
    console.log('Re-issuing LPO:', lpo);
    // Navigate to re-issue LPO page
    this.router.navigate(['/purchase-order/re-issue', lpo._id]);
  }

  viewInvoice(lpo: any): void {
    console.log('Viewing invoice for LPO:', lpo);
    
    if (!lpo.supplierInvoices || lpo.supplierInvoices.length === 0) {
      this.notificationService.info('No invoices uploaded for this LPO');
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Supplier Invoices - ${lpo.poNo}`,
      existingFiles: lpo.supplierInvoices || [],
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      showActions: {
        upload: false,
        download: true,
        view: true,
        delete: false
      }
    };

    const dialogRef = this._dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        console.log('Invoice view completed');
      }
    });
  }

  uploadInvoice(lpo: any): void {
    console.log('Uploading invoice for LPO:', lpo);
    
    const modalData: FileUploadModalData = {
      title: `Upload Supplier Invoice - ${lpo.poNo}`,
      existingFiles: lpo.supplierInvoices || [],
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      showActions: {
        upload: true,
        download: true,
        view: true,
        delete: true
      }
    };

    const dialogRef = this._dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        console.log('Files uploaded:', result.files);
        
        // Update the LPO with new invoice files
        const updateData = {
          supplierInvoices: result.files
        };
        
        // Call service to update LPO with invoice files
        this.purchaseOrderService.updateSupplierInvoices(lpo._id, updateData).subscribe({
          next: (response: any) => {
            if (response.success) {
              this.notificationService.success('Supplier invoices uploaded successfully');
              this.getPurchases(); // Refresh the list
            } else {
              this.notificationService.error('Failed to upload invoices');
            }
          },
          error: (error: any) => {
            console.error('Error uploading invoices:', error);
            this.notificationService.error('Failed to upload invoices');
          }
        });
      }
    });
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

  onStatusChange(event: any): void {
    if (event.type === 'statusChange' && event.column === 'poStatus') {
      this.updatePurchaseOrderStatus(event.item._id, event.newValue);
    }
  }

  updatePurchaseOrderStatus(lpoId: string, newStatus: string): void {
    this.purchaseOrderService.updatePurchaseOrderStatus(lpoId, newStatus).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.notificationService.success(`Purchase order status updated to "${newStatus}"`);
          this.getPurchases(); // Refresh the list
        } else {
          this.notificationService.error('Failed to update status');
        }
      },
      error: (error: any) => {
        console.error('Error updating status:', error);
        this.notificationService.error('Failed to update status: ' + (error.error?.message || error.message));
      }
    });
  }
}
