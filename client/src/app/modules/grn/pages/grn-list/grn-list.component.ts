import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { ViewGrnDetailsModalComponent, ViewGrnDetailsModalData } from '../view-grn-details-modal/view-grn-details-modal.component';
import { ViewPurchaseRequestDetailsModalComponent, ViewPurchaseRequestDetailsModalData } from '../view-purchase-request-details-modal/view-purchase-request-details-modal.component';

@Component({
  selector: 'app-grn-list',
  standalone: true,
  imports: [TableComponent, CommonModule],
  templateUrl: './grn-list.component.html',
  styleUrl: './grn-list.component.css',
  providers: [PaginationService]
})
export class GrnListComponent implements OnInit {
  private paginationService = inject(PaginationService);
  private grnService = inject(GrnService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  canUploadInvoice = signal<boolean>(false);

  constructor(private _dialog: MatDialog) {}

  ngOnInit(): void {
    this.checkPrivileges();
    this.setupTableColumns();
    this.getGRNs();
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canUploadInvoice.set(data.category.privileges.grn?.canUploadInvoice || false);
      }
    });
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'grnDate',
        label: 'GRN Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
      },
      {
        key: 'grnNo',
        label: 'GRN Number',
        type: 'text',
      },
      {
        key: 'purchaseOrderId.poNo',
        label: 'LPO Number',
        type: 'text',
      },
      {
        key: 'purchaseOrderId.purchaseId.purchaseNo',
        label: 'PR Number',
        type: 'text',
        clickable: true,
        clickFunction: (item: any) => this.viewPurchaseRequestDetails(item),
        clickableValue: (item: any) => !!item?.purchaseOrderId?.purchaseId,
      },
      {
        key: 'purchaseOrderId.supplierId.supplierName',
        label: 'Supplier Name',
        type: 'text',
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
      },
      {
        key: 'warehouse.wareHouseName',
        label: 'Warehouse',
        type: 'text',
      },
      {
        key: 'acceptedQty',
        label: 'Accepted Qty',
        type: 'text',
        cellRenderer: (item: any) => {
          if (!item.items || !Array.isArray(item.items)) return '0';
          const totalQty = item.items.reduce((sum: number, i: any) => sum + (i.acceptedQty || 0), 0);
          return totalQty.toString();
        }
      },
      {
        key: 'createdBy.firstName',
        label: 'Created By',
        type: 'text',
      },
      {
        key: 'actions',
        label: 'View',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'GRN Details',
            action: 'viewDetails',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium',
          },
        ]
      },
      {
        key: 'supplierInvoiceActions',
        label: 'Uploads',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroDocumentArrowUp',
            tooltip: 'Supplier Invoice',
            action: 'uploadInvoice',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-violet-500 hover:border-violet-700 text-violet-500 text-sm rounded-full font-medium',
            condition: () => this.canUploadInvoice()
          },
          {
            icon: 'heroTruck',
            tooltip: 'Supplier DN',
            action: 'uploadDeliveryNote',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-blue-500 hover:border-blue-700 text-blue-500 text-sm rounded-full font-medium',
            condition: () => this.canUploadInvoice()
          },
        ]
      }
    ];

    this.defaultColumns = [
      'grnDate', 'grnNo', 'purchaseOrderId.poNo', 'purchaseOrderId.purchaseId.purchaseNo', 'purchaseOrderId.supplierId.supplierName',
      'jobId.jobId', 'warehouse.wareHouseName', 'acceptedQty', 'createdBy.firstName', 'actions', 'supplierInvoiceActions'
    ];
  }

  getGRNs(): void {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();

    const params: any = {
      page: currentState.page,
      row: currentState.row,
    };

    this.grnService.getAllGRNs(params).subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data);
          this.totalItems.set(response.pagination.total);
          this.isEmpty.set(response.data.length === 0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error fetching GRNs:', error);
        this.notificationService.error('Failed to load GRNs');
        this.isLoading.set(false);
      }
    });
  }

  onRowClick(row: any): void {}

  onActionClick(event: { action: string; item: any }): void {
    const { action, item } = event;
    switch (action) {
      case 'viewDetails':
        this.viewDetails(item);
        break;
      case 'viewInvoice':
        this.viewInvoice(item);
        break;
      case 'uploadInvoice':
        this.uploadInvoice(item);
        break;
      case 'uploadDeliveryNote':
        this.uploadDeliveryNote(item);
        break;
    }
  }

  viewPurchaseRequestDetails(grn: any): void {
    const purchaseRequest = grn?.purchaseOrderId?.purchaseId;
    const purchaseId = purchaseRequest?._id || purchaseRequest;

    if (!purchaseId) {
      this.notificationService.info('No Purchase Request linked to this GRN');
      return;
    }

    const modalData: ViewPurchaseRequestDetailsModalData = {
      purchaseId,
      purchaseOrderId: grn?.purchaseOrderId?._id || grn?.purchaseOrderId
    };
    this._dialog.open(ViewPurchaseRequestDetailsModalComponent, {
      data: modalData,
      width: '1000px',
      maxHeight: '90vh'
    });
  }

  viewDetails(grn: any): void {
    const modalData: ViewGrnDetailsModalData = { grn };
    this._dialog.open(ViewGrnDetailsModalComponent, {
      data: modalData,
      width: '900px',
      maxHeight: '90vh'
    });
  }

  viewInvoice(grn: any): void {
    if (!grn.supplierInvoices || grn.supplierInvoices.length === 0) {
      this.notificationService.info('No invoices uploaded for this GRN');
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Supplier Invoices - ${grn.grnNo}`,
      existingFiles: grn.supplierInvoices || [],
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      showActions: {
        upload: false,
        download: true,
        view: true,
        delete: false
      }
    };

    this._dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });
  }

  uploadInvoice(grn: any): void {
    const modalData: FileUploadModalData = {
      title: `Upload Supplier Invoice - ${grn.grnNo}`,
      existingFiles: grn.supplierInvoices || [],
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024,
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
        const formData = new FormData();
        const newFiles: File[] = [];
        const existingFiles: any[] = [];

        result.files.forEach((file: any) => {
          if (file.file) {
            newFiles.push(file.file);
          } else if (file.isUploaded && file.fileName) {
            existingFiles.push({
              fileName: file.fileName,
              originalname: file.originalname
            });
          }
        });

        newFiles.forEach(file => {
          formData.append('files', file);
        });

        if (existingFiles.length > 0) {
          formData.append('existingFiles', JSON.stringify(existingFiles));
        }

        this.grnService.updateSupplierInvoices(grn._id, formData).subscribe({
          next: (response: any) => {
            if (response.success) {
              this.notificationService.success('Supplier invoices uploaded successfully');
              this.getGRNs();
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

  uploadDeliveryNote(grn: any): void {
    const modalData: FileUploadModalData = {
      title: `Upload Supplier Delivery Note - ${grn.grnNo}`,
      existingFiles: grn.supplierDeliveryNotes || [],
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024,
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
        const formData = new FormData();
        const newFiles: File[] = [];
        const existingFiles: any[] = [];

        result.files.forEach((file: any) => {
          if (file.file) {
            newFiles.push(file.file);
          } else if (file.isUploaded && file.fileName) {
            existingFiles.push({
              fileName: file.fileName,
              originalname: file.originalname
            });
          }
        });

        newFiles.forEach(file => {
          formData.append('files', file);
        });

        if (existingFiles.length > 0) {
          formData.append('existingFiles', JSON.stringify(existingFiles));
        }

        this.grnService.updateSupplierDeliveryNotes(grn._id, formData).subscribe({
          next: (response: any) => {
            if (response.success) {
              this.notificationService.success('Supplier delivery notes uploaded successfully');
              this.getGRNs();
            } else {
              this.notificationService.error('Failed to upload delivery notes');
            }
          },
          error: (error: any) => {
            console.error('Error uploading delivery notes:', error);
            this.notificationService.error('Failed to upload delivery notes');
          }
        });
      }
    });
  }

  onSearch(searchInput: any): void {
    const searchTerm = typeof searchInput === 'string' ? searchInput : searchInput?.target?.value || '';
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();

    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    const params: any = {
      page: 1,
      row: currentState.row,
      search: searchTerm
    };

    this.grnService.getAllGRNs(params).subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data);
          this.totalItems.set(response.pagination.total);
          this.isEmpty.set(this.tableData().length === 0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to search GRNs');
        console.error('Error searching GRNs:', error);
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
    this.getGRNs();
  }

  onRowsPerPageChange(rows: any): void {
    const rowCount = typeof rows === 'number' ? rows : parseInt(rows);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: rowCount,
      total: currentState.total
    });
    this.getGRNs();
  }
}
