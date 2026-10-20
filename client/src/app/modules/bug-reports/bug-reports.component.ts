import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Socket } from 'ngx-socket-io';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridFieldComponent } from 'src/app/shared/components/data-grid/data-grid-field.component';
import {
  DataGridBreadcrumb,
  DataGridCellEditEvent,
  DataGridColumn,
  DataGridDetailTab,
  DataGridRowAction,
  DataGridRowActionEvent,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { StatusPillComponent } from 'src/app/shared/components/status-indicator/status-pill.component';
import { StatusTone } from 'src/app/shared/components/status-indicator/status-tone';

const IN_PROGRESS_STATUSES = ['analyzing', 'implementing'];
const SAFETY_POLL_INTERVAL_MS = 15000;

interface BugReportPerson {
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
}

interface BugReportListItem {
  _id: string;
  description: string;
  route: string;
  status: string;
  userAgent: string;
  viewport: string;
  screenshotUrls: string[];
  consoleLog: unknown[];
  networkErrors: unknown[];
  actionTrail: unknown[];
  createdAt: string;
  reporterId: BugReportPerson | null;
  reportingTo: BugReportPerson | null;
}

@Component({
  selector: 'app-bug-reports',
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent,
    DataGridFieldComponent,
    DetailOverviewComponent,
    ActionButtonComponent,
    StatusPillComponent,
  ],
  templateUrl: './bug-reports.component.html',
  styleUrl: './bug-reports.component.css',
})
export class BugReportsComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid?: DataGridComponent<BugReportListItem>;

  private readonly http = inject(HttpClient);
  private readonly api = environment.api;
  private readonly toastr = inject(ToastrService);
  private readonly socket = inject(Socket);
  private notificationSub?: Subscription;
  private pollSub?: Subscription;

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Bug Reports' }];
  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Overview', icon: 'info' },
    { id: 'diagnostics', label: 'Diagnostics', icon: 'files' },
  ];
  readonly statusOptions = ['new', 'analyzing', 'implementing', 'fix-ready', 'approved', 'rejected', 'resolved', 'failed'];
  readonly statusToneMap: Record<string, StatusTone> = {
    new: 'info',
    analyzing: 'progress',
    implementing: 'progress',
    'fix-ready': 'warning',
    approved: 'success',
    rejected: 'danger',
    resolved: 'success',
    failed: 'danger',
  };

  data: BugReportListItem[] = [];
  isLoading = true;
  loadError = false;
  previewUrl: string | null = null;

  readonly columns: DataGridColumn<BugReportListItem>[] = [
    { key: 'createdAt', label: 'Reported On', type: 'date', sortable: true, locked: true },
    { key: 'route', label: 'Route' },
    { key: 'description', label: 'Description', width: '320px' },
    {
      key: 'status',
      label: 'Status',
      type: 'badge',
      editable: true,
      editor: 'select',
      editorOptions: this.statusOptions.map((status) => ({ label: this.statusLabel(status), value: status })),
      badgeLabel: (status) => this.statusLabel(status),
      badgeClasses: {
        new: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        analyzing: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
        implementing: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
        'fix-ready': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        rejected: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
        resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        failed: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      },
    },
    { key: 'reporter', label: 'Reported By', valueGetter: (row) => this.personName(row.reporterId) },
    { key: 'screenshots', label: 'Screenshots', type: 'number', align: 'center', valueGetter: (row) => row.screenshotUrls?.length ?? 0 },
    { key: 'consoleErrors', label: 'Console Errors', type: 'number', align: 'center', valueGetter: (row) => row.consoleLog?.length ?? 0 },
    { key: 'networkErrors', label: 'Network Errors', type: 'number', align: 'center', valueGetter: (row) => row.networkErrors?.length ?? 0 },
  ];

  readonly rowActions: DataGridRowAction<BugReportListItem>[] = [
    { id: 'screenshots', label: 'View Screenshots', icon: 'eye', quick: true, hidden: (row) => !row.screenshotUrls?.length },
    { id: 'resolve', label: 'Mark as Resolved', icon: 'check', quick: true, hidden: (row) => row.status === 'resolved' },
  ];

  readonly detailTitle = (row: BugReportListItem) => row.description;
  readonly detailSubtitle = (row: BugReportListItem) => row.route || 'Route not captured';

  ngOnInit(): void {
    this.fetchBugReports();
    this.listenForLiveUpdates();
  }

  ngOnDestroy(): void {
    this.notificationSub?.unsubscribe();
    this.pollSub?.unsubscribe();
  }

  fetchBugReports(): void {
    this.isLoading = true;
    this.loadError = false;
    this.http.get<BugReportListItem[]>(`${this.api}/bug-reports`).subscribe({
      next: (data) => {
        this.data = data;
        this.isLoading = false;
        this.syncSafetyPolling();
      },
      error: () => {
        this.data = [];
        this.loadError = true;
        this.isLoading = false;
      },
    });
  }

  private listenForLiveUpdates(): void {
    this.notificationSub = this.socket.fromEvent('recieveNotifications').subscribe({
      next: (notification: any) => {
        if (notification?.referenceModel === 'BugReport') this.fetchBugReports();
      },
    });
  }

  private syncSafetyPolling(): void {
    const hasInProgress = this.data.some((report) => IN_PROGRESS_STATUSES.includes(report.status));

    if (hasInProgress && !this.pollSub) {
      this.pollSub = timer(SAFETY_POLL_INTERVAL_MS, SAFETY_POLL_INTERVAL_MS)
        .pipe(switchMap(() => this.http.get<BugReportListItem[]>(`${this.api}/bug-reports`)))
        .subscribe((data) => {
          this.data = data;
          if (!data.some((report) => IN_PROGRESS_STATUSES.includes(report.status))) {
            this.pollSub?.unsubscribe();
            this.pollSub = undefined;
          }
        });
    } else if (!hasInProgress && this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = undefined;
    }
  }

  onCellEdit(event: DataGridCellEditEvent<BugReportListItem>): void {
    if (event.column.key === 'status') this.changeStatus(event.row, event.newValue, event.oldValue);
  }

  onRowAction({ action, row }: DataGridRowActionEvent<BugReportListItem>): void {
    if (action.id === 'screenshots') this.openScreenshot(row.screenshotUrls[0]);
    if (action.id === 'resolve') this.changeStatus(row, 'resolved', row.status);
  }

  async copyDiagnostic(label: string, content: unknown[] | undefined): Promise<void> {
    if (!content?.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(content, null, 2));
      this.toastr.success(`${label} copied to clipboard`);
    } catch {
      this.toastr.error(`Could not copy ${label.toLowerCase()}`);
    }
  }

  openScreenshot(url: string): void {
    this.previewUrl = url;
  }

  closeScreenshot(): void {
    this.previewUrl = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.previewUrl) this.closeScreenshot();
  }

  changeStatus(report: BugReportListItem, status: string, previousStatus = report.status): void {
    this.http.patch<BugReportListItem>(`${this.api}/bug-reports/${report._id}/status`, { status }).subscribe({
      next: (updated) => {
        report.status = updated.status;
        this.data = [...this.data];
        this.grid?.notify(status === 'resolved' ? 'Bug report marked as resolved' : 'Bug report status updated', 'success');
        this.syncSafetyPolling();
      },
      error: () => {
        report.status = previousStatus;
        this.data = [...this.data];
        this.toastr.error('Failed to update bug report status.');
      },
    });
  }

  overviewSections(row: BugReportListItem): DetailOverviewSection[] {
    return [{
      title: 'Report information',
      columns: '2',
      fields: [
        { type: 'field', label: 'Reported by', value: this.personName(row.reporterId) },
        { type: 'field', label: 'Reporting to', value: this.personName(row.reportingTo, 'Unassigned') },
        { type: 'field', label: 'Reporter email', value: row.reporterId?.email || '—' },
        { type: 'field', label: 'Route', value: row.route || '—' },
        { type: 'field', label: 'Viewport', value: row.viewport || '—' },
        { type: 'field', label: 'Reported on', value: new Date(row.createdAt).toLocaleString() },
        { type: 'field', label: 'Description', value: row.description || '—', stacked: true },
      ],
    }];
  }

  personName(person: BugReportPerson | null, fallback = '—'): string {
    if (!person) return fallback;
    return [person.firstName, person.lastName].filter(Boolean).join(' ') || fallback;
  }

  statusLabel(status: string): string {
    return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
