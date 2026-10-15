import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { StockOverviewParams, StockReservationRow, StockRow, StockService } from 'src/app/core/services/stock/stock.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { FormPromptService } from 'src/app/shared/components/form-prompt-modal/form-prompt.service';
import { StockAdjustDrawerComponent } from '../stock-adjust-drawer/stock-adjust-drawer.component';

/**
 * Stock by product: what is on hand, what is reserved for sales and jobs, and what is still available.
 * Adjustments open from here; quarantined stock is released or written off from here too.
 */
@Component({
  selector: 'app-stock-overview',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, StockAdjustDrawerComponent],
  templateUrl: './stock-overview.component.html',
  styleUrl: './stock-overview.component.css'
})
export class StockOverviewComponent implements OnInit {
  @ViewChild('grid') grid!: DataGridComponent<StockRow>;

  private stockService = inject(StockService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private productCategoryService = inject(ProductCategoryService);
  private formPrompt = inject(FormPromptService);

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Stock Overview' }];

  tableData = signal<StockRow[]>([]);
  columns: DataGridColumn<StockRow>[] = [];
  isLoading = signal<boolean>(false);
  totalItems = signal<number>(0);
  summary = signal({ totalItems: 0, exceptionCount: 0, quarantineCount: 0 });
  reservations = signal<StockReservationRow[]>([]);

  adjustOpen = false;
  adjustProductId = '';

  views: DataGridView<StockRow>[] = [
    { id: 'all', label: 'All' },
    { id: 'exceptions', label: 'Low / short' },
    { id: 'quarantine', label: 'Quarantine' },
  ];

  readonly detailTabs = [
    { id: 'overview', label: 'Stock', icon: 'info' },
    { id: 'warehouses', label: 'Warehouses', icon: 'card' },
    { id: 'reservations', label: 'Reserved for', icon: 'files' },
  ];
  readonly warehouseColumns: DetailTableColumn[] = [
    { key: 'warehouseName', label: 'Warehouse' },
    { key: 'quantity', label: 'On hand', type: 'number', total: true },
    { key: 'quarantined', label: 'Quarantine', type: 'number', total: true },
  ];
  readonly reservationColumns: DetailTableColumn[] = [
    { key: 'heldFor', label: 'Held for' },
    { key: 'customer', label: 'Customer' },
    { key: 'source', label: 'Source' },
    { key: 'quantity', label: 'Quantity', type: 'number', total: true },
    { key: 'until', label: 'Until', type: 'date' },
  ];

  rowActions: DataGridRowAction<StockRow>[] = [
    { id: 'adjust', label: 'Adjust stock', icon: 'pencil', quick: true },
    { id: 'ledger', label: 'View ledger', icon: 'eye', quick: true },
    { id: 'quarantine', label: 'Release / write off quarantine', hidden: (row) => !row.quarantinedQuantity },
  ];

  page = 1;
  row = 15;
  private searchTerm = '';
  private sortKey: string | null = null;
  private sortDir: 'asc' | 'desc' | null = null;
  private activeViewId: StockOverviewParams['view'] = 'all';
  private appliedFilters: Record<string, any> = {};

  detailTitle = (r: StockRow) => r.partNo || r.itemCode;
  detailSubtitle = (r: StockRow) => r.productDescription;

  ngOnInit(): void {
    this.setupColumns();
    this.loadFilterOptions();
    this.loadStock();
  }

  setupColumns(): void {
    this.columns = [
      { key: 'itemCode', label: 'Item Code', sortable: true },
      { key: 'partNo', label: 'Part No', sortable: true },
      { key: 'productDescription', label: 'Description', sortable: true },
      { key: 'productCategory', label: 'Category', sortable: true },
      { key: 'uom', label: 'UOM', sortable: true },
      { key: 'warehouseText', label: 'Warehouses', visible: false },
      { key: 'onHandQuantity', label: 'On Hand', type: 'number', sortable: true },
      { key: 'reservedQuantity', label: 'Reserved', type: 'number', sortable: true, cellClass: () => 'text-amber-600 font-semibold' },
      {
        key: 'availableQuantity', label: 'Available', type: 'number', sortable: true,
        cellClass: (r) => (r.availableQuantity > 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold')
      },
      { key: 'quarantinedQuantity', label: 'Quarantine', type: 'number', sortable: true, cellClass: (r) => (r.quarantinedQuantity > 0 ? 'text-red-600 font-semibold' : '') },
      { key: 'stockValue', label: 'Value', type: 'currency', sortable: true, visible: false },
    ];
  }

  loadFilterOptions(): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        const editorOptions = (categories ?? []).map((category) => ({ label: category.categoryName, value: category._id as string }));
        this.columns = this.columns.map((c) => (c.key === 'productCategory' ? { ...c, editorOptions } : c));
      }
    });
  }

  loadStock(extra: Partial<StockOverviewParams> = {}): void {
    this.isLoading.set(true);
    const params: StockOverviewParams = {
      page: extra.page ?? this.page,
      row: extra.row ?? this.row,
      search: this.searchTerm || undefined,
      view: this.activeViewId,
      sortKey: this.sortKey || undefined,
      sortDir: this.sortDir || undefined,
      ...this.appliedFilters,
    };

    this.stockService.getOverview(params).subscribe({
      next: (response) => {
        const pagination = response.data.pagination;
        const startIndex = (pagination.page - 1) * pagination.limit;
        this.tableData.set(response.data.overview.map((item, index) => ({ ...item, rowNo: startIndex + index + 1 })));
        this.summary.set(response.data.summary);
        this.totalItems.set(pagination.total);
        this.page = pagination.page;
        this.row = pagination.limit;
        this.refreshViewCounts();
        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load stock');
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
    const filters: Record<string, any> = {};
    for (const f of query.filters) filters[f.key] = f.value;
    this.appliedFilters = filters;
    this.loadStock({ page: this.page });
  }

  onViewChange(view: DataGridView<StockRow>): void {
    this.activeViewId = view.id as StockOverviewParams['view'];
    this.loadStock({ page: 1 });
  }

  onRowOpen(row: StockRow): void {
    this.reservations.set([]);
    this.stockService.getReservations(row.productId).subscribe({
      next: (res) => this.reservations.set(res.data),
      error: () => this.reservations.set([]),
    });
  }

  onRowAction(event: DataGridRowActionEvent<StockRow>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'adjust':
        this.openAdjust(row.productId);
        break;
      case 'ledger':
        this.router.navigate(['/stock/ledger'], { queryParams: { product: row.productId, label: row.partNo || row.itemCode } });
        break;
      case 'quarantine':
        void this.moveQuarantine(row);
        break;
    }
  }

  openAdjust(productId = ''): void {
    this.adjustProductId = productId;
    this.adjustOpen = true;
  }

  closeAdjust(): void {
    this.adjustOpen = false;
  }

  overviewSections(row: StockRow): DetailOverviewSection[] {
    return [
      {
        title: 'Item',
        columns: '2',
        fields: [
          { type: 'field', label: 'Item code', value: row.itemCode || '-' },
          { type: 'field', label: 'Part no', value: row.partNo || '-' },
          { type: 'field', label: 'Category', value: row.productCategory || '-' },
          { type: 'field', label: 'UOM', value: row.uom || '-' },
        ],
      },
      {
        title: 'Position',
        columns: '2',
        fields: [
          { type: 'field', label: 'On hand', value: row.onHandQuantity, numeric: true },
          { type: 'field', label: 'Reserved', value: row.reservedQuantity, numeric: true, tone: row.reservedQuantity > 0 ? 'warn' : undefined },
          { type: 'field', label: 'Available', value: row.availableQuantity, numeric: true, tone: row.availableQuantity > 0 ? 'good' : 'bad' },
          { type: 'field', label: 'Quarantine', value: row.quarantinedQuantity, numeric: true, tone: row.quarantinedQuantity > 0 ? 'bad' : undefined },
          { type: 'field', label: 'Short (reserved beyond stock)', value: row.shortfallQuantity, numeric: true, tone: 'bad', visible: row.shortfallQuantity > 0 },
          { type: 'field', label: 'Reorder point', value: row.reorderPoint || '-', numeric: true },
          { type: 'field', label: 'Stock value', value: row.stockValue.toFixed(2), numeric: true },
        ],
      },
    ];
  }

  reservationRows(): Record<string, any>[] {
    return this.reservations().map((r) => ({
      heldFor: r.job?.jobId ? `Job ${r.job.jobId}` : r.quote?.quoteId ? `Quote ${r.quote.quoteId}` : 'Manual',
      customer: r.customer?.companyName || '-',
      source: r.sourceType === 'Quotation' ? 'Won quote hold' : r.sourceType === 'Deal' ? 'Approved deal' : r.sourceType,
      quantity: r.quantity,
      until: r.expiresAt || '',
    }));
  }

  private async moveQuarantine(row: StockRow): Promise<void> {
    const quarantined = row.warehouses.filter((w) => w.quarantined > 0);
    if (!quarantined.length) return;
    const answer = await this.formPrompt.prompt({
      title: `Quarantine - ${row.partNo || row.itemCode}`,
      message: 'Release inspected goods back to sellable stock, or write them off. Stock still waiting on a supplier return is settled from the GRN returns page.',
      confirmLabel: 'Move stock',
      fields: [
        {
          key: 'warehouse', label: 'Warehouse', type: 'select', required: true, value: quarantined[0].warehouseId,
          options: quarantined.map((w) => ({ label: `${w.warehouseName} (${w.quarantined} quarantined)`, value: w.warehouseId })),
        },
        {
          key: 'action', label: 'Action', type: 'select', required: true, value: 'Release',
          options: [{ label: 'Release to stock', value: 'Release' }, { label: 'Write off', value: 'WriteOff' }],
        },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1, value: row.quarantinedQuantity },
        { key: 'remarks', label: 'Remarks', type: 'textarea', hint: 'Required to write off.' },
      ],
    });
    if (!answer) return;
    this.stockService.moveQuarantine({
      product: row.productId,
      warehouse: answer['warehouse'],
      quantity: Number(answer['quantity']),
      action: answer['action'] as 'Release' | 'WriteOff',
      remarks: answer['remarks'] || undefined,
    }).subscribe({
      next: (res) => {
        this.toastr.success(res.message || 'Done');
        this.loadStock();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Could not move the stock.'),
    });
  }

  private refreshViewCounts(): void {
    const s = this.summary();
    this.views = this.views.map((v) => ({
      ...v,
      count: v.id === 'all' ? s.totalItems : v.id === 'exceptions' ? s.exceptionCount : s.quarantineCount,
    }));
  }
}
