import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ModalService } from 'src/app/shared/components/modal';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { SfDraftDirective, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { EventCreateModalComponent } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import {
  DetailAction, DetailBreakdownRow, DetailDocument, DetailMetaItem, DetailOverviewSection, DetailSignal,
  DetailTableColumn, DetailTaskItem, DetailTimelineEntry,
} from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailCalloutComponent } from 'src/app/shared/components/detail-panel/detail-callout.component';
import { DetailMetricsComponent } from 'src/app/shared/components/detail-panel/detail-metrics.component';
import { DetailSignalListComponent } from 'src/app/shared/components/detail-panel/detail-signal-list.component';
import { DetailBreakdownComponent } from 'src/app/shared/components/detail-panel/detail-breakdown.component';
import { DetailBarMixComponent } from 'src/app/shared/components/detail-panel/detail-bar-mix.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailFootnoteComponent } from 'src/app/shared/components/detail-panel/detail-footnote.component';
import { DetailMetaComponent } from 'src/app/shared/components/detail-panel/detail-meta.component';
import { DetailActionsComponent } from 'src/app/shared/components/detail-panel/detail-actions.component';
import { DetailIconButtonComponent } from 'src/app/shared/components/detail-panel/detail-icon-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridCellEditEvent,
  DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';

import {
  CLOSED_STATUSES, CURRENT_USER, CUSTOMERS, MANAGERS, PRIORITIES, STATUSES, STATUS_TONE, TYPES,
  SampleProject, getSampleProjects, setSampleProjects,
} from '../../sample-projects';

const toOptions = (list: string[]): SfOption<string>[] => list.map((v) => ({ label: v, value: v }));
const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export type ReportTone = 'good' | 'warn' | 'bad' | 'neutral';

/** One headline number. `bar` fills 0-100%; `marker` drops a baseline tick on the same track. */
interface ReportMetric {
  label: string;
  value: string;
  caption: string;
  tone: ReportTone;
  bar?: number;
  marker?: number;
}

/** A finding written as a sentence — the part a reader acts on. */
interface ReportSignal {
  tone: ReportTone;
  title: string;
  detail: string;
}

interface ReportBreakdownRow {
  label: string;
  count: number;
  amount: number;
  share: number;
  tone: ReportTone;
}

interface ProjectReport {
  asOf: string;
  closed: boolean;
  headline: { tone: ReportTone; label: string; summary: string };
  metrics: ReportMetric[];
  signals: ReportSignal[];
  delivery: ReportBreakdownRow[];
}

/** One project on the "needs attention" list — the row a reader clicks to go and act. */
interface PortfolioRisk {
  project: SampleProject;
  tone: ReportTone;
  label: string;
  reason: string;
  value: number;
}

/** A share of the portfolio (by status, by manager) shown as count + value + track. */
interface PortfolioSlice {
  label: string;
  count: number;
  value: number;
  share: number;
  tone: ReportTone;
}

interface PortfolioReport {
  asOf: string;
  scope: string;
  count: number;
  verdict: { tone: ReportTone; label: string; summary: string };
  /** Health mix, rendered as one segmented bar — the shape of the portfolio at a glance. */
  mix: { tone: ReportTone; label: string; count: number; share: number }[];
  kpis: ReportMetric[];
  risks: PortfolioRisk[];
  status: PortfolioSlice[];
  managers: PortfolioSlice[];
}

function dueAfterStart(c: AbstractControl): ValidationErrors | null {
  const start = c.parent?.get('startDate')?.value;
  return start && c.value && c.value < start ? { dateOrder: 'Due date must be on or after the start date' } : null;
}

