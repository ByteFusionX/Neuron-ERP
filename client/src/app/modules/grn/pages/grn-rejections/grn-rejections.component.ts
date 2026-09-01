import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CreateSupplierReturnComponent } from './modals/create-supplier-return/create-supplier-return.component';
import { ViewGrnDetailsModalComponent } from 'src/app/modules/inventory/pages/stock-entries/modals/view-grn-details-modal/view-grn-details-modal.component';
import { ViewPoDetailsModalComponent } from 'src/app/modules/inventory/pages/stock-entries/modals/view-po-details-modal/view-po-details-modal.component';

@Component({
  selector: 'app-grn-rejections',
  standalone: true,
  imports: [TableComponent, CommonModule, RouterModule, ButtonComponent, IconsModule, MatMenuModule],
  templateUrl: './grn-rejections.component.html',
  styleUrl: './grn-rejections.component.css',
  providers: [PaginationService]
})
export class GrnRejectionsComponent implements OnInit {
  private grnService = inject(GrnService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private dialog = inject(MatDialog);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  canInitiateReturn = signal<boolean>(false);

  ngOnInit(): void {
    this.checkPrivileges();
    this.setupTableColumns();
    this.getRejections();
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        const privileges = data.category.privileges as any;
        const hasGrnView = privileges.grn?.viewReport && privileges.grn.viewReport !== 'none';
        this.canInitiateReturn.set(privileges.supplierReturn?.canInitiateReturn || hasGrnView || false);
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
        cellClass: 'text-violet-600 font-medium',
        clickable: true,
        clickableValue: (item: any) => !!item?.grnId,
        clickFunction: (item: any) => this.openGrnDetails(item)
      },
      {
        key: 'purchaseOrderId.poNo',
        label: 'LPO Number',
        type: 'text',
        cellClass: 'text-violet-600 font-medium',
        clickable: true,
        clickableValue: (item: any) => !!item?.purchaseOrderId?.poNo,
        clickFunction: (item: any) => this.openLpoDetails(item)
      },
      {
        key: 'purchaseOrderId.supplierId.supplierName',
        label: 'Supplier Name',
        type: 'text',
      },
      {
        key: 'itemDescription',
        label: 'Item Description',
        type: 'text',
      },
      {
        key: 'partNo',
        label: 'Part No',
        type: 'text',
        cellRenderer: (item: any) => (typeof item.partNo === 'string' ? item.partNo : item.partNo?.partNo) || '-',
      },
      {
        key: 'rejectedQty',
        label: 'Rejected Qty',
        type: 'text',
      },
      {
        key: 'rejectionReason',
        label: 'Rejection Reason',
        type: 'text',
      },
      {
        key: 'warehouse.wareHouseName',
        label: 'Warehouse',
        type: 'text',
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroArrowUturnLeft',
            tooltip: 'Resolve — Initiate Supplier Return',
            action: 'initiateReturn',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-orange-300 hover:border-orange-500 text-orange-600 text-sm rounded-full font-medium',
            condition: () => this.canInitiateReturn()
          }
        ]
      }
    ];

    this.defaultColumns = [
      'grnDate', 'grnNo', 'purchaseOrderId.poNo', 'purchaseOrderId.supplierId.supplierName',
      'itemDescription', 'partNo', 'rejectedQty', 'rejectionReason', 'warehouse.wareHouseName', 'actions'
    ];
  }

  getRejections(): void {
    this.isLoading.set(true);

    this.grnService.getGRNRejections().subscribe({
      next: (response) => {
        if (response.success) {
          const rows = (response.data || []).flatMap((grn: any) =>
            (grn.items || []).map((item: any) => ({
              grnId: grn.grnId,
              grnNo: grn.grnNo,
              grnDate: grn.grnDate,
              purchaseOrderId: grn.purchaseOrderId,
              warehouse: grn.warehouse,
              partNo: item.partNo,
              itemDescription: item.itemDescription,
              rejectedQty: item.rejectedQty,
              rejectionReason: item.rejectionReason || '-',
              itemIndex: item.itemIndex,
            }))
          );
          this.tableData.set(rows);
          this.totalItems.set(rows.length);
          this.isEmpty.set(rows.length === 0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error fetching GRN rejections:', error);
        this.notificationService.error('Failed to load GRN rejections');
        this.isLoading.set(false);
      }
    });
  }

  openGrnDetails(row: any): void {
    if (!row?.grnId) return;
    this.dialog.open(ViewGrnDetailsModalComponent, {
      data: { grnId: row.grnId },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  openLpoDetails(row: any): void {
    const poNo = row?.purchaseOrderId?.poNo;
    if (!poNo) return;
    this.dialog.open(ViewPoDetailsModalComponent, {
      data: { poNo },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  onActionClick(event: { action: string, item: any, event: Event }): void {
    event.event?.stopPropagation?.();
    if (event.action === 'initiateReturn') {
      this.openInitiateReturnModal(event.item);
    }
  }

  openInitiateReturnModal(row: any): void {
    const dialogRef = this.dialog.open(CreateSupplierReturnComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: {
        grnId: row.grnId,
        itemIndex: row.itemIndex,
        itemDescription: row.itemDescription,
        rejectedQty: row.rejectedQty
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.getRejections();
      }
    });
  }
}
