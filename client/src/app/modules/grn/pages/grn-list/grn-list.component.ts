import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ViewPurchaseRequestDetailsModalComponent, ViewPurchaseRequestDetailsModalData } from '../view-purchase-request-details-modal/view-purchase-request-details-modal.component';

@Component({
  selector: 'app-grn-list',
  standalone: true,
  imports: [TableComponent, CommonModule, RouterModule, ButtonComponent, IconsModule, MatMenuModule],
  templateUrl: './grn-list.component.html',
  styleUrl: './grn-list.component.css',
  providers: [PaginationService]
})
export class GrnListComponent implements OnInit {
  private paginationService = inject(PaginationService);
  private grnService = inject(GrnService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  constructor(private _dialog: MatDialog) {}

  ngOnInit(): void {
    this.setupTableColumns();
    this.getGRNs();
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
        cellRenderer: (item: any) => item?.jobId?.jobId || 'N/A',
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
        cellRenderer: (item: any) => this.formatEmployeeName(item?.createdBy),
      },
    ];

    this.defaultColumns = [
      'grnDate', 'grnNo', 'purchaseOrderId.poNo', 'purchaseOrderId.purchaseId.purchaseNo', 'purchaseOrderId.supplierId.supplierName',
      'jobId.jobId', 'warehouse.wareHouseName', 'acceptedQty', 'createdBy.firstName'
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

  formatEmployeeName(employee: any): string {
    if (!employee) return 'N/A';
    if (typeof employee === 'string') return employee;
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim();
    return name || employee.userName || employee.email || 'N/A';
  }

  onRowClick(row: any): void {
    this.viewDetails(row);
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
    const grnId = grn?._id;
    if (!grnId) {
      this.notificationService.info('Unable to open this GRN');
      return;
    }

    this.router.navigate(['/grn/view-grn', grnId], {
      queryParams: { returnUrl: this.router.url }
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
