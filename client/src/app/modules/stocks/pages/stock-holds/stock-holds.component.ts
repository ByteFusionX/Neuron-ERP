import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { NgIcon } from '@ng-icons/core';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
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
import { ViewStockEntryDetailsModalComponent } from '../../modals/view-stock-entry-details-modal/view-stock-entry-details-modal.component';
import { StockHoldService } from 'src/app/core/services/stock-hold/stock-hold.service';

@Component({
  selector: 'app-stock-holds',
  standalone: true,
  imports: [
    CommonModule,
    TableComponent,
    ButtonComponent,
    NgIcon,
    SearchComponent
  ],
  templateUrl: './stock-holds.component.html',
  styleUrl: './stock-holds.component.css',
  providers: [PaginationService]
})
export class StockHoldsComponent implements OnInit {
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

  private static readonly STATUS_LABELS: Record<string, string> = {
    OnHold: 'On Hold',
    PartiallyResolved: 'Partially Resolved',
    Resolved: 'Resolved',
    Disposed: 'Disposed'
  };

  readonly isQuarantineView = true;
  readonly tableId = 'stock-holds-table';
  readonly title = 'Stock Holds';
  readonly defaultColumns: string[] = [
    'dateOfPurchase', 'itemCode', 'partNo', 'jobId', 'supplierLpoNo', 'grn', 'dn', 'invoiceNo',
    'productDescription', 'supplierName', 'targetWarehouse', 'rejectedQty', 'resolvedQty', 'unresolvedQty', 'status',
    'quarantineReason'
  ];

  statusLabel(value: string): string {
    return StockHoldsComponent.STATUS_LABELS[value] || value || '-';
  }

  tableData = signal<StockEntry[]>([]);
  tableColumns: TableColumn[] = [];
  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  categoryOptions = signal<{ label: string; value: string }[]>([]);
  segmentOptions = signal<{ label: string; value: string }[]>([]);
  warehouseOptions = signal<{ label: string; value: string }[]>([]);
  productOptions = signal<{ label: string; value: string }[]>([]);
  supplierOptions = signal<{ label: string; value: string }[]>([]);

