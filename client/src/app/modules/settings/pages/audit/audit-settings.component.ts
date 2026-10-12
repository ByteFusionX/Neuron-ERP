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
  templateUrl: './audit-settings.component.html',
  styleUrls: ['./audit-settings.component.css'],
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
  readonly auditSubtitle = (row: AuditLogEntry): string => `${this.moduleLabel(row.entityType)} - ${this.date(row.at)}`;

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
