import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogEntry, AuditLogService } from 'src/app/core/services/audit-log.service';
import { formatAuditDate } from 'src/app/shared/utils/audit-timeline.util';

const MODULE_LABELS: Record<string, string> = { enquiry: 'Enquiry' };

/** Cross-module activity log: every module that records to the global audit log shows up here. */
@Component({
  selector: 'app-audit-log-list',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <label class="text-xs text-gray-500">Module
        <select [(ngModel)]="entityType" (ngModelChange)="reload()" class="mt-1 block h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
          <option value="">All modules</option>
          <option *ngFor="let t of entityTypes" [value]="t">{{ moduleLabel(t) }}</option>
        </select>
      </label>
      <label class="text-xs text-gray-500">Search
        <input type="text" [(ngModel)]="search" (ngModelChange)="reloadDebounced()" placeholder="Search activity"
          class="mt-1 block h-9 w-52 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
      </label>
      <label class="text-xs text-gray-500">User
        <input type="text" [(ngModel)]="actor" (ngModelChange)="reloadDebounced()" placeholder="Name"
          class="mt-1 block h-9 w-40 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
      </label>
      <label class="text-xs text-gray-500">From
        <input type="date" [(ngModel)]="from" (ngModelChange)="reload()"
          class="mt-1 block h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
      </label>
      <label class="text-xs text-gray-500">To
        <input type="date" [(ngModel)]="to" (ngModelChange)="reload()"
          class="mt-1 block h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
      </label>
    </div>

    <p *ngIf="error" class="mt-3 text-sm text-red-600" role="alert">{{ error }}</p>
    <p *ngIf="loading" class="mt-4 text-sm text-gray-500">Loading...</p>
    <p *ngIf="!loading && !error && !rows.length" class="mt-4 text-sm text-gray-500">No activity recorded yet.</p>

    <div *ngIf="rows.length" class="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/5">
          <tr>
            <th class="px-3 py-2 font-medium">When</th>
            <th class="px-3 py-2 font-medium">Module</th>
            <th class="px-3 py-2 font-medium">Activity</th>
            <th class="px-3 py-2 font-medium">User</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of rows" class="border-t border-gray-100 align-top dark:border-white/10">
            <td class="whitespace-nowrap px-3 py-2 text-gray-500">{{ date(r.at) }}</td>
            <td class="whitespace-nowrap px-3 py-2">{{ moduleLabel(r.entityType) }}</td>
            <td class="px-3 py-2">
              <span class="text-gray-900 dark:text-gray-100">{{ r.summary }}</span>
              <div *ngFor="let c of r.changes" class="mt-0.5 text-xs text-gray-500">
                {{ c.label }}: {{ c.from ?? '—' }} → {{ c.to ?? '—' }}
              </div>
            </td>
            <td class="whitespace-nowrap px-3 py-2">{{ r.actorName || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div *ngIf="total > limit" class="mt-3 flex items-center justify-between text-sm text-gray-500">
      <span>{{ (page - 1) * limit + 1 }}–{{ Math.min(page * limit, total) }} of {{ total }}</span>
      <span class="flex gap-2">
        <button type="button" (click)="go(page - 1)" [disabled]="page <= 1" class="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40 dark:border-white/10">Previous</button>
        <button type="button" (click)="go(page + 1)" [disabled]="page * limit >= total" class="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40 dark:border-white/10">Next</button>
      </span>
    </div>
  `,
})
export class AuditLogListComponent implements OnInit {
  private auditLog = inject(AuditLogService);

  readonly Math = Math;
  readonly limit = 25;
  rows: AuditLogEntry[] = [];
  entityTypes: string[] = [];
  total = 0;
  page = 1;
  loading = true;
  error = '';

  entityType = '';
  search = '';
  actor = '';
  from = '';
  to = '';

  private debounce?: ReturnType<typeof setTimeout>;
  /** Drops responses from superseded requests so a slow earlier call cannot overwrite newer filters. */
  private requestSeq = 0;

  ngOnInit(): void {
    this.load();
  }

  moduleLabel(type: string): string {
    return MODULE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
  }

  date(at: string): string {
    return formatAuditDate(at);
  }

  reload(): void {
    this.page = 1;
    this.load();
  }

  reloadDebounced(): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.reload(), 300);
  }

  go(page: number): void {
    this.page = page;
    this.load();
  }

  private load(): void {
    const seq = ++this.requestSeq;
    this.loading = true;
    this.error = '';
    this.auditLog.list({
      page: this.page, limit: this.limit, entityType: this.entityType, search: this.search,
      actor: this.actor, from: this.from, to: this.to,
    }).subscribe({
      next: (res) => {
        if (seq !== this.requestSeq) return;
        this.rows = res.data;
        this.total = res.total;
        this.entityTypes = res.entityTypes;
        this.loading = false;
      },
      error: () => {
        if (seq !== this.requestSeq) return;
        this.loading = false;
        this.error = 'Could not load the activity log';
      },
    });
  }
}
