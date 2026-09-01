import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { SupplierReturnService } from 'src/app/core/services/supplier-return/supplier-return.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ResolveSupplierReturnComponent } from './modals/resolve-supplier-return/resolve-supplier-return.component';
import { DisputeSupplierReturnComponent } from './modals/dispute-supplier-return/dispute-supplier-return.component';
import { ResolveDisputeComponent } from './modals/resolve-dispute/resolve-dispute.component';
import { ViewGrnDetailsModalComponent } from 'src/app/modules/inventory/pages/stock-entries/modals/view-grn-details-modal/view-grn-details-modal.component';

@Component({
  selector: 'app-supplier-returns',
  standalone: true,
  imports: [TableComponent, CommonModule, RouterModule, ButtonComponent, IconsModule, MatMenuModule],
  templateUrl: './supplier-returns.component.html',
  providers: [PaginationService]
})
export class SupplierReturnsComponent implements OnInit {
  private supplierReturnService = inject(SupplierReturnService);
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
    this.loadReturns();
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

  private static readonly LOGISTICS_LABELS: Record<string, string> = {
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
    Initiated: 'Initiated',
    AwaitingReturn: 'Awaiting Return',
    AwaitingReplacement: 'Awaiting Replacement',
    PartiallyResolved: 'Partially Resolved',
    Resolved: 'Resolved',
    Disposed: 'Disposed'
  };

  logisticsLabel(value: string): string {
    return SupplierReturnsComponent.LOGISTICS_LABELS[value] || value || '-';
  }

  resolutionLabel(value: string): string {
    return SupplierReturnsComponent.RESOLUTION_LABELS[value] || (value ? value : 'Not decided yet');
  }

  disputeLabel(value: string): string {
    return SupplierReturnsComponent.DISPUTE_LABELS[value] || value || '-';
  }

  statusLabel(value: string): string {
    return SupplierReturnsComponent.STATUS_LABELS[value] || value || '-';
  }

  setupTableColumns(): void {
    this.tableColumns = [
      { key: 'supplierReturnNo', label: 'Return No', type: 'text' },
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
            condition: (item: any) => this.canInitiateReturn() && item?.unresolvedQty > 0 && item?.disputeStatus !== 'SupplierDisputed'
          },
          {
            icon: 'heroFlag',
            tooltip: 'Mark Supplier Disputed',
            action: 'dispute',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-red-200 hover:bg-red-50 flex justify-center items-center text-red-600',
            condition: (item: any) => this.canInitiateReturn() && item?.disputeStatus === 'None'
          },
          {
            icon: 'heroShieldCheck',
            tooltip: 'Resolve Dispute',
            action: 'resolveDispute',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-blue-200 hover:bg-blue-50 flex justify-center items-center text-blue-600',
            condition: (item: any) => this.canInitiateReturn() && item?.disputeStatus === 'SupplierDisputed'
          }
        ]
      }
    ];

    this.defaultColumns = [
      'supplierReturnNo', 'grnId.grnNo', 'supplierId.supplierName', 'itemDescription', 'rejectedQty',
      'resolvedQty', 'unresolvedQty', 'logisticsType', 'resolutionType', 'disputeStatus', 'status', 'actions'
    ];
  }

  loadReturns(): void {
    this.isLoading.set(true);
    this.supplierReturnService.getSupplierReturns().subscribe({
      next: (response) => {
        if (response.success) {
          this.tableData.set(response.data || []);
          this.totalItems.set((response.data || []).length);
          this.isEmpty.set((response.data || []).length === 0);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.notificationService.error('Failed to load supplier returns');
        this.isLoading.set(false);
      }
    });
  }

  onActionClick(event: { action: string, item: any, event: Event }): void {
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
    const dialogRef = this.dialog.open(ResolveSupplierReturnComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: { supplierReturn: item }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadReturns();
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

  openDisputeModal(item: any): void {
    const dialogRef = this.dialog.open(DisputeSupplierReturnComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { supplierReturn: item }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadReturns();
      }
    });
  }

  openResolveDisputeModal(item: any): void {
    const dialogRef = this.dialog.open(ResolveDisputeComponent, {
      width: '520px',
      maxWidth: '90vw',
      disableClose: true,
      data: { supplierReturn: item }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadReturns();
      }
    });
  }

  onRowClick(_row: any): void {}
}
