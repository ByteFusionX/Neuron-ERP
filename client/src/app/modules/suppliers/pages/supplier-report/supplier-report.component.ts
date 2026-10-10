import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';
import { SupplierReportRow, SupplierReportSummaryResponse, SupplierService } from 'src/app/core/services/supplier.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { buildBreadcrumbs } from 'src/app/shared/constants/nav-menu';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { SupplierListResponse } from 'src/app/shared/interfaces/suppliers.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { KpiCardComponent } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent } from 'src/app/shared/components/report-filters/report-filters.component';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';

type BreakdownRow = SupplierReportRow;

/**
 * Suppliers report: KPI strip plus a breakdown table by category or supplier type, with an Excel
 * export. Kept intentionally simpler than the quotations report (no charts) per the module's scope —
 * KPIs and the breakdown come from the server's `report-summary` aggregate; the per-supplier
 * sheet of the Excel export is fetched only when the user exports.
 */
@Component({
  selector: 'app-supplier-report',
  templateUrl: './supplier-report.component.html',
  styleUrls: ['./supplier-report.component.css'],
  providers: [NumberFormatterPipe],
  imports: [
    NgIf, NgFor, DecimalPipe, RouterLink,
    ActionButtonComponent, KpiCardComponent, ReportFiltersComponent, ViewToggleComponent, DataGridComponent,
  ],
})
export class SupplierReportComponent implements OnInit, OnDestroy {
  @ViewChild('breakdownGrid') breakdownGrid?: DataGridComponent<BreakdownRow>;

  breadcrumbs: DataGridBreadcrumb[] = buildBreadcrumbs('/suppliers').map((c) => ({ label: c.label, link: c.route ?? '/suppliers' }));

  loading = true;
  failed = false;
  totals: Omit<SupplierReportRow, 'id' | 'name'> = { total: 0, pending: 0, approved: 0, rejected: 0, creditValue: 0 };
  private summary: { byCategory: SupplierReportRow[]; bySupplierType: SupplierReportRow[] } = { byCategory: [], bySupplierType: [] };

  filters: ReportFilterValues = { category: null, supplierType: null, fromDate: null, toDate: null };
  filterFields: ReportFilterField[] = [
    { key: 'category', label: 'Category', type: 'select', options: [], placeholder: 'All categories' },
    { key: 'supplierType', label: 'Supplier Type', type: 'select', options: [
      { label: 'OEM', value: 'OEM' }, { label: 'Distributor', value: 'Distributor' },
      { label: 'Super Stockiest', value: 'Super Stockiest' }, { label: 'Reseller', value: 'Reseller' },
    ], placeholder: 'All types' },
    { key: 'fromDate', label: 'From', type: 'date' },
    { key: 'toDate', label: 'To', type: 'date' },
  ];

  breakdownKey: 'category' | 'supplierType' = 'category';
  readonly breakdownTabs: { key: 'category' | 'supplierType'; label: string }[] = [
    { key: 'category', label: 'Category' },
    { key: 'supplierType', label: 'Supplier Type' },
  ];
  breakdownColumns: DataGridColumn<BreakdownRow>[] = [];
  /** Rebuilt only when the data or the grouping changes; a getter would hand the grid a new array on every change detection. */
  breakdownRows: BreakdownRow[] = [];

  private subscriptions = new Subscription();

  constructor(
    private _supplierService: SupplierService,
    private _profileService: ProfileService,
    private _router: Router,
    private _route: ActivatedRoute,
    private excelExport: ExcelExportService,
  ) {}

