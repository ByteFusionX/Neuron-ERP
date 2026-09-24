import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { DatePipe, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of, Subscription } from 'rxjs';
import { ProductService, Product, ProductQueryParams } from 'src/app/core/services/product/product.service';
import { PRODUCT_TYPES } from 'src/app/shared/interfaces/product.interface';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridColumn, DataGridDetailTab,
  DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ProductFormDrawerComponent } from './pages/product-form-drawer/product-form-drawer.component';

@Component({
  selector: 'app-all-products',
  standalone: true,
  imports: [NgIf, NgSwitch, NgSwitchCase, DatePipe, DataGridComponent, DetailOverviewComponent, ProductFormDrawerComponent],
  templateUrl: './all-products.component.html',
  styleUrl: './all-products.component.css',
  providers: [DatePipe],
})
export class AllProductsComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<Product>;

  private productService = inject(ProductService);
  private productCategoryService = inject(ProductCategoryService);
  private profileService = inject(ProfileService);
  private warehouseService = inject(WarehouseService);
  private confirm = inject(ConfirmDialogService);
  private toastr = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private subscriptions = new Subscription();

  isLoading = true;
  rows: Product[] = [];
  total = 0;
  page = 1;
  row = 10;
  searchQuery = '';

  columns: DataGridColumn<Product>[] = [];
  rowActions: DataGridRowAction<Product>[] = [];
  views: DataGridView<Product>[] = [{ id: 'all', label: 'All' }];
  bulkActions: DataGridBulkAction[] = [{ id: 'delete', label: 'Delete', variant: 'danger' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'pricing', label: 'Pricing', icon: 'wallet' },
  ];
  private activeViewId = 'all';

  productTitle = (r: Product) => r.productName || r.itemCode || '';
  productSubtitle = (r: Product) => r.itemCode ?? '';

  private appliedFilters: Record<string, any> = {};

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this.loadFilterOptions();
    this.getProducts();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'itemCode', label: 'Item Code', sortable: true, width: '120px' },
      { key: 'partNo', label: 'Part No', sortable: true },
      { key: 'productName', label: 'Product Name', sortable: true },
      { key: 'productDescription', label: 'Description' },
      {
        key: 'type', label: 'Type', type: 'badge', sortable: true,
        editorOptions: PRODUCT_TYPES.map((t) => ({ label: t, value: t })),
        badgeClasses: {
          Stock: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          'Non-Stock': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          Service: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
        },
      },
      { key: 'productCategory', label: 'Category', valueGetter: (r) => r.productCategory?.categoryName },
      { key: 'productSegment', label: 'Segment', valueGetter: (r) => r.productSegment?.departmentName },
      { key: 'warehouse', label: 'Warehouse', valueGetter: (r) => r.warehouse?.wareHouseName },
      { key: 'brand', label: 'Brand' },
      { key: 'unitOfMeasure', label: 'UOM', width: '90px' },
      { key: 'defaultSellingPrice', label: 'Selling Price', type: 'number' },
      {
        key: 'isActive', label: 'Active', type: 'badge', width: '100px',
        valueGetter: (r) => (r.isActive ? 'Active' : 'Inactive'),
        badgeClasses: {
          Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        },
      },
      {
        key: 'approvalStatus', label: 'Approval', type: 'badge', width: '110px',
        valueGetter: (r) => r.approvalStatus ?? 'Approved',
        badgeClasses: {
          Approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          Draft: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
        },
      },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => this.ownerName(r) },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'approve', label: 'Approve', icon: 'check', quick: true, hidden: (r) => r.approvalStatus !== 'Pending' },
      { id: 'reject', label: 'Reject', variant: 'danger', hidden: (r) => r.approvalStatus !== 'Pending' },
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true },
      { id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger', divider: true },
    ];
  }

  private ownerName(r: Product): string {
    const owner = r.createdBy as any;
    return owner ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() : '';
  }

  private loadFilterOptions(): void {
    this.subscriptions.add(
      this.productCategoryService.getProductCategories().subscribe({
        next: (categories) => {
          const options = (categories ?? []).map((c) => ({ label: c.categoryName, value: c._id as string }));
          this.setColumnOptions('productCategory', options);
        },
        error: () => this.toastr.error('Failed to load product categories'),
      })
    );

    this.subscriptions.add(
      this.profileService.getDepartments().subscribe({
        next: (departments) => {
          const options = (departments ?? []).map((d) => ({ label: d.departmentName, value: d._id as string }));
          this.setColumnOptions('productSegment', options);
        },
        error: () => this.toastr.error('Failed to load product segments'),
      })
    );

    this.subscriptions.add(
      this.warehouseService.getWarehouses().subscribe({
        next: (warehouses) => {
          const options = (warehouses ?? []).map((w) => ({ label: w.wareHouseName, value: w._id as string }));
          this.setColumnOptions('warehouse', options);
        },
        error: () => this.toastr.error('Failed to load warehouses'),
      })
    );
  }

  private setColumnOptions(key: string, editorOptions: { label: string; value: any }[]): void {
    this.columns = this.columns.map((c) => (c.key === key ? { ...c, editorOptions } : c));
  }

  getProducts(): void {
    this.isLoading = true;
    const params: ProductQueryParams = {
      page: this.page,
      row: this.row,
      search: this.searchQuery || undefined,
      ...this.appliedFilters,
    };

    this.subscriptions.add(
      this.productService.getProducts(params).subscribe({
        next: (response) => {
          const products = response.data?.products ?? [];
          this.rows = products;
          this.total = response.data?.pagination?.total ?? products.length;
          this.refreshViewCounts();
          this.isLoading = false;
        },
        error: () => {
          this.toastr.error('Failed to load products');
          this.isLoading = false;
        },
      })
    );
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;

    this.appliedFilters = {};
    for (const f of query.filters) {
      if (f.key === 'productCategory' || f.key === 'productSegment' || f.key === 'warehouse') {
        this.appliedFilters[f.key] = f.value;
      }
    }

    this.getProducts();
  }

  onViewChange(view: DataGridView<Product>): void {
    this.activeViewId = view.id;
    this.refreshViewCounts();
  }

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  // --- Product form drawer (create and edit) --------------------------------------

  formOpen = false;
  formMode: 'create' | 'edit' = 'create';
  formProduct: Product | null = null;

  onCreateProduct(): void {
    this.formMode = 'create';
    this.formProduct = null;
    this.formOpen = true;
  }

  onFormSaved(): void {
    this.getProducts();
  }

  onFormClosed(): void {
    this.formOpen = false;
  }

  onRowAction({ action, row }: DataGridRowActionEvent<Product>): void {
    switch (action.id) {
      case 'edit':
        this.formMode = 'edit';
        this.formProduct = row;
        this.formOpen = true;
        break;
      case 'approve':
        this.approveProduct(row);
        break;
      case 'reject':
        void this.rejectProduct(row);
        break;
      case 'delete':
        void this.deleteProducts([row]);
        break;
    }
  }

  onBulkAction({ action, rows }: DataGridBulkActionEvent<Product>, grid: DataGridComponent<Product>): void {
    if (action.id !== 'delete') return;
    void this.deleteProducts(rows, grid);
  }

  private approveProduct(row: Product): void {
    this.productService.approveProduct(row._id as string).subscribe({
      next: () => {
        this.toastr.success('Product approved');
        this.getProducts();
      },
      error: (error) => this.toastr.error(error?.error?.message || 'Failed to approve product'),
    });
  }

  private async rejectProduct(row: Product): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Reject product?',
      message: `"${row.productName || row.itemCode}" will go back to draft and can't be used until it is edited and approved again.`,
      confirmLabel: 'Reject',
      reason: true,
    });
    if (!confirmed) return;

    this.productService.rejectProduct(row._id as string, reason ?? '').subscribe({
      next: () => {
        this.toastr.success('Product rejected');
        this.getProducts();
      },
      error: (error) => this.toastr.error(error?.error?.message || 'Failed to reject product'),
    });
  }

  private async deleteProducts(rows: Product[], grid?: DataGridComponent<Product>): Promise<void> {
    const count = rows.length === 1 ? `"${rows[0].productName || rows[0].itemCode}"` : `${rows.length} products`;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: rows.length === 1 ? 'Delete product?' : `Delete ${count}?`,
      message: `Are you sure you want to delete ${count}?`,
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    const requests = rows.map((r) => this.productService.deleteProduct(r._id as string));
    forkJoin(requests.length ? requests : [of(null)]).subscribe({
      next: () => {
        grid?.clearSelection();
        this.grid?.closeDetail();
        this.toastr.success(rows.length === 1 ? 'Product deleted successfully' : `${rows.length} products deleted`);
        this.getProducts();
      },
      error: (error) => {
        this.toastr.error(error?.error?.message || 'Failed to delete product');
      },
    });
  }

  // --- Detail panel ---------------------------------------------------------------

  overviewSections(row: Product): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Item Code', value: row.itemCode, numeric: true, noHover: true },
          { type: 'field', label: 'Part No', value: row.partNo, noHover: true },
          { type: 'field', label: 'Product Name', value: row.productName, noHover: true },
          { type: 'dg', key: 'type' },
          { type: 'field', label: 'Category', value: row.productCategory?.categoryName, noHover: true },
          { type: 'field', label: 'Segment', value: row.productSegment?.departmentName, noHover: true },
          { type: 'field', label: 'Warehouse', value: row.warehouse?.wareHouseName, noHover: true },
          { type: 'field', label: 'Brand', value: row.brand, noHover: true },
          { type: 'field', label: 'Unit of Measure', value: row.unitOfMeasure, noHover: true },
          { type: 'dg', key: 'isActive' },
          { type: 'dg', key: 'approvalStatus' },
          ...(row.rejectionReason ? [{ type: 'field' as const, label: 'Rejection Reason', value: row.rejectionReason, noHover: true }] : []),
        ],
      },
      {
        title: 'Description',
        fields: [
          { type: 'field', label: 'Description', value: row.productDescription },
          { type: 'field', label: 'Created', value: this.datePipe.transform(row.createdDate, 'dd MMM yyyy'), noHover: true },
        ],
      },
    ];
  }

  pricingSections(row: Product): DetailOverviewSection[] {
    return [
      {
        title: 'Pricing',
        columns: '2',
        fields: [
          { type: 'field', label: 'Default Selling Price', value: row.defaultSellingPrice, numeric: true, noHover: true },
          { type: 'field', label: 'Estimated Cost', value: row.estimatedCost, numeric: true, noHover: true },
          { type: 'field', label: 'Tax Rate', value: row.defaultTaxRate, numeric: true, noHover: true },
        ],
      },
    ];
  }
}
