import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Subscription } from 'rxjs';
import { StockEntryService, StockOverview, StockOverviewQueryParams } from 'src/app/core/services/stock-entry/stock-entry.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';
import { KpiCardComponent } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent } from 'src/app/shared/components/report-filters/report-filters.component';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

interface BreakdownRow {
  id: string;
  name: string;
  items: number;
  onHand: number;
  reserved: number;
  available: number;
  quarantined: number;
  value: number;
}

type BreakdownKey = 'productCategory' | 'productSegment' | 'warehouseName';

/**
 * Stock overview report: KPIs and breakdowns computed client-side from `getStockOverview`
 * (there is no dedicated report endpoint on the server, unlike quotations). Sits next to the
 * Overview list under the same List | Report toggle, same page shell as the quotation report.
 */
@Component({
  selector: 'app-stock-overview-report',
  standalone: true,
  templateUrl: './stock-overview-report.component.html',
  styleUrl: './stock-overview-report.component.css',
  providers: [NumberFormatterPipe],
  imports: [
    NgIf, NgFor, NgClass, RouterLink, FormsModule, NgIcon,
    ViewToggleComponent, ActionButtonComponent, DataGridComponent, KpiCardComponent, ReportFiltersComponent, NumberFormatterPipe,
  ],
})
export class StockOverviewReportComponent implements OnInit, OnDestroy {
  @ViewChild('breakdownGrid') breakdownGrid?: DataGridComponent<BreakdownRow>;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Overview' }];

  loading = true;
  failed = false;
  rows: StockOverview[] = [];

  summary = {
    totalItems: 0,
    totalOnHand: 0,
    totalReserved: 0,
    totalAvailable: 0,
    totalQuarantined: 0,
    totalValue: 0,
    exceptionCount: 0,
  };

  filters: ReportFilterValues = { productCategory: null, productSegment: null, warehouseName: null };
  filterFields: ReportFilterField[] = [
    { key: 'productCategory', label: 'Category', type: 'select', options: [], placeholder: 'All categories' },
    { key: 'productSegment', label: 'Segment', type: 'select', options: [], placeholder: 'All segments' },
    { key: 'warehouseName', label: 'Warehouse', type: 'select', options: [], placeholder: 'All warehouses' },
  ];

  breakdownKey: BreakdownKey = 'productCategory';
  readonly breakdownTabs: { key: BreakdownKey; label: string }[] = [
    { key: 'productCategory', label: 'Category' },
    { key: 'productSegment', label: 'Segment' },
    { key: 'warehouseName', label: 'Warehouse' },
  ];
  breakdownColumns: DataGridColumn<BreakdownRow>[] = [];

  private categoryIdByName = new Map<string, string>();
  private segmentIdByName = new Map<string, string>();
  private warehouseIdByName = new Map<string, string>();

  private subscriptions = new Subscription();

