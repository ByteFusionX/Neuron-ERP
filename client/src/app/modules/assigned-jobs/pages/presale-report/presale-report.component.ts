import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { Subscription, filter, take } from 'rxjs';
import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';
import { EnquiryService, PresaleReport, PresaleReportRow } from 'src/app/core/services/enquiry/enquiry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { KpiCardComponent, KpiDelta } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent } from 'src/app/shared/components/report-filters/report-filters.component';
import { DataGridBreadcrumb, DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';

type BreakdownKey = 'presale' | 'department';
type AttentionKey = 'new' | 'assigned' | 'rejected';
type ReportSection = 'overview' | 'breakdown' | 'attention';

type PipelineChart = {
  series: ApexAxisChartSeries; chart: ApexChart; plotOptions: ApexPlotOptions; xaxis: ApexXAxis; yaxis: ApexYAxis;
  grid: ApexGrid; legend: ApexLegend; tooltip: ApexTooltip; dataLabels: ApexDataLabels; colors: string[];
};
type TrendChart = {
  series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis; yaxis: ApexYAxis; stroke: ApexStroke; fill: ApexFill;
  grid: ApexGrid; legend: ApexLegend; tooltip: ApexTooltip; dataLabels: ApexDataLabels; colors: string[];
};

/** The presale report, a page beside the list under the same List | Report toggle. Filters live in the URL. */
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
@Component({
  selector: 'app-presale-report',
  templateUrl: './presale-report.component.html',
  styleUrls: ['./presale-report.component.css'],
  imports: [ViewToggleComponent, NgIf, NgFor, NgClass, DecimalPipe, DatePipe, RouterLink, NgIcon, ChartComponent, ActionButtonComponent, DataGridComponent, KpiCardComponent, ReportFiltersComponent],
})
export class PresaleReportComponent implements OnInit, OnDestroy {
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  report: PresaleReport | null = null;
  /** Same report for the equal-length window before the selected dates; null without a full range. */
  previous: PresaleReport | null = null;
  loading = true;
  failed = false;
  section: ReportSection = 'overview';
  private fetchSeq = 0;
  private access?: string;
  private userId?: string;
  private subscriptions = new Subscription();
  private themeObserver?: MutationObserver;

  pipelineChart: PipelineChart | null = null;
  trendChart: TrendChart | null = null;
  /** Stages the user has unticked; everything is shown until they say otherwise. */
  hiddenStages = new Set<string>();

  private readonly stageColors: Record<string, string> = { new: '#f59e0b', assigned: '#3b82f6', completed: '#10b981', rejected: '#ef4444' };

  filters: ReportFilterValues = { department: null, presale: null, fromDate: null, toDate: null };
  filterFields: ReportFilterField[] = [
    { key: 'department', label: 'Department', type: 'select', options: [], placeholder: 'All departments' },
    { key: 'presale', label: 'Presale Engineer', type: 'combobox', options: [], placeholder: 'Everyone' },
    { key: 'fromDate', label: 'From', type: 'date' },
    { key: 'toDate', label: 'To', type: 'date' },
  ];

  readonly breakdownTabs: { key: BreakdownKey; label: string }[] = [
    { key: 'presale', label: 'Presale Engineer' },
    { key: 'department', label: 'Department' },
  ];
  breakdownKey: BreakdownKey = 'presale';

  readonly attentionTabs: { key: AttentionKey; label: string }[] = [
    { key: 'new', label: 'Waiting to be assigned' },
    { key: 'assigned', label: 'With engineers' },
    { key: 'rejected', label: 'Rejected' },
  ];
  attentionKey: AttentionKey = 'new';

  breakdownColumns: DataGridColumn<PresaleReportRow>[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'count', label: 'Jobs', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
    { key: 'new', label: 'New', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
    { key: 'assigned', label: 'Assigned', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
    { key: 'completed', label: 'Completed', type: 'number', sortable: true, align: 'right', width: '110px', aggregate: 'sum' },
    { key: 'rejected', label: 'Rejected', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
  ];

  constructor(
    private _enquiryService: EnquiryService,
    private _employeeService: EmployeeService,
    private _departmentService: ProfileService,
    private _router: Router,
    private _route: ActivatedRoute,
    private excelExport: ExcelExportService,
  ) {}

  ngOnInit(): void {
    this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
      if (employee?.category.privileges.assignedJob.viewReport === 'none') this._router.navigate(['/home']);
    });
    this.subscriptions.add(this._employeeService.getPresaleEngineers().subscribe((people) => {
      this.setOptions('presale', people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p._id as string })));
    }));
    this.subscriptions.add(this._departmentService.getDepartments().subscribe((departments: getDepartment[]) => {
      this.setOptions('department', departments.map((d) => ({ label: d.departmentName, value: d._id as string })));
    }));
    this.subscriptions.add(this._route.queryParams.subscribe((params) => {
      this.filters = Object.fromEntries(this.filterFields.map((f) => [f.key, params[f.key] || null]));
      this.fetch();
    }));
    // ApexCharts bakes colours in at build time, so rebuild when the theme class flips.
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

  private setOptions(key: string, options: { label: string; value: string }[]): void {
    this.filterFields = this.filterFields.map((f) => (f.key === key ? { ...f, options } : f));
  }

  private fetch(): void {
    this.loading = true;
    this.failed = false;
    this.previous = null;
    const seq = ++this.fetchSeq;
    this._employeeService.employeeData$.subscribe((employee) => {
      this.access = employee?.category.privileges.assignedJob.viewReport;
      this.userId = employee?._id;
    }).unsubscribe();
    const body = { ...this.filters, access: this.access, userId: this.userId };
    this.subscriptions.add(
      this._enquiryService.getPresaleReport(body).subscribe({
        next: (res) => {
          if (seq !== this.fetchSeq) return;
          this.report = res; this.loading = false; this.buildCharts(); this.fetchPrevious(body, seq);
        },
        error: () => { if (seq !== this.fetchSeq) return; this.report = null; this.loading = false; this.failed = true; },
      })
    );
  }

  /** The previous period is the same number of days ending the day before `fromDate`. A failure only drops the deltas. */
  private fetchPrevious(body: Record<string, unknown>, seq: number): void {
    const { fromDate, toDate } = this.filters as { fromDate: string | null; toDate: string | null };
    if (!fromDate || !toDate) return;
    const day = 86400000;
    const from = Date.parse(fromDate), to = Date.parse(toDate);
    if (isNaN(from) || isNaN(to) || to < from) return;
    const span = Math.round((to - from) / day) + 1;
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const prevTo = from - day;
    this.subscriptions.add(
      this._enquiryService.getPresaleReport({ ...body, fromDate: iso(prevTo - (span - 1) * day), toDate: iso(prevTo) }).subscribe({
        next: (res) => { if (seq === this.fetchSeq) this.previous = res; },
        error: () => {},
      })
    );
  }

  delta(key: 'count' | 'completed' | 'rejected'): KpiDelta | null {
    const now = this.report?.kpi, before = this.previous?.kpi;
    if (!now || !before) return null;
    if (!before[key]) return now[key] ? { text: 'New', tone: 'up' } : null;
    const pct = Math.round(((now[key] - before[key]) / before[key]) * 100);
    // A rise in rejections is bad news, so its tone is inverted.
    const good = key === 'rejected' ? pct < 0 : pct > 0;
    const bad = key === 'rejected' ? pct > 0 : pct < 0;
    return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: good ? 'up' : bad ? 'down' : 'flat' };
  }

  onFilterChange(values: ReportFilterValues): void {
    this._router.navigate([], { relativeTo: this._route, queryParams: values, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // --- Charts -------------------------------------------------------------------------------

  isStageShown(key: string): boolean {
    return !this.hiddenStages.has(key);
  }

  toggleStage(key: string): void {
    if (this.hiddenStages.has(key)) this.hiddenStages.delete(key); else this.hiddenStages.add(key);
    this.buildPipelineChart();
  }

  stageColor(key: string): string {
    return this.stageColors[key] || '#9ca3af';
  }

  private buildCharts(): void {
    this.buildPipelineChart();
    this.buildTrendChart();
  }

  private buildPipelineChart(): void {
    const stages = (this.report?.funnel || []).filter((s) => !this.hiddenStages.has(s.key));
    if (!stages.length) { this.pipelineChart = null; return; }
    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    this.pipelineChart = {
      series: [{ name: 'Jobs', data: stages.map((s) => s.count) }],
      chart: { type: 'bar', height: 40 + stages.length * 52, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: stages.map((s) => this.stageColor(s.key)),
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 5, barHeight: '62%' } },
      dataLabels: { enabled: true, textAnchor: 'start', offsetX: 6, style: { fontSize: '12px', fontWeight: 600, colors: ['#ffffff'] }, formatter: (v: number) => (v ? String(v) : '') },
      legend: { show: false },
      grid: { borderColor: dark ? '#262626' : '#f3f4f6', strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
      xaxis: { categories: stages.map((s) => s.label), labels: { style: { colors: axis, fontSize: '11px' }, formatter: (v: string) => String(Math.round(Number(v))) }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: dark ? '#d4d4d4' : '#374151', fontSize: '13px', fontWeight: 500 } } },
      tooltip: { theme: dark ? 'dark' : 'light', y: { formatter: (v: number, opts: any) => { const s = stages[opts?.dataPointIndex]; return s ? `${v} · ${Math.round(s.pct)}%` : String(v); } } },
    };
  }

  private buildTrendChart(): void {
    const trend = this.report?.trend;
    if (!trend?.length) { this.trendChart = null; return; }
    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';
    this.trendChart = {
      series: [
        { name: 'Sent to presale', type: 'column', data: trend.map((t) => t.received) },
        { name: 'Completed', type: 'line', data: trend.map((t) => t.completed) },
      ],
      chart: { type: 'line', height: 300, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: ['#a78bfa', '#10b981'],
      stroke: { width: [0, 3], curve: 'smooth' },
      fill: { opacity: [0.9, 1] },
      dataLabels: { enabled: false },
      grid: { borderColor: gridColor, strokeDashArray: 4, padding: { left: 4, right: 4 } },
      legend: { position: 'top', horizontalAlign: 'right', labels: { colors: axis } },
      xaxis: { categories: trend.map((t) => this.monthLabel(t.month)), labels: { style: { colors: axis, fontSize: '11px' } }, axisBorder: { color: gridColor }, axisTicks: { color: gridColor } },
      yaxis: { labels: { style: { colors: axis, fontSize: '11px' }, formatter: (v: number) => String(Math.round(v)) } },
      tooltip: { theme: dark ? 'dark' : 'light', shared: true, intersect: false },
    };
  }

  private monthLabel(month: string): string {
    const [year, m] = month.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[Number(m) - 1]} ${year.slice(2)}`;
  }

  // --- Breakdown / attention ----------------------------------------------------------------

  get breakdownRows(): PresaleReportRow[] {
    return this.report?.breakdown?.[this.breakdownKey] || [];
  }

  get attentionItems() {
    return this.report?.attention?.[this.attentionKey] || [];
  }

  get attentionTotal(): number {
    return this.attentionTabs.reduce((t, a) => t + this.attentionCount(a.key), 0);
  }

  attentionCount(key: AttentionKey): number {
    return this.report?.attention?.[key]?.length || 0;
  }

  /** Opens the presale list on the matching tab. */
  openJob(_item: { enquiryId: string }): void {
    this._router.navigate(['/assigned-jobs'], { queryParams: { tab: this.attentionKey } });
  }

  // --- Export -------------------------------------------------------------------------------

  exportExcel(): void {
    const r = this.report;
    if (!r) return;
    const pct = (n: number) => `${n.toFixed(1)}%`;
    const cols = [
      { header: 'Name', key: 'name', width: 32 }, { header: 'Jobs', key: 'count', width: 10 }, { header: 'New', key: 'new', width: 10 },
      { header: 'Assigned', key: 'assigned', width: 10 }, { header: 'Completed', key: 'completed', width: 12 }, { header: 'Rejected', key: 'rejected', width: 10 },
    ];
    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 18 }],
        rows: ([['Total jobs', r.kpi.count], ['New', r.kpi.new], ['Assigned', r.kpi.assigned], ['Completed', r.kpi.completed], ['Rejected', r.kpi.rejected],
          ['Completion rate', pct(r.kpi.completionRate)], ['Rejection rate', pct(r.kpi.rejectionRate)],
          ['Average days waiting to be assigned', r.avgWaitDays == null ? 'n/a' : r.avgWaitDays.toFixed(1)]] as [string, unknown][]).map(([metric, value]) => ({ metric, value })),
      },
      {
        name: 'Trend',
        columns: [{ header: 'Month', key: 'month', width: 12 }, { header: 'Sent to presale', key: 'received', width: 16 }, { header: 'Completed', key: 'completed', width: 12 }],
        rows: r.trend,
      },
      ...this.breakdownTabs.map((t): ExcelSheet => ({ name: t.label, columns: cols, rows: r.breakdown[t.key] as any[] })),
      {
        name: 'Needs attention',
        columns: [
          { header: 'List', key: 'list', width: 24 }, { header: 'Enquiry No.', key: 'enquiryId', width: 26 }, { header: 'Description', key: 'title', width: 36 },
          { header: 'Customer', key: 'customer', width: 30 }, { header: 'Sent By', key: 'salesPerson', width: 24 }, { header: 'Presale', key: 'presale', width: 24 },
          { header: 'Status', key: 'status', width: 28 }, { header: 'Days', key: 'days', width: 8 },
        ],
        rows: this.attentionTabs.flatMap(({ key, label }) => r.attention[key].map((i) => ({ list: label, ...i }))),
      },
    ];
    if (r.rejectionReasons.length) {
      sheets.push({
        name: 'Rejection reasons',
        columns: [{ header: 'Reason', key: 'reason', width: 44 }, { header: 'Times', key: 'count', width: 10 }],
        rows: r.rejectionReasons,
      });
    }
    void this.excelExport.download('presale-report.xlsx', sheets);
  }

  exportPdf(): void {
    window.print();
  }

  trackById = (_: number, r: { id: string }) => r.id;
}
