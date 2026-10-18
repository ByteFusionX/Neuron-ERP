import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, Subscription, switchMap, tap, catchError, of, debounceTime } from 'rxjs';

import { DashboardService } from 'src/app/core/services/dashboard.service';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { DashboardPreferences, SalesAttentionGroup, SalesDashboard } from 'src/app/shared/interfaces/sales-dashboard.interface';

type Currency = 'QAR' | 'USD';
type Preset = 'month' | 'lastMonth' | 'quarter' | 'ytd' | '12m' | 'custom';

interface Kpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  delta?: { text: string; tone: 'up' | 'down' | 'flat' } | null;
  icon: string;
  hint: string;
}

type TrendChart = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis[];
  stroke: ApexStroke;
  fill: ApexFill;
  grid: ApexGrid;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  colors: string[];
};

type SparkChart = { series: ApexAxisChartSeries; chart: ApexChart; stroke: ApexStroke; fill: ApexFill; tooltip: ApexTooltip; colors: string[] };

const CURRENCY_KEY = 'salesDashboard.currency';
const PREFS_KEY = 'sales';

type SectionKey = 'kpis' | 'funnel' | 'attention' | 'trend' | 'people' | 'aging' | 'customers' | 'lost' | 'margin' | 'sizes' | 'sources';

/** Every section the page can show, in default order, with its preferred width out of 12 columns. */
const SECTIONS: { key: SectionKey; label: string; span: number }[] = [
  { key: 'kpis', label: 'Headline numbers', span: 12 },
  { key: 'funnel', label: 'Conversion funnel', span: 7 },
  { key: 'attention', label: 'Needs attention', span: 5 },
  { key: 'trend', label: 'Monthly trend', span: 12 },
  { key: 'people', label: 'Salespeople', span: 8 },
  { key: 'aging', label: 'Pipeline age', span: 4 },
  { key: 'customers', label: 'Top customers', span: 6 },
  { key: 'lost', label: 'Why we lose', span: 6 },
  { key: 'margin', label: 'Margin', span: 12 },
  { key: 'sizes', label: 'Win rate by deal size', span: 6 },
  { key: 'sources', label: 'Where enquiries come from', span: 6 },
];

const KPI_OPTIONS: { key: string; label: string }[] = [
  { key: 'enq', label: 'New enquiries' },
  { key: 'sent', label: 'Quotes sent' },
  { key: 'rate', label: 'Win rate' },
  { key: 'pipe', label: 'Open pipeline' },
  { key: 'avg', label: 'Average deal' },
  { key: 'tat', label: 'Quote turnaround' },
];

const EMPTY_PREFS = (): DashboardPreferences => ({ order: [], hidden: [], hiddenKpis: [], defaults: { period: null, currency: null, person: null, customer: null } });

/**
 * Sales dashboard: how the team is doing for a period, where deals drop out, what needs chasing now,
 * and who / which customers drive the numbers. Everything comes from one scoped endpoint in QAR.
 */
@Component({
  selector: 'app-sales-dashboard',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, NgSwitch, NgSwitchCase, DatePipe, DecimalPipe, FormsModule, RouterLink, NgIcon, ChartComponent, SmartFormModule, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './sales-dashboard.component.html',
  styleUrl: './sales-dashboard.component.css',
})
export class SalesDashboardComponent implements OnInit, OnDestroy {
  data: SalesDashboard | null = null;
  loading = true;
  error = '';

  preset: Preset = 'month';
  from = '';
  to = '';
  compareFrom = '';
  compareTo = '';
  dateError = '';
  salesPerson: string | null = null;
  customer: string | null = null;
  currency: Currency = 'QAR';

