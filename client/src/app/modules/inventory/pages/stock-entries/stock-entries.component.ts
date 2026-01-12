import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableColumn, TableFilter, InlineEditConfig } from 'src/app/shared/components/table/table.model';
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
  defaultColumns: string[] = ['rowNo', 'partNo', 'productDescription', 'targetWarehouse', 'quantity', 'uom', 'unitCost', 'totalCost', 'supplierName', 'dateOfPurchase', 'stockInDays', 'jobId', 'productCategory', 'productSegment', 'sellingPrice', 'blockedQuantities', 'remarks', 'actions'];
  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  categoryOptions = signal<{ label: string; value: string }[]>([]);
  segmentOptions = signal<{ label: string; value: string }[]>([]);
  warehouseOptions = signal<{ label: string; value: string }[]>([]);
  productOptions = signal<{ label: string; value: string }[]>([]);
  supplierOptions = signal<{ label: string; value: string }[]>([]);
  inlineEditConfig: InlineEditConfig | null = null;

  private categorySelectOptions: { label: string; value: string }[] = [];
  private segmentSelectOptions: { label: string; value: string }[] = [];
  private warehouseSelectOptions: { label: string; value: string }[] = [];
  private productSelectOptions: { label: string; value: string }[] = [];
  private supplierSelectOptions: { label: string; value: string }[] = [];
  private jobSelectOptions: { label: string; value: string }[] = [];

  private appliedFilters: Record<string, any> = {};
  private searchTerm: string = '';

  ngOnInit(): void {
    this.setupTableColumns();
    this.refreshInlineEditConfig();
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
        this.categorySelectOptions = options;
        this.categoryOptions.set(options);
        this.updateColumnFilterOptions('productCategory', options);
        this.refreshInlineEditConfig();
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
        this.segmentSelectOptions = options;
        this.segmentOptions.set(options);
        this.updateColumnFilterOptions('productSegment', options);
        this.refreshInlineEditConfig();
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
        this.warehouseSelectOptions = options;
        this.warehouseOptions.set(options);
        this.updateColumnFilterOptions('targetWarehouse', options);
        this.refreshInlineEditConfig();
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
        this.productSelectOptions = options;
        this.productOptions.set(options);
        this.updateColumnFilterOptions('partNo', options);
        this.refreshInlineEditConfig();
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
        this.supplierSelectOptions = options;
        this.supplierOptions.set(options);
        this.updateColumnFilterOptions('supplierName', options);
        this.refreshInlineEditConfig();
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
        this.refreshInlineEditConfig();
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
        key: 'rowNo',
        label: 'No',
        type: 'text',
        sortable: false,
        filterable: false,
        cellClass: 'w-16'
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
        filterPlaceholder: 'Search description...'
      },
      {
        key: 'targetWarehouse',
        label: 'Target Warehouse',
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
        label: 'QTY',
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
        type: 'currency',
        sortable: true,
        filterable: false,
        pipeParams: { currency: 'USD' }
      },
      {
        key: 'totalCost',
        label: 'Total Cost',
        type: 'currency',
        sortable: true,
        filterable: false,
        pipeParams: { currency: 'USD' }
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
        label: 'Pro. Category',
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
        label: 'P. Segment',
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
        type: 'currency',
        sortable: true,
        filterable: false,
        pipeParams: { currency: 'USD' }
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

  @ViewChild(TableComponent) tableComponent!: TableComponent;

  onActionClick(event: { action: string, item: any, event: Event }): void {
    if (event.action === 'blockItem') {
      this.openBlockItemModal(event.item);
    } else if (event.action === 'viewBlocked') {
      this.viewBlockedItems(event.item);
    } else if (event.action === 'editItem') {
      if (this.tableComponent) {
        this.tableComponent.startInlineEdit(event.item, event.event);
      }
    } else if (event.action === 'deleteItem') {
      this.onInlineDelete(event.item);
    }
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

  onInlineEditSave(event: { rowId: string; updated: any }): void {
    if (!event.rowId) return;

    const payload = this.buildUpdatePayload(event.updated);
    if (payload.quantity !== undefined && payload.unitCost !== undefined) {
      const qty = Number(payload.quantity) || 0;
      const cost = Number(payload.unitCost) || 0;
      payload.totalCost = Number((qty * cost).toFixed(2));
    }

    this.stockEntryService.updateStockEntry(event.rowId, payload).subscribe({
      next: () => {
        this.toastr.success('Stock entry updated');
        this.loadStockEntries();
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to update stock entry');
      }
    });
  }

  onInlineDelete(item: StockEntry): void {
    if (!item?._id) return;
    const confirmed = confirm('Are you sure you want to delete this stock entry?');
    if (!confirmed) return;

    this.stockEntryService.deleteStockEntry(item._id).subscribe({
      next: () => {
        this.toastr.success('Stock entry deleted');
        this.loadStockEntries();
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to delete stock entry');
      }
    });
  }

  private buildUpdatePayload(updated: any): any {
    const payload: any = {};
    const referenceFields = ['partNo', 'supplierName', 'productSegment', 'productCategory', 'targetWarehouse', 'jobId'];

    referenceFields.forEach((field) => {
      if (updated[field] !== undefined) {
        const value = updated[field];
        payload[field] = typeof value === 'object' ? value?._id || value?.value || value : value;
      }
    });

    const directFields = ['productDescription', 'quantity', 'uom', 'unitCost', 'totalCost', 'sellingPrice', 'remarks'];
    directFields.forEach((field) => {
      if (updated[field] !== undefined) {
        payload[field] = updated[field];
      }
    });

    if (updated.dateOfPurchase !== undefined) {
      payload.dateOfPurchase = updated.dateOfPurchase;
    }

    return payload;
  }

  private calculateStockInDays(date: Date | string): number {
    if (!date) return 0;
    const purchaseDate = new Date(date);
    const now = new Date();
    const diff = now.getTime() - purchaseDate.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  private refreshInlineEditConfig(): void {
    this.inlineEditConfig = {
      enabled: true,
      allowDelete: true,
      showActionsColumn: false,
      rowIdentityKey: '_id',
      columns: {
        partNo: { type: 'select', options: this.productSelectOptions },
        productDescription: { type: 'textarea', placeholder: 'Update description' },
        targetWarehouse: { type: 'select', options: this.warehouseSelectOptions },
        quantity: { type: 'number', min: 1, step: 1 },
        uom: { type: 'text', placeholder: 'Enter UOM' },
        unitCost: { type: 'number', min: 0, step: 0.01 },
        totalCost: { type: 'number', min: 0, step: 0.01, disabled: true },
        supplierName: { type: 'select', options: this.supplierSelectOptions },
        dateOfPurchase: { type: 'date' },
        jobId: { type: 'select', options: this.jobSelectOptions },
        productCategory: { type: 'select', options: this.categorySelectOptions },
        productSegment: { type: 'select', options: this.segmentSelectOptions },
        sellingPrice: { type: 'number', min: 0, step: 0.01 },
        remarks: { type: 'textarea', placeholder: 'Add remarks' }
      }
    };
  }
}