@Component({
  selector: 'app-home-landing',
  standalone: true,
  imports: [
    CommonModule, SmartFormModule, DataGridComponent,
    DetailSectionComponent, DetailOverviewComponent, DetailDocumentsComponent, DetailTableComponent,
    DetailTaskListComponent, DetailBadgeComponent, DetailMetaComponent,
    DetailActionsComponent, DetailIconButtonComponent, DetailCalloutComponent, DetailMetricsComponent,
    DetailSignalListComponent, DetailBreakdownComponent, DetailBarMixComponent, DetailTimelineComponent,
    DetailFootnoteComponent, ActionButtonComponent, DetailPanelIconComponent,
  ],
  providers: [DatePipe],
  templateUrl: './home-landing.component.html',
  styleUrls: ['./home-landing.component.css'],
})
export class HomeLandingComponent implements OnInit {
  private _projects: SampleProject[] = [];
  /** Writes through to the shared store so the project detail page sees creates/deletes. */
  get projects(): SampleProject[] { return this._projects; }
  set projects(list: SampleProject[]) {
    this._projects = list;
    setSampleProjects(list);
  }
  loading = true;
  detailLoading = false;
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];

  views: DataGridView<SampleProject>[] = [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'My projects', predicate: (p) => p.manager === CURRENT_USER },
    { id: 'overdue', label: 'Overdue', predicate: (p) => this.isOverdue(p),
      sort: { key: 'dueDate', direction: 'asc' } },
    { id: 'hold', label: 'On Hold', predicate: (p) => p.status === 'On Hold' },
  ];

  columns: DataGridColumn<SampleProject>[] = [
    { key: 'id', label: 'Project #', sortable: true, locked: true, width: '110px' },
    { key: 'name', label: 'Project', sortable: true, editable: true, editor: 'text' },
    { key: 'customer', label: 'Customer', sortable: true },
    { key: 'manager', label: 'Manager', sortable: true, editable: true, editor: 'select',
      editorOptions: MANAGERS.map((m) => ({ label: m, value: m })) },
    { key: 'status', label: 'Status', type: 'badge', sortable: true, editable: true, editor: 'select',
      editorOptions: STATUSES.map((s) => ({ label: s, value: s })),
      badgeClasses: {
        Planning: 'bg-sky-50 text-sky-700',
        'In Progress': 'bg-violet-50 text-violet-700',
        'On Hold': 'bg-amber-50 text-amber-700',
        Completed: 'bg-emerald-50 text-emerald-700',
        Cancelled: 'bg-red-50 text-red-700',
      } },
    { key: 'priority', label: 'Priority', sortable: true, editable: true, editor: 'select',
      editorOptions: PRIORITIES.map((p) => ({ label: p, value: p })) },
    { key: 'dueDate', label: 'Due Date', type: 'date', sortable: true, editable: true, editor: 'date',
      cellClass: (p) => (this.isOverdue(p) ? '!text-red-600 font-medium' : null) },
    { key: 'budget', label: 'Budget', type: 'currency', sortable: true, editable: true, editor: 'number', aggregate: 'sum' },
    { key: 'progress', label: 'Progress %', type: 'number', align: 'right', sortable: true, visible: false },
  ];

  bulkActions: DataGridBulkAction[] = [
    { id: 'export', label: 'Export' },
    { id: 'hold', label: 'Put on Hold' },
    { id: 'complete', label: 'Mark Completed', variant: 'primary' },
    { id: 'delete', label: 'Delete', variant: 'danger' },
  ];

  rowActions: DataGridRowAction<SampleProject>[] = [
    { id: 'complete', label: 'Mark Completed', quick: true, icon: 'check', hidden: (p) => CLOSED_STATUSES.includes(p.status) },
    { id: 'hold', label: 'Put on Hold', quick: true, icon: 'pause', hidden: (p) => p.status === 'On Hold' || CLOSED_STATUSES.includes(p.status) },
    { id: 'duplicate', label: 'Duplicate', quick: true, icon: 'copy' },
    { id: 'delete', label: 'Delete', variant: 'danger', divider: true, icon: 'trash' },
  ];

  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'files' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'report', label: 'Report', icon: 'chart' },
    { id: 'activity', label: 'Activities', icon: 'activity' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'unitCost', label: 'Unit cost', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
    { key: 'status', label: 'Status', type: 'badge', badgeTones: { Delivered: 'good', Ordered: 'info', Pending: 'warn' } },
  ];

  // TODO: sample items/documents/tasks — replace with the project detail API response
  private extras = new Map<string, { items: Record<string, any>[]; documents: DetailDocument[]; tasks: DetailTaskItem[] }>();

  extrasFor(p: SampleProject) {
    let e = this.extras.get(p.id);
    if (!e) {
      const day = (offset: number, hour = 9) => {
        const d = new Date(p.startDate);
        d.setDate(d.getDate() + offset);
        d.setHours(hour, 0, 0, 0);
        return d.toISOString();
      };
      const items = [
        { sku: 'CAM-4K-01', name: '4K dome camera', qty: 24, unitCost: 850, status: 'Delivered' },
        { sku: 'NVR-32', name: '32-channel NVR', qty: 2, unitCost: 6200, status: 'Ordered' },
        { sku: 'CBL-CAT6', name: 'Cat6 cable (305 m)', qty: 12, unitCost: 420, status: 'Delivered' },
        { sku: 'SW-POE-24', name: '24-port PoE switch', qty: 3, unitCost: 2100, status: 'Pending' },
      ].map((i) => ({ ...i, amount: i.qty * i.unitCost }));
      e = {
        items,
        documents: [
          { id: 'd1', name: 'Scope of work.pdf', size: '1.2 MB', uploadedBy: p.manager, date: p.startDate },
          { id: 'd2', name: 'Bill of quantities.xlsx', size: '240 KB', uploadedBy: MANAGERS[1], date: day(2) },
          { id: 'd3', name: 'Site layout.dwg', size: '3.1 MB', uploadedBy: MANAGERS[2], date: day(5) },
          { id: 'd4', name: 'Method statement.docx', size: '860 KB', uploadedBy: p.manager, date: day(7) },
        ],
        tasks: [
          { id: 'e1', kind: 'event', title: 'Kick-off meeting', date: day(3, 10), location: p.customer },
          { id: 'e2', kind: 'event', title: 'Site inspection', date: day(25, 11), location: 'Main building' },
        ],
      };
      this.extras.set(p.id, e);
    }
    return e;
  }

  // ---- Report tab -------------------------------------------------------------------------
  // A read-first status report for one project: the numbers a manager would otherwise ask for in
  // a meeting, plus the findings spelled out as sentences. Printing/sending is a secondary action.

  private reportCache = new Map<string, { sig: string; report: ProjectReport }>();

  /** Cached so the tab keeps stable array identities between change-detection runs; the signature
   *  covers every field the report reads, so an inline edit refreshes it. */
  reportFor(p: SampleProject): ProjectReport {
    const sig = `${p.status}|${p.progress}|${p.spent}|${p.budget}|${p.startDate}|${p.dueDate}`;
    const hit = this.reportCache.get(p.id);
    if (hit && hit.sig === sig) return hit.report;
    const report = this.buildReport(p);
    this.reportCache.set(p.id, { sig, report });
    return report;
  }

  money(n: number): string {
    return this.qar.format(Math.round(n));
  }

  private buildReport(p: SampleProject): ProjectReport {
    const closed = CLOSED_STATUSES.includes(p.status);
    const days = this.daysToDue(p);
    const expected = this.plannedProgress(p);
    const drift = p.progress - expected;                     // percentage points ahead/behind plan
    const burn = p.budget ? (p.spent / p.budget) * 100 : 0;
    const forecast = p.progress > 0 ? (p.spent / p.progress) * 100 : p.budget;
    const overrun = forecast - p.budget;

    const items = this.extrasFor(p).items;
    const total = items.reduce((s, i) => s + i['amount'], 0);
    const openItems = items.filter((i) => i['status'] !== 'Delivered');
    const openValue = openItems.reduce((s, i) => s + i['amount'], 0);

    const now = Date.now();
    const lateTasks = this.extrasFor(p).tasks.filter(
      (t) => t.kind === 'task' && !t.done && new Date(t.date!).getTime() < now,
    );

    const delivery: ReportBreakdownRow[] = (['Delivered', 'Ordered', 'Pending'] as const)
      .map((status) => {
        const rows = items.filter((i) => i['status'] === status);
        const amount = rows.reduce((s, i) => s + i['amount'], 0);
        return {
          label: status,
          count: rows.length,
          amount,
          share: total ? Math.round((amount / total) * 100) : 0,
          tone: (status === 'Delivered' ? 'good' : status === 'Ordered' ? 'neutral' : 'warn') as ReportTone,
        };
      })
      .filter((r) => r.count > 0);

    const metrics: ReportMetric[] = [
      {
        label: 'Completion',
        value: `${p.progress}%`,
        caption: closed ? 'at closure' : `${expected}% planned by today`,
        tone: closed ? 'neutral' : drift < -10 ? 'bad' : drift < -3 ? 'warn' : 'good',
        bar: p.progress,
        marker: closed ? undefined : expected,
      },
      {
        label: 'Budget used',
        value: `${Math.round(burn)}%`,
        caption: `${this.money(p.spent)} of ${this.money(p.budget)}`,
        tone: burn > 100 ? 'bad' : burn - p.progress > 12 ? 'warn' : 'good',
        bar: Math.min(burn, 100),
      },
      closed
        ? {
            label: 'Final variance',
            value: `${p.spent > p.budget ? '+' : '−'}${this.money(Math.abs(p.spent - p.budget))}`,
            caption: p.spent > p.budget ? 'over the approved budget' : 'released back',
            tone: p.spent > p.budget ? 'bad' : 'good',
          }
        : {
            label: 'Forecast at completion',
            value: this.money(forecast),
            caption: overrun > 0 ? `${this.money(overrun)} over budget` : `${this.money(-overrun)} under budget`,
            tone: overrun > p.budget * 0.05 ? 'bad' : overrun > 0 ? 'warn' : 'good',
          },
      {
        label: closed ? 'Undelivered at closure' : 'Open commitment',
        value: this.money(openValue),
        caption: `${openItems.length} of ${items.length} line items not delivered`,
        tone: openItems.length === 0 ? 'good' : 'neutral',
      },
    ];

    const signals: ReportSignal[] = [];
    if (closed) {
      signals.push({
        tone: p.status === 'Cancelled' ? 'bad' : 'good',
        title: p.status === 'Cancelled' ? 'Project was cancelled' : 'Project closed',
        detail: `Final spend ${this.money(p.spent)} against an approved budget of ${this.money(p.budget)}.`,
      });
      if (openItems.length) {
        signals.push({
          tone: 'warn',
          title: `${openItems.length} line item${openItems.length === 1 ? '' : 's'} never delivered`,
          detail: `${this.money(openValue)} of ordered material is still outstanding and should be returned or written off.`,
        });
      }
    } else {
      if (p.status === 'On Hold') {
        signals.push({
          tone: 'warn',
          title: 'Project is on hold',
          detail: 'Shipments and site visits are paused, but the schedule keeps running against the due date.',
        });
      }
      if (days < 0) {
        signals.push({
          tone: 'bad',
          title: `${-days} days past the due date`,
          detail: `Still at ${p.progress}% completion. The due date needs to be re-baselined or the remaining scope cut.`,
        });
      } else if (days <= 7) {
        signals.push({
          tone: p.progress >= 90 ? 'good' : 'warn',
          title: `Due in ${days} day${days === 1 ? '' : 's'}`,
          detail: `${100 - p.progress}% of the work is still open with one week to go.`,
        });
      }
      if (drift <= -10) {
        signals.push({
          tone: 'bad',
          title: `${Math.abs(Math.round(drift))} points behind plan`,
          detail: `Progress is ${p.progress}% where the schedule expects ${expected}% by today.`,
        });
      } else if (drift >= 10) {
        signals.push({
          tone: 'good',
          title: `${Math.round(drift)} points ahead of plan`,
          detail: 'Delivery is running ahead of the baseline schedule.',
        });
      }
      if (burn > 100) {
        signals.push({
          tone: 'bad',
          title: 'Approved budget exceeded',
          detail: `${this.money(p.spent - p.budget)} has been spent beyond the approved ${this.money(p.budget)}. A budget revision is required.`,
        });
      } else if (burn - p.progress > 12) {
        signals.push({
          tone: 'warn',
          title: 'Spend is running ahead of delivery',
          detail: `${Math.round(burn)}% of the budget is consumed at ${p.progress}% completion; at this rate the project lands on ${this.money(forecast)}.`,
        });
      }
      if (lateTasks.length) {
        signals.push({
          tone: 'warn',
          title: `${lateTasks.length} overdue task${lateTasks.length === 1 ? '' : 's'}`,
          detail: lateTasks.slice(0, 2).map((t) => t.title).join(' · ') + (lateTasks.length > 2 ? ' and more' : ''),
        });
      }
      if (openItems.length) {
        signals.push({
          tone: 'neutral',
          title: `${openItems.length} line item${openItems.length === 1 ? '' : 's'} awaiting delivery`,
          detail: `${this.money(openValue)} committed but not yet received on site.`,
        });
      }
    }

    const rank: Record<ReportTone, number> = { bad: 0, warn: 1, neutral: 2, good: 3 };
    signals.sort((a, b) => rank[a.tone] - rank[b.tone]);
    if (!signals.length) {
      signals.push({
        tone: 'good',
        title: 'Nothing needs attention',
        detail: 'Schedule, spend and deliveries are all tracking against the plan.',
      });
    }

    const worst = signals[0].tone;
    const headline = closed
      ? {
          tone: (p.status === 'Cancelled' ? 'bad' : 'good') as ReportTone,
          label: p.status,
          summary: `Closed at ${p.progress}% completion with ${this.money(p.spent)} spent of ${this.money(p.budget)} approved.`,
        }
      : {
          tone: worst,
          label: worst === 'bad' ? 'Off track' : worst === 'warn' ? 'Needs attention' : 'On track',
          summary:
            worst === 'good'
              ? `${p.progress}% complete and ${Math.round(burn)}% of the budget used — delivery and spend are moving together.`
              : `${p.progress}% complete against ${expected}% planned, with ${Math.round(burn)}% of the budget used.`,
        };

    return { asOf: new Date().toISOString(), closed, headline, metrics, signals, delivery };
  }

  /** Where the baseline schedule says completion should be today. */
  private plannedProgress(p: SampleProject): number {
    const start = new Date(p.startDate).getTime();
    const due = new Date(p.dueDate).getTime();
    if (due <= start) return 100;
    return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (due - start)) * 100)));
  }

  // TODO: wire to the reporting service — should render the same figures server-side for the PDF.
  downloadReport(p: SampleProject, grid: DataGridComponent<SampleProject>): void {
    grid.notify(`Preparing the ${p.id} status report…`);
  }

  shareReport(p: SampleProject, grid: DataGridComponent<SampleProject>): void {
    grid.notify(`Report for ${p.id} is not wired to email yet`);
  }

  // ---- Portfolio report (grid toolbar) ----------------------------------------------------
  // One report for the table, not for a row. It always answers three questions in order:
  // how is the portfolio doing, where is the money, and which projects do I open next.
  // Scope follows the grid — the active view, search and filters — so the numbers always
  // match the rows on screen behind the panel.

  portfolioOpen = false;
  portfolio: PortfolioReport | null = null;

  openPortfolio(grid: DataGridComponent<SampleProject>): void {
    this.portfolio = this.buildPortfolio(grid.filteredData, this.scopeLabel(grid));
    this.portfolioOpen = true;
  }

  /** Jump from a finding straight to the project it is about. */
  openRisk(risk: PortfolioRisk, grid: DataGridComponent<SampleProject>): void {
    this.portfolioOpen = false;
    grid.openRow(risk.project);
  }

  private scopeLabel(grid: DataGridComponent<SampleProject>): string {
    const parts = [grid.activeView?.label ?? 'All projects'];
    if (grid.searchTerm.trim()) parts.push(`search “${grid.searchTerm.trim()}”`);
    if (grid.filters.length) parts.push(`${grid.filters.length} filter${grid.filters.length === 1 ? '' : 's'}`);
    return parts.join(' · ');
  }

  private buildPortfolio(rows: SampleProject[], scope: string): PortfolioReport {
    const asOf = new Date().toISOString();
    const open = rows.filter((p) => !CLOSED_STATUSES.includes(p.status));
    const budget = rows.reduce((s, p) => s + p.budget, 0);
    const spent = rows.reduce((s, p) => s + p.spent, 0);
    const burn = budget ? (spent / budget) * 100 : 0;

    // Weighted by budget: a QAR 2M project slipping matters more than a QAR 50k one.
    const weight = (list: SampleProject[], pick: (p: SampleProject) => number) => {
      const w = list.reduce((s, p) => s + p.budget, 0);
      return w ? Math.round(list.reduce((s, p) => s + pick(p) * p.budget, 0) / w) : 0;
    };
    const done = weight(open, (p) => p.progress);
    const planned = weight(open, (p) => this.plannedProgress(p));

    // Each project's verdict comes from the same report the detail panel shows, so the
    // portfolio can never disagree with the record a manager opens from it.
    const verdicts = rows.map((p) => ({ p, rep: this.reportFor(p) }));
    const overdue = open.filter((p) => this.isOverdue(p));
    const overBudget = rows.filter((p) => p.spent > p.budget);

    const risks: PortfolioRisk[] = verdicts
      .filter(({ p, rep }) => !rep.closed && (rep.headline.tone === 'bad' || rep.headline.tone === 'warn') && p)
      .map(({ p, rep }) => ({
        project: p,
        tone: rep.headline.tone,
        label: rep.signals[0].title,
        reason: rep.signals[0].detail,
        value: p.budget,
      }))
      .sort((a, b) => (a.tone === b.tone ? b.value - a.value : a.tone === 'bad' ? -1 : 1));

    const counts = { bad: 0, warn: 0, good: 0, neutral: 0 } as Record<ReportTone, number>;
    verdicts.forEach(({ rep }) => counts[rep.closed ? 'neutral' : rep.headline.tone]++);
    const mix = ([
      ['bad', 'Off track'], ['warn', 'Needs attention'], ['good', 'On track'], ['neutral', 'Closed'],
    ] as [ReportTone, string][])
      .map(([tone, label]) => ({ tone, label, count: counts[tone], share: rows.length ? (counts[tone] / rows.length) * 100 : 0 }))
      .filter((s) => s.count > 0);

    const slice = (label: string, list: SampleProject[], tone: ReportTone): PortfolioSlice => {
      const value = list.reduce((s, p) => s + p.budget, 0);
      return { label, count: list.length, value, share: budget ? Math.round((value / budget) * 100) : 0, tone };
    };

    const statusTone: Record<string, ReportTone> = {
      Planning: 'neutral', 'In Progress': 'neutral', 'On Hold': 'warn', Completed: 'good', Cancelled: 'bad',
    };
    const status = STATUSES
      .map((s) => slice(s, rows.filter((p) => p.status === s), statusTone[s] ?? 'neutral'))
      .filter((s) => s.count > 0);

    const managers = [...new Set(open.map((p) => p.manager))]
      .map((m) => slice(m, open.filter((p) => p.manager === m), 'neutral'))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const atRiskValue = risks.reduce((s, r) => s + r.value, 0);
    const kpis: ReportMetric[] = [
      {
        label: 'Portfolio value',
        value: this.money(budget),
        caption: `${open.length} active · ${rows.length - open.length} closed`,
        tone: 'neutral',
      },
      {
        label: 'Budget used',
        value: `${Math.round(burn)}%`,
        caption: `${this.money(spent)} spent · ${overBudget.length} project${overBudget.length === 1 ? '' : 's'} over budget`,
        tone: overBudget.length ? 'bad' : burn - done > 12 ? 'warn' : 'good',
        bar: Math.min(burn, 100),
        marker: done,
      },
      {
        label: 'Weighted completion',
        value: `${done}%`,
        caption: `${planned}% planned by today across active work`,
        tone: done - planned < -10 ? 'bad' : done - planned < -3 ? 'warn' : 'good',
        bar: done,
        marker: planned,
      },
      {
        label: 'Value at risk',
        value: this.money(atRiskValue),
        caption: `${risks.length} of ${open.length} active project${open.length === 1 ? '' : 's'} · ${overdue.length} overdue`,
        tone: risks.some((r) => r.tone === 'bad') ? 'bad' : risks.length ? 'warn' : 'good',
        bar: budget ? Math.round((atRiskValue / budget) * 100) : 0,
      },
    ];

    const bad = counts['bad'];
    const verdict = !rows.length
      ? { tone: 'neutral' as ReportTone, label: 'Nothing in scope', summary: 'No projects match the current view, search and filters.' }
      : bad
        ? {
            tone: 'bad' as ReportTone,
            label: `${bad} project${bad === 1 ? '' : 's'} off track`,
            summary: `${this.money(atRiskValue)} of the ${this.money(budget)} portfolio needs a decision this week — ${overdue.length} project${overdue.length === 1 ? ' is' : 's are'} past the due date.`,
          }
        : counts['warn']
          ? {
              tone: 'warn' as ReportTone,
              label: `${counts['warn']} project${counts['warn'] === 1 ? '' : 's'} need attention`,
              summary: `Nothing is off track, but ${this.money(atRiskValue)} is drifting on schedule or spend and should be reviewed.`,
            }
          : {
              tone: 'good' as ReportTone,
              label: 'Portfolio on track',
              summary: `${done}% weighted completion against ${planned}% planned, with ${Math.round(burn)}% of the budget used.`,
            };

    return { asOf, scope, count: rows.length, verdict, mix, kpis, risks, status, managers };
  }

  // TODO: wire to the reporting service — the PDF must render these same figures server-side.
  exportPortfolio(grid: DataGridComponent<SampleProject>): void {
    grid.notify('Preparing the portfolio report…');
  }

  schedulePortfolio(grid: DataGridComponent<SampleProject>): void {
    grid.notify('Scheduled delivery is not wired yet');
  }

  openAddEventModal(p: SampleProject, grid: DataGridComponent<SampleProject>): void {
    const add = (event: DetailTaskItem) => {
      this.extrasFor(p).tasks.unshift(event);
      grid.notify(`"${event.title}" added`);
    };
    this.modal.open<DetailTaskItem>(EventCreateModalComponent, {
      width: '560px',
      data: { context: p.name, onCreate: add },
    }).afterClosed().subscribe((event) => event && add(event));
  }

  removeEvent(p: SampleProject, item: DetailTaskItem): void {
    const extras = this.extrasFor(p);
    extras.tasks = extras.tasks.filter((t) => t.id !== item.id);
  }

  removeDocument(p: SampleProject, doc: DetailDocument, grid: DataGridComponent<SampleProject>): void {
    const extras = this.extrasFor(p);
    extras.documents = extras.documents.filter((d) => d.id !== doc.id);
    grid.notify(`"${doc.name}" removed`);
  }

  projectTitle = (p: SampleProject) => p.name;
  projectSubtitle = (p: SampleProject) => p.id;

  readonly statusTone = STATUS_TONE;

  readonly closeAction: DetailAction[] = [{ id: 'close', label: 'Close' }];

  /** Key facts strip under the panel header — content only; <app-detail-meta> owns the look. */
  metaFor(p: SampleProject): DetailMetaItem[] {
    return [
      { label: 'Customer', value: p.customer },
      { label: 'Budget', value: p.budget, format: 'currency' },
      { label: 'Due date', value: p.dueDate, format: 'date', tone: this.isOverdue(p) ? 'bad' : undefined },
      { label: 'Progress', value: p.progress, format: 'percent' },
    ];
  }

  /** Panel footer buttons. Visibility is expressed by omitting the action, not by styling it away. */
  footerFor(p: SampleProject): DetailAction[] {
    const actions: DetailAction[] = [];
    if (p.status !== 'On Hold' && !CLOSED_STATUSES.includes(p.status)) {
      actions.push({ id: 'hold', label: 'Put on Hold' });
    }
    actions.push({ id: 'open', label: 'Open project', variant: 'primary', link: ['/home/projects', p.id] });
    return actions;
  }

  onFooterAction(id: string, row: SampleProject, grid: DataGridComponent<SampleProject>): void {
    const action = this.rowActions.find((a) => a.id === id);
    if (action) void this.onRowAction({ action, row }, grid);
  }

  /** Delivery split for the report tab, as breakdown rows. */
  deliveryRows(rep: ProjectReport): DetailBreakdownRow[] {
    return rep.delivery.map((d) => ({ label: d.label, meta: d.count, value: this.money(d.amount), share: d.share, tone: d.tone }));
  }

  /** Portfolio "needs attention" rows, as signals. */
  riskSignals(pf: PortfolioReport): DetailSignal[] {
    return pf.risks.map((r) => ({
      id: r.project.id, tone: r.tone, title: r.project.name, ref: r.project.id,
      label: r.label, detail: r.reason, value: this.money(r.value), meta: r.project.manager,
    }));
  }

  /** Portfolio budget split by status. */
  statusRows(pf: PortfolioReport): DetailBreakdownRow[] {
    return pf.status.map((s) => ({ label: s.label, meta: s.count, value: `${this.money(s.value)} · ${s.share}%`, share: s.share, tone: s.tone }));
  }

  /** Active workload per manager — counts only, so these rows carry no track. */
  managerRows(pf: PortfolioReport): DetailBreakdownRow[] {
    return pf.managers.map((m) => ({
      label: m.label,
      value: `${m.count} project${m.count === 1 ? '' : 's'} · ${this.money(m.value)}`,
    }));
  }

  /** Activity feed for the panel's Activities tab. */
  activityFor(p: SampleProject): DetailTimelineEntry[] {
    return (p.activity || []).map((a) => ({ text: a.text, meta: `${a.by} · ${this.datePipe.transform(a.date, 'dd MMM yyyy')}` }));
  }

  /** A risk row was clicked in the portfolio drawer. */
  onRiskSelect(s: DetailSignal, grid: DataGridComponent<SampleProject>): void {
    const risk = this.portfolio?.risks.find((r) => r.project.id === s.id);
    if (risk) this.openRisk(risk, grid);
  }

  /** Overdue/remaining caption under the due date. */
  dueCaption(p: SampleProject): string {
    const d = this.daysToDue(p);
    return d < 0 ? `${-d}d overdue` : `${d}d left`;
  }

  overviewSections(p: SampleProject): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Project #', value: p.id, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Customer', value: p.customer },
          { type: 'dg', key: 'priority' },
          { type: 'dg', key: 'manager', label: 'Project manager' },
        ],
      },
      {
        title: 'Schedule',
        columns: '2',
        fields: [
          { type: 'field', label: 'Start date', value: this.datePipe.transform(p.startDate, 'dd MMM yyyy') },
          {
            type: 'dg', key: 'dueDate',
            badge: {
              label: this.dueCaption(p),
              tone: this.isOverdue(p) ? 'bad' : 'neutral',
              visible: !CLOSED_STATUSES.includes(p.status),
            },
          },
        ],
      },
      {
        title: 'Budget',
        fields: [
          { type: 'dg', key: 'budget', label: 'Approved budget' },
          { type: 'field', label: 'Spent', value: this.qar.format(p.spent), numeric: true },
          {
            type: 'field', label: 'Remaining', numeric: true,
            value: this.qar.format(p.budget - p.spent),
            tone: p.budget - p.spent < 0 ? 'bad' : undefined,
          },
        ],
      },
      {
        title: 'Utilization',
        fields: [
          { type: 'progress', label: 'Budget used', value: this.budgetUsed(p), tone: this.budgetUsed(p) > 100 ? 'bad' : 'good' },
        ],
      },
      {
        title: 'Progress',
        fields: [
          { type: 'progress', label: 'Completion', value: p.progress },
        ],
      },
    ];
  }

  // ---- New project form (smart-form showcase) ----
  private datePipe = inject(DatePipe);
  private fb = inject(FormBuilder);
  private confirm = inject(ConfirmDialogService);
  private modal = inject(ModalService);
  private qar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'QAR', maximumFractionDigits: 0 });
  formOpen = false;
  saving = false;

  readonly customerOptions: SfOption<string>[] = CUSTOMERS.map((c, i) => ({ label: c, value: c, description: `CUS-${2001 + i}` }));
  readonly typeOptions = toOptions(TYPES);
  readonly managerOptions = toOptions(MANAGERS);
  readonly priorityOptions = toOptions(PRIORITIES);
  readonly billingOptions: SfOption<string>[] = [
    { label: 'Fixed price', value: 'fixed', description: 'One agreed amount' },
    { label: 'Time & material', value: 'tm', description: 'Billed on actual hours' },
    { label: 'Milestones', value: 'milestone', description: 'Split into payments' },
  ];
  readonly serviceOptions = toOptions(['Design', 'Supply', 'Installation', 'Commissioning', 'Training', 'AMC']);

  projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    customer: [null as string | null, Validators.required],
    type: [null as string | null, Validators.required],
    reference: [''],
    manager: [CURRENT_USER as string | null, Validators.required],
    team: [[] as string[]],
    contactEmail: ['', Validators.email],
    contactPhone: ['', Validators.pattern(/^\+?[0-9\s-]{7,15}$/)],
    startDate: [isoDate(new Date()) as string | null, Validators.required],
    dueDate: [null as string | null, [Validators.required, dueAfterStart]],
    kickoffTime: ['09:00' as string | null],
    budget: [null as number | null, [Validators.required, Validators.min(1000)]],
    contingency: [10 as number | null, [Validators.min(0), Validators.max(50)]],
    billing: ['fixed'],
    milestones: [{ value: 3 as number | null, disabled: true }, [Validators.required, Validators.min(2), Validators.max(12)]],
    priority: ['Medium'],
    risk: [30 as number | null],
    services: [[] as string[]],
    tags: [[] as string[]],
    siteSurvey: [false as boolean | null],
    surveyDate: [{ value: null as string | null, disabled: true }, Validators.required],
    notifyCustomer: [true as boolean | null],
    description: ['', Validators.maxLength(500)],
    attachments: [[] as File[] | null],
  });
  private readonly formDefaults = this.projectForm.getRawValue();

  constructor() {
    const f = this.projectForm.controls;
    f.billing.valueChanges.subscribe((b) => (b === 'milestone' ? f.milestones.enable() : f.milestones.disable()));
    f.siteSurvey.valueChanges.subscribe((on) => (on ? f.surveyDate.enable() : f.surveyDate.disable()));
    f.startDate.valueChanges.subscribe(() => f.dueDate.updateValueAndValidity());
  }

  get contingencyAmount(): number {
    const { budget, contingency } = this.projectForm.controls;
    return ((budget.value ?? 0) * (contingency.value ?? 0)) / 100;
  }

  /** Route guard: leaving the page with an open, dirty form asks first (the draft is kept either way). */
  async canDeactivate(): Promise<boolean> {
    if (!this.formOpen || !this.projectForm.dirty) return true;
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Leave without creating the project?',
      message: 'Your entries stay saved as a draft and can be restored next time you open the form.',
      confirmLabel: 'Leave page',
      cancelLabel: 'Stay',
    });
    return confirmed;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.formOpen && this.projectForm.dirty) e.preventDefault();
  }

  closeForm(discarded: boolean, draft: SfDraftDirective): void {
    this.formOpen = false;
    if (discarded) {
      draft.clear();
      this.projectForm.reset(this.formDefaults);
    }
  }

  async submitProject(grid: DataGridComponent<SampleProject>, draft: SfDraftDirective): Promise<void> {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      setTimeout(() => document.querySelector('app-sf-drawer [formcontrolname].ng-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const v = this.projectForm.getRawValue();
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Create this project?',
      message: `A project will be opened for ${v.customer} and the budget reserved against it.`,
      details: [
        { label: 'Project', value: v.name! },
        { label: 'Manager', value: v.manager! },
        { label: 'Approved budget', value: this.qar.format(v.budget!) },
        { label: 'Due', value: new Date(v.dueDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
      ],
      consequence: v.notifyCustomer && v.contactEmail ? `${v.contactEmail} will be emailed immediately.` : undefined,
      confirmLabel: 'Create project',
      cancelLabel: 'Back to form',
    });
    if (!confirmed) return;
    this.saving = true;
    // simulates the create API call
    setTimeout(() => {
      const project: SampleProject = {
        id: `PRJ-${1001 + this.projects.length + Math.floor(Math.random() * 9000)}`,
        name: v.name!,
        customer: v.customer!,
        manager: v.manager!,
        status: 'Planning',
        priority: v.priority!,
        startDate: new Date(v.startDate!).toISOString(),
        dueDate: new Date(v.dueDate!).toISOString(),
        budget: v.budget!,
        spent: 0,
        progress: 0,
        activity: [{ text: 'Project created', by: CURRENT_USER, date: new Date().toISOString() }],
      };
      this.projects = [project, ...this.projects];
      this.saving = false;
      this.formOpen = false;
      draft.clear();
      this.projectForm.reset(this.formDefaults);
      grid.notify(`${project.id} created`);
    }, 600);
  }

  ngOnInit(): void {
    // simulates the API call so the loading skeleton can be reviewed
    setTimeout(() => {
      this.projects = getSampleProjects();
      this.loading = false;
    }, 900);
  }

  /** Real modules fetch the full record here (items, attachments, history) while the panel shows a skeleton. */
  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  budgetUsed(p: SampleProject): number {
    return p.budget ? Math.round((p.spent / p.budget) * 100) : 0;
  }

  rowAccent = (p: SampleProject) => (this.isOverdue(p) ? ('danger' as const) : null);

  isOverdue(p: SampleProject): boolean {
    return !CLOSED_STATUSES.includes(p.status) && this.daysToDue(p) < 0;
  }

  daysToDue(p: SampleProject): number {
    return Math.round((new Date(p.dueDate).getTime() - Date.now()) / 86400000);
  }

  onCellEdit(e: DataGridCellEditEvent<SampleProject>): void {
    if (e.column.editor === 'date' && e.newValue) e.row.dueDate = new Date(e.newValue).toISOString();
  }

  async onRowAction({ action, row }: DataGridRowActionEvent<SampleProject>, grid: DataGridComponent<SampleProject>): Promise<void> {
    const project = [{ label: 'Project', value: `${row.id} · ${row.name}` }, { label: 'Customer', value: row.customer }];
    switch (action.id) {
      case 'duplicate': {
        const { confirmed } = await this.confirm.open({
          tone: 'note',
          title: 'Duplicate project',
          message: 'The copy starts in Planning with the same customer, manager and budget. Activity history and attachments are not copied.',
          details: project,
          confirmLabel: 'Duplicate',
        });
        if (!confirmed) return;
        const copy = { ...row, id: `PRJ-${1001 + this.projects.length + Math.floor(Math.random() * 9000)}`, name: `${row.name} (copy)` };
        this.projects = [copy, ...this.projects];
        grid.notify(`${row.id} duplicated`);
        break;
      }
      case 'complete': {
        const open = row.budget - row.spent;
        const { confirmed } = await this.confirm.open({
          tone: 'approve',
          title: 'Mark project completed?',
          message: 'The final invoice will be raised and the project closed for further time and material entries.',
          details: [...project, { label: 'Spent / budget', value: `${this.qar.format(row.spent)} / ${this.qar.format(row.budget)}` }, { label: 'Progress', value: `${row.progress}%` }],
          consequence: open > 0 ? `${this.qar.format(open)} of unused budget will be released.` : undefined,
          confirmLabel: 'Mark completed',
        });
        if (!confirmed) return;
        row.status = 'Completed';
        this.projects = [...this.projects];
        grid.notify(`${row.id} marked Completed`);
        break;
      }
      case 'hold': {
        const { confirmed, reason } = await this.confirm.open({
          tone: 'warning',
          title: 'Put project on hold?',
          message: 'Scheduled shipments and site visits for this project will be paused until it is resumed.',
          details: [...project, { label: 'Manager', value: row.manager }],
          reason: true,
          reasonLabel: 'Why is it on hold?',
          confirmLabel: 'Put on hold',
        });
        if (!confirmed) return;
        row.status = 'On Hold';
        row.activity = [{ text: `Put on hold: ${reason}`, by: CURRENT_USER, date: new Date().toISOString() }, ...row.activity];
        this.projects = [...this.projects];
        grid.notify(`${row.id} marked On Hold`);
        break;
      }
      case 'delete': {
        const { confirmed } = await this.confirm.open({
          tone: 'reject',
          title: 'Delete project?',
          message: 'The project, its activity history and linked documents will be removed for everyone.',
          details: [...project, { label: 'Budget', value: this.qar.format(row.budget) }],
          consequence: 'This cannot be undone.',
          typeToConfirm: row.id,
          confirmLabel: 'Delete project',
        });
        if (!confirmed) return;
        this.projects = this.projects.filter((p) => p.id !== row.id);
        grid.notify(`${row.id} deleted`);
        break;
      }
    }
  }

  async onBulkAction({ action, rows }: DataGridBulkActionEvent<SampleProject>, grid: DataGridComponent<SampleProject>): Promise<void> {
    const ids = new Set(rows.map((r) => r.id));
    const count = `${rows.length} project${rows.length === 1 ? '' : 's'}`;
    if (action.id === 'delete') {
      const { confirmed } = await this.confirm.open({
        tone: 'reject',
        title: `Delete ${count}?`,
        message: 'The selected projects and their history will be removed for everyone.',
        details: [{ label: 'Selected', value: count }, { label: 'Combined budget', value: this.qar.format(rows.reduce((s, r) => s + r.budget, 0)) }],
        consequence: 'This cannot be undone.',
        confirmLabel: `Delete ${count}`,
      });
      if (!confirmed) return;
      this.projects = this.projects.filter((p) => !ids.has(p.id));
      grid.clearSelection();
      grid.notify(`${count} deleted`);
    } else if (action.id === 'hold' || action.id === 'complete') {
      const status = action.id === 'hold' ? 'On Hold' : 'Completed';
      rows.forEach((r) => (r.status = status));
      this.projects = [...this.projects];
      grid.clearSelection();
      grid.notify(`${count} marked ${status}`);
    } else if (action.id === 'export') {
      await grid.exportToExcel(rows);
    }
  }
}
