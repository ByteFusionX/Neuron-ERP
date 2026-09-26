import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { Observable, Subscription, filter, of, shareReplay, switchMap, take } from 'rxjs';
import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';

import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { ReportAttentionItem, ReportBreakdownRow, ReportDetails, ReportFilter, ReportKpi, QuoteStatusColors } from 'src/app/shared/interfaces/quotation.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { KpiCardComponent, KpiDelta } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent } from 'src/app/shared/components/report-filters/report-filters.component';
import { DataGridBreadcrumb, DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';

type TrendChart = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  stroke: ApexStroke;
  fill: ApexFill;
  grid: ApexGrid;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
  colors: string[];
};

type PipelineChart = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  plotOptions: ApexPlotOptions;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  grid: ApexGrid;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
  colors: string[];
};

type StatusChart = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  stroke: ApexStroke;
  plotOptions: ApexPlotOptions;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
};

type BreakdownKey = 'department' | 'salesPerson' | 'customer';
type AttentionKey = 'overdue' | 'closingSoon' | 'idle';
type ReportSection = 'overview' | 'breakdown' | 'attention';

/**
 * The quotation report, as a page rather than a modal so it can carry the list's filters and
 * stand next to it under the same List | Report toggle. Filters live in the URL, which is what
 * lets the toggle keep them: both routes read the same query params.
 */
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
@Component({
  selector: 'app-quotation-report',
  templateUrl: './quotation-report.component.html',
  styleUrls: ['./quotation-report.component.css'],
  providers: [NumberFormatterPipe, DatePipe],
  imports: [ViewToggleComponent, 
    NgIf, NgFor, NgClass, AsyncPipe, DecimalPipe, DatePipe, RouterLink, FormsModule, NgIcon,
    ChartComponent, SmartFormModule, ActionButtonComponent, DataGridComponent, NumberFormatterPipe, KpiCardComponent, ReportFiltersComponent,
  ],
})
export class QuotationReportComponent implements OnInit, OnDestroy {
  @ViewChild('breakdownGrid') breakdownGrid?: DataGridComponent<ReportBreakdownRow>;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];

  report: ReportDetails | null = null;
  /** KPIs for the equal-length window just before the selected dates; null without a full range. */
  previousKpi: ReportKpi | null = null;
  private fetchSeq = 0;
  loading = true;
  failed = false;

  // --- Filters (mirrored into the URL so the List | Report toggle keeps them) ---------------
  filters: ReportFilterValues = { salesPerson: null, customer: null, department: null, fromDate: null, toDate: null };

  filterFields: ReportFilterField[] = [
    { key: 'department', label: 'Department', type: 'select', options: [], placeholder: 'All departments' },
    { key: 'salesPerson', label: 'Sales Person', type: 'combobox', options: [], placeholder: 'Everyone' },
    { key: 'customer', label: 'Customer', type: 'combobox', options: [], placeholder: 'All customers' },
    { key: 'fromDate', label: 'From', type: 'date' },
    { key: 'toDate', label: 'To', type: 'date' },
  ];

  breakdownKey: BreakdownKey = 'department';
  readonly breakdownTabs: { key: BreakdownKey; label: string }[] = [
    { key: 'department', label: 'Department' },
    { key: 'salesPerson', label: 'Sales Person' },
    { key: 'customer', label: 'Customer' },
  ];

  attentionKey: AttentionKey = 'overdue';
  section: ReportSection = 'overview';

  trendChart: TrendChart | null = null;
  pipelineChart: PipelineChart | null = null;
  /** Pipeline stages the user has unticked; everything is shown until they say otherwise. */
  hiddenStages = new Set<string>();
  statusChart: StatusChart | null = null;
  /** Won value is an order of magnitude smaller than quoted value on most months; a count
   *  line on its own axis reads better than a second value series squashed against the floor. */
  trendMetric: 'value' | 'count' = 'value';

  readonly statusColors = QuoteStatusColors;

  private subscriptions = new Subscription();
  private themeObserver?: MutationObserver;
  private access?: string;
  private userId?: string;

  breakdownColumns: DataGridColumn<ReportBreakdownRow>[] = [];

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
        this.filters = Object.fromEntries(this.filterFields.map((f) => [f.key, params[f.key] || null]));
        this.fetch();
      })
    );

    // ApexCharts bakes its colours in at build time, so the charts are rebuilt when the
    // theme class flips rather than styled by CSS.
    this.themeObserver = new MutationObserver(() => this.buildCharts());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.themeObserver?.disconnect();
  }

  private get isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  private loadFilterOptions(): void {
    this.subscriptions.add(
      this._employeeService.getAllEmployees().subscribe((people: getEmployee[]) => {
        this.setOptions('salesPerson', people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p._id })));
      })
    );
    this.subscriptions.add(
      this._departmentService.getDepartments().subscribe((departments: getDepartment[]) => {
        this.setOptions('department', departments.map((d) => ({ label: d.departmentName, value: d._id })));
      })
    );
    // Customers are scoped to the employee, so wait until the employee is known.
    const customers$: Observable<getCustomer[]> = this._employeeService.employeeData$.pipe(
      filter((e) => !!e?._id),
      take(1),
      switchMap((e) => this._customerService.getAllCustomers(e!._id as string)),
      shareReplay(1)
    );
    this.subscriptions.add(
      customers$.subscribe((customers) => {
        this.setOptions('customer', customers.map((c) => ({ label: c.companyName, value: c._id })));
      })
    );
  }

  private setOptions(key: string, options: SfOption[]): void {
    this.filterFields = this.filterFields.map((f) => (f.key === key ? { ...f, options } : f));
  }

  private currentFilter(): ReportFilter {
    this._employeeService.employeeData$.subscribe((employee) => {
      this.access = employee?.category.privileges.quotation.viewReport;
      this.userId = employee?._id;
    }).unsubscribe();

    return {
      ...(this.filters as Pick<ReportFilter, "salesPerson" | "customer" | "department" | "fromDate" | "toDate">),
      access: this.access,
      userId: this.userId,
    };
  }

  private fetch(): void {
    this.loading = true;
    this.failed = false;
    this.previousKpi = null;
    const seq = ++this.fetchSeq;
    const filter = this.currentFilter();
    this.subscriptions.add(
      this._quoteService.getQuotationReport(filter).subscribe({
        next: (res) => {
          this.report = res;
          this.loading = false;
          this.buildCharts();
          this.fetchPrevious(filter, seq);
        },
        error: () => {
          this.report = null;
          this.loading = false;
          this.failed = true;
        },
      })
    );
  }

  /**
   * Comparison needs a bounded range: the previous period is the same number of days ending the
   * day before `fromDate`. Without both dates there is nothing sensible to compare against.
   * A failure here just leaves the deltas off; it never blocks the report.
   */
  private fetchPrevious(filter: ReportFilter, seq: number): void {
    if (!filter.fromDate || !filter.toDate) return;
    const day = 86400000;
    const from = Date.parse(filter.fromDate);
    const to = Date.parse(filter.toDate);
    if (isNaN(from) || isNaN(to) || to < from) return;
    const spanDays = Math.round((to - from) / day) + 1;
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const prevTo = from - day;
    const prevFrom = prevTo - (spanDays - 1) * day;
    this.subscriptions.add(
      this._quoteService.getQuotationReport({ ...filter, fromDate: iso(prevFrom), toDate: iso(prevTo) }).subscribe({
        next: (res) => {
          if (seq === this.fetchSeq) this.previousKpi = res.kpi;
        },
        error: () => {},
      })
    );
  }

  /** Change of a KPI against the previous period; win rate is in percentage points. */
  delta(key: 'totalValue' | 'wonValue' | 'winRate' | 'avgQuoteValue'): KpiDelta | null {
    const now = this.report?.kpi;
    const before = this.previousKpi;
    if (!now || !before) return null;
    const diff = now[key] - before[key];
    if (key === 'winRate') {
      if (!before.closedCount && !now.closedCount) return null;
      const pts = Math.round(diff * 10) / 10;
      return { text: `${pts > 0 ? '+' : ''}${pts} pts`, tone: pts > 0 ? 'up' : pts < 0 ? 'down' : 'flat' };
    }
    if (!before[key]) return now[key] ? { text: 'New', tone: 'up' } : null;
    const pct = Math.round((diff / before[key]) * 100);
    return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }

  /** Filter changes go through the URL, so a refresh or a switch to the list keeps them. */
  onFilterChange(values: ReportFilterValues): void {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: values,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Query params handed to the List tab, so switching back keeps the same slice of data. */
  get listQueryParams(): Record<string, string | null> {
    return { ...this.filters };
  }

  // --- Funnel -------------------------------------------------------------------------------

  private readonly dealStatusHex: Record<string, string> = {
    pending: '#f59e0b',
    approved: '#10b981',
    rejected: '#ef4444',
  };

  /** Deal statuses the user has unticked; everything is shown until they say otherwise. */
  hiddenDealStatuses = new Set<string>();

  dealStatusColor(key: string): string {
    return this.dealStatusHex[key] || '#9ca3af';
  }

  isDealStatusShown(key: string): boolean {
    return !this.hiddenDealStatuses.has(key);
  }

  toggleDealStatus(key: string): void {
    if (this.hiddenDealStatuses.has(key)) this.hiddenDealStatuses.delete(key);
    else this.hiddenDealStatuses.add(key);
    this.buildStatusChart();
  }

  get hasDealSheets(): boolean {
    return !!this.report?.dealStatus?.some((r) => r.count);
  }

  isStageShown(key: string): boolean {
    return !this.hiddenStages.has(key);
  }

  toggleStage(key: string): void {
    if (this.hiddenStages.has(key)) this.hiddenStages.delete(key);
    else this.hiddenStages.add(key);
    this.buildPipelineChart();
  }

  // --- Trend --------------------------------------------------------------------------------

  setTrendMetric(metric: 'value' | 'count'): void {
    this.trendMetric = metric;
    this.buildTrendChart();
  }

  private buildCharts(): void {
    this.buildTrendChart();
    this.buildPipelineChart();
    this.buildStatusChart();
  }

  private buildPipelineChart(): void {
    const funnel = (this.report?.funnel || []).filter((s) => !this.hiddenStages.has(s.key));
    if (!funnel.length) {
      this.pipelineChart = null;
      return;
    }

    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';
    const currency = this.report?.currency || 'QAR';

    this.pipelineChart = {
      series: [{ name: 'Quotations', data: funnel.map((s) => s.count) }],
      chart: { type: 'bar', height: 40 + funnel.length * 52, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: funnel.map((s) => this.statusColor(s.label)),
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 5, barHeight: '62%' } },
      dataLabels: {
        enabled: true,
        textAnchor: 'start',
        offsetX: 6,
        style: { fontSize: '12px', fontWeight: 600, colors: ['#ffffff'] },
        formatter: (v: number) => (v ? String(v) : ''),
      },
      legend: { show: false },
      grid: { borderColor: gridColor, strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
      xaxis: {
        categories: funnel.map((s) => s.label),
        labels: { style: { colors: axis, fontSize: '11px' }, formatter: (v: string) => String(Math.round(Number(v))) },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { style: { colors: dark ? '#d4d4d4' : '#374151', fontSize: '13px', fontWeight: 500 } } },
      tooltip: {
        theme: dark ? 'dark' : 'light',
        y: {
          formatter: (v: number, opts: any) => {
            const stage = funnel[opts?.dataPointIndex];
            return stage ? `${v} · ${this.numberFormat.transform(stage.value)} ${currency} · ${Math.round(stage.pct)}%` : String(v);
          },
        },
      },
    };
  }

  private buildStatusChart(): void {
    const rows = (this.report?.dealStatus || []).filter((r) => !this.hiddenDealStatuses.has(r.key));
    if (!rows.some((r) => r.count)) {
      this.statusChart = null;
      return;
    }

    const dark = this.isDark;
    const text = dark ? '#d4d4d4' : '#374151';
    const currency = this.report?.currency || 'QAR';

    this.statusChart = {
      series: rows.map((r) => r.count),
      labels: rows.map((r) => r.label),
      colors: rows.map((r) => this.dealStatusHex[r.key]),
      chart: { type: 'donut', height: 320, fontFamily: 'inherit', background: 'transparent' },
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
              total: { show: true, label: 'Total', color: dark ? '#8f8f8f' : '#6b7280', formatter: () => String(rows.reduce((t, r) => t + r.count, 0)) },
            },
          },
        },
      },
      tooltip: {
        theme: dark ? 'dark' : 'light',
        y: {
          formatter: (v: number, opts: any) => {
            const row = rows[opts?.seriesIndex];
            return row ? `${v} · ${this.numberFormat.transform(row.value)} ${currency}` : String(v);
          },
        },
      },
    };
  }

  private buildTrendChart(): void {
    const trend = this.report?.trend;
    if (!trend?.length) {
      this.trendChart = null;
      return;
    }

    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';
    const byValue = this.trendMetric === 'value';

    this.trendChart = {
      series: [
        { name: byValue ? 'Quoted' : 'Quotes created', type: 'column', data: trend.map((t) => Math.round(byValue ? t.createdValue : t.createdCount)) },
        { name: byValue ? 'Won' : 'Quotes won', type: 'line', data: trend.map((t) => Math.round(byValue ? t.wonValue : t.wonCount)) },
      ],
      chart: {
        type: 'line',
        height: 300,
        fontFamily: 'inherit',
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      colors: ['#a78bfa', '#10b981'],
      stroke: { width: [0, 3], curve: 'smooth' },
      fill: { opacity: [0.9, 1] },
      dataLabels: { enabled: false },
      grid: { borderColor: gridColor, strokeDashArray: 4, padding: { left: 4, right: 4 } },
      legend: { position: 'top', horizontalAlign: 'right', labels: { colors: axis } },
      xaxis: {
        categories: trend.map((t) => this.monthLabel(t.month)),
        labels: { style: { colors: axis, fontSize: '11px' } },
        axisBorder: { color: gridColor },
        axisTicks: { color: gridColor },
      },
      yaxis: {
        labels: {
          style: { colors: axis, fontSize: '11px' },
          formatter: (v: number) => (byValue ? this.numberFormat.transform(v) : String(Math.round(v))),
        },
      },
      tooltip: {
        theme: dark ? 'dark' : 'light',
        shared: true,
        intersect: false,
        y: { formatter: (v: number) => (byValue ? `${this.numberFormat.transform(v)} ${this.report?.currency || 'QAR'}` : `${v}`) },
      },
    };
  }

  private monthLabel(month: string): string {
    const [year, m] = month.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[Number(m) - 1]} ${year.slice(2)}`;
  }

  // --- Breakdown ----------------------------------------------------------------------------

  private buildBreakdownColumns(): void {
    this.breakdownColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'count', label: 'Quotes', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      {
        key: 'value', label: 'Quoted Value', type: 'number', sortable: true, align: 'right', aggregate: 'sum',
        valueGetter: (r) => Math.round(r.value),
      },
      { key: 'wonCount', label: 'Won', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      {
        key: 'wonValue', label: 'Won Value', type: 'number', sortable: true, align: 'right', aggregate: 'sum',
        valueGetter: (r) => Math.round(r.wonValue),
      },
      {
        key: 'winRate', label: 'Win Rate', sortable: true, align: 'right', width: '110px',
        valueGetter: (r) => `${r.winRate.toFixed(0)}%`,
      },
    ];
  }

  get breakdownRows(): ReportBreakdownRow[] {
    return this.report?.breakdown?.[this.breakdownKey] || [];
  }

  setBreakdown(key: BreakdownKey): void {
    this.breakdownKey = key;
  }

  /** Clicking a breakdown row opens the list filtered to it — the report answers "who", the list "which". */
  onBreakdownRowOpen(row: ReportBreakdownRow): void {
    // The grid marks the row as open for its detail panel; there is no panel here, so close it again.
    this.breakdownGrid?.closeDetail();
    const param = { department: 'department', salesPerson: 'salesPerson', customer: 'customer' }[this.breakdownKey];
    this._router.navigate(['/quotations'], {
      queryParams: { ...this.listQueryParams, [param]: row.id },
    });
  }

  // --- Attention ----------------------------------------------------------------------------

  get attentionItems(): ReportAttentionItem[] {
    return this.report?.attention?.[this.attentionKey] || [];
  }

  get attentionTotal(): number {
    return this.attentionCount('overdue') + this.attentionCount('closingSoon') + this.attentionCount('idle');
  }

  attentionCount(key: AttentionKey): number {
    return this.report?.attention?.[key]?.length || 0;
  }

  /** The `days` field means something different per list, so the label is chosen here. */
  attentionDaysLabel(item: ReportAttentionItem): string {
    if (this.attentionKey === 'overdue') return `${item.days}d overdue`;
    if (this.attentionKey === 'closingSoon') return item.days === 0 ? 'Closes today' : `in ${item.days}d`;
    return `${item.days}d idle`;
  }

  openQuotation(item: ReportAttentionItem): void {
    this._router.navigate(['/quotations/view', item._id]);
  }

  // --- Export -------------------------------------------------------------------------------

  /** One workbook, one sheet per section, so the numbers on screen can be checked and shared. */
  exportExcel(): void {
    const report = this.report;
    if (!report) return;

    const currency = report.currency;
    const k = report.kpi;
    const money = (n: number) => Math.round(n);
    const pct = (n: number) => `${n.toFixed(1)}%`;

    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 22 }],
        rows: ([
          ['Total quoted value', `${money(k.totalValue)} ${currency}`],
          ['Quotations', k.totalCount],
          ['Won value', `${money(k.wonValue)} ${currency}`],
          ['Won', k.wonCount],
          ['Lost', k.lostCount],
          ['Win rate', pct(k.winRate)],
          ['Open pipeline value', `${money(k.openValue)} ${currency}`],
          ['Open quotations', k.openCount],
          ['Average quote value', `${money(k.avgQuoteValue)} ${currency}`],
          ['Average days to close', k.avgDaysToClose == null ? 'n/a' : k.avgDaysToClose.toFixed(1)],
        ] as [string, unknown][]).map(([metric, value]) => ({ metric, value })),
      },
      {
        name: 'Funnel',
        columns: [
          { header: 'Stage', key: 'stage', width: 20 },
          { header: 'Quotes', key: 'count', width: 12 },
          { header: `Value (${currency})`, key: 'value', width: 20 },
          { header: 'Share', key: 'pct', width: 12 },
        ],
        rows: report.funnel.map((s) => ({ stage: s.label, count: s.count, value: money(s.value), pct: pct(s.pct) })),
      },
      {
        name: 'Trend',
        columns: [
          { header: 'Month', key: 'month', width: 12 },
          { header: 'Created', key: 'createdCount', width: 12 },
          { header: `Created value (${currency})`, key: 'createdValue', width: 24 },
          { header: 'Won', key: 'wonCount', width: 12 },
          { header: `Won value (${currency})`, key: 'wonValue', width: 24 },
        ],
        rows: report.trend.map((t) => ({
          month: t.month, createdCount: t.createdCount, createdValue: money(t.createdValue), wonCount: t.wonCount, wonValue: money(t.wonValue),
        })),
      },
      ...(['department', 'salesPerson', 'customer'] as BreakdownKey[]).map((key): ExcelSheet => ({
        name: this.breakdownTabs.find((t) => t.key === key)!.label,
        columns: [
          { header: 'Name', key: 'name', width: 32 },
          { header: 'Quotes', key: 'count', width: 12 },
          { header: `Value (${currency})`, key: 'value', width: 20 },
          { header: 'Won', key: 'wonCount', width: 12 },
          { header: `Won value (${currency})`, key: 'wonValue', width: 20 },
          { header: 'Win rate', key: 'winRate', width: 12 },
        ],
        rows: report.breakdown[key].map((r) => ({
          name: r.name, count: r.count, value: money(r.value), wonCount: r.wonCount, wonValue: money(r.wonValue), winRate: pct(r.winRate),
        })),
      })),
      {
        name: 'Needs attention',
        columns: [
          { header: 'List', key: 'list', width: 16 },
          { header: 'Quote Id', key: 'quoteId', width: 18 },
          { header: 'Customer', key: 'customer', width: 30 },
          { header: 'Sales Person', key: 'salesPerson', width: 24 },
          { header: 'Status', key: 'status', width: 20 },
          { header: `Value (${currency})`, key: 'value', width: 20 },
          { header: 'Closing Date', key: 'closingDate', width: 16 },
          { header: 'Days', key: 'days', width: 10 },
        ],
        rows: ([
          { key: 'overdue', label: 'Overdue' },
          { key: 'closingSoon', label: 'Closing soon' },
          { key: 'idle', label: 'Idle' },
        ] as { key: AttentionKey; label: string }[]).flatMap(({ key, label }) =>
          report.attention[key].map((i) => ({
            list: label, quoteId: i.quoteId, customer: i.customer, salesPerson: i.salesPerson, status: i.status,
            value: money(i.value), closingDate: i.closingDate ? new Date(i.closingDate).toLocaleDateString() : '', days: i.days,
          }))
        ),
      },
    ];

    if (report.lostReasons.length) {
      sheets.push({
        name: 'Lost reasons',
        columns: [
          { header: 'Reason', key: 'reason', width: 44 },
          { header: 'Quotes', key: 'count', width: 12 },
          { header: `Value (${currency})`, key: 'value', width: 20 },
        ],
        rows: report.lostReasons.map((r) => ({ reason: r.reason, count: r.count, value: money(r.value) })),
      });
    }

    void this.excelExport.download('quotation-report.xlsx', sheets);
  }

  /** The browser's own print-to-PDF, against a print stylesheet — no second rendering to keep in step. */
  exportPdf(): void {
    window.print();
  }

  // --- Helpers used by the template ----------------------------------------------------------

  statusColor(name: string): string {
    return (this.statusColors as Record<string, string>)[name] || '#9CA3AF';
  }

  trackByMonth = (_: number, t: { month: string }) => t.month;
  trackById = (_: number, r: { _id?: string; id?: string }) => r._id ?? r.id ?? '';
}
