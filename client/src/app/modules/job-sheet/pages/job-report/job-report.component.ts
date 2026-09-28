import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { Observable, Subscription, filter, shareReplay, switchMap, take } from 'rxjs';

import { JobService } from 'src/app/core/services/job/job.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ExcelExportService, ExcelSheet } from 'src/app/core/services/export/excel-export.service';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { getCreators } from 'src/app/shared/interfaces/employee.interface';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { allocateStatus, filterJob, getJob, JobTable } from 'src/app/shared/interfaces/job.interface';

import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn } from 'src/app/shared/components/data-grid/data-grid.model';
import { KpiCardComponent, KpiDelta } from 'src/app/shared/components/kpi-card/kpi-card.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { ReportFilterField, ReportFilterValues, ReportFiltersComponent } from 'src/app/shared/components/report-filters/report-filters.component';
import { SfOption } from 'src/app/shared/components/smart-form';

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

interface BreakdownRow {
  id: string;
  name: string;
  count: number;
  lpoValue: number;
  pending: number;
  openToWork: number;
  inProgress: number;
  completed: number;
}

interface AttentionItem {
  _id: string;
  jobId: string;
  customer: string;
  salesPerson: string;
  status: string;
  lpoValue: number;
  days: number;
}

type BreakdownKey = 'salesPerson' | 'department';
type AttentionKey = 'onHold' | 'idle';
type ReportSection = 'overview' | 'breakdown' | 'attention';

const STAGE_COLORS: Record<string, string> = {
  Pending: '#f59e0b',
  OpenToWork: '#38bdf8',
  'Work In Progress': '#a78bfa',
  Completed: '#10b981',
};

const STAGE_LABELS: Record<allocateStatus, string> = {
  [allocateStatus.Pending]: 'Pending',
  [allocateStatus.OpenToWork]: 'Open To Work',
  [allocateStatus.WorkInProgress]: 'In Progress',
  [allocateStatus.Completed]: 'Completed',
};

/**
 * The job-sheet report, as a page rather than a modal, mirroring the quotation report's
 * List | Report toggle, filters-in-the-URL pattern, and section layout (Overview / Breakdown /
 * Attention). There is no dedicated backend report endpoint for jobs, so this fetches the full
 * filtered job list and aggregates KPIs/charts/breakdowns client-side.
 */
@Component({
  selector: 'app-job-report',
  templateUrl: './job-report.component.html',
  styleUrls: ['./job-report.component.css'],
  providers: [NumberFormatterPipe, DatePipe],
  imports: [
    ViewToggleComponent, NgIf, NgFor, NgClass, AsyncPipe, DecimalPipe, DatePipe, RouterLink, FormsModule, NgIcon,
    ChartComponent, ActionButtonComponent, DataGridComponent, KpiCardComponent, NumberFormatterPipe, ReportFiltersComponent,
  ],
})
export class JobReportComponent implements OnInit, OnDestroy {
  @ViewChild('breakdownGrid') breakdownGrid?: DataGridComponent<BreakdownRow>;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Job Sheet', link: '/job-sheet' }];

  jobs: getJob[] = [];
  private allJobs: getJob[] = [];
  previousJobs: getJob[] | null = null;
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

  breakdownKey: BreakdownKey = 'salesPerson';
  readonly breakdownTabs: { key: BreakdownKey; label: string }[] = [
    { key: 'salesPerson', label: 'Sales Person' },
    { key: 'department', label: 'Department' },
  ];
  breakdownColumns: DataGridColumn<BreakdownRow>[] = [];
  bySalesPerson: BreakdownRow[] = [];
  byDepartment: BreakdownRow[] = [];

  attentionKey: AttentionKey = 'onHold';
  section: ReportSection = 'overview';

  trendChart: TrendChart | null = null;
  pipelineChart: PipelineChart | null = null;
  /** allocateStatus stages the user has unticked; everything is shown until they say otherwise. */
  hiddenStages = new Set<string>();
  statusChart: StatusChart | null = null;
  trendMetric: 'value' | 'count' = 'count';

  private subscriptions = new Subscription();
  private themeObserver?: MutationObserver;
  private access?: string;
  private userId?: string;

