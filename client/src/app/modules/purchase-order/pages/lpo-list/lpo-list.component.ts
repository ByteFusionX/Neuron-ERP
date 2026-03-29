import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { GrnListModalComponent, GrnListModalData } from 'src/app/shared/components/grn-list-modal/grn-list-modal.component';

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
  @Output() lpoListUpdated = new EventEmitter<void>(); // Emit when LPO list changes (revoke, create, etc.)

  private router = inject(Router);
  private paginationService = inject(PaginationService);
  private purchaseService = inject(PurchaseService);
  private purchaseOrderService = inject(PurchaseOrderService);
  private grnService = inject(GrnService);
  private employeeService = inject(EmployeeService);
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
  canInitiateLPO = signal<boolean>(false);
  canApprovePOs = signal<boolean>(false);
  canReissueAndRevoke = signal<boolean>(false);

  constructor(
    private _dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.checkPrivileges();
    this.setupTableColumns()
    this.getPurchases()
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canInitiateLPO.set(data.category.privileges.purchaseOrder?.canInitiateLPO || false);
        this.canApprovePOs.set(data.category.privileges.purchaseOrder?.canApprovePOs || false);
        this.canReissueAndRevoke.set(data.category.privileges.purchaseOrder?.canReissueAndRevoke || false);
      }
    });
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
        cellRenderer: (item: any) => {
          const value =
            typeof item.totalLpoValue === 'number'
              ? item.totalLpoValue
              : parseFloat(item.totalLpoValue) || 0;
          const currency =
            item.currency ||
            item.quoteId?.currency ||
            item.quoteId?.dealData?.currency ||
            item.purchaseId?.jobId?.quoteId?.currency ||
            item.purchaseId?.jobId?.quoteId?.dealData?.currency ||
            '';
          const formattedValue = value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          if (currency) {
            return `${formattedValue} ${currency}`;
          }
          return formattedValue;
        }
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
        headerClass: 'text-center',
      },
      {
        key: 'comments',
        label: 'Comments',
        type: 'text',
        headerClass: 'text-center',
        cellRenderer: (item: any) => {
          if (item.approvedHistory && item.approvedHistory.length > 0) {
            const lastApproval = item.approvedHistory[item.approvedHistory.length - 1];
            return lastApproval.reason || '-';
          }
          if (item.rejectedHistory && item.rejectedHistory.length > 0) {
            const lastRejection = item.rejectedHistory[item.rejectedHistory.length - 1];
            return lastRejection.reason || '-';
          }
          return '-';
        }
      },
      {
        key: 'sendForApproval',
        label: 'Send for Approval',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroPaperAirplane',
            tooltip: 'Send for Approval',
            action: 'sendForApproval',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-green-500 hover:border-green-700 text-green-500 text-sm rounded-full font-medium',
            condition: (item: any) => (item.poStatus === 'Draft' || item.poStatus === 'Rejected') && this.canInitiateLPO()
          },
        ]
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroPencil',
            tooltip: 'Edit LPO',
            action: 'editLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-blue-300 hover:border-blue-500 text-blue-600 text-sm rounded-full font-medium',
            condition: (item: any) => item.poStatus === 'Draft' || item.poStatus === 'Rejected'
          },
          {
            icon: 'heroEye',
            tooltip: 'View LPO',
            action: 'viewLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium',
            condition: (item: any) => item.poStatus === 'Approved' || item.poStatus === 'Closed'
          },
          {
            icon: 'heroArrowDownTray',
            tooltip: 'Download LPO',
            action: 'downloadLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium',
            condition: (item: any) => item.poStatus === 'Approved' || item.poStatus === 'Closed'
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
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-orange-500 hover:border-orange-700 text-orange-500 text-sm rounded-full font-medium',
            condition: (item: any) => item.poStatus !== 'Draft' && item.poStatus !== 'Rejected' && item.poStatus !== 'Approved' && item.poStatus !== 'Closed' && this.canReissueAndRevoke()
          },
        ]
      },
      {
        key: 'actions',
        label: 'Revoke LPO',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroTrash',
            tooltip: 'Revoke LPO',
            action: 'revokeLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-red-500 hover:border-red-700 text-red-500 text-sm rounded-full font-medium',
            condition: (item: any) => item.poStatus !== 'Approved' && item.poStatus !== 'Closed' && this.canReissueAndRevoke()
          },
        ]
      },
      {
        key: 'grn',
        label: 'GRN',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroClipboardDocumentCheck',
            tooltip: 'Create GRN',
            action: 'createGrn',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-green-500 hover:border-green-700 text-green-500 text-sm rounded-full font-medium',
            condition: (item: any) => (item.poStatus === 'Approved' || item.poStatus === 'Closed') && item.hasBalanceQty
          },
          {
            icon: 'heroEye',
            tooltip: 'View GRN',
            action: 'viewGrn',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-blue-500 hover:border-blue-700 text-blue-500 text-sm rounded-full font-medium',
            condition: (item: any) => (item.poStatus === 'Approved' || item.poStatus === 'Closed') && item.grnCount > 0
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
            condition: (item: any) => item.poStatus === 'Approved' || item.poStatus === 'Closed'
          },
        ],

      }
    ]

    this.defaultColumns = [
      'poDate', 'supplierId.supplierName', 'poNo', 'jobId.jobId', 'totalLpoValue', 'createdBy.firstName', 'poStatus', 'comments', 'sendForApproval', 'grn', 'actions'
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
          const lpos = response.data;
          this.checkGrnExistence(lpos).then((enrichedLpos) => {
            this.tableData.set(enrichedLpos);
            this.totalItems.set(response.pagination.total);
            this.isEmpty.set(enrichedLpos.length === 0);
          });
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

  async checkGrnExistence(lpos: any[]): Promise<any[]> {
    const enrichedLpos = await Promise.all(
      lpos.map(async (lpo) => {
        try {
          const response = await firstValueFrom(this.grnService.getAllGRNsByLpoId(lpo._id));
          const grns = response?.success && response?.data ? response.data : [];
          const grnCount = grns.length;
          const latestGrnId = grnCount > 0 ? grns[0]._id : null;
          
          let hasBalanceQty = false;
          if (lpo.items && Array.isArray(lpo.items) && grnCount > 0) {
            lpo.items.forEach((lpoItem: any) => {
              const orderedQty = lpoItem.quantity || 0;
              let totalAcceptedQty = 0;
              
              grns.forEach((grn: any) => {
                if (grn.items && Array.isArray(grn.items)) {
                  grn.items.forEach((grnItem: any) => {
                    const partNoMatch = this.matchPartNo(grnItem.partNo, lpoItem?.partNo);
                    const descriptionMatch = grnItem.itemDescription === lpoItem?.detail;
                    
                    if (partNoMatch || descriptionMatch) {
                      totalAcceptedQty += grnItem.acceptedQty || 0;
                    }
                  });
                }
              });
              
              const balanceQty = orderedQty - totalAcceptedQty;
              if (balanceQty > 0) {
                hasBalanceQty = true;
              }
            });
          } else if (lpo.items && Array.isArray(lpo.items) && grnCount === 0) {
            hasBalanceQty = lpo.items.some((item: any) => (item.quantity || 0) > 0);
          }
          
          return {
            ...lpo,
            hasGrn: grnCount > 0,
            grnId: latestGrnId,
            grnCount: grnCount,
            hasBalanceQty: hasBalanceQty
          };
        } catch (error) {
          const hasBalanceQty = lpo.items && Array.isArray(lpo.items) 
            ? lpo.items.some((item: any) => (item.quantity || 0) > 0)
            : false;
          return {
            ...lpo,
            hasGrn: false,
            grnId: null,
            grnCount: 0,
            hasBalanceQty: hasBalanceQty
          };
        }
      })
    );
    return enrichedLpos;
  }

  matchPartNo(grnPartNo: any, lpoPartNo: any): boolean {
    const formatPartNo = (partNo: any): string => {
      if (!partNo) return '';
      if (typeof partNo === 'string') return partNo;
      if (partNo.partNo) return partNo.partNo;
      return '';
    };
    
    return formatPartNo(grnPartNo) === formatPartNo(lpoPartNo);
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
      case 'editLpo':
        this.editLpo(item);
        break;
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
      case 'sendForApproval':
        this.sendForApproval(item);
        break;
      case 'viewPurchase':
        this.viewPurchaseDetails(item);
        break;
      case 'viewDocuments':
        this.viewDocuments(item);
        break;
      case 'revokeLpo':
        this.revokeLpo(item);
        break;
      case 'createGrn':
        this.createGrn(item);
        break;
      case 'viewGrn':
        this.viewGrn(item);
        break;
    }
  }

  editLpo(lpo: any): void {
    if (lpo.purchaseId) {
      const purchaseId = lpo.purchaseId._id || lpo.purchaseId;
      this.router.navigate(['/purchase/issue-lpo', purchaseId, 'edit', lpo._id]);
    }
  }

  async viewLpo(lpo: any) {
    const pdfDoc = await this.purchaseService.generatePDF(lpo, true)
    pdfDoc.getBlob((blob: Blob) => {
      let url = window.URL.createObjectURL(blob);
      this._dialog.open(PdfPreviewComponent, { data: { url: url, formatedQuote: lpo, type: 'purchase' } });
    });
  }

  downloadLpo(lpo: any): void {
    this.purchaseService.generatePDF(lpo, true).then((pdf) => {
      pdf.download(lpo.poNo);
    });
  }

  reIssueLpo(lpo: any): void {
    if (lpo.purchaseId) {
      const purchaseId = lpo.purchaseId._id || lpo.purchaseId;
      this.router.navigate(['/purchase/issue-lpo', purchaseId, 'reissue', lpo._id]);
    }
  }

  createGrn(lpo: any): void {
    this.router.navigate(['/purchase-order/create-grn', lpo._id]);
  }

  viewGrn(lpo: any): void {
    this.grnService.getAllGRNsByLpoId(lpo._id).subscribe({
      next: (response: any) => {
        const grns = response?.success && response?.data ? response.data : [];
        const purchaseId = lpo.purchaseId?._id || lpo.purchaseId || '';
        
        const modalData: GrnListModalData = {
          lpoId: lpo._id,
          lpoNo: lpo.poNo || 'N/A',
          grns: grns,
          hasBalanceQty: lpo.hasBalanceQty || false,
          purchaseId: purchaseId
        };

        const dialogRef = this._dialog.open(GrnListModalComponent, {
          data: modalData,
          width: '900px',
          maxHeight: '90vh',
          disableClose: false
        });

        dialogRef.afterClosed().subscribe(() => {
        });
      },
      error: (error) => {
        console.error('Error loading GRNs:', error);
        this.notificationService.error('Failed to load GRNs');
      }
    });
  }

  revokeLpo(lpo: any): void {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Revoke LPO',
        description: `Are you sure you want to revoke (permanently delete) LPO "${lpo.poNo}"? This action cannot be undone and will permanently delete the LPO.`,
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.purchaseOrderService.revokePurchaseOrder(lpo._id).subscribe({
          next: (response: any) => {
            if (response.success) {
              this.notificationService.success('LPO revoked successfully');
              this.getPurchases(); // Refresh the list
              // Notify parent component that LPO list has been updated
              this.lpoListUpdated.emit();
            } else {
              this.notificationService.error('Failed to revoke LPO');
            }
          },
          error: (error: any) => {
            console.error('Error revoking LPO:', error);
            this.notificationService.error('Failed to revoke LPO: ' + (error.error?.message || error.message));
          }
        });
      }
    });
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
        console.log('Files to upload:', result.files);
        
        // Create FormData for file upload
        const formData = new FormData();
        
        // Separate new files (with File objects) from existing files (metadata only)
        const newFiles: File[] = [];
        const existingFiles: any[] = [];
        
        result.files.forEach((file: any) => {
          if (file.file) {
            // New file to upload (has File object)
            newFiles.push(file.file);
          } else if (file.isUploaded && file.fileName) {
            // Existing file - keep metadata (no File object, but has fileName)
            existingFiles.push({
              fileName: file.fileName,
              originalname: file.originalname
            });
          }
        });
        
        // Append new files to FormData (backend expects 'files' field name)
        newFiles.forEach(file => {
          formData.append('files', file);
        });
        
        // Append existing files metadata if any
        if (existingFiles.length > 0) {
          formData.append('existingFiles', JSON.stringify(existingFiles));
        }
        
        // Call service to update LPO with invoice files
        this.purchaseOrderService.updateSupplierInvoices(lpo._id, formData).subscribe({
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

  sendForApproval(lpo: any): void {
    this.purchaseOrderService.updatePurchaseOrderStatus(lpo._id, 'Pending for Approval').subscribe({
      next: (response: any) => {
        if (response.success) {
          this.notificationService.success('LPO sent for approval successfully');
          this.getPurchases();
        } else {
          this.notificationService.error('Failed to send LPO for approval');
        }
      },
      error: (error: any) => {
        console.error('Error sending LPO for approval:', error);
        this.notificationService.error('Failed to send LPO for approval: ' + (error.error?.message || error.message));
      }
    });
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
