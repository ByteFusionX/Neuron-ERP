import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { Observable, Subscription, filter, shareReplay, switchMap, take } from 'rxjs';

import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { DealReportRow } from 'src/app/shared/interfaces/quotation.interface';
import { dealSheetPrivileges } from 'src/app/shared/utils/privilege-fallback';

import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';
import { KpiCardComponent, KpiDelta } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { FilterPillsComponent } from 'src/app/shared/components/filter-bar/filter-pills.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent, listParamsFrom, matchesReportValue, readReportValues } from 'src/app/shared/components/report-filters/report-filters.component';
import { SfOption } from 'src/app/shared/components/smart-form';

type TrendChart = {
  series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis; yaxis: ApexYAxis | ApexYAxis[]; stroke: ApexStroke;
  fill: ApexFill; grid: ApexGrid; legend: ApexLegend; tooltip: ApexTooltip; dataLabels: ApexDataLabels; colors: string[];
};

type StatusChart = {
  series: ApexNonAxisChartSeries; chart: ApexChart; labels: string[]; colors: string[]; stroke: ApexStroke;
  plotOptions: ApexPlotOptions; legend: ApexLegend; tooltip: ApexTooltip; dataLabels: ApexDataLabels;
};

interface BreakdownRow {
  id: string;
  name: string;
  count: number;
  approved: number;
  value: number;
  profit: number;
  margin: number;
}

type BreakdownKey = 'salesPerson' | 'department' | 'customer';
type AttentionKey = 'waiting' | 'lowMargin';
type ReportSection = 'overview' | 'breakdown' | 'attention';
type StatusKey = 'pending' | 'approved' | 'rejected';

const STATUS_META: Record<StatusKey, { label: string; color: string; route: string }> = {
  pending: { label: 'Pending', color: '#f59e0b', route: '/deal-sheet/pendings' },
  approved: { label: 'Approved', color: '#10b981', route: '/deal-sheet/approved' },
  rejected: { label: 'Rejected', color: '#ef4444', route: '/deal-sheet/rejected' },
};

/** Pending longer than this is flagged in Attention. */
const WAITING_DAYS = 3;
/** Margin below this (in %) is flagged in Attention. */
const LOW_MARGIN = 10;

/**
 * The deal sheet report. Same shape as the job report: one flat fetch of the deals the user may
 * see, then filters, KPIs, charts and breakdowns worked out in the browser. Filters live in the URL.
 * Dates filter on the deal's submitted date.
 */
@Component({
  selector: 'app-deal-report',
  templateUrl: './deal-report.component.html',
  styleUrls: ['./deal-report.component.css'],
  providers: [NumberFormatterPipe, DatePipe],
  imports: [
    ViewToggleComponent, NgIf, NgFor, NgClass, DecimalPipe, NgIcon,
    ChartComponent, ActionButtonComponent, DataGridComponent, KpiCardComponent, NumberFormatterPipe, ReportFiltersComponent, FilterPillsComponent,
  ],
})
export class DealReportComponent implements OnInit, OnDestroy {
  deals: DealReportRow[] = [];
  private allDeals: DealReportRow[] = [];
  private previousDeals: DealReportRow[] | null = null;
  loading = true;
  failed = false;
  currency = 'QAR';

  filters: ReportFilterValues = { status: null, salesPerson: null, customer: null, department: null, fromDate: null, toDate: null };

  filterFields: ReportFilterField[] = [
    { key: 'status', label: 'Status', type: 'select', placeholder: 'All statuses', options: (Object.keys(STATUS_META) as StatusKey[]).map((k) => ({ label: STATUS_META[k].label, value: k })) },
    { key: 'department', label: 'Department', type: 'select', options: [], placeholder: 'All departments' },
    { key: 'salesPerson', label: 'Sales Person', type: 'combobox', options: [], placeholder: 'Everyone' },
    { key: 'customer', label: 'Customer', type: 'combobox', options: [], placeholder: 'All customers' },
    { key: 'fromDate', label: 'From', type: 'date' },
    { key: 'toDate', label: 'To', type: 'date' },
  ];

