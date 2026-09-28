import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { StockEntryService, StockOverview, StockOverviewQueryParams } from 'src/app/core/services/stock-entry/stock-entry.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';

@Component({
  selector: 'app-stock-overview',
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent,
    ViewToggleComponent
  ],
  templateUrl: './stock-overview.component.html',
  styleUrl: './stock-overview.component.css',
  providers: [PaginationService]
})
export class StockOverviewComponent implements OnInit {
  protected stockEntryService = inject(StockEntryService);
  protected toastr = inject(ToastrService);
  protected paginationService = inject(PaginationService);
  protected productCategoryService = inject(ProductCategoryService);
  protected profileService = inject(ProfileService);
  protected warehouseService = inject(WarehouseService);

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Overview' }];

  tableData = signal<StockOverview[]>([]);
  columns: DataGridColumn<StockOverview>[] = [];
  isLoading = signal<boolean>(false);
  totalItems = signal<number>(0);
  summary = signal({
    totalItems: 0,
    totalOnHand: 0,
    totalReserved: 0,
    totalAvailable: 0,
    totalQuarantined: 0,
    totalValue: 0,
    exceptionCount: 0
  });

  views: DataGridView<StockOverview>[] = [
    { id: 'all', label: 'All' },
    { id: 'exceptions', label: 'Exceptions' },
  ];

  page = 1;
  row = 10;
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  searchTerm = '';
  private activeViewId = 'all';
  protected appliedFilters: Record<string, any> = {};

  ngOnInit(): void {
    this.setupColumns();
    this.loadFilterOptions();
    this.loadStockOverview();
  }

  private get lowStockOnly(): boolean {
    return this.activeViewId === 'exceptions';
  }

  setupColumns(): void {
    this.columns = [
      { key: 'itemCode', label: 'Item Code', sortable: true },
      { key: 'partNo', label: 'Part No', sortable: true },
      { key: 'productDescription', label: 'Description', sortable: true },
      { key: 'productCategory', label: 'Category', sortable: true },
      { key: 'productSegment', label: 'Segment', sortable: true },
      { key: 'warehouseName', label: 'Warehouse', sortable: true },
      { key: 'uom', label: 'UOM', sortable: true },
      { key: 'onHandQuantity', label: 'On Hand', type: 'number', sortable: true },
      { key: 'blockedQuantity', label: 'Blocked', type: 'number', sortable: true },
      { key: 'reservationQuantity', label: 'Reservations', type: 'number', sortable: true },
      {
        key: 'reservedQuantity', label: 'Reserved', type: 'number', sortable: true,
        cellClass: () => 'text-amber-600 font-semibold'
      },
      {
        key: 'availableQuantity', label: 'Available', type: 'number', sortable: true,
        cellClass: () => 'text-emerald-600 font-semibold'
      },
      {
        key: 'quarantinedQuantity', label: 'Quarantine', type: 'number', sortable: true,
        cellClass: () => 'text-red-600 font-semibold'
      },
      { key: 'stockValue', label: 'Value', type: 'currency', sortable: true },
      { key: 'stockEntryCount', label: 'Entries', type: 'number', sortable: true },
    ];
  }

  loadFilterOptions(): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        const options = (categories ?? []).map(category => ({ label: category.categoryName, value: category._id as string }));
        this.setColumnOptions('productCategory', options);
      }
    });

    this.profileService.getDepartments().subscribe({
      next: (departments) => {
        const options = (departments ?? []).map(department => ({ label: department.departmentName, value: department._id as string }));
        this.setColumnOptions('productSegment', options);
      }
    });

    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        const options = (warehouses ?? []).map(warehouse => ({ label: warehouse.wareHouseName, value: warehouse._id as string }));
        this.setColumnOptions('warehouseName', options);
      }
    });
  }

  private setColumnOptions(key: string, editorOptions: { label: string; value: any }[]): void {
    this.columns = this.columns.map((c) => (c.key === key ? { ...c, editorOptions } : c));
  }

  loadStockOverview(extraParams: Partial<StockOverviewQueryParams> = {}): void {
    this.isLoading.set(true);
    const params: StockOverviewQueryParams = {
      page: extraParams.page ?? this.page,
      row: extraParams.row ?? this.row,
      search: this.searchTerm || undefined,
      lowStock: this.lowStockOnly || undefined,
      ...this.appliedFilters,
      ...extraParams
    };

    this.stockEntryService.getStockOverview(params).subscribe({
      next: (response) => {
        const overview = response.data?.overview ?? [];
        const pagination = response.data?.pagination;
        const startIndex = pagination ? (pagination.page - 1) * pagination.limit : 0;

        this.tableData.set(overview.map((item, index) => ({
          ...item,
          rowNo: startIndex + index + 1
        })));
        this.summary.set(response.data?.summary ?? this.summary());
        this.refreshViewCounts();

        if (pagination) {
          this.totalItems.set(pagination.total);
          this.page = pagination.page;
          this.row = pagination.limit;
        }

        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load stock overview');
        this.isLoading.set(false);
      }
    });
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchTerm = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;

    const parsedFilters: Record<string, any> = {};
    for (const f of query.filters) {
      const key = f.key === 'warehouseName' ? 'targetWarehouse' : f.key;
      parsedFilters[key] = f.value;
    }
    this.appliedFilters = parsedFilters;

    this.loadStockOverview({ page: this.page });
  }

  onViewChange(view: DataGridView<StockOverview>): void {
    this.activeViewId = view.id;
    this.loadStockOverview({ page: 1 });
  }

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({
      ...v,
      count: v.id === this.activeViewId ? this.totalItems() : (v.id === 'exceptions' ? this.summary().exceptionCount : undefined),
      hideCount: v.id !== this.activeViewId && v.id !== 'exceptions',
    }));
  }
}
