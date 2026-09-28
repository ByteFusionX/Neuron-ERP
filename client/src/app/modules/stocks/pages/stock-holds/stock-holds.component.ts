import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { StockEntryService, StockEntry, StockEntryQueryParams } from 'src/app/core/services/stock-entry/stock-entry.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ProductService } from 'src/app/core/services/product/product.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { BlockItemComponent } from '../../modals/block-item/block-item.component';
import { ViewBlockedItemsComponent } from '../../modals/view-blocked-items/view-blocked-items.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateStockComponent } from '../../modals/create-stock/create-stock.component';
import { ViewGrnDetailsModalComponent } from '../../modals/view-grn-details-modal/view-grn-details-modal.component';
import { ViewDnDetailsModalComponent } from '../../modals/view-dn-details-modal/view-dn-details-modal.component';
import { ViewPoDetailsModalComponent } from '../../modals/view-po-details-modal/view-po-details-modal.component';
import { ViewInvoiceDetailsModalComponent } from '../../modals/view-invoice-details-modal/view-invoice-details-modal.component';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';

@Component({
  selector: 'app-stock-holds',
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent,
    DetailOverviewComponent
  ],
  templateUrl: './stock-holds.component.html',
  styleUrl: './stock-holds.component.css',
  providers: [PaginationService, DatePipe]
})
export class StockHoldsComponent implements OnInit {
  @ViewChild('grid') grid!: DataGridComponent<StockEntry>;

  protected stockEntryService = inject(StockEntryService);
  protected router = inject(Router);
  protected toastr = inject(ToastrService);
  protected dialog = inject(MatDialog);
  protected paginationService = inject(PaginationService);
  protected productCategoryService = inject(ProductCategoryService);
  protected profileService = inject(ProfileService);
  protected warehouseService = inject(WarehouseService);
  protected productService = inject(ProductService);
  protected supplierService = inject(SupplierService);
  protected stockHoldService = inject(StockHoldService);
  protected datePipe = inject(DatePipe);

  private static readonly STATUS_LABELS: Record<string, string> = {
    OnHold: 'On Hold',
    PartiallyResolved: 'Partially Resolved',
    Resolved: 'Resolved',
    Disposed: 'Disposed'
  };

  readonly isQuarantineView = true;
  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Stock Holds' }];

  statusLabel(value: string): string {
    return StockHoldsComponent.STATUS_LABELS[value] || value || '-';
  }

  tableData = signal<StockEntry[]>([]);
  columns: DataGridColumn<StockEntry>[] = [];
  rowActions: DataGridRowAction<StockEntry>[] = [];
  isLoading = signal<boolean>(false);
  totalItems = signal<number>(0);

  categoryOptions = signal<{ label: string; value: string }[]>([]);
  segmentOptions = signal<{ label: string; value: string }[]>([]);
  warehouseOptions = signal<{ label: string; value: string }[]>([]);
  productOptions = signal<{ label: string; value: string }[]>([]);
  supplierOptions = signal<{ label: string; value: string }[]>([]);

  readonly detailTabs = [{ id: 'overview', label: 'Overview', icon: 'info' }];
  detailTitle = (r: StockEntry) => r.partNo?.partNo ?? r.itemCode ?? '';
  detailSubtitle = (r: StockEntry) => r.productDescription ?? '';

  page = 1;
  row = 10;
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  searchTerm = '';
  protected appliedFilters: Record<string, any> = {};

  ngOnInit(): void {
    this.setupColumns();
    this.buildRowActions();
    this.loadFilterOptions();
    this.loadStockEntries();
  }

