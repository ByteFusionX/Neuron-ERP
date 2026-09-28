import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { Supplier, SupplierListResponse, SupplierStatus } from 'src/app/shared/interfaces/suppliers.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { KpiCardComponent } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent } from 'src/app/shared/components/report-filters/report-filters.component';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';

interface BreakdownRow {
  id: string;
  name: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  creditValue: number;
}

/**
 * Suppliers report: KPI strip plus a breakdown table by category or supplier type, with an Excel
 * export. Kept intentionally simpler than the quotations report (no charts) per the module's scope —
 * everything here is computed client-side from `getSuppliers`, since there is no dedicated
 * aggregate/report endpoint on the server for suppliers.
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

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'Suppliers' }];

  loading = true;
  failed = false;
  suppliers: Supplier[] = [];

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

  private fetch(): void {
    this.loading = true;
    this.failed = false;
    // Same trick as quotation-list's generateExcelReport: fetch the whole filtered slice in one
    // page (no dedicated report/aggregate endpoint exists for suppliers) and derive KPIs client-side.
    const params = {
      page: 1,
      row: Number.MAX_SAFE_INTEGER,
      category: this.filters['category'] || undefined,
      supplierType: this.filters['supplierType'] || undefined,
      fromDate: this.filters['fromDate'] || undefined,
      toDate: this.filters['toDate'] || undefined,
    };
    this.subscriptions.add(
      this._supplierService.getSuppliers(params).subscribe({
        next: (res: SupplierListResponse) => {
          this.suppliers = res?.data?.suppliers || [];
          this.loading = false;
        },
        error: () => { this.suppliers = []; this.loading = false; this.failed = true; },
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

  get totalSuppliers(): number { return this.suppliers.length; }
  get pendingCount(): number { return this.suppliers.filter((s) => s.status === SupplierStatus.PENDING).length; }
  get approvedCount(): number { return this.suppliers.filter((s) => s.status === SupplierStatus.APPROVED).length; }
  get rejectedCount(): number { return this.suppliers.filter((s) => s.status === SupplierStatus.REJECTED).length; }
  get totalCreditExposure(): number {
    return this.suppliers.filter((s) => s.status === SupplierStatus.APPROVED).reduce((sum, s) => sum + (Number(s.creditValue) || 0), 0);
  }

  // --- Breakdown ---------------------------------------------------------------------------

  private buildBreakdownColumns(): void {
    this.breakdownColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'total', label: 'Suppliers', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'pending', label: 'Pending', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'approved', label: 'Approved', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'rejected', label: 'Rejected', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'creditValue', label: 'Credit Exposure', type: 'number', sortable: true, align: 'right', aggregate: 'sum' },
    ];
  }

  setBreakdown(key: 'category' | 'supplierType'): void {
    this.breakdownKey = key;
  }

  get breakdownRows(): BreakdownRow[] {
    const groups = new Map<string, BreakdownRow>();
    for (const s of this.suppliers) {
      const key = this.breakdownKey === 'category' ? (s.category?.departmentName || 'Unassigned') : (s.supplierType || 'Unassigned');
      const row = groups.get(key) || { id: key, name: key, total: 0, pending: 0, approved: 0, rejected: 0, creditValue: 0 };
      row.total += 1;
      if (s.status === SupplierStatus.PENDING) row.pending += 1;
      if (s.status === SupplierStatus.APPROVED) { row.approved += 1; row.creditValue += Number(s.creditValue) || 0; }
      if (s.status === SupplierStatus.REJECTED) row.rejected += 1;
      groups.set(key, row);
    }
    return Array.from(groups.values());
  }

  onBreakdownRowOpen(row: BreakdownRow): void {
    this.breakdownGrid?.closeDetail();
    this._router.navigate(['/suppliers'], { queryParams: { ...this.listQueryParams, [this.breakdownKey]: row.id } });
  }

  // --- Export -------------------------------------------------------------------------------

  exportExcel(): void {
    if (!this.suppliers.length) return;
    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 22 }],
        rows: [
          { metric: 'Total suppliers', value: this.totalSuppliers },
          { metric: 'Pending', value: this.pendingCount },
          { metric: 'Approved', value: this.approvedCount },
          { metric: 'Rejected', value: this.rejectedCount },
          { metric: 'Total credit exposure', value: Math.round(this.totalCreditExposure) },
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
          { header: 'Credit Exposure', key: 'creditValue', width: 18 },
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
        rows: this.suppliers.map((s) => ({
          supplierId: s.supplierId, supplierName: s.supplierName, category: s.category?.departmentName,
          supplierType: s.supplierType, status: s.status, creditDays: s.creditDays, creditValue: Math.round(s.creditValue),
        })),
      },
    ];
    void this.excelExport.download('supplier-report.xlsx', sheets);
  }

  trackById = (_: number, r: BreakdownRow) => r.id;
}
