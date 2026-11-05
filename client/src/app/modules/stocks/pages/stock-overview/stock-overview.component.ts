import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { StockItemDetails, StockOverviewParams, StockReservationRow, StockRow, StockService } from 'src/app/core/services/stock/stock.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailMetaComponent } from 'src/app/shared/components/detail-panel/detail-meta.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailMetaItem, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { FormPromptService } from 'src/app/shared/components/form-prompt-modal/form-prompt.service';
import { StockAdjustDrawerComponent } from '../stock-adjust-drawer/stock-adjust-drawer.component';

/**
 * Stock by product: what is on hand, what is reserved for sales and jobs, and what is still available.
 * Adjustments open from here; quarantined stock is released or written off from here too.
 */
@Component({
  selector: 'app-stock-overview',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailMetaComponent, DetailOverviewComponent,DetailTimelineComponent, StockAdjustDrawerComponent],
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
  private auditLog = inject(AuditLogService);

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Stock Balance' }];

  tableData = signal<StockRow[]>([]);
  columns: DataGridColumn<StockRow>[] = [];
  isLoading = signal<boolean>(false);
  totalItems = signal<number>(0);
  summary = signal({ totalItems: 0, availableCount: 0, reservedCount: 0, quarantineCount: 0 });
  reservations = signal<StockReservationRow[]>([]);
  details = signal<StockItemDetails | null>(null);
  historyEntries = signal<DetailTimelineEntry[]>([]);

  adjustOpen = false;
  adjustProductId = '';
  adjustWarehouseId = '';

  views: DataGridView<StockRow>[] = [
    { id: 'all', label: 'All' },
    { id: 'available', label: 'Available' },
    { id: 'reserved', label: 'Reserved' },
    { id: 'quarantine', label: 'Quarantine' },
  ];

  readonly detailTabs = [
    { id: 'details', label: 'Details', icon: 'info' },
    { id: 'history', label: 'History', icon: 'files' },
  ];
  readonly warehouseColumns: DetailTableColumn[] = [
    { key: 'warehouseName', label: 'Warehouse' },
    { key: 'quantity', label: 'On hand', type: 'number', total: true },
    { key: 'quarantined', label: 'Quarantine', type: 'number', total: true },
  ];
  readonly jobColumns: DetailTableColumn[] = [
    { key: 'jobId', label: 'Job' },
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Status' },
    { key: 'reservedQty', label: 'Reserved', type: 'number', total: true },
    { key: 'reservedOn', label: 'Reserved on', type: 'date' },
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

  detailTitle = (r: StockRow) => r.itemCode || r.partNo;
  detailSubtitle = () => '';

  ngOnInit(): void {
    this.setupColumns();
    this.loadFilterOptions();
    this.loadStock();
  }

  setupColumns(): void {
    this.columns = [
      { key: 'lastMovementDate', label: 'Date', type: 'date', sortable: true },
      { key: 'itemCode', label: 'Item Code', sortable: true },
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
      { key: 'stockValue', label: 'Value', type: 'currency', sortable: true },
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
        // On hand adds nothing when it equals available on every row, so the column is dropped.
        const onHandRedundant = this.tableData().length > 0 && this.tableData().every((r) => r.onHandQuantity === r.availableQuantity);
        this.columns = this.columns.map((c) => (c.key === 'onHandQuantity' ? { ...c, visible: !onHandRedundant } : c));
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
    this.details.set(null);
    this.historyEntries.set([]);
    this.stockService.getItemDetails(row.productId).subscribe({
      next: (res) => this.details.set(res.data),
      error: () => this.details.set(null),
    });
    this.stockService.getReservations(row.productId).subscribe({
      next: (res) => this.reservations.set(res.data),
      error: () => this.reservations.set([]),
    });
    this.auditLog.getHistory('stock', row.productId).subscribe({
      next: (entries) => this.historyEntries.set(toTimelineEntries(entries || [])),
      error: () => this.historyEntries.set([]),
    });
  }

  onRowAction(event: DataGridRowActionEvent<StockRow>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'adjust':
        // preselect the warehouse only when the stock sits in a single one
        this.openAdjust(row.productId, row.warehouses?.length === 1 ? row.warehouses[0].warehouseId : '');
        break;
      case 'ledger':
        this.router.navigate(['/stock/ledger'], { queryParams: { product: row.productId, label: row.partNo || row.itemCode } });
        break;
      case 'quarantine':
        void this.moveQuarantine(row);
        break;
    }
  }

  openAdjust(productId = '', warehouseId = ''): void {
    this.adjustProductId = productId;
    this.adjustWarehouseId = warehouseId;
    this.adjustOpen = true;
  }

  closeAdjust(): void {
    this.adjustOpen = false;
  }

  metaFor(row: StockRow): DetailMetaItem[] {
    return [
      { label: 'On hand', value: row.onHandQuantity },
      { label: 'Reserved', value: row.reservedQuantity, tone: row.reservedQuantity > 0 ? 'warn' : undefined },
      { label: 'Available', value: row.availableQuantity, tone: row.availableQuantity > 0 ? 'good' : 'bad' },
      { label: 'Stock value', value: row.stockValue, format: 'currency' },
    ];
  }

  detailSections(): DetailOverviewSection[] {
    const d = this.details();
    if (!d) return [];
    const v = (x: any) => (x === undefined || x === null || x === '' ? '-' : x);
    const money = (x: any, cur?: string) => (x === undefined || x === null ? '-' : `${cur ? cur + ' ' : ''}${Number(x).toFixed(2)}`);
    const date = (x: any) => (x ? new Date(x).toLocaleDateString('en-GB') : '-');
    const sections: DetailOverviewSection[] = [
      {
        title: 'Item details',
        columns: '2',
        fields: [
          { type: 'field', label: 'Description', value: v(d.item['description']), fullRow: true },
          { type: 'field', label: 'Item code', value: v(d.item['itemCode']) },
          { type: 'field', label: 'Part no', value: v(d.item['partNo']) },
          { type: 'field', label: 'Brand', value: v(d.item['brand']) },
          { type: 'field', label: 'Category', value: v(d.item['category']) },
          { type: 'field', label: 'UOM', value: v(d.item['uom']) },
          { type: 'field', label: 'Type', value: v(d.item['type']) },
        ],
      },
    ];
    const po = d.lastPo;
    sections.push({
      title: 'Price & supplier (last PO)',
      columns: '2',
      fields: po ? [
        { type: 'field', label: 'PO no', value: v(po['poNo']) },
        { type: 'field', label: 'PO date', value: date(po['poDate']) },
        { type: 'field', label: 'Supplier', value: v(po['supplier']) },
        { type: 'field', label: 'PO status', value: v(po['status']) },
        { type: 'field', label: 'Unit price', value: money(po['unitCost'], po['currency']), numeric: true },
        { type: 'field', label: 'Quantity', value: v(po['quantity']), numeric: true },
        { type: 'field', label: 'Total', value: money(po['totalCost'], po['currency']), numeric: true },
        { type: 'field', label: 'Job', value: v(po['job']) },
      ] : [{ type: 'field', label: 'Last PO', value: 'No purchase order yet' }],
    });
    const held = this.reservationRows();
    sections.push({
      title: 'Reservations',
      columns: '2',
      fields: held.length
        ? held.flatMap((r) => [
            { type: 'field' as const, label: 'Job no', value: r['heldFor'] },
            { type: 'field' as const, label: 'Reserved qty', value: r['quantity'], numeric: true },
            { type: 'field' as const, label: 'Sales person', value: r['salesPerson'] },
            { type: 'field' as const, label: 'Customer', value: r['customer'] },
            { type: 'field' as const, label: 'Until', value: date(r['until']) },
          ])
        : [{ type: 'field' as const, label: 'Reserved', value: 'Nothing is reserved for this item.' }],
    });
    return sections;
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
    const fullName = (p?: { firstName?: string; lastName?: string } | null) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');
    return this.reservations().map((r) => ({
      heldFor: r.job?.jobId ? r.job.jobId : r.quote?.quoteId ? `Quote ${r.quote.quoteId}` : 'Manual',
      salesPerson: fullName(r.job?.quoteId?.createdBy) || fullName(r.quote?.createdBy) || fullName(r.createdBy) || '-',
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
      count: v.id === 'all' ? s.totalItems : v.id === 'available' ? s.availableCount : v.id === 'reserved' ? s.reservedCount : s.quarantineCount,
    }));
  }
}
