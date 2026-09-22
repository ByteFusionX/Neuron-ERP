import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { Observable, Subscription, filter, shareReplay, switchMap, take } from 'rxjs';
import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';

import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import {
  EnquiryReportAttentionItem,
  EnquiryReportBreakdownRow,
  EnquiryReportDetails,
  EnquiryReportFilter,
  EnquiryReportKpi,
} from 'src/app/shared/interfaces/enquiry.interface';
import { SfOption } from 'src/app/shared/components/smart-form';
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

type WorkloadChart = {
  series: number[];
  chart: ApexChart;
  labels: string[];
  colors: string[];
  stroke: ApexStroke;
  plotOptions: ApexPlotOptions;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
};

type BreakdownKey ='department' | 'salesPerson' | 'customer' | 'presale';
type AttentionKey = 'notStarted' | 'stuck' | 'awaitingQuote' | 'rejected';
type ReportSection = 'overview' | 'breakdown' | 'attention';

/**
 * The enquiry report, a page beside the list under the same List | Report toggle. Filters live in the
 * URL, which is what lets the toggle keep them: both routes read the same query params.
 *
 * Enquiries carry no monetary value, so everything here is a count. "Days to quote" is measured to the
 * quotation raised against the enquiry.
 */
@Component({
  selector: 'app-enquiry-report',
  templateUrl: './enquiry-report.component.html',
  styleUrls: ['./enquiry-report.component.css'],
  imports: [
    NgIf, NgFor, NgClass, DecimalPipe, DatePipe, RouterLink, NgIcon,
    ChartComponent, ActionButtonComponent, DataGridComponent, KpiCardComponent, ReportFiltersComponent,
  ],
})
export class EnquiryReportComponent implements OnInit, OnDestroy {
  @ViewChild('breakdownGrid') breakdownGrid?: DataGridComponent<EnquiryReportBreakdownRow>;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];

  report: EnquiryReportDetails | null = null;
  /** KPIs for the equal-length window just before the selected dates; null without a full range. */
  previousKpi: EnquiryReportKpi | null = null;
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
    { key: 'presale', label: 'Presale' },
  ];

  readonly attentionTabs: { key: AttentionKey; label: string }[] = [
    { key: 'notStarted', label: 'Not started' },
    { key: 'stuck', label: 'With presales' },
    { key: 'awaitingQuote', label: 'Awaiting quote' },
    { key: 'rejected', label: 'Rejected' },
  ];
  attentionKey: AttentionKey = 'stuck';
  section: ReportSection = 'overview';

  trendChart: TrendChart | null = null;
  pipelineChart: PipelineChart | null = null;
  /** Stages the user has unticked; everything is shown until they say otherwise. */
  hiddenStages = new Set<string>();

  workloadChart: WorkloadChart | null = null;
  /** Presale people the user has unticked; everyone is shown until they say otherwise. */
  hiddenPresales = new Set<string>();

  private readonly workloadPalette = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

  private readonly stageColors: Record<string, string> = {
    new: '#9ca3af',
    presales: '#3b82f6',
    estimated: '#f59e0b',
    quoted: '#10b981',
    rejected: '#ef4444',
    other: '#a78bfa',
  };

  private subscriptions = new Subscription();
  private themeObserver?: MutationObserver;
  private access?: string;
  private userId?: string;

  breakdownColumns: DataGridColumn<EnquiryReportBreakdownRow>[] = [];

  constructor(
    private _enquiryService: EnquiryService,
    private _employeeService: EmployeeService,
    private _customerService: CustomerService,
    private _departmentService: ProfileService,
    private _router: Router,
    private _route: ActivatedRoute,
    private excelExport: ExcelExportService,
  ) {}

  ngOnInit(): void {
    // The route guard only checks the bare /enquiry URL, so the report checks the privilege itself.
    this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
      if (employee?.category.privileges.enquiry.viewReport === 'none') this._router.navigate(['/home']);
    });

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

  private currentFilter(): EnquiryReportFilter {
    this._employeeService.employeeData$.subscribe((employee) => {
      this.access = employee?.category.privileges.enquiry.viewReport;
      this.userId = employee?._id;
    }).unsubscribe();

    return {
      ...(this.filters as Pick<EnquiryReportFilter, 'salesPerson' | 'customer' | 'department' | 'fromDate' | 'toDate'>),
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
      this._enquiryService.getEnquiryReport(filter).subscribe({
        next: (res) => {
          if (seq !== this.fetchSeq) return;
          this.report = res;
          this.loading = false;
          this.buildCharts();
          this.fetchPrevious(filter, seq);
        },
        error: () => {
          if (seq !== this.fetchSeq) return;
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
  private fetchPrevious(filter: EnquiryReportFilter, seq: number): void {
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
      this._enquiryService.getEnquiryReport({ ...filter, fromDate: iso(prevFrom), toDate: iso(prevTo) }).subscribe({
        next: (res) => {
          if (seq === this.fetchSeq) this.previousKpi = res.kpi;
        },
        error: () => {},
      })
    );
  }

  /**
   * Change of a KPI against the previous period. Rates are in percentage points. Days to quote is
   * "up" when it falls, because a faster turnaround is the good direction.
   */
  delta(key: 'totalCount' | 'quotedCount' | 'conversionRate' | 'avgDaysToQuote'): KpiDelta | null {
    const now = this.report?.kpi;
    const before = this.previousKpi;
    if (!now || !before) return null;

    if (key === 'avgDaysToQuote') {
      if (now.avgDaysToQuote == null || before.avgDaysToQuote == null) return null;
      const days = Math.round((now.avgDaysToQuote - before.avgDaysToQuote) * 10) / 10;
      return { text: `${days > 0 ? '+' : ''}${days} d`, tone: days < 0 ? 'up' : days > 0 ? 'down' : 'flat' };
    }
    const diff = now[key] - before[key];
    if (key === 'conversionRate') {
      if (!before.totalCount && !now.totalCount) return null;
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

  // --- Pipeline -----------------------------------------------------------------------------

  stageColor(key: string): string {
    return this.stageColors[key] || '#9ca3af';
  }

  isStageShown(key: string): boolean {
    return !this.hiddenStages.has(key);
  }

  toggleStage(key: string): void {
    if (this.hiddenStages.has(key)) this.hiddenStages.delete(key);
    else this.hiddenStages.add(key);
    this.buildPipelineChart();
  }

  workloadColor(index: number): string {
    return this.workloadPalette[index % this.workloadPalette.length];
  }

  isPresaleShown(id: string): boolean {
    return !this.hiddenPresales.has(id);
  }

  togglePresale(id: string): void {
    if (this.hiddenPresales.has(id)) this.hiddenPresales.delete(id);
    else this.hiddenPresales.add(id);
    this.buildWorkloadChart();
  }

  private buildCharts(): void {
    this.buildTrendChart();
    this.buildPipelineChart();
    this.buildWorkloadChart();
  }

  private buildWorkloadChart(): void {
    // Colours follow the row's position in the full list, so unticking someone doesn't recolour the rest.
    const all = this.report?.workload || [];
    const rows = all.map((w, i) => ({ w, color: this.workloadColor(i) })).filter((r) => !this.hiddenPresales.has(r.w.id));
    if (!rows.some((r) => r.w.count)) {
      this.workloadChart = null;
      return;
    }

    const dark = this.isDark;
    const text = dark ? '#d4d4d4' : '#374151';

    this.workloadChart = {
      series: rows.map((r) => r.w.count),
      labels: rows.map((r) => r.w.name),
      colors: rows.map((r) => r.color),
      chart: { type: 'donut', height: 300, fontFamily: 'inherit', background: 'transparent' },
      stroke: { width: 2, colors: [dark ? '#171717' : '#ffffff'] },
      dataLabels: { enabled: false },
      legend: { show: false },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              name: { color: dark ? '#8f8f8f' : '#6b7280', fontSize: '12px' },
              value: { color: text, fontSize: '22px', fontWeight: 600 },
              total: { show: true, label: 'Total', color: dark ? '#8f8f8f' : '#6b7280', formatter: () => String(rows.reduce((t, r) => t + r.w.count, 0)) },
            },
          },
        },
      },
      tooltip: {
        theme: dark ? 'dark' : 'light',
        y: {
          formatter: (v: number, opts: any) => {
            const row = rows[opts?.seriesIndex];
            return row ? `${v} · oldest ${row.w.oldestDays}d` : String(v);
          },
        },
      },
    };
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

    this.pipelineChart = {
      series: [{ name: 'Enquiries', data: funnel.map((s) => s.count) }],
      chart: { type: 'bar', height: 40 + funnel.length * 52, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: funnel.map((s) => this.stageColor(s.key)),
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
            return stage ? `${v} · ${Math.round(stage.pct)}%` : String(v);
          },
        },
      },
    };
  }

  // --- Trend --------------------------------------------------------------------------------

  private buildTrendChart(): void {
    const trend = this.report?.trend;
    if (!trend?.length) {
      this.trendChart = null;
      return;
    }

    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';

    this.trendChart = {
      series: [
        { name: 'Enquiries received', type: 'column', data: trend.map((t) => t.createdCount) },
        { name: 'Quotations raised', type: 'line', data: trend.map((t) => t.quotedCount) },
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
        labels: { style: { colors: axis, fontSize: '11px' }, formatter: (v: number) => String(Math.round(v)) },
      },
      tooltip: { theme: dark ? 'dark' : 'light', shared: true, intersect: false },
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
      { key: 'count', label: 'Enquiries', type: 'number', sortable: true, align: 'right', width: '110px', aggregate: 'sum' },
      { key: 'openCount', label: 'Open', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      { key: 'quotedCount', label: 'Quoted', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      { key: 'rejectedCount', label: 'Rejected', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      {
        key: 'conversionRate', label: 'Conversion', sortable: true, align: 'right', width: '110px',
        valueGetter: (r) => `${r.conversionRate.toFixed(0)}%`,
      },
    ];
  }

  get breakdownRows(): EnquiryReportBreakdownRow[] {
    return this.report?.breakdown?.[this.breakdownKey] || [];
  }

  setBreakdown(key: BreakdownKey): void {
    this.breakdownKey = key;
  }

  get breakdownTitle(): string {
    return 'By ' + (this.breakdownTabs.find((t) => t.key === this.breakdownKey)?.label || '');
  }

  /** Clicking a breakdown row opens the list filtered to it — the report answers "who", the list "which". */
  onBreakdownRowOpen(row: EnquiryReportBreakdownRow): void {
    // The grid marks the row as open for its detail panel; there is no panel here, so close it again.
    this.breakdownGrid?.closeDetail();
    // The list has no presale filter, so those rows have nowhere to go.
    if (this.breakdownKey === 'presale') return;
    this._router.navigate(['/enquiry'], {
      queryParams: { ...this.listQueryParams, [this.breakdownKey]: row.id },
    });
  }

  // --- Attention ----------------------------------------------------------------------------

  get attentionItems(): EnquiryReportAttentionItem[] {
    return this.report?.attention?.[this.attentionKey] || [];
  }

  get attentionTotal(): number {
    return this.attentionTabs.reduce((sum, t) => sum + this.attentionCount(t.key), 0);
  }

  attentionCount(key: AttentionKey): number {
    return this.report?.attention?.[key]?.length || 0;
  }

  /** The `days` field means something different per list, so the label is chosen here. */
  attentionDaysLabel(item: EnquiryReportAttentionItem): string {
    switch (this.attentionKey) {
      case 'stuck': return `${item.days}d with presales`;
      case 'rejected': return `${item.days}d since assigned`;
      default: return `${item.days}d old`;
    }
  }

  /** Opens the list already searching for that enquiry. */
  openEnquiry(item: EnquiryReportAttentionItem): void {
    this._router.navigate(['/enquiry'], { queryParams: { search: item.enquiryId } });
  }

  // --- Export -------------------------------------------------------------------------------

  /** One workbook, one sheet per section, so the numbers on screen can be checked and shared. */
  exportExcel(): void {
    const report = this.report;
    if (!report) return;

    const k = report.kpi;
    const pct = (n: number) => `${n.toFixed(1)}%`;

    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 32 }, { header: 'Value', key: 'value', width: 22 }],
        rows: ([
          ['Enquiries', k.totalCount],
          ['Open', k.openCount],
          ['With presales', k.presalesCount],
          ['Estimated, ready to quote', k.estimatedCount],
          ['Quoted', k.quotedCount],
          ['Currently rejected', k.rejectedCount],
          ['Conversion to quotation', pct(k.conversionRate)],
          ['Sent to presales', k.sentToPresalesCount],
          ['Rejected at least once', k.everRejectedCount],
          ['Presale rejection rate', pct(k.rejectionRate)],
          ['Average days to quote', k.avgDaysToQuote == null ? 'n/a' : k.avgDaysToQuote.toFixed(1)],
        ] as [string, unknown][]).map(([metric, value]) => ({ metric, value })),
      },
      {
        name: 'Pipeline',
        columns: [
          { header: 'Stage', key: 'stage', width: 20 },
          { header: 'Enquiries', key: 'count', width: 12 },
          { header: 'Share', key: 'pct', width: 12 },
        ],
        rows: report.funnel.map((s) => ({ stage: s.label, count: s.count, pct: pct(s.pct) })),
      },
      {
        name: 'Trend',
        columns: [
          { header: 'Month', key: 'month', width: 12 },
          { header: 'Received', key: 'createdCount', width: 12 },
          { header: 'Quoted', key: 'quotedCount', width: 12 },
        ],
        rows: report.trend.map((t) => ({ month: t.month, createdCount: t.createdCount, quotedCount: t.quotedCount })),
      },
      ...this.breakdownTabs.map((tab): ExcelSheet => ({
        name: tab.label,
        columns: [
          { header: 'Name', key: 'name', width: 32 },
          { header: 'Enquiries', key: 'count', width: 12 },
          { header: 'Open', key: 'openCount', width: 10 },
          { header: 'Quoted', key: 'quotedCount', width: 10 },
          { header: 'Rejected', key: 'rejectedCount', width: 10 },
          { header: 'Conversion', key: 'conversionRate', width: 12 },
        ],
        rows: report.breakdown[tab.key].map((r) => ({
          name: r.name, count: r.count, openCount: r.openCount, quotedCount: r.quotedCount, rejectedCount: r.rejectedCount, conversionRate: pct(r.conversionRate),
        })),
      })),
      {
        name: 'Needs attention',
        columns: [
          { header: 'List', key: 'list', width: 16 },
          { header: 'Enquiry No.', key: 'enquiryId', width: 26 },
          { header: 'Description', key: 'title', width: 36 },
          { header: 'Customer', key: 'customer', width: 30 },
          { header: 'Sales Person', key: 'salesPerson', width: 24 },
          { header: 'Presale', key: 'presale', width: 24 },
          { header: 'Status', key: 'status', width: 26 },
          { header: 'Days', key: 'days', width: 8 },
        ],
        rows: this.attentionTabs.flatMap(({ key, label }) =>
          report.attention[key].map((i) => ({
            list: label, enquiryId: i.enquiryId, title: i.title, customer: i.customer, salesPerson: i.salesPerson,
            presale: i.presale, status: i.status, days: i.days,
          }))
        ),
      },
    ];

    if (report.rejectionReasons.length) {
      sheets.push({
        name: 'Rejection reasons',
        columns: [{ header: 'Reason', key: 'reason', width: 50 }, { header: 'Count', key: 'count', width: 10 }],
        rows: report.rejectionReasons.map((r) => ({ reason: r.reason, count: r.count })),
      });
    }

    void this.excelExport.download('enquiry-report.xlsx', sheets);
  }

  /** The browser's own print-to-PDF, against a print stylesheet — no second rendering to keep in step. */
  exportPdf(): void {
    window.print();
  }

  trackById = (_: number, r: { _id?: string; id?: string }) => r._id ?? r.id ?? '';
}
