import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CreateStockHoldComponent } from './modals/create-stock-hold/create-stock-hold.component';
import { ResolveStockHoldComponent } from './modals/resolve-stock-hold/resolve-stock-hold.component';
import { DisputeStockHoldComponent } from './modals/dispute-stock-hold/dispute-stock-hold.component';
import { ResolveDisputeComponent } from './modals/resolve-dispute/resolve-dispute.component';
import { ViewGrnDetailsModalComponent } from 'src/app/modules/stocks/modals/view-grn-details-modal/view-grn-details-modal.component';
import { ViewPoDetailsModalComponent } from 'src/app/modules/stocks/modals/view-po-details-modal/view-po-details-modal.component';

type StockHoldTab = 'pending' | 'holds';

@Component({
  selector: 'app-grn-stock-holds',
  standalone: true,
  imports: [TableComponent, CommonModule, RouterModule, ButtonComponent, IconsModule, MatMenuModule],
  templateUrl: './stock-holds.component.html',
  styleUrl: './stock-holds.component.css',
  providers: [PaginationService]
})
export class GrnStockHoldsComponent implements OnInit {
  private grnService = inject(GrnService);
  private stockHoldService = inject(StockHoldService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private dialog = inject(MatDialog);

  activeTab = signal<StockHoldTab>('pending');

  canInitiateHold = signal<boolean>(false);

  // Pending Rejections tab state
  pendingTableData = signal<any[]>([]);
  pendingTableColumns: TableColumn[] = [];
  pendingDefaultColumns: string[] = [];
  pendingIsLoading = signal<boolean>(false);
  pendingIsEmpty = signal<boolean>(false);
  pendingTotalItems = signal<number>(0);

  // Stock Holds tab state
  holdsTableData = signal<any[]>([]);
  holdsTableColumns: TableColumn[] = [];
  holdsDefaultColumns: string[] = [];
  holdsIsLoading = signal<boolean>(false);
  holdsIsEmpty = signal<boolean>(false);
  holdsTotalItems = signal<number>(0);

  ngOnInit(): void {
    this.checkPrivileges();
    this.setupPendingColumns();
    this.setupHoldsColumns();
    this.getRejections();
    this.loadStockHolds();
  }

  setTab(tab: StockHoldTab): void {
    this.activeTab.set(tab);
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        const privileges = data.category.privileges as any;
        const hasGrnView = privileges.grn?.viewReport && privileges.grn.viewReport !== 'none';
        this.canInitiateHold.set(privileges.stockHold?.canInitiateHold || hasGrnView || false);
      }
    });
  }

  // ---------- Pending Rejections tab ----------

  setupPendingColumns(): void {
    this.pendingTableColumns = [
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
            tooltip: 'Resolve — Initiate Stock Hold',
            action: 'initiateHold',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-orange-300 hover:border-orange-500 text-orange-600 text-sm rounded-full font-medium',
            condition: () => this.canInitiateHold()
          }
        ]
      }
    ];

    this.pendingDefaultColumns = [
      'grnDate', 'grnNo', 'purchaseOrderId.poNo', 'purchaseOrderId.supplierId.supplierName',
      'itemDescription', 'partNo', 'rejectedQty', 'rejectionReason', 'warehouse.wareHouseName', 'actions'
    ];
  }

  getRejections(): void {
    this.pendingIsLoading.set(true);

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
          this.pendingTableData.set(rows);
          this.pendingTotalItems.set(rows.length);
          this.pendingIsEmpty.set(rows.length === 0);
        }
        this.pendingIsLoading.set(false);
      },
      error: (error) => {
        console.error('Error fetching GRN rejections:', error);
        this.notificationService.error('Failed to load GRN rejections');
        this.pendingIsLoading.set(false);
      }
    });
  }

  onPendingActionClick(event: { action: string, item: any, event: Event }): void {
    event.event?.stopPropagation?.();
    if (event.action === 'initiateHold') {
      this.openInitiateHoldModal(event.item);
    }
  }

  openInitiateHoldModal(row: any): void {
    const dialogRef = this.dialog.open(CreateStockHoldComponent, {
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
        this.loadStockHolds();
      }
    });
  }

  // ---------- Stock Holds tab ----------

  private static readonly LOGISTICS_LABELS: Record<string, string> = {
    PhysicalReturn: 'Physical Return',
    SupplierPickup: 'Supplier Pickup',
    Courier: 'Courier',
    NoPhysicalReturn: 'No Physical Return'
  };

  private static readonly RESOLUTION_LABELS: Record<string, string> = {
    Replacement: 'Replacement',
    AlternateSupplierSourcing: 'Alternate Supplier Sourcing',
    CreditOnly: 'Credit Only',
    Disposed: 'Disposed'
  };

  private static readonly DISPUTE_LABELS: Record<string, string> = {
    None: 'No Dispute',
    SupplierDisputed: 'Supplier Disputed',
    DisputeResolved: 'Dispute Resolved'
  };

  private static readonly STATUS_LABELS: Record<string, string> = {
    AwaitingReturn: 'Awaiting Return',
    AwaitingReplacement: 'Awaiting Replacement',
    PartiallyResolved: 'Partially Resolved',
    Resolved: 'Resolved',
    Disposed: 'Disposed'
  };

  logisticsLabel(value: string): string {
    return GrnStockHoldsComponent.LOGISTICS_LABELS[value] || value || '-';
  }

  resolutionLabel(value: string): string {
    return GrnStockHoldsComponent.RESOLUTION_LABELS[value] || (value ? value : 'Not decided yet');
  }

  disputeLabel(value: string): string {
    return GrnStockHoldsComponent.DISPUTE_LABELS[value] || value || '-';
  }

  statusLabel(value: string): string {
    return GrnStockHoldsComponent.STATUS_LABELS[value] || value || '-';
  }

  setupHoldsColumns(): void {
    this.holdsTableColumns = [
      { key: 'holdNo', label: 'Hold No', type: 'text' },
      {
        key: 'grnId.grnNo',
        label: 'GRN ID',
        type: 'text',
        cellRenderer: (item: any) => item?.grnId?.grnNo || '-',
        cellClass: 'text-violet-600 font-medium',
        clickable: true,
        clickableValue: (item: any) => !!item?.grnId,
        clickFunction: (item: any) => this.openGrnDetails(item)
      },
      { key: 'supplierId.supplierName', label: 'Supplier', type: 'text' },
      { key: 'itemDescription', label: 'Item', type: 'text' },
      { key: 'rejectedQty', label: 'Rejected Qty', type: 'text' },
      { key: 'resolvedQty', label: 'Resolved Qty', type: 'text' },
      { key: 'unresolvedQty', label: 'Unresolved Qty', type: 'text' },
      { key: 'logisticsType', label: 'Logistics', type: 'text', cellRenderer: (item: any) => this.logisticsLabel(item?.logisticsType) },
      { key: 'resolutionType', label: 'Resolution', type: 'text', cellRenderer: (item: any) => this.resolutionLabel(item?.resolutionType) },
      { key: 'disputeStatus', label: 'Dispute', type: 'text', cellRenderer: (item: any) => this.disputeLabel(item?.disputeStatus) },
      { key: 'status', label: 'Status', type: 'text', cellRenderer: (item: any) => this.statusLabel(item?.status) },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroCheckCircle',
            tooltip: 'Resolve',
            action: 'resolve',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-green-200 hover:bg-green-50 flex justify-center items-center text-green-600',
            condition: (item: any) => this.canInitiateHold() && item?.unresolvedQty > 0 && item?.disputeStatus !== 'SupplierDisputed'
          },
          {
            icon: 'heroFlag',
            tooltip: 'Mark Supplier Disputed',
            action: 'dispute',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-red-200 hover:bg-red-50 flex justify-center items-center text-red-600',
            condition: (item: any) => this.canInitiateHold() && item?.disputeStatus === 'None'
          },
          {
            icon: 'heroShieldCheck',
            tooltip: 'Resolve Dispute',
            action: 'resolveDispute',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-blue-200 hover:bg-blue-50 flex justify-center items-center text-blue-600',
            condition: (item: any) => this.canInitiateHold() && item?.disputeStatus === 'SupplierDisputed'
          }
        ]
      }
    ];

    this.holdsDefaultColumns = [
      'holdNo', 'grnId.grnNo', 'supplierId.supplierName', 'itemDescription', 'rejectedQty',
      'resolvedQty', 'unresolvedQty', 'logisticsType', 'resolutionType', 'disputeStatus', 'status', 'actions'
    ];
  }

  loadStockHolds(): void {
    this.holdsIsLoading.set(true);
    this.stockHoldService.getStockHolds().subscribe({
      next: (response) => {
        if (response.success) {
          this.holdsTableData.set(response.data || []);
          this.holdsTotalItems.set((response.data || []).length);
          this.holdsIsEmpty.set((response.data || []).length === 0);
        }
        this.holdsIsLoading.set(false);
      },
      error: () => {
        this.notificationService.error('Failed to load stock holds');
        this.holdsIsLoading.set(false);
      }
    });
  }

  onHoldsActionClick(event: { action: string, item: any, event: Event }): void {
    event.event?.stopPropagation?.();
    if (event.action === 'resolve') {
      this.openResolveModal(event.item);
    } else if (event.action === 'dispute') {
      this.openDisputeModal(event.item);
    } else if (event.action === 'resolveDispute') {
      this.openResolveDisputeModal(event.item);
    }
  }

  openResolveModal(item: any): void {
    const dialogRef = this.dialog.open(ResolveStockHoldComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: item }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStockHolds();
      }
    });
  }

  openGrnDetails(item: any): void {
    if (!item?.grnId) return;
    const grnId = typeof item.grnId === 'string' ? item.grnId : item.grnId._id;
    this.dialog.open(ViewGrnDetailsModalComponent, {
      data: { grnId },
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

  openDisputeModal(item: any): void {
    const dialogRef = this.dialog.open(DisputeStockHoldComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: item }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStockHolds();
      }
    });
  }

  openResolveDisputeModal(item: any): void {
    const dialogRef = this.dialog.open(ResolveDisputeComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { stockHold: item }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStockHolds();
      }
    });
  }

  onRowClick(_row: any): void {}
}
