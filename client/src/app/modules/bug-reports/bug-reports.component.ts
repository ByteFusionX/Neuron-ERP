import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatTableDataSource } from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { Socket } from 'ngx-socket-io';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';
import { SkeltonLoadingComponent } from '../../shared/components/skelton-loading/skelton-loading.component';
import { AiAnalysisDialogComponent } from './ai-analysis-dialog/ai-analysis-dialog.component';

const IN_PROGRESS_STATUSES = ['analyzing', 'implementing'];
const SAFETY_POLL_INTERVAL_MS = 15000;

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
  reporterId: { firstName: string; lastName: string; email: string } | null;
  reportingTo: { firstName: string; lastName: string; email: string; employeeId: string } | null;
  aiAnalysis?: {
    summary?: string; probableCause?: string; suggestedFix?: string; severity?: string;
    error?: string; failedReason?: string; analyzedAt?: string; costUsd?: number;
    applied?: boolean; filesChanged?: string[]; explanation?: string; codeChanges?: string;
    implementationError?: string; implementationCostUsd?: number;
  };
}

@Component({
  selector: 'app-bug-reports',
  standalone: true,
  imports: [CommonModule, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatTooltip, NgIcon, SkeltonLoadingComponent],
  templateUrl: './bug-reports.component.html',
  styleUrl: './bug-reports.component.css',
})
export class BugReportsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly api = environment.api;
  private readonly dialog = inject(MatDialog);
  private readonly toastr = inject(ToastrService);
  private readonly socket = inject(Socket);
  private notificationSub?: Subscription;
  private pollSub?: Subscription;

  isLoading = true;
  isEmpty = false;

  dataSource = new MatTableDataSource<BugReportListItem>();
  displayedColumns: string[] = ['reporter', 'reportingTo', 'description', 'route', 'status', 'aiAnalysis', 'screenshots', 'consoleErrors', 'networkErrors', 'createdAt', 'actions'];

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
    this.http.get<BugReportListItem[]>(`${this.api}/bug-reports`).subscribe({
      next: (data) => {
        this.dataSource.data = data;
        this.isEmpty = data.length === 0;
        this.isLoading = false;
        this.syncSafetyPolling();
      },
      error: () => {
        this.isEmpty = true;
        this.isLoading = false;
      },
    });
  }

  // Primary live-update path: as soon as a BugReport-related notification comes in
  // over the socket (assigned / resolved), refresh so status/spinners reflect it instantly.
  private listenForLiveUpdates(): void {
    this.notificationSub = this.socket.fromEvent('recieveNotifications').subscribe({
      next: (notification: any) => {
        if (notification?.referenceModel === 'BugReport') {
          this.fetchBugReports();
        }
      },
    });
  }

  // Safety net: notifications only reach the reporter/assignee, so anyone else watching
  // this table (e.g. an admin browsing the list) still needs the "Analyzing..." spinner
  // to stop once processing finishes. Poll only while something is actually in progress.
  private syncSafetyPolling(): void {
    const hasInProgress = this.dataSource.data.some((r) => IN_PROGRESS_STATUSES.includes(r.status));

    if (hasInProgress && !this.pollSub) {
      this.pollSub = timer(SAFETY_POLL_INTERVAL_MS, SAFETY_POLL_INTERVAL_MS)
        .pipe(switchMap(() => this.http.get<BugReportListItem[]>(`${this.api}/bug-reports`)))
        .subscribe((data) => {
          this.dataSource.data = data;
          if (!data.some((r) => IN_PROGRESS_STATUSES.includes(r.status))) {
            this.pollSub?.unsubscribe();
            this.pollSub = undefined;
          }
        });
    } else if (!hasInProgress && this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = undefined;
    }
  }

  openScreenshot(url: string): void {
    window.open(url, '_blank');
  }

  openAiAnalysis(element: BugReportListItem): void {
    this.dialog.open(AiAnalysisDialogComponent, {
      width: '600px',
      maxHeight: '90vh',
      data: { reportId: element._id, status: element.status, aiAnalysis: element.aiAnalysis },
    });
  }

  markAsResolved(element: BugReportListItem): void {
    this.http.patch<BugReportListItem>(`${this.api}/bug-reports/${element._id}/status`, { status: 'resolved' }).subscribe({
      next: (updated) => {
        element.status = updated.status;
        this.toastr.success('Bug report marked as resolved. Reporter notified.');
      },
      error: () => {
        this.toastr.error('Failed to update bug report status.');
      },
    });
  }
}