  readonly statusKeys = Object.keys(STATUS_META) as StatusKey[];
  readonly statusMeta = STATUS_META;
  readonly waitingDays = WAITING_DAYS;
  readonly lowMargin = LOW_MARGIN;

  breakdownKey: BreakdownKey = 'salesPerson';
  readonly breakdownTabs: { key: BreakdownKey; label: string }[] = [
    { key: 'salesPerson', label: 'Sales Person' },
    { key: 'department', label: 'Department' },
    { key: 'customer', label: 'Customer' },
  ];
  breakdownColumns: DataGridColumn<BreakdownRow>[] = [];
  breakdowns: Record<BreakdownKey, BreakdownRow[]> = { salesPerson: [], department: [], customer: [] };

  attentionKey: AttentionKey = 'waiting';
  section: ReportSection = 'overview';

  trendChart: TrendChart | null = null;
  statusChart: StatusChart | null = null;
  trendMetric: 'value' | 'count' = 'value';

  private subscriptions = new Subscription();
  private fetchSub?: Subscription;
  private loaded = false;
  private themeObserver?: MutationObserver;

  constructor(
    private _quoteService: QuotationService,
    private _employeeService: EmployeeService,
    private _customerService: CustomerService,
    private _departmentService: ProfileService,
    private _router: Router,
    private _route: ActivatedRoute,
    private numberFormat: NumberFormatterPipe,
    private excelExport: ExcelExportService,
  ) {}

  ngOnInit(): void {
    this.buildBreakdownColumns();
    this.loadFilterOptions();

    this.subscriptions.add(
      this._route.queryParams.subscribe((params) => {
        this.filters = readReportValues(params, this.filterFields);
        if (this.loaded) this.applyFilters();
        else this.fetch();
      })
    );

    // ApexCharts bakes its colours in at build time, so rebuild when the theme flips.
    this.themeObserver = new MutationObserver(() => this.buildCharts());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.fetchSub?.unsubscribe();
    this.themeObserver?.disconnect();
  }

  // ---- Filters ---------------------------------------------------------------------------------