  constructor(
    private stockEntryService: StockEntryService,
    private productCategoryService: ProductCategoryService,
    private profileService: ProfileService,
    private warehouseService: WarehouseService,
    private excelExport: ExcelExportService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildBreakdownColumns();
    this.loadFilterOptions();

    this.subscriptions.add(
      this.route.queryParams.subscribe((params) => {
        this.filters = Object.fromEntries(this.filterFields.map((f) => [f.key, params[f.key] || null]));
        this.fetch();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private loadFilterOptions(): void {
    this.subscriptions.add(
      this.productCategoryService.getProductCategories().subscribe((categories) => {
        (categories ?? []).forEach((c) => this.categoryIdByName.set(c.categoryName, c._id as string));
        this.setOptions('productCategory', (categories ?? []).map((c) => ({ label: c.categoryName, value: c._id as string })));
      })
    );
    this.subscriptions.add(
      this.profileService.getDepartments().subscribe((departments) => {
        (departments ?? []).forEach((d) => this.segmentIdByName.set(d.departmentName, d._id as string));
        this.setOptions('productSegment', (departments ?? []).map((d) => ({ label: d.departmentName, value: d._id as string })));
      })
    );
    this.subscriptions.add(
      this.warehouseService.getWarehouses().subscribe((warehouses) => {
        (warehouses ?? []).forEach((w) => this.warehouseIdByName.set(w.wareHouseName, w._id as string));
        this.setOptions('warehouseName', (warehouses ?? []).map((w) => ({ label: w.wareHouseName, value: w._id as string })));
      })
    );
  }

  private setOptions(key: string, options: { label: string; value: any }[]): void {
    this.filterFields = this.filterFields.map((f) => (f.key === key ? { ...f, options } : f));
  }

  private fetch(): void {
    this.loading = true;
    this.failed = false;
    const params: StockOverviewQueryParams = {
      row: Number.MAX_SAFE_INTEGER,
      productCategory: this.filters['productCategory'] ?? undefined,
      productSegment: this.filters['productSegment'] ?? undefined,
      targetWarehouse: this.filters['warehouseName'] ?? undefined,
    };
    this.subscriptions.add(
      this.stockEntryService.getStockOverview(params).subscribe({
        next: (res) => {
          this.rows = res.data?.overview ?? [];
          this.summary = res.data?.summary ?? this.summary;
          this.loading = false;
        },
        error: () => {
          this.rows = [];
          this.loading = false;
          this.failed = true;
        },
      })
    );
  }

  /** Filter changes go through the URL, so a refresh or a switch to the list keeps them. */
  onFilterChange(values: ReportFilterValues): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: values,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Query params handed to the List tab, so switching back keeps the same slice of data. */
  get listQueryParams(): Record<string, string | null> {
    return { ...this.filters };
  }

  // --- Breakdown ------------------------------------------------------------------------------

  private buildBreakdownColumns(): void {
    this.breakdownColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'items', label: 'Rows', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      { key: 'onHand', label: 'On Hand', type: 'number', sortable: true, align: 'right', aggregate: 'sum' },
      { key: 'reserved', label: 'Reserved', type: 'number', sortable: true, align: 'right', aggregate: 'sum' },
      { key: 'available', label: 'Available', type: 'number', sortable: true, align: 'right', aggregate: 'sum' },
      { key: 'quarantined', label: 'Quarantine', type: 'number', sortable: true, align: 'right', aggregate: 'sum' },
      { key: 'value', label: 'Stock Value', type: 'currency', sortable: true, align: 'right', aggregate: 'sum' },
    ];
  }

  get breakdownRows(): BreakdownRow[] {
    const key = this.breakdownKey;
    const groups = new Map<string, BreakdownRow>();
    for (const r of this.rows) {
      const name = (r[key] as unknown as string) || 'Unassigned';
      let group = groups.get(name);
      if (!group) {
        group = { id: name, name, items: 0, onHand: 0, reserved: 0, available: 0, quarantined: 0, value: 0 };
        groups.set(name, group);
      }
      group.items += 1;
      group.onHand += r.onHandQuantity || 0;
      group.reserved += r.reservedQuantity || 0;
      group.available += r.availableQuantity || 0;
      group.quarantined += r.quarantinedQuantity || 0;
      group.value += r.stockValue || 0;
    }
    return Array.from(groups.values()).sort((a, b) => b.value - a.value);
  }

  setBreakdown(key: BreakdownKey): void {
    this.breakdownKey = key;
  }

  /** Clicking a breakdown row opens the list filtered to it — the report answers "which group", the list "which item". */
  onBreakdownRowOpen(row: BreakdownRow): void {
    this.breakdownGrid?.closeDetail();
    const idByName = this.breakdownKey === 'productCategory' ? this.categoryIdByName
      : this.breakdownKey === 'productSegment' ? this.segmentIdByName
      : this.warehouseIdByName;
    const param = this.breakdownKey === 'warehouseName' ? 'warehouseName' : this.breakdownKey;
    const value = idByName.get(row.name) ?? row.name;
    this.router.navigate(['/stock/overview'], { queryParams: { [param]: value } });
  }

  // --- Exceptions -------------------------------------------------------------------------------

  get exceptionRows(): StockOverview[] {
    return this.rows
      .filter((r) => (r.quarantinedQuantity || 0) > 0 || (r.availableQuantity || 0) <= 0)
      .sort((a, b) => (b.quarantinedQuantity || 0) - (a.quarantinedQuantity || 0))
      .slice(0, 50);
  }

  exceptionReason(row: StockOverview): string {
    if ((row.quarantinedQuantity || 0) > 0) return `${row.quarantinedQuantity} in quarantine`;
    return 'No available stock';
  }

  // --- Export -------------------------------------------------------------------------------

  exportExcel(): void {
    if (!this.rows.length) return;
    const money = (n: number) => Math.round(n || 0);

    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 22 }],
        rows: ([
          ['Item / Warehouse rows', this.summary.totalItems],
          ['On hand', money(this.summary.totalOnHand)],
          ['Reserved', money(this.summary.totalReserved)],
          ['Available', money(this.summary.totalAvailable)],
          ['Quarantine', money(this.summary.totalQuarantined)],
          ['Stock value', money(this.summary.totalValue)],
        ] as [string, unknown][]).map(([metric, value]) => ({ metric, value })),
      },
      ...this.breakdownTabs.map((t): ExcelSheet => ({
        name: t.label,
        columns: [
          { header: 'Name', key: 'name', width: 32 },
          { header: 'Rows', key: 'items', width: 12 },
          { header: 'On Hand', key: 'onHand', width: 14 },
          { header: 'Reserved', key: 'reserved', width: 14 },
          { header: 'Available', key: 'available', width: 14 },
          { header: 'Quarantine', key: 'quarantined', width: 14 },
          { header: 'Stock Value', key: 'value', width: 16 },
        ],
        rows: this.groupBy(t.key).map((r) => ({ ...r, onHand: money(r.onHand), reserved: money(r.reserved), available: money(r.available), quarantined: money(r.quarantined), value: money(r.value) })),
      })),
      {
        name: 'Exceptions',
        columns: [
          { header: 'Item Code', key: 'itemCode', width: 16 },
          { header: 'Description', key: 'productDescription', width: 32 },
          { header: 'Warehouse', key: 'warehouseName', width: 20 },
          { header: 'Reason', key: 'reason', width: 24 },
        ],
        rows: this.exceptionRows.map((r) => ({ itemCode: r.itemCode, productDescription: r.productDescription, warehouseName: r.warehouseName, reason: this.exceptionReason(r) })),
      },
    ];

    void this.excelExport.download('stock-overview-report.xlsx', sheets);
  }

  private groupBy(key: BreakdownKey): BreakdownRow[] {
    const prevKey = this.breakdownKey;
    this.breakdownKey = key;
    const rows = this.breakdownRows;
    this.breakdownKey = prevKey;
    return rows;
  }

  trackById = (_: number, r: StockOverview) => `${r.itemCode}-${r.warehouseId}`;
}
