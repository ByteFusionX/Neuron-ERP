import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { SystemSettingService } from 'src/app/core/services/system-setting.service';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';

const AREA_DEFS: { id: string; label: string; description: string }[] = [
  { id: 'documents', label: 'Documents', description: 'Enquiries, quotations, deal sheets, jobs and other business documents.' },
  { id: 'masterData', label: 'Master data', description: 'Customers, suppliers, products and the lists in Master Data.' },
  { id: 'settings', label: 'Settings', description: 'Changes made on the Settings pages.' },
  { id: 'usersRoles', label: 'Users & roles', description: 'Employees, roles and privilege changes.' },
  { id: 'approvals', label: 'Approvals', description: 'Approval requests, decisions and overrides.' },
];

@Component({
  selector: 'app-audit-settings',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <div class="w-full h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="audit"></app-settings-section-header>
      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Choose what changes are recorded and how long history is kept. These choices are saved here; recording is not yet driven by them.
      </p>

      <p *ngIf="loading" class="text-sm text-gray-500">Loading...</p>
      <ng-container *ngIf="!loading">
        <h3 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Record changes to</h3>
        <div class="space-y-3">
          <label *ngFor="let a of defs" class="flex items-center gap-4 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <input type="checkbox" [(ngModel)]="areas[a.id]" class="h-4 w-4 accent-violet-600">
            <span>
              <span class="block text-sm font-semibold text-gray-900 dark:text-gray-100">{{ a.label }}</span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">{{ a.description }}</span>
            </span>
          </label>
        </div>

        <h3 class="mb-2 mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Keep history for</h3>
        <label class="flex items-center gap-2 text-sm">
          <input type="number" min="30" max="3650" [(ngModel)]="retentionDays" placeholder="Forever" aria-label="Retention in days"
            class="h-9 w-32 rounded-lg border border-gray-200 bg-white px-2 dark:border-white/10 dark:bg-erp-surface-dark">
          <span class="text-xs text-gray-500">days (30 to 3650). Leave empty to keep history forever.</span>
        </label>
      </ng-container>

      <p *ngIf="error" class="mt-3 text-sm text-red-600" role="alert">{{ error }}</p>
      <button type="button" *ngIf="!loading" (click)="save()" [disabled]="saving"
        class="mt-4 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
    </div>
  `,
})
export class AuditSettingsComponent implements OnInit {
  private settings = inject(SystemSettingService);
  private toast = inject(ToastrService);

  readonly defs = AREA_DEFS;
  areas: Record<string, boolean> = {};
  retentionDays: number | null = null;
  loading = true;
  saving = false;
  error = '';

  ngOnInit(): void {
    this.settings.getAudit().subscribe({
      next: (res) => {
        this.areas = Object.fromEntries(AREA_DEFS.map((a) => [a.id, res.data.areas?.[a.id] ?? true]));
        this.retentionDays = res.data.retentionDays ?? null;
        this.loading = false;
      },
      error: () => { this.loading = false; this.error = 'Could not load audit settings'; },
    });
  }

  save(): void {
    this.saving = true;
    this.error = '';
    // A cleared number input comes back as '' or null; both mean keep forever.
    const retention = (this.retentionDays as number | string | null) === '' ? null : this.retentionDays;
    this.settings.saveAudit({ areas: this.areas, retentionDays: retention }).subscribe({
      next: () => { this.saving = false; this.toast.success('Audit settings saved'); },
      error: (e) => { this.saving = false; this.error = e?.error?.message ?? 'Could not save audit settings'; },
    });
  }
}