  /** Filter changes go through the URL, so a refresh keeps them. */
  onFilterChange(values: ReportFilterValues): void {
    this._router.navigate([], { relativeTo: this._route, queryParams: values, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // ---- KPIs ------------------------------------------------------------------------------------

  get totalValue(): number { return this.sum(this.deals, 'value'); }
  get approvedDeals(): DealReportRow[] { return this.deals.filter((d) => d.status === 'approved'); }
  get approvedValue(): number { return this.sum(this.approvedDeals, 'value'); }
  get approvedProfit(): number { return this.sum(this.approvedDeals, 'profit'); }
  /** Weighted by value, so one tiny deal can't swing it. */
  get approvedMargin(): number { return this.approvedValue ? (this.approvedProfit / this.approvedValue) * 100 : 0; }
  countFor(status: StatusKey): number { return this.deals.filter((d) => d.status === status).length; }
  valueFor(status: StatusKey): number { return this.sum(this.deals.filter((d) => d.status === status), 'value'); }
  get revokedCount(): number { return this.deals.filter((d) => d.revoked).length; }
  /** Share of decided deals that were approved. */
  get approvalRate(): number {
    const decided = this.countFor('approved') + this.countFor('rejected');
    return decided ? (this.countFor('approved') / decided) * 100 : 0;
  }

  delta(key: 'count' | 'value' | 'approvedValue'): KpiDelta | null {
    const before = this.previousDeals;
    if (!before) return null;
    const pick = (rows: DealReportRow[]) =>
      key === 'count' ? rows.length : key === 'value' ? this.sum(rows, 'value') : this.sum(rows.filter((d) => d.status === 'approved'), 'value');
    const now = pick(this.deals);
    const prev = pick(before);
    if (!prev) return now ? { text: 'New', tone: 'up' } : null;
    const pct = Math.round(((now - prev) / prev) * 100);
    return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }

  /** A KPI card opens the matching deal sheet list tab. */
  openList(status?: StatusKey | 'revoked'): void {
    const route = !status ? '/deal-sheet/dealsheets' : status === 'revoked' ? '/deal-sheet/revokeds' : STATUS_META[status].route;
    this._router.navigate([route]);
  }

  // ---- Charts ----------------------------------------------------------------------------------

  setTrendMetric(metric: 'value' | 'count'): void {
    this.trendMetric = metric;
    this.buildTrendChart();
  }

  // ---- Breakdown -------------------------------------------------------------------------------

  get breakdownRows(): BreakdownRow[] {
    return this.breakdowns[this.breakdownKey];
  }

  get breakdownTitle(): string {
    return 'By ' + this.breakdownTabs.find((t) => t.key === this.breakdownKey)!.label;
  }

  // ---- Attention -------------------------------------------------------------------------------

  get attentionItems(): DealReportRow[] {
    return this.attentionFor(this.attentionKey);
  }

  attentionCount(key: AttentionKey): number {
    return this.attentionFor(key).length;
  }

  get attentionTotal(): number {
    return this.attentionCount('waiting') + this.attentionCount('lowMargin');
  }

  openDeal(deal: DealReportRow): void {
    this._router.navigate(['/deal-sheet/view', deal._id]);
  }

  trackById = (_: number, r: { _id?: string; id?: string }) => r._id ?? r.id ?? '';

  // ---- Export ----------------------------------------------------------------------------------

  exportExcel(): void {
    if (!this.deals.length) return;
    const money = (n: number) => Math.round(n);
    const pct = (n: number) => `${n.toFixed(1)}%`;
    const c = this.currency;
    const breakdownSheet = (key: BreakdownKey): ExcelSheet => ({
      name: 'By ' + this.breakdownTabs.find((t) => t.key === key)!.label,
      columns: [
        { header: 'Name', key: 'name', width: 32 }, { header: 'Deals', key: 'count', width: 10 },
        { header: 'Approved', key: 'approved', width: 12 }, { header: `Value (${c})`, key: 'value', width: 18 },
        { header: `Profit (${c})`, key: 'profit', width: 18 }, { header: 'Margin', key: 'margin', width: 12 },
      ],
      rows: this.breakdowns[key].map((r) => ({ ...r, value: money(r.value), profit: money(r.profit), margin: pct(r.margin) })),
    });

    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 22 }],
        rows: [
          { metric: 'Deals', value: this.deals.length },
          { metric: `Total deal value (${c})`, value: money(this.totalValue) },
          { metric: 'Approved', value: this.countFor('approved') },
          { metric: `Approved value (${c})`, value: money(this.approvedValue) },
          { metric: `Approved profit (${c})`, value: money(this.approvedProfit) },
          { metric: 'Approved margin', value: pct(this.approvedMargin) },
          { metric: 'Pending', value: this.countFor('pending') },
          { metric: 'Rejected', value: this.countFor('rejected') },
          { metric: 'Revoked (back to pending)', value: this.revokedCount },
          { metric: 'Approval rate', value: pct(this.approvalRate) },
        ],
      },
      {
        name: 'Deals',
        columns: [
          { header: 'Deal Id', key: 'dealId', width: 18 }, { header: 'Quote Id', key: 'quoteId', width: 18 },
          { header: 'Customer', key: 'customer', width: 30 }, { header: 'Sales Person', key: 'salesPerson', width: 22 },
          { header: 'Department', key: 'department', width: 20 }, { header: 'Status', key: 'status', width: 12 },
          { header: 'Submitted', key: 'savedDate', width: 14 }, { header: `Value (${c})`, key: 'value', width: 16 },
          { header: `Cost (${c})`, key: 'cost', width: 16 }, { header: `Profit (${c})`, key: 'profit', width: 16 },
          { header: 'Margin', key: 'margin', width: 10 },
        ],
        rows: this.deals.map((d) => ({
          dealId: d.dealId, quoteId: d.quoteId, customer: d.customer, salesPerson: d.salesPerson, department: d.department,
          status: STATUS_META[d.status].label + (d.revoked ? ' (revoked)' : ''),
          savedDate: d.savedDate ? new Date(d.savedDate).toLocaleDateString() : '',
          value: money(d.value), cost: money(d.cost), profit: money(d.profit), margin: pct(d.margin),
        })),
      },
      breakdownSheet('salesPerson'),
      breakdownSheet('department'),
      breakdownSheet('customer'),
    ];

