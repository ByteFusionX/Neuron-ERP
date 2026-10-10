import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditLogEntry, AuditLogService } from 'src/app/core/services/audit-log.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { formatAuditDate } from 'src/app/shared/utils/audit-timeline.util';

const MODULE_LABELS: Record<string, string> = { enquiry: 'Enquiry' };

@Component({
  selector: 'app-audit-settings',
  standalone: true,
  imports: [CommonModule, DataGridComponent],
  template: `
    <div class="h-full flex flex-col p-6 bg-gray-50 dark:bg-erp-surface-dark-alt">
      <div *ngIf="error" role="alert"
        class="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <span>{{ error }}</span>
        <button type="button" class="font-medium underline hover:no-underline" (click)="load()">Try again</button>
      </div>

      <app-data-grid
        class="flex-1 min-h-0"
        [fillHeight]="true"
        title="Audit & History"
        subtitle="Review system activity across modules, users, and recorded changes"
        [breadcrumbs]="breadcrumbs"
        rowKey="_id"
        [serverSide]="true"
        [totalCount]="total"
        [data]="rows"
        [columns]="columns"
        [loading]="loading"
        [pageSize]="limit"
        searchPlaceholder="Search activity"
        emptyMessage="No activity recorded yet"
        [createLabel]="''"
        [views]="views"
        storageKey="settings-audit-log"
        exportable
        exportFileName="audit-history.xlsx"
        [detailTabs]="detailTabs"
        [detailTitle]="auditTitle"
        [detailSubtitle]="auditSubtitle"
        (queryChange)="onQueryChange($event)">

        <ng-template #detailMetaTemplate let-row>
          <div class="audit-meta"><p class="audit-meta-label">Module</p><p class="audit-meta-value">{{ moduleLabel(row.entityType) }}</p></div>
          <div class="audit-meta"><p class="audit-meta-label">User</p><p class="audit-meta-value">{{ row.actorName || '-' }}</p></div>
          <div class="audit-meta"><p class="audit-meta-label">Record</p><p class="audit-meta-value">{{ row.entityLabel || row.entityId || '-' }}</p></div>
          <div class="audit-meta"><p class="audit-meta-label">When</p><p class="audit-meta-value">{{ date(row.at) }}</p></div>
        </ng-template>

        <ng-template #detailTemplate let-row let-tab="tab">
          <ng-container [ngSwitch]="tab">
            <div *ngSwitchCase="'summary'" class="space-y-3">
              <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-erp-border-dark dark:bg-erp-surface-dark">
                <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Activity</p>
                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{{ row.summary }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-erp-border-dark dark:bg-erp-surface-dark">
                <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Reference</p>
                <div class="mt-2 grid gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <p><span class="text-gray-500 dark:text-gray-400">Action:</span> {{ row.action || '-' }}</p>
                  <p><span class="text-gray-500 dark:text-gray-400">Entity ID:</span> {{ row.entityId || '-' }}</p>
                </div>
              </div>
            </div>

            <div *ngSwitchCase="'changes'" class="space-y-2.5">
              <div *ngFor="let change of row.changes ?? []"
                class="rounded-lg border border-gray-200 bg-white p-3.5 dark:border-erp-border-dark dark:bg-erp-surface-dark">
                <p class="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{{ change.label }}</p>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ change.from ?? '-' }} <span class="px-1 text-gray-400">to</span> {{ change.to ?? '-' }}
                </p>
              </div>
              <div *ngIf="!(row.changes ?? []).length"
                class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-erp-border-dark">
                <p class="text-[13px] text-gray-500 dark:text-gray-400">No field-level changes were recorded.</p>
              </div>
            </div>
          </ng-container>
        </ng-template>
      </app-data-grid>
    </div>
  `,
  styles: [`
    .audit-meta {
      min-width: 0;
      padding: 0.625rem 0.75rem;
    }

    .audit-meta + .audit-meta {
      border-left: 1px solid #e5e7eb;
    }

    .audit-meta-label {
      color: #6b7280;
      font-size: 0.6875rem;
    }

    .audit-meta-value {
      margin-top: 0.125rem;
      overflow: hidden;
      color: #111827;
      font-size: 0.8125rem;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :host-context(html.dark) .audit-meta + .audit-meta {
      border-left-color: #262626;
    }

    :host-context(html.dark) .audit-meta-label {
      color: #a1a1a1;
    }

    :host-context(html.dark) .audit-meta-value {
      color: #ededed;
    }
  `],
})
export class AuditSettingsComponent implements OnInit {
  private auditLog = inject(AuditLogService);

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Settings', link: ['/settings'] }];
  readonly limit = 25;
  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'summary', label: 'Summary', icon: 'info' },
    { id: 'changes', label: 'Changes', icon: 'history' },
  ];
  readonly columns: DataGridColumn<AuditLogEntry>[] = [
    { key: 'at', label: 'When', type: 'date', sortable: true, width: '170px', valueGetter: (row) => row.at },
    { key: 'entityType', label: 'Module', sortable: true, width: '150px', valueGetter: (row) => this.moduleLabel(row.entityType) },
    { key: 'summary', label: 'Activity', sortable: true, locked: true },
    { key: 'actorName', label: 'User', sortable: true, width: '180px', valueGetter: (row) => row.actorName || '-' },
  ];

  rows: AuditLogEntry[] = [];
  entityTypes: string[] = [];
  views: DataGridView<AuditLogEntry>[] = [{ id: 'all', label: 'All Activity', hideCount: true }];
  total = 0;
  loading = true;
  error = '';

  private query: DataGridQuery = {
    search: '',
    filters: [],
    sort: { key: null, direction: null },
    page: 1,
    pageSize: this.limit,
    viewId: 'all',
  };
  private requestSeq = 0;

  ngOnInit(): void {
    this.load();
  }

  readonly auditTitle = (row: AuditLogEntry): string => row.summary || this.moduleLabel(row.entityType);
  readonly auditSubtitle = (row: AuditLogEntry): string => `${this.moduleLabel(row.entityType)} · ${this.date(row.at)}`;

  moduleLabel(type: string): string {
    return MODULE_LABELS[type] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown');
  }

  date(at: string): string {
    return formatAuditDate(at);
  }

  onQueryChange(query: DataGridQuery): void {
    this.query = query;
    this.load();
  }

  load(): void {
    const seq = ++this.requestSeq;
    this.loading = true;
    this.error = '';
    this.auditLog.list({
      page: this.query.page,
      limit: this.query.pageSize || this.limit,
      entityType: this.query.viewId === 'all' ? '' : this.query.viewId,
      search: this.query.search,
    }).subscribe({
      next: (res) => {
        if (seq !== this.requestSeq) return;
        this.rows = res.data;
        this.total = res.total;
        this.entityTypes = res.entityTypes;
        this.refreshViews();
        this.loading = false;
      },
      error: () => {
        if (seq !== this.requestSeq) return;
        this.loading = false;
        this.error = 'Could not load the activity log';
      },
    });
  }

  private refreshViews(): void {
    this.views = [
      { id: 'all', label: 'All Activity', count: this.query.viewId === 'all' ? this.total : undefined, hideCount: this.query.viewId !== 'all' },
      ...this.entityTypes.map((type) => ({
        id: type,
        label: this.moduleLabel(type),
        count: this.query.viewId === type ? this.total : undefined,
        hideCount: this.query.viewId !== type,
      })),
    ];
  }
}
