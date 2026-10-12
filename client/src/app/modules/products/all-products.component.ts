import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AsyncPipe, DatePipe, NgSwitch, NgSwitchCase } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, forkJoin, Observable, of, Subscription } from 'rxjs';
import { ProductService, Product, ProductQueryParams } from 'src/app/core/services/product/product.service';
import { PRODUCT_TYPES } from 'src/app/shared/interfaces/product.interface';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridColumn, DataGridDetailTab,
  DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection, DetailRelatedItem, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';
import { DetailRelatedListComponent } from 'src/app/shared/components/detail-panel/detail-related-list.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { StatusPillComponent } from 'src/app/shared/components/status-indicator/status-pill.component';
import { StatusTone } from 'src/app/shared/components/status-indicator/status-tone';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { ProductFormDrawerComponent } from './pages/product-form-drawer/product-form-drawer.component';
import { ModalService } from 'src/app/shared/components/modal';
import { ProductImportComponent } from './modals/product-import/product-import.component';
import { DuplicatesReportComponent } from './modals/duplicates-report/duplicates-report.component';

@Component({
  selector: 'app-all-products',
  standalone: true,
  imports: [NgSwitch, NgSwitchCase, AsyncPipe, DatePipe, DataGridComponent, DetailOverviewComponent, DetailTimelineComponent, DetailRelatedListComponent, StatusPillComponent, ProductFormDrawerComponent],
  templateUrl: './all-products.component.html',
  styleUrl: './all-products.component.css',
  providers: [DatePipe],
})
export class AllProductsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<Product>;

  private productService = inject(ProductService);
  private productCategoryService = inject(ProductCategoryService);
  private profileService = inject(ProfileService);
  private warehouseService = inject(WarehouseService);
  private confirm = inject(ConfirmDialogService);
  private toastr = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auditLog = inject(AuditLogService);
  private employeeService = inject(EmployeeService);
  private modal = inject(ModalService);
  private subscriptions = new Subscription();

  isLoading = true;
  rows: Product[] = [];
  total = 0;
  page = 1;
  row = 15;
  searchQuery = '';

  columns: DataGridColumn<Product>[] = [];
  rowActions: DataGridRowAction<Product>[] = [];
  views: DataGridView<Product>[] = [{ id: 'all', label: 'All' }, { id: 'review', label: 'Needs review' }, { id: 'inactive', label: 'Inactive' }];
  bulkActions: DataGridBulkAction[] = [{ id: 'delete', label: 'Delete', variant: 'danger' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'pricing', label: 'Pricing', icon: 'wallet' },
    { id: 'suppliers', label: 'Suppliers', icon: 'files' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];
  private activeViewId = 'all';

  /** Without a product name the description names the item, and the code stays as the subtitle. */
  productTitle = (r: Product) => r.productName || r.productDescription || r.itemCode || '';
  productSubtitle = (r: Product) => ((r.productName || r.productDescription) ? r.itemCode : '') ?? '';

  readonly activeTones: Record<string, StatusTone> = { Active: 'success', Inactive: 'neutral' };

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();
  private supplierCache = new Map<string, BehaviorSubject<DetailRelatedItem[] | null>>();

  private readonly supplierTones: Record<string, DetailTone> = { Approved: 'good', Pending: 'warn', Rejected: 'bad' };

  /** Emits null while loading, then the suppliers that list this product. */
  suppliersFor(row: Product): Observable<DetailRelatedItem[] | null> {
    const id = row._id as string;
    let subject = this.supplierCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<DetailRelatedItem[] | null>(null);
      this.supplierCache.set(id, subject);
      this.productService.getProductSuppliers(id).subscribe({
        next: (suppliers) => subject!.next(suppliers.map((s) => ({
          id: s._id,
          title: s.supplierName,
          subtitle: [s.supplierId, s.isDefault ? 'Default vendor' : ''].filter(Boolean).join(' · '),
          lines: [
            [s.contactName, s.contactNo].filter(Boolean).join(' · '),
            s.contactEmail ?? '',
            s.paymentTerm ? `Payment term: ${s.paymentTerm}` : '',
          ].filter(Boolean),
          badge: s.status,
          tone: this.supplierTones[s.status ?? ''] ?? 'neutral',
        }))),
        error: () => this.supplierCache.delete(id),
      });
    }
    return subject.asObservable();
  }

  historyFor(row: Product): Observable<DetailTimelineEntry[]> {
    const id = row._id as string;
    let subject = this.historyCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(id, subject);
      this.auditLog.getHistory('product', id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(id),
      });
    }
    return subject.asObservable();
  }

  private appliedFilters: Record<string, any> = {};
  private advancedFilters: { key: string; op: string; value: any }[] = [];
  private sort: { sortBy?: string; sortDir?: 'asc' | 'desc' } = {};
  private readonly serverFilterKeys = ['productCategory', 'productSegment', 'warehouse', 'itemCode', 'partNo', 'productName', 'productDescription', 'type', 'brand', 'unitOfMeasure'];

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this.loadFilterOptions();
    this.getProducts();
  }

  /** `?search=` (e.g. from the command palette) is typed into the grid's search once it exists. */
  ngAfterViewInit(): void {
    const search = this.route.snapshot.queryParamMap.get('search');
    if (!search) return;
    setTimeout(() => {
      this.grid?.onSearch(search);
      this.router.navigate([], { relativeTo: this.route, queryParams: { search: null }, queryParamsHandling: 'merge', replaceUrl: true });
    });
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
          'Stock': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          'Non-Stock': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          Service: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
        },
      },
      { key: 'productCategory', label: 'Category', valueGetter: (r) => r.productCategory?.categoryName },
      { key: 'productSegment', label: 'Department', valueGetter: (r) => r.productSegment?.departmentName },
      { key: 'warehouse', label: 'Warehouse', valueGetter: (r) => r.warehouse?.wareHouseName },
      { key: 'brand', label: 'Brand' },
      { key: 'parentModel', label: 'Model / Family' },
      { key: 'source', label: 'Source', width: '100px' },
      { key: 'approvalStatus', label: 'Review', width: '110px', valueGetter: (r) => r.approvalStatus ?? 'Approved' },
      { key: 'unitOfMeasure', label: 'UOM', width: '90px' },
      { key: 'defaultSellingPrice', label: 'Selling Price', type: 'number' },
      {
        key: 'isActive', label: 'Status', type: 'badge', width: '100px',
        valueGetter: (r) => (r.isActive ? 'Active' : 'Inactive'),
        editorOptions: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }],
        badgeClasses: {
          Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        },
      },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => this.ownerName(r) },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true },
      { id: 'approve', label: 'Approve', icon: 'check', quick: true, hidden: (r) => r.approvalStatus !== 'Pending' },
      { id: 'reject', label: 'Reject', variant: 'danger', hidden: (r) => r.approvalStatus !== 'Pending' },
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

  private queryParams(): ProductQueryParams {
    return {
      search: this.searchQuery || undefined,
      ...this.appliedFilters,
      ...(this.activeViewId === 'inactive' ? { isActive: 'false' } : {}),
      ...(this.activeViewId === 'review' ? { approvalStatus: 'Pending' } : {}),
      ...this.sort,
      advFilters: this.advancedFilters.length ? JSON.stringify(this.advancedFilters) : undefined,
    };
  }

  getProducts(): void {
    // Anything that reloads the list may have changed a product, so the cached histories are stale.
    this.historyCache.clear();
    this.supplierCache.clear();
    this.isLoading = true;
    const params: ProductQueryParams = { page: this.page, row: this.row, ...this.queryParams() };

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

    this.sort = query.sort?.key && query.sort.direction ? { sortBy: query.sort.key, sortDir: query.sort.direction } : {};
    this.appliedFilters = {};
    this.advancedFilters = [];
    for (const f of query.filters) {
      if (f.op === 'empty') {
        this.advancedFilters.push({ key: f.key, op: 'empty', value: null });
        continue;
      }
      if (f.value == null || f.value === '') continue;
      if (['contains', 'is'].includes(f.op) && this.serverFilterKeys.includes(f.key)) {
        this.appliedFilters[f.key] = f.value;
      } else if (['contains', 'is'].includes(f.op) && f.key === 'isActive') {
        this.appliedFilters['isActive'] = f.value === 'Active' ? 'true' : 'false';
      } else if (['isNot', 'notContains', 'eq', 'gt', 'lt'].includes(f.op)) {
        this.advancedFilters.push({ key: f.key, op: f.op, value: f.value });
      }
    }

    this.getProducts();
  }

  /** The grid only holds one page, so Export fetches every row matching the current search, filters and sort. */
  onExportAll(): void {
    this.subscriptions.add(
      this.productService.getProducts({ page: 1, row: 10000, ...this.queryParams() }).subscribe({
        next: (response) => {
          const all = response.data?.products ?? [];
          void this.grid.exportToExcel(all);
        },
        error: () => this.toastr.error('Failed to export products'),
      })
    );
  }

  onViewChange(view: DataGridView<Product>): void {
    this.activeViewId = view.id;
    this.page = 1;
    this.refreshViewCounts();
    this.getProducts();
  }

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: undefined, hideCount: true }));
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
        this.approve(row);
        break;
      case 'reject':
        void this.reject(row);
        break;
      case 'delete':
        void this.deleteProducts([row]);
        break;
    }
  }

  private approve(row: Product): void {
    this.productService.approveProduct(row._id as string).subscribe({
      next: () => { this.toastr.success(`${row.itemCode} approved`); this.getProducts(); },
      error: (e) => this.toastr.error(e?.error?.message || 'Failed to approve product'),
    });
  }

  private async reject(row: Product): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Reject product?',
      message: `${row.productName || row.productDescription || row.itemCode} will go back to Draft and stay out of the pickers.`,
      confirmLabel: 'Reject',
      reason: true,
    });
    if (!confirmed || !reason) return;
    this.productService.rejectProduct(row._id as string, reason).subscribe({
      next: () => { this.toastr.success(`${row.itemCode} rejected`); this.getProducts(); },
      error: (e) => this.toastr.error(e?.error?.message || 'Failed to reject product'),
    });
  }

  openImport(): void {
    this.modal.open<any, void>(ProductImportComponent, { width: '640px' }).afterClosed().subscribe((imported) => {
      if (imported) this.getProducts();
    });
  }

  openDuplicatesReport(): void {
    this.modal.open<any, void>(DuplicatesReportComponent, { width: '720px' });
  }

  onBulkAction({ action, rows }: DataGridBulkActionEvent<Product>, grid: DataGridComponent<Product>): void {
    if (action.id === 'delete') void this.deleteProducts(rows, grid);
  }

  private async deleteProducts(rows: Product[], grid?: DataGridComponent<Product>): Promise<void> {
    const count = rows.length === 1 ? `"${rows[0].productName || rows[0].itemCode}"` : `${rows.length} products`;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: rows.length === 1 ? 'Delete product?' : `Delete ${count}?`,
      message: `${count} will be removed from the product catalogue.`,
      consequence: "Products already used in quotations, RFQs, orders or stock can't be deleted. Mark them Inactive instead.",
      confirmLabel: 'Delete',
      // several at once: make the user type the count so "Select all" + Delete can't be a two-click accident
      typeToConfirm: rows.length > 1 ? String(rows.length) : undefined,
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
          { type: 'field', label: 'Department', value: row.productSegment?.departmentName, noHover: true },
          { type: 'field', label: 'Warehouse', value: row.warehouse?.wareHouseName, noHover: true },
          { type: 'field', label: 'Brand', value: row.brand, noHover: true },
          { type: 'field', label: 'Unit of Measure', value: row.unitOfMeasure, noHover: true },
          { type: 'field', label: 'Model / Family', value: row.parentModel, noHover: true },
          { type: 'field', label: 'Source', value: row.source ?? 'Manual', noHover: true },
          { type: 'field', label: 'Review', value: row.approvalStatus ?? 'Approved', noHover: true },
          { type: 'field', label: 'Generic item', value: row.isGeneric ? 'Yes' : '', noHover: true },
          { type: 'field', label: 'Other part numbers', value: (row.aliases ?? []).map((a) => `${a.value} (${a.type})`).join(', '), noHover: true },
          { type: 'dg', key: 'isActive' },
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
        ],
      },
    ];
  }
}