  constructor(
    private _jobService: JobService,
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
      this._jobService.getJobSalesPerson().subscribe((people: getCreators[]) => {
        this.setOptions('salesPerson', people.map((p) => ({ label: p.fullName, value: p._id })));
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

  /** Jobs are fetched unfiltered (aside from access scoping) since there is no report endpoint; filters are applied client-side. */
  private fetch(): void {
    this.loading = true;
    this.failed = false;
    this.previousJobs = null;
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        this.access = employee?.category?.privileges?.jobSheet?.viewReport;
        this.userId = employee?._id;

        const filterData: filterJob = {
          search: '',
          page: 1,
          row: Number.MAX_SAFE_INTEGER,
          status: null,
          access: this.access,
          userId: this.userId,
          allocateStatus: null,
        };

        this._jobService.getJobs(filterData).subscribe({
          next: (data: JobTable) => {
            this.allJobs = data ? data.job : [];
            this.applyFilters();
            this.loading = false;
          },
          error: () => {
            this.allJobs = [];
            this.jobs = [];
            this.loading = false;
            this.failed = true;
          },
        });
      })
    );
  }

  private applyFilters(): void {
    const from = this.filters['fromDate'] ? Date.parse(this.filters['fromDate']!) : null;
    const to = this.filters['toDate'] ? Date.parse(this.filters['toDate']!) + 86400000 - 1 : null;

    this.jobs = this.allJobs.filter((j) => {
      if (this.filters['salesPerson'] && j.salesPersonDetails?.[0]?._id !== this.filters['salesPerson']) return false;
      if (this.filters['department'] && j.departmentDetails?.[0]?._id !== this.filters['department']) return false;
      if (this.filters['customer'] && j.clientDetails?._id !== this.filters['customer']) return false;
      const created = Date.parse(j.createdDate);
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      return true;
    });

    this.buildCharts();
    this.buildBreakdowns();
    this.fetchPrevious(from, to);
  }

  /**
   * Comparison needs a bounded range: the previous period is the same number of days ending the
   * day before `fromDate`. Without both dates there is nothing sensible to compare against.
   */
  private fetchPrevious(from: number | null, to: number | null): void {
    if (from === null || to === null || isNaN(from) || isNaN(to) || to < from) {
      this.previousJobs = null;
      return;
    }
    const day = 86400000;
    const spanDays = Math.round((to - from) / day) + 1;
    const prevTo = from - 1;
    const prevFrom = prevTo - (spanDays - 1) * day;

    this.previousJobs = this.allJobs.filter((j) => {
      if (this.filters['salesPerson'] && j.salesPersonDetails?.[0]?._id !== this.filters['salesPerson']) return false;
      if (this.filters['department'] && j.departmentDetails?.[0]?._id !== this.filters['department']) return false;
      if (this.filters['customer'] && j.clientDetails?._id !== this.filters['customer']) return false;
      const created = Date.parse(j.createdDate);
      return created >= prevFrom && created <= prevTo;
    });
  }