  loadFilterOptions(): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        const options = (categories ?? []).map(category => ({ label: category.categoryName, value: category._id as string }));
        this.categoryOptions.set(options);
        this.setColumnOptions('productCategory', options);
      },
      error: () => this.toastr.error('Failed to load product categories')
    });

    this.profileService.getDepartments().subscribe({
      next: (departments) => {
        const options = (departments ?? []).map(department => ({ label: department.departmentName, value: department._id as string }));
        this.segmentOptions.set(options);
        this.setColumnOptions('productSegment', options);
      },
      error: () => this.toastr.error('Failed to load product segments')
    });

    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        const options = (warehouses ?? []).map(wh => ({ label: wh.wareHouseName, value: wh._id as string }));
        this.warehouseOptions.set(options);
        this.setColumnOptions('targetWarehouse', options);
      },
      error: () => this.toastr.error('Failed to load warehouses')
    });

    this.productService.getProducts().subscribe({
      next: (response) => {
        const products = response.data?.products ?? [];
        const options = products.map((product: any) => ({ label: `${product.partNo} - ${product.productDescription}`, value: product._id as string }));
        this.productOptions.set(options);
        this.setColumnOptions('partNo', options);
      },
      error: () => this.toastr.error('Failed to load products')
    });

    this.supplierService.supplierList().subscribe({
      next: (response: any) => {
        const suppliers = response.data || response || [];
        const options = suppliers.map((supplier: any) => ({ label: supplier.supplierName, value: supplier._id as string }));
        this.supplierOptions.set(options);
        this.setColumnOptions('supplierName', options);
      },
      error: () => this.toastr.error('Failed to load suppliers')
    });
  }

  private setColumnOptions(key: string, editorOptions: { label: string; value: any }[]): void {
    this.columns = this.columns.map((c) => (c.key === key ? { ...c, editorOptions } : c));
  }

  setupColumns(): void {
    this.columns = [
      { key: 'dateOfPurchase', label: 'Date Of Purchase', type: 'date', sortable: true },
      { key: 'itemCode', label: 'Item Code', valueGetter: (r) => r.itemCode || r.partNo?.itemCode || '' },
      { key: 'partNo', label: 'Part No', sortable: true, valueGetter: (r) => r.partNo?.partNo || '' },
      { key: 'jobId', label: 'Job No', valueGetter: (r: any) => r.jobId?.jobId || '' },
      { key: 'supplierLpoNo', label: 'PO No', sortable: true, cellClass: () => 'text-violet-600 dark:text-violet-400 font-medium' },
      { key: 'grn', label: 'GRN No', sortable: true, valueGetter: (r: any) => r.grn?.grnNo || 'N/A', cellClass: () => 'text-violet-600 dark:text-violet-400 font-medium' },
      { key: 'dn', label: 'DN No', valueGetter: (r: any) => r.isQuarantined ? (r.dn?.dnNo || 'N/A') : 'N/A', cellClass: () => 'text-violet-600 dark:text-violet-400 font-medium' },
      { key: 'invoiceNo', label: 'Invoice No', valueGetter: (r: any) => (r.invoiceNos?.length ? r.invoiceNos.join(', ') : 'N/A'), cellClass: () => 'text-violet-600 dark:text-violet-400 font-medium' },
      { key: 'productDescription', label: 'Description', sortable: true },
      { key: 'supplierName', label: 'Supplier', sortable: true, valueGetter: (r: any) => r.supplierName?.supplierName || '' },
      { key: 'targetWarehouse', label: 'Warehouse', sortable: true, valueGetter: (r: any) => r.targetWarehouse?.wareHouseName || '' },
      { key: 'rejectedQty', label: 'Rejected Qty', type: 'number', sortable: true, valueGetter: (r: any) => r.quantity ?? 0 },
      { key: 'resolvedQty', label: 'Resolved Qty', type: 'number', valueGetter: (r: any) => r.supplierReturn?.resolvedQty ?? 0 },
      { key: 'unresolvedQty', label: 'Unresolved Qty', type: 'number', valueGetter: (r: any) => r.supplierReturn?.unresolvedQty ?? 0 },
      { key: 'status', label: 'Status', valueGetter: (r: any) => r.supplierReturn ? this.statusLabel(r.supplierReturn.status) : '-' },
      { key: 'quarantineReason', label: 'Hold Reason', valueGetter: (r: any) => r.isQuarantined ? (r.quarantineReason || '-') : '' },
      { key: 'remarks', label: 'Remarks', sortable: true },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'viewPo', label: 'View PO', icon: 'eye', quick: true, hidden: (r) => !r.supplierLpoNo },
      { id: 'viewGrn', label: 'View GRN', icon: 'eye', quick: true, hidden: (r: any) => !r.grn?._id },
      { id: 'viewDn', label: 'View DN', icon: 'eye', quick: true, hidden: (r: any) => !(r.isQuarantined && r.dn?._id) },
      { id: 'viewInvoice', label: 'View Invoice', icon: 'eye', quick: true, hidden: (r: any) => !(r.invoiceNos?.length === 1) },
      { id: 'viewBlocked', label: 'View Blocked Items', icon: 'eye', quick: true, hidden: (r: any) => !(r.activeBlocks?.length > 0) },
      { id: 'blockItem', label: 'Block Item', icon: 'flag' },
      { id: 'editItem', label: 'Edit', icon: 'pencil' },
      { id: 'releaseQuarantine', label: 'Release From Hold', icon: 'refresh', quick: true, hidden: (r: any) => !r.isQuarantined },
      { id: 'deleteItem', label: 'Delete', icon: 'trash', variant: 'danger', divider: true },
    ];
  }

  loadStockEntries(extraParams: Partial<StockEntryQueryParams> = {}): void {
    this.isLoading.set(true);
    const params: StockEntryQueryParams = {
      page: extraParams.page ?? this.page,
      row: extraParams.row ?? this.row,
      search: this.searchTerm || undefined,
      isQuarantined: this.isQuarantineView || undefined,
      ...this.appliedFilters,
      ...extraParams
    };

    this.stockEntryService.getStockEntries(params).subscribe({
      next: (response) => {
        const stockEntries = response.data?.stockEntries ?? [];
        const pagination = response.data?.pagination;
        const startIndex = pagination ? (pagination.page - 1) * pagination.limit : 0;

        const enrichedEntries = stockEntries.map((entry, idx) => ({
          ...entry,
          rowNo: startIndex + idx + 1,
          stockInDays: this.calculateStockInDays(entry.dateOfPurchase)
        }));

        this.tableData.set(enrichedEntries);

        if (pagination) {
          this.totalItems.set(pagination.total);
          this.page = pagination.page;
          this.row = pagination.limit;
        }

        this.isLoading.set(false);

        if (this.isQuarantineView && enrichedEntries.some(entry => entry.isQuarantined)) {
          this.attachSupplierReturns();
        }
      },
      error: () => {
        this.toastr.error('Failed to load stock entries');
        this.isLoading.set(false);
      }
    });
  }

  private attachSupplierReturns(): void {
    this.stockHoldService.getStockHolds().subscribe({
      next: (response) => {
        const holds = response?.data || [];
        const findHold = (entryId: string) => holds.find((h: any) =>
          h.stockEntryId === entryId || h.stockEntryId?._id === entryId
        ) || null;

        this.tableData.update(entries => entries.map(entry => ({
          ...entry,
          supplierReturn: entry.isQuarantined && entry._id ? findHold(entry._id) : null
        })));
      },
      error: () => {
        // stock hold data is supplementary; leave rows without it on failure
      }
    });
  }

  onCreateStockEntry(): void {
    this.router.navigate(['/stock/create']);
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchTerm = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;

    const parsedFilters: Record<string, any> = {};
    for (const f of query.filters) {
      parsedFilters[f.key] = f.value;
    }
    this.appliedFilters = parsedFilters;

    this.loadStockEntries({ page: this.page });
  }

  onReleaseFromQuarantine(item: StockEntry): void {
    if (!item?._id) return;

    this.stockEntryService.releaseFromQuarantine(item._id).subscribe({
      next: () => {
        this.toastr.success('Stock entry released from hold');
        this.loadStockEntries();
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to release stock entry from hold');
      }
    });
  }

  onRowAction(event: DataGridRowActionEvent<StockEntry>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'viewPo':
        this.viewPo(row);
        break;
      case 'viewGrn':
        this.viewGrn(row);
        break;
      case 'viewDn':
        this.viewDn(row);
        break;
      case 'viewInvoice':
        this.viewInvoice(row);
        break;
      case 'viewBlocked':
        this.viewBlockedItems(row);
        break;
      case 'blockItem':
        this.openBlockItemModal(row);
        break;
      case 'editItem':
        this.onEditStockEntry(row);
        break;
      case 'releaseQuarantine':
        this.onReleaseFromQuarantine(row);
        break;
      case 'deleteItem':
        this.onInlineDelete(row);
        break;
    }
  }

  private viewPo(item: any): void {
    if (!item?.supplierLpoNo) return;
    this.dialog.open(ViewPoDetailsModalComponent, {
      data: { poNo: item.supplierLpoNo },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  private viewGrn(item: any): void {
    if (!item?.grn?._id) return;
    this.dialog.open(ViewGrnDetailsModalComponent, {
      data: { grnId: item.grn._id },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  private viewDn(item: any): void {
    if (!item?.dn?._id) return;
    this.dialog.open(ViewDnDetailsModalComponent, {
      data: { dnId: item.dn._id },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  private viewInvoice(item: any): void {
    if (item?.invoiceNos?.length !== 1) return;
    this.dialog.open(ViewInvoiceDetailsModalComponent, {
      data: { invoiceNo: item.invoiceNos[0] },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  onEditStockEntry(stockEntry: StockEntry): void {
    const dialogRef = this.dialog.open(CreateStockComponent, {
      disableClose: true,
      maxHeight: '90vh',
      width: '70vw',
      data: { stockEntry }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStockEntries();
      }
    });
  }

  viewBlockedItems(stockEntry: StockEntry): void {
    if (!stockEntry._id) {
      this.toastr.error('Invalid stock entry');
      return;
    }

    this.dialog.open(ViewBlockedItemsComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      disableClose: false,
      data: {
        blockedItems: stockEntry.activeBlocks || [],
        stockEntry: stockEntry,
        availableQuantity: stockEntry.availableQuantity || 0
      }
    });
  }

  openBlockItemModal(stockEntry: StockEntry): void {
    if (!stockEntry._id) {
      this.toastr.error('Invalid stock entry');
      return;
    }

    const dialogRef = this.dialog.open(BlockItemComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: {
        stockEntryId: stockEntry._id
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStockEntries();
      }
    });
  }

  onInlineDelete(item: StockEntry): void {
    if (!item?._id) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Stock Entry',
        description: `Are you sure you want to delete this stock entry (${item.partNo?.partNo || item.partNo || 'this item'})? This action cannot be undone and will permanently remove it from inventory.`,
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (!confirmed) return;

      this.stockEntryService.deleteStockEntry(item._id!).subscribe({
        next: () => {
          this.toastr.success('Stock entry deleted');
          this.loadStockEntries();
        },
        error: (error) => {
          this.toastr.error(error.error?.message || 'Failed to delete stock entry');
        }
      });
    });
  }

  private calculateStockInDays(date: Date | string): number {
    if (!date) return 0;
    const purchaseDate = new Date(date);
    const now = new Date();
    const diff = now.getTime() - purchaseDate.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Item Code', value: row.itemCode || row.partNo?.itemCode || '', numeric: true },
          { type: 'field', label: 'Part No', value: row.partNo?.partNo || '' },
          { type: 'field', label: 'Description', value: row.productDescription || '' },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.dateOfPurchase, 'dd MMM yyyy') },
          { type: 'field', label: 'PO No', value: row.supplierLpoNo || '-' },
          { type: 'field', label: 'GRN No', value: row.grn?.grnNo || '-' },
          { type: 'field', label: 'DN No', value: row.isQuarantined ? (row.dn?.dnNo || 'N/A') : 'N/A' },
          { type: 'field', label: 'Invoice No', value: row.invoiceNos?.length ? row.invoiceNos.join(', ') : 'N/A' },
          { type: 'field', label: 'Supplier', value: row.supplierName?.supplierName || '' },
          { type: 'field', label: 'Warehouse', value: row.targetWarehouse?.wareHouseName || '' },
        ],
      },
      {
        title: 'Hold & Resolution',
        columns: '2',
        fields: [
          { type: 'field', label: 'Hold Reason', value: row.isQuarantined ? (row.quarantineReason || '-') : '-', tone: 'bad' },
          { type: 'field', label: 'Status', value: row.supplierReturn ? this.statusLabel(row.supplierReturn.status) : '-', pill: true },
          { type: 'field', label: 'Rejected Qty', value: row.quantity ?? 0, numeric: true },
          { type: 'field', label: 'Resolved Qty', value: row.supplierReturn?.resolvedQty ?? 0, numeric: true },
          { type: 'field', label: 'Unresolved Qty', value: row.supplierReturn?.unresolvedQty ?? 0, numeric: true },
          { type: 'field', label: 'Remarks', value: row.remarks || '-', visible: !!row.remarks },
        ],
      },
    ];
  }
}
