import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { NotificationEventSetting, SystemSettingService } from 'src/app/core/services/system-setting.service';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';

const EVENT_DEFS: { id: string; label: string; description: string; daysLabel?: string }[] = [
  { id: 'approvalPending', label: 'Approval pending', description: 'Remind the approver when something is waiting for their decision.', daysLabel: 'days waiting' },
  { id: 'missingData', label: 'Missing data', description: 'Warn when a record is saved without information it needs.' },
  { id: 'duplicateWarning', label: 'Duplicate warning', description: 'Warn when a new record looks like one that already exists.' },
  { id: 'overdueFollowUp', label: 'Overdue follow-up', description: 'Alert the owner when a follow-up date has passed.', daysLabel: 'days overdue' },
];

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <div class="w-full h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="notifications"></app-settings-section-header>
      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Choose which events alert people. These choices are saved here; the alerts themselves are not yet sent from them.
      </p>

      <p *ngIf="loading" class="text-sm text-gray-500">Loading...</p>
      <div *ngIf="!loading" class="space-y-3">
        <div *ngFor="let d of defs" class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <div class="flex flex-wrap items-center gap-4">
            <div class="min-w-[220px] flex-1">
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ d.label }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ d.description }}</p>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [(ngModel)]="events[d.id].enabled" class="h-4 w-4 accent-violet-600"> Enabled
            </label>
            <label class="flex items-center gap-2 text-sm" [class.opacity-50]="!events[d.id].enabled">
              <input type="checkbox" [(ngModel)]="events[d.id].email" [disabled]="!events[d.id].enabled" class="h-4 w-4 accent-violet-600"> Also email
            </label>
            <label *ngIf="d.daysLabel" class="flex items-center gap-2 text-sm" [class.opacity-50]="!events[d.id].enabled">
              <input type="number" min="1" max="365" [(ngModel)]="events[d.id].afterDays" [disabled]="!events[d.id].enabled"
                [attr.aria-label]="d.label + ' days'"
                class="h-9 w-20 rounded-lg border border-gray-200 bg-white px-2 dark:border-white/10 dark:bg-erp-surface-dark">
              <span class="text-xs text-gray-500">{{ d.daysLabel }}</span>
            </label>
          </div>
        </div>
      </div>

      <p *ngIf="error" class="mt-3 text-sm text-red-600" role="alert">{{ error }}</p>
      <button type="button" *ngIf="!loading" (click)="save()" [disabled]="saving"
        class="mt-4 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
    </div>
  `,
})
export class NotificationSettingsComponent implements OnInit {
  private settings = inject(SystemSettingService);
  private toast = inject(ToastrService);

  readonly defs = EVENT_DEFS;
  events: Record<string, NotificationEventSetting> = {};
  loading = true;
  saving = false;
  error = '';

  ngOnInit(): void {
    this.settings.getNotifications().subscribe({
      next: (res) => {
        // Guarantee an entry for every row so the template never reads an undefined event.
        this.events = Object.fromEntries(
          EVENT_DEFS.map((d) => [d.id, res.data.events?.[d.id] ?? { enabled: true, email: false, afterDays: d.daysLabel ? 1 : null }]),
        );
        this.loading = false;
      },
      error: () => { this.loading = false; this.error = 'Could not load notification settings'; },
    });
  }

  save(): void {
    this.saving = true;
    this.error = '';
    this.settings.saveNotifications({ events: this.events }).subscribe({
      next: () => { this.saving = false; this.toast.success('Notification settings saved'); },
      error: (e) => { this.saving = false; this.error = e?.error?.message ?? 'Could not save notification settings'; },
    });
  }
}