  ngOnInit(): void {
    this.buildBreakdownColumns();
    this.loadFilterOptions();

    this.subscriptions.add(
      this._route.queryParams.subscribe((params) => {
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
      this._profileService.getDepartments().subscribe((departments: getDepartment[]) => {
        this.filterFields = this.filterFields.map((f) =>
          f.key === 'category' ? { ...f, options: departments.map((d) => ({ label: d.departmentName, value: d._id })) } : f
        );
      })
    );
  }

  private get filterParams() {
    return {
      category: this.filters['category'] || undefined,
      supplierType: this.filters['supplierType'] || undefined,
      fromDate: this.filters['fromDate'] || undefined,
      toDate: this.filters['toDate'] || undefined,
    };
  }

  private fetch(): void {
    this.loading = true;
    this.failed = false;
    this.subscriptions.add(
      this._supplierService.getReportSummary(this.filterParams).subscribe({
        next: (res: SupplierReportSummaryResponse) => {
          this.totals = res.data.totals;
          this.summary = { byCategory: res.data.byCategory, bySupplierType: res.data.bySupplierType };
          this.rebuildBreakdown();
          this.loading = false;
        },
        error: () => {
          this.totals = { total: 0, pending: 0, approved: 0, rejected: 0, creditValue: 0 };
          this.summary = { byCategory: [], bySupplierType: [] };
          this.rebuildBreakdown();
          this.loading = false;
          this.failed = true;
        },
      })
    );
  }

  onFilterChange(values: ReportFilterValues): void {
    this._router.navigate([], { relativeTo: this._route, queryParams: values, queryParamsHandling: 'merge', replaceUrl: true });
  }

  get listQueryParams(): Record<string, string | null> {
    return { ...this.filters };
  }

  // --- KPIs ------------------------------------------------------------------------------

  get totalSuppliers(): number { return this.totals.total; }
  get pendingCount(): number { return this.totals.pending; }
  get approvedCount(): number { return this.totals.approved; }
  get rejectedCount(): number { return this.totals.rejected; }
  get totalCreditExposure(): number { return this.totals.creditValue; }

  // --- Breakdown ---------------------------------------------------------------------------

  private buildBreakdownColumns(): void {
    this.breakdownColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'total', label: 'Suppliers', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'pending', label: 'Pending', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'approved', label: 'Approved', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'rejected', label: 'Rejected', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'creditValue', label: 'Credit Limit', type: 'number', sortable: true, align: 'right', aggregate: 'sum' },
    ];
  }

  setBreakdown(key: 'category' | 'supplierType'): void {
    this.breakdownKey = key;
    this.rebuildBreakdown();
  }

  private rebuildBreakdown(): void {
    const rows = this.breakdownKey === 'category' ? this.summary.byCategory : this.summary.bySupplierType;
    this.breakdownRows = [...rows].sort((x, y) => y.total - x.total);
  }

  onBreakdownRowOpen(row: BreakdownRow): void {
    this.breakdownGrid?.closeDetail();
    if (row.id === 'unassigned') return;
    this._router.navigate(['/suppliers'], { queryParams: { ...this.listQueryParams, [this.breakdownKey]: row.id } });
  }

  // --- Export -------------------------------------------------------------------------------

  exportExcel(): void {
    if (!this.totals.total) return;
    this.subscriptions.add(
      this._supplierService.getSuppliers({ page: 1, row: 5000, ...this.filterParams }).subscribe({
        next: (res: SupplierListResponse) => this.downloadWorkbook(res?.data?.suppliers || []),
        error: () => this.downloadWorkbook([]),
      })
    );
  }

  private downloadWorkbook(suppliers: SupplierListResponse['data']['suppliers']): void {
    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 22 }],
        rows: [
          { metric: 'Total suppliers', value: this.totalSuppliers },
          { metric: 'Pending', value: this.pendingCount },
          { metric: 'Approved', value: this.approvedCount },
          { metric: 'Rejected', value: this.rejectedCount },
          { metric: 'Total approved credit limit', value: Math.round(this.totalCreditExposure) },
        ],
      },
      {
        name: this.breakdownTabs.find((t) => t.key === this.breakdownKey)!.label,
        columns: [
          { header: 'Name', key: 'name', width: 30 },
          { header: 'Suppliers', key: 'total', width: 14 },
          { header: 'Pending', key: 'pending', width: 12 },
          { header: 'Approved', key: 'approved', width: 12 },
          { header: 'Rejected', key: 'rejected', width: 12 },
          { header: 'Credit Limit', key: 'creditValue', width: 18 },
        ],
        rows: this.breakdownRows.map((r) => ({ ...r, creditValue: Math.round(r.creditValue) })),
      },
      {
        name: 'Suppliers',
        columns: [
          { header: 'Supplier Id', key: 'supplierId', width: 18 },
          { header: 'Name', key: 'supplierName', width: 30 },
          { header: 'Category', key: 'category', width: 20 },
          { header: 'Type', key: 'supplierType', width: 16 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Credit Days', key: 'creditDays', width: 12 },
          { header: 'Credit Limit', key: 'creditValue', width: 16 },
        ],
        rows: suppliers.map((s) => ({
          supplierId: s.supplierId, supplierName: s.supplierName, category: s.category?.departmentName,
          supplierType: s.supplierType, status: s.status, creditDays: s.creditDays, creditValue: Math.round(s.creditValue),
        })),
      },
    ];
    void this.excelExport.download('supplier-report.xlsx', sheets);
  }

  trackById = (_: number, r: BreakdownRow) => r.id;
}