    void this.excelExport.download('deal-sheet-report.xlsx', sheets);
  }

  // ---- Private ---------------------------------------------------------------------------------

  private get isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  private sum(rows: DealReportRow[], key: 'value' | 'profit' | 'cost'): number {
    return rows.reduce((t, r) => t + (r[key] || 0), 0);
  }

  private loadFilterOptions(): void {
    this.subscriptions.add(
      this._employeeService.getAllEmployees().subscribe({
        next: (people: getEmployee[]) => this.setOptions('salesPerson', people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p._id }))),
        error: () => { /* no employee access: the Sales Person filter stays empty */ },
      })
    );
    this.subscriptions.add(
      this._departmentService.getDepartments().subscribe((departments: getDepartment[]) => {
        this.setOptions('department', departments.map((d) => ({ label: d.departmentName, value: d._id })));
      })
    );
    const customers$: Observable<getCustomer[]> = this._employeeService.employeeData$.pipe(
      filter((e) => !!e?._id),
      take(1),
      switchMap((e) => this._customerService.getAllCustomers(e!._id as string, true)),
      shareReplay(1)
    );
    this.subscriptions.add(
      customers$.subscribe((customers) => this.setOptions('customer', customers.map((c) => ({ label: c.companyName, value: c._id }))))
    );
  }

  private setOptions(key: string, options: SfOption[]): void {
    this.filterFields = this.filterFields.map((f) => (f.key === key ? { ...f, options } : f));
  }

  private fetch(): void {
    this.loading = true;
    this.failed = false;
    this.fetchSub?.unsubscribe();
    this.fetchSub = this._employeeService.employeeData$.pipe(
      filter((e) => !!e?._id),
      take(1),
      switchMap((employee) => this._quoteService.getDealReport(dealSheetPrivileges(employee?.category?.privileges).viewReport, employee?._id as string)),
    ).subscribe({
      next: (res) => {
        this.allDeals = res?.deals ?? [];
        this.currency = res?.currency || 'QAR';
        this.loaded = true;
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.allDeals = [];
        this.deals = [];
        this.loading = false;
        this.failed = true;
      },
    });
  }

  /** Every filter except the dates, so the previous-period comparison can reuse it. */
  private matchesNonDate(d: DealReportRow): boolean {
    const f = this.filters;
    if (!matchesReportValue(f, 'status', d.status)) return false;
    if (!matchesReportValue(f, 'salesPerson', d.salesPersonId)) return false;
    if (!matchesReportValue(f, 'department', d.departmentId)) return false;
    if (!matchesReportValue(f, 'customer', d.customerId)) return false;
    return true;
  }

  private applyFilters(): void {
    const day = 86400000;
    const from = this.filters['fromDate'] ? Date.parse(this.filters['fromDate']!) : null;
    const to = this.filters['toDate'] ? Date.parse(this.filters['toDate']!) + day - 1 : null;
    const inRange = (d: DealReportRow, lo: number | null, hi: number | null) => {
      const t = d.savedDate ? Date.parse(d.savedDate) : NaN;
      if (lo !== null && !(t >= lo)) return false;
      if (hi !== null && !(t <= hi)) return false;
      return true;
    };

    this.deals = this.allDeals.filter((d) => this.matchesNonDate(d) && inRange(d, from, to));

    // Previous period: same number of days, ending the day before `from`.
    if (from !== null && to !== null && !isNaN(from) && !isNaN(to) && to >= from) {
      const span = Math.round((to - from) / day) + 1;
      const prevTo = from - 1;
      const prevFrom = prevTo - (span - 1) * day - (day - 1);
      this.previousDeals = this.allDeals.filter((d) => this.matchesNonDate(d) && inRange(d, prevFrom, prevTo));
    } else {
      this.previousDeals = null;
    }

    this.buildBreakdowns();
    this.buildCharts();
    if (!this.attentionCount(this.attentionKey)) {
      const other: AttentionKey = this.attentionKey === 'waiting' ? 'lowMargin' : 'waiting';
      if (this.attentionCount(other)) this.attentionKey = other;
    }
  }

  private attentionFor(key: AttentionKey): DealReportRow[] {
    if (key === 'waiting') {
      return this.deals
        .filter((d) => d.status === 'pending' && (d.daysWaiting ?? 0) >= WAITING_DAYS)
        .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));
    }
    return this.deals
      .filter((d) => d.status !== 'rejected' && d.value > 0 && d.margin < LOW_MARGIN)
      .sort((a, b) => a.margin - b.margin);
  }

  private buildBreakdownColumns(): void {
    this.breakdownColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'count', label: 'Deals', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      { key: 'approved', label: 'Approved', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      { key: 'value', label: `Value (${this.currency})`, type: 'number', sortable: true, align: 'right', aggregate: 'sum', valueGetter: (r) => Math.round(r.value) },
      { key: 'profit', label: `Profit (${this.currency})`, type: 'number', sortable: true, align: 'right', aggregate: 'sum', valueGetter: (r) => Math.round(r.profit) },
      { key: 'margin', label: 'Margin', sortable: true, align: 'right', width: '100px', valueGetter: (r) => `${r.margin.toFixed(1)}%` },
    ];
  }

  private buildBreakdowns(): void {
    this.breakdowns = {
      salesPerson: this.group((d) => (d.salesPersonId ? { id: d.salesPersonId, name: d.salesPerson } : null)),
      department: this.group((d) => (d.departmentId ? { id: d.departmentId, name: d.department } : null)),
      customer: this.group((d) => (d.customerId ? { id: d.customerId, name: d.customer } : null)),
    };
  }

  private group(keyOf: (d: DealReportRow) => { id: string; name: string } | null): BreakdownRow[] {
    const map = new Map<string, BreakdownRow>();
    for (const deal of this.deals) {
      const key = keyOf(deal);
      if (!key) continue;
      let row = map.get(key.id);
      if (!row) {
        row = { id: key.id, name: key.name || 'Unknown', count: 0, approved: 0, value: 0, profit: 0, margin: 0 };
        map.set(key.id, row);
      }
      row.count += 1;
      if (deal.status === 'approved') row.approved += 1;
      // Rejected deals count as deals but not as money: they never turned into work.
      if (deal.status !== 'rejected') {
        row.value += deal.value;
        row.profit += deal.profit;
      }
    }
    for (const row of map.values()) row.margin = row.value ? (row.profit / row.value) * 100 : 0;
    return [...map.values()].sort((a, b) => b.value - a.value);
  }

  private buildCharts(): void {
    this.buildTrendChart();
    this.buildStatusChart();
  }

  private buildStatusChart(): void {
    const rows = this.statusKeys.map((k) => ({ key: k, count: this.countFor(k), value: this.valueFor(k) })).filter((r) => r.count);
    if (!rows.length) {
      this.statusChart = null;
      return;
    }
    const dark = this.isDark;
    const text = dark ? '#d4d4d4' : '#374151';
    this.statusChart = {
      series: rows.map((r) => r.count),
      labels: rows.map((r) => STATUS_META[r.key].label),
      colors: rows.map((r) => STATUS_META[r.key].color),
      chart: { type: 'donut', height: 300, fontFamily: 'inherit', background: 'transparent' },
      stroke: { width: 2, colors: [dark ? '#171717' : '#ffffff'] },
      dataLabels: { enabled: false },
      legend: { position: 'bottom', fontSize: '12px', labels: { colors: text }, itemMargin: { horizontal: 8, vertical: 2 } },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              name: { color: dark ? '#8f8f8f' : '#6b7280', fontSize: '12px' },
              value: { color: text, fontSize: '22px', fontWeight: 600 },
              total: { show: true, label: 'Deals', color: dark ? '#8f8f8f' : '#6b7280', formatter: () => String(rows.reduce((t, r) => t + r.count, 0)) },
            },
          },
        },
      },
      tooltip: {
        theme: dark ? 'dark' : 'light',
        y: { formatter: (v: number, opts: any) => { const r = rows[opts?.seriesIndex]; return r ? `${v} · ${this.numberFormat.transform(r.value)} ${this.currency}` : String(v); } },
      },
    };
  }

  private buildTrendChart(): void {
    if (!this.deals.length) {
      this.trendChart = null;
      return;
    }
    const months: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(this.monthKey(d));
    }
    const submitted = new Map(months.map((m) => [m, { count: 0, value: 0 }]));
    const approved = new Map(months.map((m) => [m, { count: 0, value: 0 }]));
    for (const deal of this.deals) {
      const s = deal.savedDate ? submitted.get(this.monthKey(new Date(deal.savedDate))) : undefined;
      if (s) { s.count += 1; s.value += deal.value; }
      if (deal.status === 'approved' && deal.approvedDate) {
        const a = approved.get(this.monthKey(new Date(deal.approvedDate)));
        if (a) { a.count += 1; a.value += deal.value; }
      }
    }

    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';
    const byValue = this.trendMetric === 'value';
    const pick = (r: { count: number; value: number }) => Math.round(byValue ? r.value : r.count);

    this.trendChart = {
      series: [
        { name: byValue ? 'Submitted value' : 'Deals submitted', type: 'column', data: months.map((m) => pick(submitted.get(m)!)) },
        { name: byValue ? 'Approved value' : 'Deals approved', type: 'line', data: months.map((m) => pick(approved.get(m)!)) },
      ],
      chart: { type: 'line', height: 300, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: ['#a78bfa', '#10b981'],
      stroke: { width: [0, 3], curve: 'smooth' },
      fill: { opacity: [0.9, 1] },
      dataLabels: { enabled: false },
      grid: { borderColor: gridColor, strokeDashArray: 4, padding: { left: 4, right: 4 } },
      legend: { position: 'top', horizontalAlign: 'right', labels: { colors: axis } },
      xaxis: {
        categories: months.map((m) => this.monthLabel(m)),
        labels: { style: { colors: axis, fontSize: '11px' } },
        axisBorder: { color: gridColor },
        axisTicks: { color: gridColor },
      },
      yaxis: { labels: { style: { colors: axis, fontSize: '11px' }, formatter: (v: number) => (byValue ? this.numberFormat.transform(v) : String(Math.round(v))) } },
      tooltip: {
        theme: dark ? 'dark' : 'light', shared: true, intersect: false,
        y: { formatter: (v: number) => (byValue ? `${this.numberFormat.transform(v)} ${this.currency}` : `${v}`) },
      },
    };
  }

  private monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthLabel(month: string): string {
    const [year, m] = month.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[Number(m) - 1]} ${year.slice(2)}`;
  }
}
