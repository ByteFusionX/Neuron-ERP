import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { StockItemDetails, StockLedgerParams, StockMovement, StockService } from 'src/app/core/services/stock/stock.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DetailMetaComponent } from 'src/app/shared/components/detail-panel/detail-meta.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailMetaItem, DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';

/** Read-only history of every stock movement: receipts, deliveries, returns and adjustments, newest first. */
@Component({
  selector: 'app-stock-ledger',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailMetaComponent, DetailOverviewComponent],
  templateUrl: './stock-ledger.component.html',
  styleUrl: './stock-ledger.component.css'
})
export class StockLedgerComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<StockMovement>;
  private stockService = inject(StockService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private subscription = new Subscription();

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Stock Movement' }];

  tableData = signal<StockMovement[]>([]);
  isLoading = signal(false);
  totalItems = signal(0);
  subtitle = 'Every receipt, delivery, return and adjustment. Nothing here can be edited or deleted.';

  views: DataGridView<StockMovement>[] = [
    { id: 'all', label: 'All' },
    { id: 'Receipt', label: 'Receipts' },
    { id: 'Delivery', label: 'Deliveries' },
    { id: 'Return', label: 'Returns' },
    { id: 'Adjustment', label: 'Adjustments' },
  ];

  columns: DataGridColumn<StockMovement>[] = [
    { key: 'movementDate', label: 'Date', type: 'date' },
    { key: 'product', label: 'Item', valueGetter: (r) => [r.product?.itemCode || r.product?.partNo, r.product?.productDescription].filter(Boolean).join(' - ') },
    { key: 'warehouse', label: 'Warehouse', valueGetter: (r) => r.warehouse?.wareHouseName || '-' },
    { key: 'movementType', label: 'Type' },
    { key: 'quantityIn', label: 'In', type: 'number', cellClass: (r) => (r.quantityIn ? 'text-emerald-600 font-semibold' : '') },
    { key: 'quantityOut', label: 'Out', type: 'number', cellClass: (r) => (r.quantityOut ? 'text-red-600 font-semibold' : '') },
    { key: 'stockStatus', label: 'Stock', valueGetter: (r) => (r.stockStatus === 'Quarantine' ? 'Quarantine' : 'Available') },
    { key: 'referenceNo', label: 'Document', valueGetter: (r) => [r.referenceType, r.referenceNo].filter(Boolean).join(' ') || '-' },
    { key: 'reason', label: 'Reason', valueGetter: (r) => r.reason || r.remarks || '' },
    { key: 'createdBy', label: 'By', valueGetter: (r) => [r.createdBy?.firstName, r.createdBy?.lastName].filter(Boolean).join(' ') },
  ];

  readonly detailTabs = [{ id: 'overview', label: 'Details', icon: 'info' }];
  details = signal<StockItemDetails | null>(null);
  detailTitle = (r: StockMovement) => r.product?.itemCode || r.product?.partNo || '';
  detailSubtitle = (r: StockMovement) => [r.movementType, r.referenceNo].filter(Boolean).join(' · ');

  onRowOpen(r: StockMovement): void {
    this.details.set(null);
    if (!r.product?._id) return;
    this.stockService.getItemDetails(r.product._id).subscribe({
      next: (res) => this.details.set(res.data),
      error: () => this.details.set(null),
    });
  }

  itemSections(): DetailOverviewSection[] {
    const d = this.details();
    if (!d) return [];
    const v = (x: any) => (x === undefined || x === null || x === '' ? '-' : x);
    return [
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
  }

  page = 1;
  row = 15;
  private searchTerm = '';
  private movementType = '';
  private product = '';

  metaFor(r: StockMovement): DetailMetaItem[] {
    return [
      { label: 'Type', value: r.movementType },
      { label: 'In', value: r.quantityIn || 0, tone: r.quantityIn ? 'good' : undefined },
      { label: 'Out', value: r.quantityOut || 0, tone: r.quantityOut ? 'bad' : undefined },
      { label: 'Stock', value: r.stockStatus === 'Quarantine' ? 'Quarantine' : 'Available' },
    ];
  }

  overviewSections(r: StockMovement): DetailOverviewSection[] {
    const by = [r.createdBy?.firstName, r.createdBy?.lastName].filter(Boolean).join(' ');
    return [
      ...this.itemSections(),
      {
        title: 'Movement',
        columns: '2',
        fields: [
          { type: 'field', label: 'Warehouse', value: r.warehouse?.wareHouseName || '-' },
          { type: 'field', label: 'Date', value: r.movementDate ? new Date(r.movementDate).toLocaleString() : '-' },
          { type: 'field', label: 'Document', value: [r.referenceType, r.referenceNo].filter(Boolean).join(' ') || '-' },
          { type: 'field', label: 'Quantity in', value: r.quantityIn || 0, numeric: true },
          { type: 'field', label: 'Quantity out', value: r.quantityOut || 0, numeric: true },
          { type: 'field', label: 'Unit cost', value: r.unitCost != null ? r.unitCost.toFixed(2) : '-', numeric: true },
          { type: 'field', label: 'Recorded by', value: by || '-' },
          { type: 'field', label: 'Reason', value: r.reason || '-' },
          { type: 'field', label: 'Remarks', value: r.remarks || '-' },
        ],
      },
    ];
  }

  ngOnInit(): void {
    this.subscription.add(this.route.queryParamMap.subscribe((params) => {
      this.product = params.get('product') || '';
      this.subtitle = this.product && params.get('label')
        ? `History for ${params.get('label')}`
        : 'Every receipt, delivery, return and adjustment. Nothing here can be edited or deleted.';
      this.page = 1;
      this.load();
    }));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  load(): void {
    this.isLoading.set(true);
    const params: StockLedgerParams = {
      page: this.page,
      row: this.row,
      search: this.searchTerm || undefined,
      movementType: this.movementType || undefined,
      product: this.product || undefined,
    };
    this.stockService.getLedger(params).subscribe({
      next: (res) => {
        this.tableData.set(res.data.movements);
        this.totalItems.set(res.data.pagination.total);
        const counts = res.data.counts;
        if (counts) this.views = this.views.map((v) => ({ ...v, count: counts[v.id] ?? 0 }));
        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load the stock ledger');
        this.isLoading.set(false);
      },
    });
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchTerm = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.load();
  }

  onViewChange(view: DataGridView<StockMovement>): void {
    this.movementType = view.id === 'all' ? '' : view.id;
    this.page = 1;
    this.load();
  }
}
