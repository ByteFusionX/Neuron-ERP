import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NotificationChannel, NotificationService } from 'src/app/core/services/notification.service';

const CHANNELS: { id: NotificationChannel; label: string }[] = [
  { id: 'inapp', label: 'In-app' },
  { id: 'push', label: 'Push' },
  { id: 'email', label: 'Email' },
];

const GROUPS: { label: string; types: string[] }[] = [
  { label: 'General', types: ['Announcement', 'Event'] },
  { label: 'Sales', types: ['Enquiry', 'EnquiryEstimationReady', 'EnquiryFollowUpOverdue', 'RfqFollowUpOverdue', 'FeedbackRequest', 'Quotation', 'DealSheet', 'DealSheetResponse'] },
  { label: 'Jobs & Technical', types: ['AssignedJob', 'ReAssignedJob', 'TechnicalAssigned', 'JobAllocated', 'ProcurementTransferred'] },
  { label: 'Material requests', types: ['MrRequest', 'MrApprovalRequest', 'MrApproved', 'MrRejected'] },
  { label: 'Purchase', types: ['PurchaseApprovalRequest', 'PurchaseProcurementNotice', 'PurchaseApproved', 'PurchaseRejected', 'LpoApprovalRequest', 'LpoApproved', 'LpoRejected'] },
  { label: 'Suppliers', types: ['SupplierApprovalRequest', 'SupplierApproved', 'SupplierRejected', 'SupplierReturnInitiated'] },
  { label: 'Claims', types: ['ClaimApprovalRequest', 'ClaimApproved', 'ClaimRejected'] },
  { label: 'Stores & Finance', types: ['GrnItemsRejected', 'DnItemsRejected', 'InvoiceRejected', 'StockHoldInitiated'] },
  { label: 'Bug reports', types: ['BugReportAssigned', 'BugReportResolved'] },
];

const LABEL_OVERRIDES: Record<string, string> = {
  EnquiryEstimationReady: 'Estimation ready for review',
  EnquiryFollowUpOverdue: 'Enquiry follow-up overdue',
  RfqFollowUpOverdue: 'Supplier RFQ follow-up overdue',
  MrRequest: 'Material request',
  MrApprovalRequest: 'Material request approval needed',
  MrApproved: 'Material request approved',
  MrRejected: 'Material request rejected',
  LpoApprovalRequest: 'LPO approval needed',
  LpoApproved: 'LPO approved',
  LpoRejected: 'LPO rejected',
  GrnItemsRejected: 'GRN items rejected',
  DnItemsRejected: 'Delivery note items rejected',
};

const labelOf = (type: string) =>
  LABEL_OVERRIDES[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink],
  template: `
    <div class="w-full p-8 space-y-5">
      <div class="bg-white rounded-xl shadow-sm p-6">
        <a routerLink="/profile" class="text-xs text-violet-700 hover:underline">&larr; Back to profile</a>
        <p class="mt-2 text-black font-semibold text-base">My notification preferences</p>
        <p class="mt-1 text-sm text-gray-500">
          Switch off the notifications you do not want. These apply to you only.
          When and to whom reminders are sent is set by your administrators.
        </p>
      </div>

      <p *ngIf="loading" class="text-sm text-gray-500">Loading...</p>
      <p *ngIf="error" class="text-sm text-red-600" role="alert">{{ error }}</p>

      <ng-container *ngIf="!loading && !error">
        <p *ngIf="!emailAvailable" class="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Email delivery is not configured on this system, so the email options have no effect yet.
        </p>

        <div *ngFor="let group of groups" class="bg-white rounded-xl shadow-sm p-6">
          <div class="mb-3 grid grid-cols-[1fr_repeat(4,5rem)] items-end gap-2 border-b pb-3">
            <p class="text-black font-semibold text-base">{{ group.label }}</p>
            <p *ngFor="let c of channels" class="text-center text-xs text-gray-500">{{ c.label }}</p>
            <p class="text-center text-xs text-gray-500" title="Batch emails into one digest">Email digest</p>
          </div>
          <div *ngFor="let t of group.types" class="grid grid-cols-[1fr_repeat(4,5rem)] items-center gap-2 py-2">
            <p class="text-sm text-gray-800">{{ label(t) }}</p>
            <label *ngFor="let c of channels" class="flex justify-center">
              <input type="checkbox" class="h-4 w-4 accent-violet-600"
                [checked]="!isMuted(c.id, t)" (change)="setChannel(c.id, t, $any($event.target).checked)"
                [attr.aria-label]="label(t) + ' ' + c.label">
            </label>
            <label class="flex justify-center">
              <input type="checkbox" class="h-4 w-4 accent-violet-600"
                [checked]="digest.has(t)" [disabled]="isMuted('email', t)"
                (change)="setDigest(t, $any($event.target).checked)"
                [attr.aria-label]="label(t) + ' email digest'">
            </label>
          </div>
        </div>

        <button type="button" (click)="save()" [disabled]="saving"
          class="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50">
          {{ saving ? 'Saving...' : 'Save preferences' }}
        </button>
      </ng-container>
    </div>
  `,
})
export class NotificationPreferencesComponent implements OnInit {
  private notifications = inject(NotificationService);
  private toast = inject(ToastrService);

  readonly channels = CHANNELS;
  groups: { label: string; types: string[] }[] = [];
  muted: Record<NotificationChannel, Set<string>> = { inapp: new Set(), push: new Set(), email: new Set() };
  digest = new Set<string>();
  emailAvailable = true;
  loading = true;
  saving = false;
  error = '';

  label = labelOf;

  ngOnInit(): void {
    this.notifications.getPreferences().subscribe({
      next: (res) => {
        CHANNELS.forEach(({ id }) => (this.muted[id] = new Set(res.muted?.[id] ?? [])));
        this.digest = new Set(res.emailDigest ?? []);
        this.emailAvailable = res.emailAvailable;
        this.groups = this.buildGroups(res.types ?? []);
        this.loading = false;
      },
      error: () => { this.loading = false; this.error = 'Could not load your notification preferences'; },
    });
  }

  isMuted(channel: NotificationChannel, type: string): boolean {
    return this.muted[channel].has(type);
  }

  setChannel(channel: NotificationChannel, type: string, on: boolean): void {
    if (on) this.muted[channel].delete(type); else this.muted[channel].add(type);
  }

  setDigest(type: string, on: boolean): void {
    if (on) this.digest.add(type); else this.digest.delete(type);
  }

  save(): void {
    this.saving = true;
    this.notifications.savePreferences({
      muted: { inapp: [...this.muted.inapp], push: [...this.muted.push], email: [...this.muted.email] },
      emailDigest: [...this.digest],
    }).subscribe({
      next: () => { this.saving = false; this.toast.success('Notification preferences saved'); },
      error: (e) => { this.saving = false; this.toast.error(e?.error?.message ?? 'Could not save notification preferences'); },
    });
  }

  /** Known groups first, then any type the server reports that no group lists, so new types always show up. */
  private buildGroups(serverTypes: string[]) {
    const known = new Set(GROUPS.flatMap((g) => g.types));
    const groups = GROUPS
      .map((g) => ({ label: g.label, types: g.types.filter((t) => serverTypes.includes(t)) }))
      .filter((g) => g.types.length);
    const other = serverTypes.filter((t) => !known.has(t));
    return other.length ? [...groups, { label: 'Other', types: other }] : groups;
  }
}