  /** Change of a KPI against the previous period. */
  delta(key: 'totalJobs' | 'totalLpoValue' | 'completedCount'): KpiDelta | null {
    const before = this.previousJobs;
    if (!before) return null;
    const now = key === 'totalJobs' ? this.totalJobs : key === 'totalLpoValue' ? this.totalLpoValue : this.completedCount;
    const beforeVal = key === 'totalJobs' ? before.length
      : key === 'totalLpoValue' ? before.reduce((t, j) => t + (j.lpoValue ?? 0), 0)
      : before.filter((j) => j.allocateStatus === allocateStatus.Completed).length;
    const diff = now - beforeVal;
    if (!beforeVal) return now ? { text: 'New', tone: 'up' } : null;
    const pct = Math.round((diff / beforeVal) * 100);
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

  // ---- KPIs ----------------------------------------------------------------------------------

  get totalJobs(): number { return this.jobs.length; }
  get totalLpoValue(): number { return this.jobs.reduce((t, j) => t + (j.lpoValue ?? 0), 0); }
  countFor(status: allocateStatus): number { return this.jobs.filter((j) => j.allocateStatus === status).length; }
  get pendingCount(): number { return this.countFor(allocateStatus.Pending); }
  get openToWorkCount(): number { return this.countFor(allocateStatus.OpenToWork); }
  get inProgressCount(): number { return this.countFor(allocateStatus.WorkInProgress); }
  get completedCount(): number { return this.countFor(allocateStatus.Completed); }

  // ---- Pipeline / trend charts -----------------------------------------------------------------

  isStageShown(key: string): boolean {
    return !this.hiddenStages.has(key);
  }

  toggleStage(key: string): void {
    if (this.hiddenStages.has(key)) this.hiddenStages.delete(key);
    else this.hiddenStages.add(key);
    this.buildPipelineChart();
  }

  setTrendMetric(metric: 'value' | 'count'): void {
    this.trendMetric = metric;
    this.buildTrendChart();
  }

  private buildCharts(): void {
    this.buildTrendChart();
    this.buildPipelineChart();
  }

  get stages(): { key: string; label: string; count: number; value: number }[] {
    return (Object.values(allocateStatus) as allocateStatus[]).map((s) => {
      const rows = this.jobs.filter((j) => j.allocateStatus === s);
      return { key: s, label: STAGE_LABELS[s], count: rows.length, value: rows.reduce((t, j) => t + (j.lpoValue ?? 0), 0) };
    });
  }

  private buildPipelineChart(): void {
    const funnel = this.stages.filter((s) => !this.hiddenStages.has(s.key));
    if (!funnel.length) {
      this.pipelineChart = null;
      return;
    }

    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';

    this.pipelineChart = {
      series: [{ name: 'Jobs', data: funnel.map((s) => s.count) }],
      chart: { type: 'bar', height: 40 + funnel.length * 52, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: funnel.map((s) => STAGE_COLORS[s.key] || '#9ca3af'),
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
            return stage ? `${v} · ${this.numberFormat.transform(stage.value)} QAR` : String(v);
          },
        },
      },
    };
  }

  private buildTrendChart(): void {
    if (!this.jobs.length) {
      this.trendChart = null;
      return;
    }

    const months: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const createdBy = new Map<string, { count: number; value: number }>();
    const completedBy = new Map<string, { count: number; value: number }>();
    for (const m of months) {
      createdBy.set(m, { count: 0, value: 0 });
      completedBy.set(m, { count: 0, value: 0 });
    }
    for (const job of this.jobs) {
      const created = new Date(job.createdDate);
      const cKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      if (createdBy.has(cKey)) {
        const row = createdBy.get(cKey)!;
        row.count += 1;
        row.value += job.lpoValue ?? 0;
      }
      if (job.allocateStatus === allocateStatus.Completed && job.updatedDate) {
        const updated = new Date(job.updatedDate);
        const uKey = `${updated.getFullYear()}-${String(updated.getMonth() + 1).padStart(2, '0')}`;
        if (completedBy.has(uKey)) {
          const row = completedBy.get(uKey)!;
          row.count += 1;
          row.value += job.lpoValue ?? 0;
        }
      }
    }

    const dark = this.isDark;
    const axis = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f3f4f6';
    const byValue = this.trendMetric === 'value';

    this.trendChart = {
      series: [
        { name: byValue ? 'LPO Value' : 'Jobs created', type: 'column', data: months.map((m) => Math.round(byValue ? createdBy.get(m)!.value : createdBy.get(m)!.count)) },
        { name: byValue ? 'Completed Value' : 'Jobs completed', type: 'line', data: months.map((m) => Math.round(byValue ? completedBy.get(m)!.value : completedBy.get(m)!.count)) },
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
        categories: months.map((m) => this.monthLabel(m)),
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
        y: { formatter: (v: number) => (byValue ? `${this.numberFormat.transform(v)} QAR` : `${v}`) },
      },
    };
  }

  private monthLabel(month: string): string {
    const [year, m] = month.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[Number(m) - 1]} ${year.slice(2)}`;
  }

  // ---- Breakdown -------------------------------------------------------------------------------

  private buildBreakdownColumns(): void {
    this.breakdownColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'count', label: 'Jobs', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      { key: 'pending', label: 'Pending', type: 'number', sortable: true, align: 'right', width: '90px', aggregate: 'sum' },
      { key: 'openToWork', label: 'Open To Work', type: 'number', sortable: true, align: 'right', width: '120px', aggregate: 'sum' },
      { key: 'inProgress', label: 'In Progress', type: 'number', sortable: true, align: 'right', width: '110px', aggregate: 'sum' },
      { key: 'completed', label: 'Completed', type: 'number', sortable: true, align: 'right', width: '100px', aggregate: 'sum' },
      {
        key: 'lpoValue', label: 'LPO Value (QAR)', type: 'number', sortable: true, align: 'right', aggregate: 'sum',
        valueGetter: (r) => Math.round(r.lpoValue),
      },
    ];
  }

  private buildBreakdowns(): void {
    this.bySalesPerson = this.group(this.jobs, (j) => {
      const p = j.salesPersonDetails?.[0];
      return p ? { id: p._id ?? `${p.firstName}-${p.lastName}`, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() } : null;
    });
    this.byDepartment = this.group(this.jobs, (j) => {
      const d = j.departmentDetails?.[0];
      return d ? { id: d._id ?? d.departmentName, name: d.departmentName } : null;
    });
  }

  private group(jobs: getJob[], keyOf: (j: getJob) => { id: string; name: string } | null): BreakdownRow[] {
    const map = new Map<string, BreakdownRow>();
    for (const job of jobs) {
      const key = keyOf(job);
      if (!key) continue;
      let row = map.get(key.id);
      if (!row) {
        row = { id: key.id, name: key.name || 'Unknown', count: 0, lpoValue: 0, pending: 0, openToWork: 0, inProgress: 0, completed: 0 };
        map.set(key.id, row);
      }
      row.count += 1;
      row.lpoValue += job.lpoValue ?? 0;
      if (job.allocateStatus === allocateStatus.Pending) row.pending += 1;
      else if (job.allocateStatus === allocateStatus.OpenToWork) row.openToWork += 1;
      else if (job.allocateStatus === allocateStatus.WorkInProgress) row.inProgress += 1;
      else if (job.allocateStatus === allocateStatus.Completed) row.completed += 1;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  get breakdownRows(): BreakdownRow[] {
    return this.breakdownKey === 'salesPerson' ? this.bySalesPerson : this.byDepartment;
  }

  setBreakdown(key: BreakdownKey): void {
    this.breakdownKey = key;
  }

  /** Clicking a breakdown row opens the list filtered to it — the report answers "who", the list "which". */
  onBreakdownRowOpen(row: BreakdownRow): void {
    this.breakdownGrid?.closeDetail();
    const param = this.breakdownKey === 'salesPerson' ? 'salesPerson' : 'department';
    this._router.navigate(['/job-sheet'], {
      queryParams: { ...this.listQueryParams, [param]: row.id },
    });
  }

  // ---- Attention -------------------------------------------------------------------------------

  private ageDays(date?: string): number {
    if (!date) return 0;
    return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  }

  get attentionItems(): AttentionItem[] {
    const source = this.attentionKey === 'onHold'
      ? this.jobs.filter((j) => j.status === 'On Hold')
      : this.jobs.filter((j) => j.allocateStatus !== allocateStatus.Completed && this.ageDays(j.updatedDate || j.createdDate) >= 14);

    return source
      .map((j) => ({
        _id: j._id,
        jobId: j.jobId,
        customer: j.clientDetails?.companyName ?? '',
        salesPerson: j.salesPersonDetails?.[0] ? `${j.salesPersonDetails[0].firstName ?? ''} ${j.salesPersonDetails[0].lastName ?? ''}`.trim() : '',
        status: j.allocateStatus,
        lpoValue: j.lpoValue ?? 0,
        days: this.ageDays(j.updatedDate || j.createdDate),
      }))
      .sort((a, b) => b.days - a.days);
  }

  get attentionTotal(): number {
    return this.attentionCount('onHold') + this.attentionCount('idle');
  }

  attentionCount(key: AttentionKey): number {
    if (key === 'onHold') return this.jobs.filter((j) => j.status === 'On Hold').length;
    return this.jobs.filter((j) => j.allocateStatus !== allocateStatus.Completed && this.ageDays(j.updatedDate || j.createdDate) >= 14).length;
  }

  attentionDaysLabel(item: AttentionItem): string {
    return this.attentionKey === 'onHold' ? `${item.days}d on hold` : `${item.days}d idle`;
  }

  openJob(item: AttentionItem): void {
    this._router.navigate(['/job-sheet/view', item._id]);
  }

  trackById = (_: number, r: { _id?: string; id?: string }) => r._id ?? r.id ?? '';

  // ---- Export ------------------------------------------------------------------------------

  exportExcel(): void {
    if (!this.jobs.length) return;
    const sheets: ExcelSheet[] = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 22 }],
        rows: [
          { metric: 'Total jobs', value: this.totalJobs },
          { metric: 'Total LPO value (QAR)', value: Math.round(this.totalLpoValue) },
          { metric: 'Pending', value: this.pendingCount },
          { metric: 'Open To Work', value: this.openToWorkCount },
          { metric: 'In Progress', value: this.inProgressCount },
          { metric: 'Completed', value: this.completedCount },
        ],
      },
      {
        name: 'Pipeline',
        columns: [
          { header: 'Stage', key: 'stage', width: 20 },
          { header: 'Jobs', key: 'count', width: 12 },
          { header: 'Value (QAR)', key: 'value', width: 20 },
        ],
        rows: this.stages.map((s) => ({ stage: s.label, count: s.count, value: Math.round(s.value) })),
      },
      {
        name: 'By Sales Person',
        columns: [
          { header: 'Name', key: 'name', width: 32 }, { header: 'Jobs', key: 'count', width: 12 },
          { header: 'Pending', key: 'pending', width: 12 }, { header: 'Open To Work', key: 'openToWork', width: 14 },
          { header: 'In Progress', key: 'inProgress', width: 14 }, { header: 'Completed', key: 'completed', width: 12 },
          { header: 'LPO Value (QAR)', key: 'lpoValue', width: 18 },
        ],
        rows: this.bySalesPerson.map((r) => ({ ...r, lpoValue: Math.round(r.lpoValue) })),
      },
      {
        name: 'By Department',
        columns: [
          { header: 'Name', key: 'name', width: 32 }, { header: 'Jobs', key: 'count', width: 12 },
          { header: 'Pending', key: 'pending', width: 12 }, { header: 'Open To Work', key: 'openToWork', width: 14 },
          { header: 'In Progress', key: 'inProgress', width: 14 }, { header: 'Completed', key: 'completed', width: 12 },
          { header: 'LPO Value (QAR)', key: 'lpoValue', width: 18 },
        ],
        rows: this.byDepartment.map((r) => ({ ...r, lpoValue: Math.round(r.lpoValue) })),
      },
      {
        name: 'Needs attention',
        columns: [
          { header: 'List', key: 'list', width: 16 },
          { header: 'Job Id', key: 'jobId', width: 18 },
          { header: 'Customer', key: 'customer', width: 30 },
          { header: 'Sales Person', key: 'salesPerson', width: 24 },
          { header: 'Status', key: 'status', width: 20 },
          { header: 'Value (QAR)', key: 'value', width: 20 },
          { header: 'Days', key: 'days', width: 10 },
        ],
        rows: (['onHold', 'idle'] as AttentionKey[]).flatMap((key) => {
          const prevKey = this.attentionKey;
          this.attentionKey = key;
          const items = this.attentionItems;
          this.attentionKey = prevKey;
          const label = key === 'onHold' ? 'On Hold' : 'Idle';
          return items.map((i) => ({
            list: label, jobId: i.jobId, customer: i.customer, salesPerson: i.salesPerson, status: i.status,
            value: Math.round(i.lpoValue), days: i.days,
          }));
        }),
      },
    ];

    void this.excelExport.download('job-sheet-report.xlsx', sheets);
  }

  /** The browser's own print-to-PDF, against a print stylesheet — no second rendering to keep in step. */
  exportPdf(): void {
    window.print();
  }
}
