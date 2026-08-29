import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { StockEntryService, StockEntry, StockEntryQueryParams } from 'src/app/core/services/stock-entry/stock-entry.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { NgIcon } from '@ng-icons/core';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ProductService } from 'src/app/core/services/product/product.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { BlockItemComponent } from './modals/block-item/block-item.component';
import { ViewBlockedItemsComponent } from './modals/view-blocked-items/view-blocked-items.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateStockEntryComponent } from './modals/create-stock-entry/create-stock-entry.component';

@Component({
  selector: 'app-stock-entries',
  standalone: true,
  imports: [
    CommonModule,
    TableComponent,
    ButtonComponent,
    NgIcon,
    SearchComponent
  ],
  templateUrl: './stock-entries.component.html',
  styleUrl: './stock-entries.component.css',
  providers: [PaginationService]
})
export class StockEntriesComponent implements OnInit {
  private stockEntryService = inject(StockEntryService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private paginationService = inject(PaginationService);
  private productCategoryService = inject(ProductCategoryService);
  private profileService = inject(ProfileService);
  private warehouseService = inject(WarehouseService);
  private productService = inject(ProductService);
  private supplierService = inject(SupplierService);
  private jobService = inject(JobService);

  tableData = signal<StockEntry[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = ['itemCode', 'partNo', 'productDescription', 'targetWarehouse', 'quantity', 'uom', 'unitCost', 'totalCost', 'supplierName', 'dateOfPurchase', 'stockInDays', 'jobId', 'productCategory', 'productSegment', 'sellingPrice', 'blockedQuantities', 'remarks', 'actions'];
  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  categoryOptions = signal<{ label: string; value: string }[]>([]);
  segmentOptions = signal<{ label: string; value: string }[]>([]);
  warehouseOptions = signal<{ label: string; value: string }[]>([]);
  productOptions = signal<{ label: string; value: string }[]>([]);
  supplierOptions = signal<{ label: string; value: string }[]>([]);

  private jobSelectOptions: { label: string; value: string }[] = [];

  private appliedFilters: Record<string, any> = {};
  private searchTerm: string = '';

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadFilterOptions();
    this.loadStockEntries();
  }

  formatPlainNumber(value: any): string {
    if (value == null) return '';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
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

    this.jobService.getJobids().subscribe({
      next: (response: any) => {
        const jobs = Array.isArray(response)
          ? response
          : response?.jobs || response?.data || [];
        const options = (jobs ?? []).map((job: any) => ({
          label: job.jobId,
          value: job._id as string
        }));
        this.jobSelectOptions = options;
        this.updateColumnFilterOptions('jobId', options);
      },
      error: () => {
        this.toastr.error('Failed to load job ids');
      }
    });
  }

  private updateColumnFilterOptions(columnKey: string, options: { label: string; value: string }[]): void {
    const column = this.tableColumns.find(col => col.key === columnKey);
    if (column) {
      column.filterOptions = options;
    }
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'itemCode',
        label: 'Item Code',
        type: 'text',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => item?.partNo?.itemCode || ''
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
        key: 'quantity',
        label: 'Quantity',
        type: 'number',
        sortable: true,
        filterable: true,
        filterType: 'number',
        filterPlaceholder: 'Enter quantity...'
      },
      {
        key: 'uom',
        label: 'UOM',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search UOM...'
      },
      {
        key: 'unitCost',
        label: 'Unit Cost',
        type: 'text',
        sortable: true,
        filterable: false,
        cellRenderer: (item: any) => this.formatPlainNumber(item?.unitCost)
      },
      {
        key: 'totalCost',
        label: 'Total Cost',
        type: 'text',
        sortable: true,
        filterable: false,
        cellRenderer: (item: any) => this.formatPlainNumber(item?.totalCost)
      },
      {
        key: 'supplierName',
        label: 'Supplier Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.supplierOptions(),
        filterPlaceholder: 'Select supplier...',
        cellRenderer: (item: any) => item?.supplierName?.supplierName || ''
      },
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
        key: 'stockInDays',
        label: 'Stock in (Days)',
        type: 'number',
        sortable: false,
        filterable: false
      },
      {
        key: 'jobId',
        label: 'Job ID',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.jobSelectOptions,
        filterPlaceholder: 'Select job id...',
        cellRenderer: (item: any) => item?.jobId?.jobId || ''
      },
      {
        key: 'productCategory',
        label: 'Category',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.categoryOptions(),
        filterPlaceholder: 'Select category...',
        cellRenderer: (item: any) => item?.productCategory?.categoryName || ''
      },
      {
        key: 'productSegment',
        label: 'Segment',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.segmentOptions(),
        filterPlaceholder: 'Select segment...',
        cellRenderer: (item: any) => item?.productSegment?.departmentName || ''
      },
      {
        key: 'sellingPrice',
        label: 'Selling Price',
        type: 'text',
        sortable: true,
        filterable: false,
        cellRenderer: (item: any) => this.formatPlainNumber(item?.sellingPrice)
      },
      {
        key: 'blockedQuantities',
        label: 'Blocked',
        type: 'text',
        headerClass: '!text-center',
        cellClass: 'text-center',
        sortable: false,
        filterable: false,
        cellRenderer: (item: any) => {
          const blockedCount = item?.activeBlocks?.length || 0;
          const totalBlocked = item?.blockedQuantity || 0;
          if (blockedCount === 0) return '';
          return `Qty: ${totalBlocked}`;
        },
        inlineButton: {
          icon: 'heroEye',
          tooltip: 'View Blocked Items',
          buttonClass: 'cursor-pointer w-7 h-7 rounded-full border border-orange-300 hover:border-orange-500 hover:bg-orange-50 flex justify-center items-center text-orange-600 transition-colors ml-2',
          condition: (item: any) => (item?.activeBlocks?.length || 0) > 0,
          onClick: (item: any, event: Event) => {
            event.stopPropagation();
            this.viewBlockedItems(item);
          }
        }
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
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroPencilSquare',
            tooltip: 'Edit Stock',
            action: 'editItem',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-blue-200 hover:bg-blue-50 flex justify-center items-center text-blue-600'
          },
          {
            icon: 'heroTrash',
            tooltip: 'Delete Stock',
            action: 'deleteItem',
            buttonClass: 'cursor-pointer w-9 h-9 rounded-full border border-red-200 hover:bg-red-50 flex justify-center items-center text-red-600'
          },
          {
            icon: 'heroLockClosed',
            tooltip: 'Block Stock',
            action: 'blockItem',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-orange-300 hover:border-orange-500 text-orange-600 text-sm rounded-full font-medium',
            condition: (item: any) => (item?.availableQuantity ?? item?.quantity ?? 0) > 0
          }
        ]
      }
    ];
  }

  loadStockEntries(extraParams: Partial<StockEntryQueryParams> = {}): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const params: StockEntryQueryParams = {
      page: extraParams.page ?? paginationState.page,
      row: extraParams.row ?? paginationState.row,
      search: this.searchTerm || undefined,
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
      },
      error: () => {
        this.toastr.error('Failed to load stock entries');
        this.isLoading.set(false);
        this.isEmpty.set(true);
      }
    });
  }

  onCreateStockEntry(): void {
    this.router.navigate(['/inventory/stock-entries/create']);
  }

  onRowClick(row: StockEntry): void {
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
    }
  }

  onEditStockEntry(stockEntry: StockEntry): void {
    const dialogRef = this.dialog.open(CreateStockEntryComponent, {
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

    const dialogRef = this.dialog.open(ViewBlockedItemsComponent, {
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