  readonly presets: { key: Preset; label: string }[] = [
    { key: 'month', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
    { key: 'quarter', label: 'This quarter' },
    { key: 'ytd', label: 'Year to date' },
    { key: '12m', label: 'Last 12 months' },
    { key: 'custom', label: 'Custom' },
  ];

  kpis: Kpi[] = [];
  hero: { value: string; count: number; delta: Kpi['delta']; prev: string } | null = null;
  spark: SparkChart | null = null;
  trendChart: TrendChart | null = null;
  openGroup: string | null = null;
  peopleSort: 'wonValue' | 'pipeline' | 'winRate' | 'quotes' = 'wonValue';

  // Customisation
  prefs: DashboardPreferences = EMPTY_PREFS();
  customizing = false;
  readonly kpiOptions = KPI_OPTIONS;
  readonly Math = Math;
  /** Ordered, visible sections with their computed width; rebuilt whenever prefs or scope change. */
  layout: { key: SectionKey; span: number }[] = [];

  private reload$ = new Subject<void>();
  private save$ = new Subject<void>();
  private sub?: Subscription;
  private saveSub?: Subscription;

  constructor(private _dashboard: DashboardService, private _route: ActivatedRoute, private _router: Router) {}

  ngOnInit(): void {
    this.saveSub = this.save$.pipe(
      debounceTime(500),
      switchMap(() => this._dashboard.saveDashboardPreferences(PREFS_KEY, this.prefs).pipe(catchError(() => of(null)))),
    ).subscribe();

    // Load the saved layout first so the page opens in the user's view; fall back to defaults if it fails.
    this._dashboard.getDashboardPreferences(PREFS_KEY).pipe(catchError(() => of(EMPTY_PREFS()))).subscribe((prefs) => {
      this.prefs = { ...EMPTY_PREFS(), ...prefs, defaults: { ...EMPTY_PREFS().defaults, ...(prefs?.defaults || {}) } };
      this.start();
    });
  }

  private start(): void {
    const def = this.prefs.defaults;
    try {
      const saved = def.currency || localStorage.getItem(CURRENCY_KEY);
      if (saved === 'USD' || saved === 'QAR') this.currency = saved;
    } catch { /* storage unavailable: keep QAR */ }

    // A link with filters wins; otherwise open on the user's saved default view.
    const q = this._route.snapshot.queryParamMap;
    const fromUrl = q.has('period') || q.has('person') || q.has('customer');
    const preset = (fromUrl ? q.get('period') : def.period) as Preset | null;
    this.salesPerson = fromUrl ? q.get('person') : def.person;
    this.customer = fromUrl ? q.get('customer') : def.customer;
    if (preset === 'custom' && q.get('from') && q.get('to')) {
      this.preset = 'custom';
      this.from = q.get('from')!;
      this.to = q.get('to')!;
      if (this.from > this.to) [this.from, this.to] = [this.to, this.from];
    } else {
      this.applyPreset(preset && this.presets.some((p) => p.key === preset) && preset !== 'custom' ? preset : 'month', false);
    }
    this.buildLayout();

    this.sub = this.reload$.pipe(
      tap(() => { this.loading = true; this.error = ''; }),
      switchMap(() => this._dashboard.getSalesDashboard({ from: this.from, to: this.to, compareFrom: this.compareFrom || null, compareTo: this.compareTo || null, salesPerson: this.salesPerson, customer: this.customer }).pipe(
        catchError((err) => { this.error = err?.error?.message || 'Could not load the sales dashboard.'; return of(null); }),
      )),
    ).subscribe((data) => {
      this.loading = false;
      if (!data) return;
      this.data = data;
      // A saved person the viewer can no longer pick (e.g. now a Sales Executive) is ignored by the server; drop it here too.
      if (!data.scope.canPickPerson) this.salesPerson = null;
      this.build();
      this.buildLayout();
    });
    this.reload$.next();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.saveSub?.unsubscribe();
  }

  // ---- Customisation -----------------------------------------------------------------------

  private get canPeople(): boolean {
    return !!this.data?.scope.canPickPerson;
  }

  /** Sections in the user's order (unknown keys dropped, new ones slotted in at their default place). */
  get orderedSections(): { key: SectionKey; label: string; span: number }[] {
    return this.fullOrder()
      .map((k) => SECTIONS.find((s) => s.key === k)!)
      .filter((s) => s.key !== 'people' || this.canPeople);
  }

  private fullOrder(): SectionKey[] {
    const saved = [...new Set(this.prefs.order.filter((k) => SECTIONS.some((s) => s.key === k)))] as SectionKey[];
    SECTIONS.forEach((s, i) => {
      if (saved.includes(s.key)) return;
      const before = SECTIONS.slice(0, i).map((x) => x.key).filter((k) => saved.includes(k)).pop();
      saved.splice(before ? saved.indexOf(before) + 1 : 0, 0, s.key);
    });
    return saved;
  }

  isHidden(key: string): boolean {
    return this.prefs.hidden.includes(key);
  }

  isKpiHidden(key: string): boolean {
    return this.prefs.hiddenKpis.includes(key);
  }

  get visibleKpis(): Kpi[] {
    return this.kpis.filter((k) => !this.isKpiHidden(k.key));
  }

  get hiddenCount(): number {
    return this.orderedSections.filter((s) => this.isHidden(s.key)).length;
  }

  /**
   * Packs visible sections into 12-column rows. A section that doesn't fit starts a new row and the
   * previous row's last section stretches to fill, so hiding or moving cards never leaves holes.
   */
  private buildLayout(): void {
    const out: { key: SectionKey; span: number }[] = [];
    let used = 0;
    for (const s of this.orderedSections.filter((x) => !this.isHidden(x.key))) {
      if (used && used + s.span > 12) {
        out[out.length - 1].span += 12 - used;
        used = 0;
      }
      out.push({ key: s.key, span: s.span });
      used = (used + s.span) % 12;
    }
    if (used && out.length) out[out.length - 1].span += 12 - used;
    this.layout = out;
  }

  @HostListener('document:keydown.escape')
  closeCustomize(): void {
    this.customizing = false;
  }

  toggleSection(key: SectionKey): void {
    const hidden = this.prefs.hidden;
    this.prefs.hidden = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    this.changed();
  }

  toggleKpi(key: string): void {
    const hidden = this.prefs.hiddenKpis;
    this.prefs.hiddenKpis = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    this.changed();
  }

  dropSection(e: CdkDragDrop<unknown>): void {
    const keys = this.orderedSections.map((s) => s.key);
    moveItemInArray(keys, e.previousIndex, e.currentIndex);
    this.setOrder(keys);
  }

  moveSection(index: number, step: -1 | 1): void {
    const keys = this.orderedSections.map((s) => s.key);
    const to = index + step;
    if (to < 0 || to >= keys.length) return;
    moveItemInArray(keys, index, to);
    this.setOrder(keys);
  }

  /** Keep a manager-only section (hidden from this viewer's list) at its old place in the stored order. */
  private setOrder(visibleKeys: SectionKey[]): void {
    if (!this.canPeople) {
      const full = this.fullOrder();
      const before = full.slice(0, full.indexOf('people')).pop();
      visibleKeys.splice(before ? visibleKeys.indexOf(before) + 1 : 0, 0, 'people');
    }
    this.prefs.order = visibleKeys;
    this.changed();
  }

  get hasSavedDefault(): boolean {
    const d = this.prefs.defaults;
    return !!(d.period || d.currency || d.person || d.customer);
  }

  get savedDefaultText(): string {
    const d = this.prefs.defaults;
    const parts: string[] = [];
    if (d.period) parts.push(this.presets.find((p) => p.key === d.period)?.label ?? d.period);
    if (d.currency) parts.push(d.currency);
    if (d.person) parts.push(this.data?.options.people.find((p) => p.value === d.person)?.label ?? 'one salesperson');
    if (d.customer) parts.push(this.data?.options.customers.find((c) => c.value === d.customer)?.label ?? 'one customer');
    return parts.join(' · ');
  }

  /** Remember the current period, currency and narrowing as what the page opens on. Custom ranges aren't saved (they go stale). */
  saveCurrentAsDefault(): void {
    this.prefs.defaults = {
      period: this.preset === 'custom' ? null : this.preset,
      currency: this.currency,
      person: this.salesPerson,
      customer: this.customer,
    };
    this.changed(false);
  }

  clearDefault(): void {
    this.prefs.defaults = EMPTY_PREFS().defaults;
    this.changed(false);
  }

  resetLayout(): void {
    this.prefs = { ...EMPTY_PREFS(), defaults: this.prefs.defaults };
    this.changed();
  }

  private changed(relayout = true): void {
    if (relayout) this.buildLayout();
    this.save$.next();
  }

  // ---- Filters -----------------------------------------------------------------------------

  applyPreset(preset: Preset, reload = true): void {
    this.preset = preset;
    if (preset !== 'custom') {
      const now = new Date();
      let start = new Date(now.getFullYear(), now.getMonth(), 1);
      let end = now;
      if (preset === 'lastMonth') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
      if (preset === 'quarter') start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      if (preset === 'ytd') start = new Date(now.getFullYear(), 0, 1);
      if (preset === '12m') start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      this.from = this.iso(start);
      this.to = this.iso(end);
      // Compare like with like: 1–12 Oct against 1–12 Sep, not against the 12 days before it.
      const months = preset === 'month' ? 1 : preset === 'quarter' ? 3 : preset === 'ytd' ? 12 : 0;
      this.compareFrom = months ? this.iso(this.shiftMonths(start, months)) : '';
      this.compareTo = months ? this.iso(this.shiftMonths(end, months)) : '';
    } else {
      this.compareFrom = '';
      this.compareTo = '';
    }
    this.dateError = '';
    if (reload) this.refresh();
  }

  onCustomDate(): void {
    this.preset = 'custom';
    this.compareFrom = '';
    this.compareTo = '';
    if (!this.from || !this.to) { this.dateError = ''; return; }
    if (this.from > this.to) {
      this.dateError = 'The start date must be on or before the end date.';
      return;
    }
    this.dateError = '';
    this.refresh();
  }

  private shiftMonths(d: Date, back: number): Date {
    const target = new Date(d.getFullYear(), d.getMonth() - back, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
  }

  setCurrency(c: Currency): void {
    if (this.currency === c) return;
    this.currency = c;
    try { localStorage.setItem(CURRENCY_KEY, c); } catch { /* ignore */ }
    if (this.data) this.build();
  }

  get hasNarrowing(): boolean {
    return !!this.salesPerson || !!this.customer;
  }

  clearNarrowing(): void {
    this.salesPerson = null;
    this.customer = null;
    this.refresh();
  }

  refresh(): void {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        period: this.preset,
        from: this.preset === 'custom' ? this.from : null,
        to: this.preset === 'custom' ? this.to : null,
        person: this.salesPerson || null,
        customer: this.customer || null,
      },
      replaceUrl: true,
    });
    this.reload$.next();
  }

  focusPerson(id: string): void {
    if (!this.data?.scope.canPickPerson) return;
    this.salesPerson = this.salesPerson === id ? null : id;
    this.refresh();
  }

  focusCustomer(id: string): void {
    this.customer = this.customer === id ? null : id;
    this.refresh();
  }

  // ---- Formatting --------------------------------------------------------------------------

  /** QAR amount shown in the chosen currency, compact (e.g. 1.2M). */
  money(qar: number | null | undefined, compact = true): string {
    if (qar == null || !this.data) return '—';
    const v = this.currency === 'USD' ? qar / (this.data.usdToQar || 3.64) : qar;
    return new Intl.NumberFormat('en-US', compact
      ? { notation: 'compact', maximumFractionDigits: Math.abs(v) >= 1000 ? 1 : 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  pct(v: number | null | undefined): string {
    return v == null ? '—' : `${Math.round(v * 10) / 10}%`;
  }

  daysText(v: number | null | undefined): string {
    return v == null ? '—' : v < 1 ? '< 1' : String(Math.round(v * 10) / 10);
  }

  daysUnit(v: number | null | undefined): string {
    return v == null ? '' : v <= 1 ? 'day' : 'days';
  }

  plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
  }

  /** Funnel value only where it adds something over the row above. */
  funnelValueShown(i: number): boolean {
    const f = this.data?.funnel;
    if (!f || i < 2) return false;
    return i === 2 || f[i].count !== f[i - 1].count || f[i].value !== f[i - 1].value;
  }

  get peopleEmpty(): boolean {
    return !this.data?.aging.some((a) => a.count > 0);
  }

  get periodLabel(): string {
    if (!this.data) return '';
    const f = new Date(this.data.period.from);
    const t = new Date(this.data.period.to);
    const fmt = (d: Date, y: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) });
    return `${fmt(f, f.getFullYear() !== t.getFullYear())} – ${fmt(t, true)}`;
  }

  get prevLabel(): string {
    if (!this.data) return '';
    const f = new Date(this.data.period.prevFrom);
    const t = new Date(this.data.period.prevTo);
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(f)} – ${fmt(t)}`;
  }

  get attentionTotal(): number {
    return this.data?.attention.reduce((s, g) => s + g.count, 0) ?? 0;
  }

  get attentionGroups(): SalesAttentionGroup[] {
    return (this.data?.attention ?? []).filter((g) => g.count > 0);
  }

  get quietGroups(): SalesAttentionGroup[] {
    return (this.data?.attention ?? []).filter((g) => g.count === 0);
  }

  toggleGroup(key: string): void {
    this.openGroup = this.openGroup === key ? null : key;
  }

  ageText(date: string | null, key: string): string {
    if (!date) return '';
    const diff = Math.round((Date.now() - new Date(date).getTime()) / 86_400_000);
    if (key === 'expiring') {
      const left = -diff;
      return left <= 0 ? 'today' : `in ${left}d`;
    }
    if (diff <= 0) return 'today';
    return `${diff}d ago`;
  }

  // ---- Derived views -----------------------------------------------------------------------

  get funnelMax(): number {
    return Math.max(1, ...(this.data?.funnel.map((s) => s.count) ?? [1]));
  }

  funnelWidth(count: number): number {
    return Math.max(4, (count / this.funnelMax) * 100);
  }

  /** Share of the previous step that made it to this one. */
  stepRate(i: number): string {
    const f = this.data?.funnel;
    if (!f || i === 0 || !f[i - 1].count) return '';
    return `${Math.round((f[i].count / f[i - 1].count) * 100)}%`;
  }

  /** The step with the worst drop-off, called out under the funnel. */
  get leak(): { from: string; to: string; lost: number; rate: number; drop: number } | null {
    const f = this.data?.funnel;
    if (!f) return null;
    let worst: { from: string; to: string; lost: number; rate: number; drop: number } | null = null;
    for (let i = 1; i < f.length; i++) {
      if (!f[i - 1].count) continue;
      const rate = f[i].count / f[i - 1].count;
      const lost = f[i - 1].count - f[i].count;
      if (lost > 0 && (!worst || rate < worst.rate)) worst = { from: f[i - 1].label, to: f[i].label, lost, rate, drop: Math.round((1 - rate) * 100) };
    }
    return worst;
  }

  get sortedPeople() {
    const rows = [...(this.data?.people ?? [])];
    const key = this.peopleSort;
    return rows.sort((a, b) => ((b[key] ?? -1) as number) - ((a[key] ?? -1) as number));
  }

  get peopleMaxWon(): number {
    return Math.max(1, ...(this.data?.people.map((p) => p.wonValue) ?? [1]));
  }

  get customersMax(): number {
    return Math.max(1, ...(this.data?.customers.map((c) => c.wonValue + c.pipeline) ?? [1]));
  }

  get agingMax(): number {
    return Math.max(1, ...(this.data?.aging.map((a) => a.value) ?? [1]));
  }

  get lostMax(): number {
    return Math.max(1, ...(this.data?.lostReasons.map((r) => r.value) ?? [1]));
  }

  get lostTotal(): number {
    return this.data?.lostReasons.reduce((s, r) => s + r.count, 0) ?? 0;
  }

  get sourcesMax(): number {
    return Math.max(1, ...(this.data?.sources.map((s) => s.enquiries) ?? [1]));
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  }

  avatarTone(name: string): string {
    const tones = ['violet', 'sky', 'emerald', 'amber', 'rose', 'indigo', 'teal'];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return tones[h % tones.length];
  }

  winTone(rate: number | null): string {
    if (rate == null) return 'muted';
    return rate >= 50 ? 'good' : rate >= 25 ? 'mid' : 'bad';
  }

  /** Below the server's low-margin threshold is red; under twice that is amber. */
  marginTone(pct: number | null): string {
    const low = this.data?.margin.threshold ?? 10;
    if (pct == null) return 'muted';
    return pct < low ? 'bad' : pct < low * 2 ? 'mid' : 'good';
  }

  /** Heavier discounting reads as a warning, not a win. */
  discountTone(pct: number | null): string {
    if (!pct) return 'muted';
    return pct >= 10 ? 'bad' : pct >= 5 ? 'mid' : 'good';
  }

  trackKey(_: number, x: { key?: string; id?: string; label?: string }) {
    return x.key ?? x.id ?? x.label;
  }

  // ---- Build -------------------------------------------------------------------------------

  private build(): void {
    const d = this.data!;
    const c = d.kpis.current;
    const p = d.kpis.previous;

    this.hero = {
      value: this.money(c.wonValue, false),
      count: c.won,
      delta: this.delta(c.wonValue, p.wonValue),
      prev: p.wonValue ? `${this.money(p.wonValue)} ${this.currency}` : 'nothing won',
    };

    this.kpis = [
      { key: 'enq', label: 'New enquiries', value: String(c.enquiries), icon: 'heroInboxArrowDown', delta: this.delta(c.enquiries, p.enquiries), sub: `${p.enquiries} last period`, hint: 'Enquiries created in the period. Shows whether demand is rising or falling.' },
      { key: 'sent', label: 'Quotes sent', value: String(c.quotesSent), sub: `${this.money(c.quotesSentValue)} ${this.currency}`, icon: 'heroPaperAirplane', delta: this.delta(c.quotesSent, p.quotesSent), hint: 'Quotes that went to the customer in the period, and what they were worth.' },
      { key: 'rate', label: 'Win rate', value: this.pct(c.winRate), sub: `${c.won} won · ${c.lost} lost`, icon: 'heroCheckBadge', delta: this.pointDelta(c.winRate, p.winRate), hint: 'Approved deal sheets ÷ (approved deal sheets + lost quotes) decided in the period.' },
      { key: 'pipe', label: 'Open pipeline', value: this.money(d.kpis.pipeline.value), unit: this.currency, sub: `${this.plural(d.kpis.pipeline.count, 'quote')} with customers`, icon: 'heroCircleStack', delta: null, hint: 'Sent quotes still waiting for a customer decision, right now.' },
      { key: 'avg', label: 'Average deal', value: this.money(c.avgDeal), unit: c.avgDeal == null ? '' : this.currency, sub: `Last period ${this.money(p.avgDeal)}`, icon: 'heroScale', delta: this.delta(c.avgDeal, p.avgDeal), hint: 'Won value ÷ number of wins in the period.' },
      { key: 'tat', label: 'Quote turnaround', value: this.daysText(c.turnaround), unit: this.daysUnit(c.turnaround), sub: 'Enquiry → quote sent', icon: 'heroClock', delta: this.delta(c.turnaround, p.turnaround, true), hint: 'Average days from enquiry to sending the quote. Lower is better.' },
    ];

    const dark = document.documentElement.classList.contains('dark');
    const text = dark ? '#8f8f8f' : '#6b7280';
    const gridColor = dark ? '#262626' : '#f1f1f4';
    const toCur = (v: number) => (this.currency === 'USD' ? v / (d.usdToQar || 3.64) : v);

    this.spark = {
      series: [{ name: 'Won', data: d.trend.won.map((v) => Math.round(toCur(v))) }],
      chart: { type: 'area', height: 64, sparkline: { enabled: true }, fontFamily: 'inherit', animations: { enabled: true } },
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0, stops: [0, 100] } },
      tooltip: { theme: dark ? 'dark' : 'light', x: { show: false }, y: { formatter: (v: number) => `${this.money(this.currency === 'USD' ? v * d.usdToQar : v)} ${this.currency}`, title: { formatter: () => '' } } },
      colors: ['#ffffff'],
    };

    // Drop months before any activity started (keep at least the last 6) so the chart isn't mostly empty.
    const firstActive = d.trend.months.findIndex((_, i) => d.trend.quoted[i] || d.trend.won[i] || d.trend.winRate[i] != null);
    const skip = Math.min(Math.max(firstActive, 0), d.trend.months.length - 6);
    const cut = <T>(xs: T[]) => xs.slice(skip);

    this.trendChart = {
      series: [
        { name: 'Quoted', type: 'column', data: cut(d.trend.quoted).map((v) => Math.round(toCur(v))) },
        { name: 'Won', type: 'column', data: cut(d.trend.won).map((v) => Math.round(toCur(v))) },
        { name: 'Win rate', type: 'line', data: cut(d.trend.winRate) as any },
      ],
      chart: { type: 'line', height: 300, fontFamily: 'inherit', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false }, stacked: false },
      plotOptions: { bar: { columnWidth: '58%', borderRadius: 4, borderRadiusApplication: 'end' } },
      colors: [dark ? '#3f3a5a' : '#ddd6fe', '#7c3aed', '#10b981'],
      stroke: { width: [0, 0, 3], curve: 'smooth' },
      fill: { opacity: [1, 1, 1] },
      dataLabels: { enabled: false },
      grid: { borderColor: gridColor, strokeDashArray: 4, padding: { left: 8, right: 8 } },
      legend: { position: 'top', horizontalAlign: 'left', fontSize: '12px', labels: { colors: text }, markers: { size: 5 } as any, itemMargin: { horizontal: 8, vertical: 0 } },
      xaxis: { categories: cut(d.trend.months), labels: { style: { colors: text, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: [
        { seriesName: 'Quoted', labels: { style: { colors: text, fontSize: '11px' }, formatter: (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v) } },
        { seriesName: 'Quoted', show: false },
        { seriesName: 'Win rate', opposite: true, min: 0, max: 100, labels: { style: { colors: text, fontSize: '11px' }, formatter: (v: number) => `${Math.round(v)}%` } },
      ],
      tooltip: {
        theme: dark ? 'dark' : 'light', shared: true, intersect: false,
        y: { formatter: (v: number, o: any) => (v == null ? '—' : o?.seriesIndex === 2 ? `${v}%` : `${new Intl.NumberFormat('en-US').format(v)} ${this.currency}`) },
      },
    };
  }

  private delta(cur: number | null, prev: number | null, lowerIsBetter = false): Kpi['delta'] {
    if (cur == null || prev == null) return null;
    if (!prev) return cur ? { text: 'New', tone: lowerIsBetter ? 'down' : 'up' } : { text: '0%', tone: 'flat' };
    const change = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(change) < 0.5) return { text: '0%', tone: 'flat' };
    const good = lowerIsBetter ? change < 0 : change > 0;
    return { text: `${change > 0 ? '+' : ''}${Math.round(change)}%`, tone: good ? 'up' : 'down' };
  }

  private pointDelta(cur: number | null, prev: number | null): Kpi['delta'] {
    if (cur == null || prev == null) return null;
    const diff = Math.round((cur - prev) * 10) / 10;
    if (!diff) return { text: '0 pts', tone: 'flat' };
    return { text: `${diff > 0 ? '+' : ''}${diff} pts`, tone: diff > 0 ? 'up' : 'down' };
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