  protected appliedFilters: Record<string, any> = {};
  protected searchTerm: string = '';

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadFilterOptions();
    this.loadStockEntries();
  }

  loadFilterOptions(): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        const options = (categories ?? []).map(category => ({
          label: category.categoryName,
          value: category._id as string
        }));
        this.categoryOptions.set(options);
        this.updateColumnFilterOptions('productCategory', options);
      },
      error: () => {
        this.toastr.error('Failed to load product categories');
      }
    });

    this.profileService.getDepartments().subscribe({
      next: (departments) => {
        const options = (departments ?? []).map(department => ({
          label: department.departmentName,
          value: department._id as string
        }));
        this.segmentOptions.set(options);
        this.updateColumnFilterOptions('productSegment', options);
      },
      error: () => {
        this.toastr.error('Failed to load product segments');
      }
    });

    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        const options = (warehouses ?? []).map(wh => ({
          label: wh.wareHouseName,
          value: wh._id as string
        }));
        this.warehouseOptions.set(options);
        this.updateColumnFilterOptions('targetWarehouse', options);
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
      }
    });

    this.productService.getProducts().subscribe({
      next: (response) => {
        const products = response.data?.products ?? [];
        const options = products.map((product: any) => ({
          label: `${product.partNo} - ${product.productDescription}`,
          value: product._id as string
        }));
        this.productOptions.set(options);
        this.updateColumnFilterOptions('partNo', options);
      },
      error: () => {
        this.toastr.error('Failed to load products');
      }
    });

    this.supplierService.supplierList().subscribe({
      next: (response: any) => {
        const suppliers = response.data || response || [];
        const options = suppliers.map((supplier: any) => ({
          label: supplier.supplierName,
          value: supplier._id as string
        }));
        this.supplierOptions.set(options);
        this.updateColumnFilterOptions('supplierName', options);
      },
      error: () => {
        this.toastr.error('Failed to load suppliers');
      }
    });
  }

  protected updateColumnFilterOptions(columnKey: string, options: { label: string; value: string }[]): void {
    const column = this.tableColumns.find(col => col.key === columnKey);
    if (column) {
      column.filterOptions = options;
    }
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'dateOfPurchase',
        label: 'Date Of Purchase',
        type: 'date',
        sortable: true,
        filterable: true,
        filterType: 'date',
        filterPlaceholder: 'Select date...'
      },
      {
        key: 'itemCode',
        label: 'Item Code',
        type: 'text',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.itemCode || item?.partNo?.itemCode || ''
      },
      {
        key: 'partNo',
        label: 'Part No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.productOptions(),
        filterPlaceholder: 'Select part no...',
        cellRenderer: (item: any) => item?.partNo?.partNo || ''
      },
      {
        key: 'jobId',
        label: 'Job No',
        type: 'text',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.jobId?.jobId || ''
      },
      {
        key: 'supplierLpoNo',
        label: 'PO No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search PO number...',
        cellRenderer: (item: any) => item?.supplierLpoNo || '',
        cellClass: 'text-violet-600 font-medium',
        clickable: true,
        clickableValue: (item: any) => !!item?.supplierLpoNo,
        clickFunction: (item: any) => {
          if (item?.supplierLpoNo) {
            this.dialog.open(ViewPoDetailsModalComponent, {
              data: { poNo: item.supplierLpoNo },
              width: '1200px',
              maxWidth: '95vw',
              maxHeight: '90vh'
            });
          }
        }
      },
      {
        key: 'grn',
        label: 'GRN No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search GRN...',
        cellClass: 'text-violet-600 font-medium',
        cellRenderer: (item: any) => item?.grn?.grnNo || 'N/A',
        clickable: true,
        clickableValue: (item: any) => !!item?.grn?._id,
        clickFunction: (item: any) => {
          if (item?.grn?._id) {
            this.dialog.open(ViewGrnDetailsModalComponent, {
              data: { grnId: item.grn._id },
              width: '1200px',
              maxWidth: '95vw',
              maxHeight: '90vh'
            });
          }
        }
      },
      {
        key: 'dn',
        label: 'DN No',
        type: 'text',
        sortable: false,
        filterable: false,
        cellClass: 'text-violet-600 font-medium',
        cellRenderer: (item: any) => item?.isQuarantined ? (item?.dn?.dnNo || 'N/A') : 'N/A',
        clickable: true,
        clickableValue: (item: any) => item?.isQuarantined && !!item?.dn?._id,
        clickFunction: (item: any) => {
          if (item?.dn?._id) {
            this.dialog.open(ViewDnDetailsModalComponent, {
              data: { dnId: item.dn._id },
              width: '1200px',
              maxWidth: '95vw',
              maxHeight: '90vh'
            });
          }
        }
      },
      {
        key: 'invoiceNo',
        label: 'Invoice No',
        type: 'text',
        sortable: false,
        filterable: false,
        cellClass: 'text-violet-600 font-medium',
        cellRenderer: (item: any) => (item?.invoiceNos?.length ? item.invoiceNos.join(', ') : 'N/A'),
        clickable: true,
        clickableValue: (item: any) => item?.invoiceNos?.length === 1,
        clickFunction: (item: any) => {
          if (item?.invoiceNos?.length === 1) {
            this.dialog.open(ViewInvoiceDetailsModalComponent, {
              data: { invoiceNo: item.invoiceNos[0] },
              width: '1200px',
              maxWidth: '95vw',
              maxHeight: '90vh'
            });
          }
        }
      },
      {
        key: 'productDescription',
        label: 'Description',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search description...',
        truncateText: true
      },
      {
        key: 'supplierName',
        label: 'Supplier',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.supplierOptions(),
        filterPlaceholder: 'Select supplier...',
        cellRenderer: (item: any) => item?.supplierName?.supplierName || ''
      },
      {
        key: 'targetWarehouse',
        label: 'Warehouse',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.warehouseOptions(),
        filterPlaceholder: 'Select warehouse...',
        cellRenderer: (item: any) => item?.targetWarehouse?.wareHouseName || ''
      },
      {
        key: 'rejectedQty',
        label: 'Rejected Qty',
        type: 'number',
        sortable: true,
        filterable: true,
        filterType: 'number',
        filterPlaceholder: 'Enter quantity...',
        cellRenderer: (item: any) => item?.quantity ?? 0
      },
      {
        key: 'resolvedQty',
        label: 'Resolved Qty',
        type: 'number',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.supplierReturn?.resolvedQty ?? 0
      },
      {
        key: 'unresolvedQty',
        label: 'Unresolved Qty',
        type: 'number',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.supplierReturn?.unresolvedQty ?? 0
      },
      {
        key: 'status',
        label: 'Status',
        type: 'text',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.supplierReturn ? this.statusLabel(item.supplierReturn.status) : '-'
      },
      {
        key: 'quarantineReason',
        label: 'Hold Reason',
        type: 'text',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.isQuarantined ? (item?.quarantineReason || '-') : ''
      },
      {
        key: 'remarks',
        label: 'Remarks',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search remarks...',
        cellRenderer: (item: any) => item?.remarks || ''
      },
    ];
  }

  loadStockEntries(extraParams: Partial<StockEntryQueryParams> = {}): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const params: StockEntryQueryParams = {
      page: extraParams.page ?? paginationState.page,
      row: extraParams.row ?? paginationState.row,
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
        this.isEmpty.set(stockEntries.length === 0);

        if (pagination) {
          this.totalItems.set(pagination.total);
          this.paginationService.updatePaginationState({
            page: pagination.page,
            row: pagination.limit,
            total: pagination.total
          });
        }

        this.isLoading.set(false);

        if (this.isQuarantineView && enrichedEntries.some(entry => entry.isQuarantined)) {
          this.attachSupplierReturns();
        }
      },
      error: () => {
        this.toastr.error('Failed to load stock entries');
        this.isLoading.set(false);
        this.isEmpty.set(true);
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

  onRowClick(row: StockEntry): void {
    const dialogRef = this.dialog.open(ViewStockEntryDetailsModalComponent, {
      data: { stockEntry: row },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === 'edit') {
        this.onEditStockEntry(row);
      } else if (result === 'delete') {
        this.onInlineDelete(row);
      } else if (result === 'block') {
        this.openBlockItemModal(row);
      } else if (result === 'release') {
        this.onReleaseFromQuarantine(row);
      } else if (result === 'updated') {
        this.loadStockEntries();
      }
    });
  }

  onActionClick(event: { action: string, item: any, event: Event }): void {
    if (event.action === 'blockItem') {
      this.openBlockItemModal(event.item);
    } else if (event.action === 'viewBlocked') {
      this.viewBlockedItems(event.item);
    } else if (event.action === 'editItem') {
      this.onEditStockEntry(event.item);
    } else if (event.action === 'deleteItem') {
      this.onInlineDelete(event.item);
    } else if (event.action === 'releaseQuarantine') {
      this.onReleaseFromQuarantine(event.item);
    }
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

  onFilterChange(filters: TableFilter[]): void {
    const parsedFilters: Record<string, any> = {};

    filters.forEach(filter => {
      if (filter.value) {
        parsedFilters[filter.column] = filter.value;
      }
    });

    this.appliedFilters = parsedFilters;

    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    this.loadStockEntries({ page: 1 });
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.loadStockEntries({ page: event.page, row: event.row });
  }

  onSearch(term: string): void {
    this.searchTerm = term?.trim() || '';
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.loadStockEntries({ page: 1 });
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
}
