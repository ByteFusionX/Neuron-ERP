import { Component, Input, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NotificationChannel, NotificationService } from 'src/app/core/services/notification.service';

const CHANNELS: { id: NotificationChannel; label: string; hint: string; icon: string }[] = [
  { id: 'inapp', label: 'In-app', hint: 'Bell inside the ERP', icon: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0' },
  { id: 'push', label: 'Push', hint: 'Browser / desktop alerts', icon: 'M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3' },
  { id: 'email', label: 'Email', hint: 'Sent to your work inbox', icon: 'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75' },
];

const GROUPS: { label: string; types: string[] }[] = [
  { label: 'General', types: ['Announcement', 'Event'] },
  {
    label: 'Enquiry & Presales',
    types: ['AssignedJob', 'ReAssignedJob', 'PresaleRejected', 'EnquiryEstimationReady', 'FeedbackRequest', 'FeedbackGiven', 'EnquiryFollowUpOverdue'],
  },
  { label: 'Quotation', types: ['QuotationFollowUpOverdue'] },
  { label: 'Deal Sheet', types: ['DealSheet', 'DealSheetResponse'] },
  { label: 'Technical', types: ['TechnicalAssigned'] },
  { label: 'Material Requests', types: ['MrRequest', 'MrApprovalRequest', 'MrApproved', 'MrRejected'] },
  { label: 'Purchase Requests', types: ['PurchaseApprovalRequest', 'PurchaseProcurementNotice', 'PurchaseApproved', 'PurchaseRejected', 'PurchaseRequestAllocated', 'ProcurementTransferred', 'PurchaseFollowUpOverdue'] },
  { label: 'LPO', types: ['LpoApprovalRequest', 'LpoApproved', 'LpoRejected', 'LpoPlaced', 'LpoDeliveryDue', 'LpoCancelled'] },
  { label: 'Suppliers', types: ['SupplierApprovalRequest', 'SupplierApproved', 'SupplierRejected'] },
  { label: 'Stores (GRN & DN)', types: ['GrnCreated', 'GrnItemsRejected', 'DnDispatched', 'DnDelivered', 'DnItemsRejected', 'StockHoldInitiated', 'SupplierReturnInitiated'] },
  { label: 'Finance', types: ['LpoPlacedBilling', 'InvoiceOverdue', 'InvoiceRejected', 'PdcRejected', 'ProformaPaymentConfirmed'] },
  { label: 'Claims', types: ['ClaimApprovalRequest', 'ClaimApproved', 'ClaimRejected', 'ClaimPaid'] },
  { label: 'Bug Reports', types: ['BugReportAssigned', 'BugReportResolved'] },
];

/** Types that are no longer user-configurable; never listed, even if the server still reports them. */
const HIDDEN = new Set(['Enquiry', 'JobAllocated', 'QuotationWon']);

const LABEL_OVERRIDES: Record<string, string> = {
  AssignedJob: 'Presale job assigned',
  ReAssignedJob: 'Presale job reassigned',
  PresaleRejected: 'Presale job rejected or returned',
  EnquiryEstimationReady: 'Estimation ready for review',
  FeedbackRequest: 'Feedback requested',
  FeedbackGiven: 'Feedback received',
  EnquiryFollowUpOverdue: 'Enquiry follow-up overdue',
  QuotationWon: 'Quotation won',
  QuotationFollowUpOverdue: 'Quote follow-up overdue',
  PurchaseFollowUpOverdue: 'Purchase request follow-up overdue',
  PurchaseRequestAllocated: 'Purchase request allocated to you',
  LpoPlaced: 'LPO placed, delivery expected',
  LpoDeliveryDue: 'LPO delivery due today',
  LpoCancelled: 'LPO cancelled',
  LpoPlacedBilling: 'LPO placed (for billing)',
  GrnCreated: 'Goods received (GRN created)',
  DnDispatched: 'Delivery note dispatched',
  DnDelivered: 'Delivery confirmed (POD)',
  InvoiceOverdue: 'Invoice overdue',
  InvoiceRejected: 'Invoice rejected',
  PdcRejected: 'PDC rejected',
  ProformaPaymentConfirmed: 'Advance payment confirmed',
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

const DESCRIPTIONS: Record<string, string> = {
  Announcement: 'A company announcement is published to you.',
  Event: 'An event or calendar reminder you are invited to.',
  AssignedJob: 'A presale job is assigned to you, so you can start the estimation.',
  ReAssignedJob: 'A presale job you own is moved to someone else, or one is moved to you.',
  PresaleRejected: 'Your presale work is rejected or sent back, so you can fix it and resubmit.',
  EnquiryEstimationReady: 'The presale team finished the estimation, so you can review it and prepare the quotation.',
  FeedbackRequest: 'Someone asks for your feedback on an enquiry.',
  FeedbackGiven: 'Someone replied to the feedback you asked for.',
  EnquiryFollowUpOverdue: 'An enquiry you own has passed its follow-up date. Sent once a day until you follow up.',
  QuotationFollowUpOverdue: 'A quotation you own has passed its follow-up date and is still open.',
  DealSheet: 'A deal sheet needs your approval, is overdue, or was revoked. Shown under "Needs action".',
  DealSheetResponse: 'A deal sheet you submitted was approved, rejected, or auto-rejected for taking too long.',
  TechnicalAssigned: 'A technical task is assigned to you.',
  MrRequest: 'A material request is raised for a job you are responsible for.',
  MrApprovalRequest: 'A material request is waiting for your approval.',
  MrApproved: 'A material request you raised was approved.',
  MrRejected: 'A material request you raised was rejected.',
  PurchaseApprovalRequest: 'A purchase request is waiting for your approval.',
  PurchaseProcurementNotice: 'A purchase request has been approved and is ready for procurement to action.',
  PurchaseApproved: 'A purchase request you raised was approved.',
  PurchaseRejected: 'A purchase request you raised was rejected.',
  PurchaseRequestAllocated: 'A purchase request is allocated to you to buy.',
  ProcurementTransferred: 'A procurement task is transferred to you from another buyer.',
  PurchaseFollowUpOverdue: 'A purchase request you own has passed its follow-up date.',
  LpoApprovalRequest: 'An LPO is waiting for your approval.',
  LpoApproved: 'An LPO you prepared was approved.',
  LpoRejected: 'An LPO you prepared was rejected.',
  LpoPlaced: 'An LPO was placed with the supplier and a delivery date is expected.',
  LpoDeliveryDue: 'An LPO is due for delivery today.',
  LpoCancelled: 'An LPO was cancelled, wholly or in part.',
  SupplierApprovalRequest: 'A new supplier is waiting for your approval.',
  SupplierApproved: 'A supplier you added was approved.',
  SupplierRejected: 'A supplier you added was rejected.',
  GrnCreated: 'Goods against an LPO were received and a GRN was created.',
  GrnItemsRejected: 'Some received items were rejected at GRN, so the supplier may need to replace them.',
  DnDispatched: 'A delivery note was dispatched to the customer.',
  DnDelivered: 'The customer confirmed delivery (proof of delivery).',
  DnItemsRejected: 'The customer rejected items on a delivery note.',
  StockHoldInitiated: 'Stock is put on hold for a job or order.',
  SupplierReturnInitiated: 'Rejected goods are being returned to the supplier, so you can follow up on replacement or credit.',
  LpoPlacedBilling: 'An LPO was placed, so Finance can prepare billing or payment.',
  InvoiceOverdue: 'An invoice has passed its due date without payment.',
  InvoiceRejected: 'An invoice was rejected and needs correcting.',
  PdcRejected: 'A post-dated cheque was rejected or bounced.',
  ProformaPaymentConfirmed: 'The advance payment from the customer was confirmed, so work can proceed.',
  ClaimApprovalRequest: 'An expense claim is waiting for your approval.',
  ClaimApproved: 'Your expense claim was approved.',
  ClaimRejected: 'Your expense claim was rejected.',
  ClaimPaid: 'Your expense claim was paid.',
  BugReportAssigned: 'A bug report is assigned to you to fix.',
  BugReportResolved: 'A bug report you submitted was resolved.',
};

const labelOf = (type: string) =>
  LABEL_OVERRIDES[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink],
  styleUrls: ['../../profile-shared.css'],
  styles: [`
    :host {
      display: block;
      color: var(--pf-text, #111827);
    }
    .np-search {
      background: var(--pf-surface-2, #f9fafb);
      border: 1px solid var(--pf-border, #e5e7eb);
      color: var(--pf-text, #111827);
      @apply w-full rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none transition;
    }
    .np-search:focus { border-color: var(--pf-accent, #7c3aed); }
    .np-search::placeholder { color: var(--pf-faint, #9ca3af); }

    .np-channel {
      background: var(--pf-surface-2, #f9fafb);
      border: 1px solid var(--pf-border, #e5e7eb);
      @apply rounded-xl p-4 flex items-start gap-3;
    }

    .np-group-head { @apply w-full flex items-center gap-3 px-5 py-4 text-left transition; }
    .np-group-head:hover { background: var(--pf-surface-2, #f9fafb); }
    .np-chevron { @apply w-4 h-4 transition-transform shrink-0; color: var(--pf-muted, #6b7280); }
    .np-chevron.open { transform: rotate(90deg); }

    .np-row {
      border-top: 1px solid var(--pf-border, #e5e7eb);
      @apply grid items-center gap-2 px-5 py-3;
      grid-template-columns: minmax(0, 1fr) repeat(4, 4.5rem);
    }
    .np-row:hover { background: var(--pf-surface-2, #f9fafb); }
    .np-colhead { @apply text-center text-[11px] font-medium; color: var(--pf-muted, #6b7280); }

    .np-switch {
      position: relative;
      width: 2.25rem; height: 1.25rem;
      border-radius: 9999px;
      background: var(--pf-border, #d1d5db);
      transition: background .2s;
      flex-shrink: 0;
    }
    .np-switch::after {
      content: '';
      position: absolute; top: 2px; left: 2px;
      width: 1rem; height: 1rem;
      border-radius: 9999px;
      background: #fff;
      box-shadow: 0 1px 2px rgb(0 0 0 / .25);
      transition: transform .2s;
    }
    .np-switch.on { background: var(--pf-accent, #7c3aed); }
    .np-switch.on::after { transform: translateX(1rem); }
    .np-switch:disabled { opacity: .35; cursor: not-allowed; }
    .np-switch:focus-visible { outline: 2px solid var(--pf-accent, #7c3aed); outline-offset: 2px; }

    .np-mini {
      color: var(--pf-text, #111827);
      background: var(--pf-surface, #fff);
      border: 1px solid var(--pf-border, #d1d5db);
      @apply text-[11px] font-medium rounded-md px-2.5 py-1 transition cursor-pointer;
    }
    .np-mini:hover { color: var(--pf-accent-text, #6d28d9); background: var(--pf-accent-soft, #ede9fe); border-color: var(--pf-accent, #7c3aed); }

    .np-savebar {
      background: var(--pf-surface, #fff);
      border: 1px solid var(--pf-border, #e5e7eb);
      box-shadow: 0 10px 30px -10px rgb(0 0 0 / .35);
      @apply sticky bottom-4 z-10 rounded-xl px-5 py-3 flex items-center justify-between gap-4;
    }

    @media (max-width: 640px) {
      .np-row { grid-template-columns: minmax(0, 1fr) repeat(4, 2.75rem); @apply px-3; }
    }
  `],
  template: `
    <div class="w-full space-y-4" [class.p-6]="!embedded">
      <a *ngIf="!embedded" routerLink="/profile" class="text-xs accent hover:underline">&larr; Back to profile</a>

      <!-- Header -->
      <div class="panel p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <span class="meta-icon">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" [attr.d]="channels[0].icon" /></svg>
            </span>
            <div>
              <p class="text-sm font-semibold">Notification preferences</p>
              <p class="muted text-xs mt-1 max-w-xl">
                Choose how each kind of update reaches you. These settings apply to you only; who receives
                reminders and when is set by your administrators.
              </p>
            </div>
          </div>
          <div class="relative w-full sm:w-64" *ngIf="!loading && !error">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 faint" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input type="search" class="np-search" placeholder="Search notifications" [value]="query"
              (input)="query = $any($event.target).value" aria-label="Search notifications">
          </div>
        </div>

        <!-- Channel overview -->
        <div *ngIf="!loading && !error" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div *ngFor="let c of channels" class="np-channel">
            <span class="meta-icon">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" [attr.d]="c.icon" /></svg>
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[13px] font-semibold">{{ c.label }}</p>
                <span class="pill" [class.pill-ok]="enabledCount(c.id) === totalTypes"
                  [class.pill-warn]="enabledCount(c.id) > 0 && enabledCount(c.id) < totalTypes"
                  [class.pill-neutral]="enabledCount(c.id) === 0">
                  {{ enabledCount(c.id) }}/{{ totalTypes }}
                </span>
              </div>
              <p class="faint text-[11px] mt-0.5">{{ c.hint }}</p>
              <div class="flex gap-2 mt-2">
                <button type="button" class="np-mini" (click)="setAll(c.id, true)">All on</button>
                <button type="button" class="np-mini" (click)="setAll(c.id, false)">All off</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="panel p-5 muted text-sm">Loading preferences…</div>
      <div *ngIf="error" class="panel p-5 flex items-center justify-between gap-4" role="alert">
        <p class="text-sm" style="color: var(--pf-warn, #b45309)">{{ error }}</p>
        <button type="button" class="btn-ghost" (click)="load()">Retry</button>
      </div>

      <ng-container *ngIf="!loading && !error">
        <div *ngIf="!emailAvailable" class="panel px-4 py-3 flex items-center gap-2 text-xs">
          <span class="pill pill-warn"><span class="dot"></span>Email off</span>
          <span class="muted">Email delivery is not configured on this system, so email options have no effect yet.</span>
        </div>

        <!-- Groups -->
        <div *ngFor="let group of visibleGroups()" class="panel overflow-hidden">
          <button type="button" class="np-group-head" (click)="toggleGroup(group.label)"
            [attr.aria-expanded]="isOpen(group.label)">
            <svg class="np-chevron" [class.open]="isOpen(group.label)" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <span class="text-[13px] font-semibold flex-1">{{ group.label }}</span>
            <span class="pill pill-neutral">{{ group.types.length }} type{{ group.types.length === 1 ? '' : 's' }}</span>
            <span *ngIf="mutedInGroup(group.types) as m" class="pill pill-warn">{{ m }} muted</span>
          </button>

          <ng-container *ngIf="isOpen(group.label)">
            <div class="np-row" style="padding-top: .5rem; padding-bottom: .5rem;">
              <span class="eyebrow">Notification</span>
              <span *ngFor="let c of channels" class="np-colhead">{{ c.label }}</span>
              <span class="np-colhead" title="Instead of one email per notification, get a single daily summary email. Off by default.">Daily summary</span>
            </div>
            <div *ngFor="let t of group.types" class="np-row">
              <div class="min-w-0">
                <p class="text-[13px] font-medium">{{ label(t) }}</p>
                <p class="faint text-[11px] leading-snug mt-0.5">{{ describe(t) }}</p>
              </div>
              <div *ngFor="let c of channels" class="flex justify-center">
                <button type="button" role="switch" class="np-switch" [class.on]="!isMuted(c.id, t) && !(c.id === 'email' && !emailAvailable)"
                  [disabled]="c.id === 'email' && !emailAvailable"
                  [attr.aria-checked]="!isMuted(c.id, t) && !(c.id === 'email' && !emailAvailable)" [attr.aria-label]="label(t) + ' ' + c.label"
                  (click)="setChannel(c.id, t, isMuted(c.id, t))"></button>
              </div>
              <div class="flex justify-center">
                <button type="button" role="switch" class="np-switch" [class.on]="emailAvailable && digest.has(t) && !isMuted('email', t)"
                  [disabled]="!emailAvailable || isMuted('email', t)" [attr.aria-checked]="digest.has(t)"
                  [attr.aria-label]="label(t) + ' email summary'"
                  (click)="setDigest(t, !digest.has(t))"></button>
              </div>
            </div>
          </ng-container>
        </div>

        <div *ngIf="!visibleGroups().length" class="empty">No notifications match “{{ query }}”.</div>

        <!-- Save bar -->
        <div class="np-savebar">
          <p class="text-xs" [class.muted]="!dirty">
            <ng-container *ngIf="dirty; else clean">
              <span class="pill pill-accent"><span class="dot"></span>Unsaved changes</span>
            </ng-container>
            <ng-template #clean>All changes saved</ng-template>
          </p>
          <div class="flex gap-2">
            <button type="button" class="btn-ghost" [disabled]="!dirty || saving" (click)="reset()">Discard</button>
            <button type="button" class="btn" [disabled]="!dirty || saving" (click)="save()">
              {{ saving ? 'Saving…' : 'Save preferences' }}
            </button>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class NotificationPreferencesComponent implements OnInit {
  /** True when shown inside the profile page's Notifications tab (no back link, no page padding). */
  @Input() embedded = false;

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
  query = '';
  totalTypes = 0;

  private open = new Set<string>();
  private snapshot = '';

  label = labelOf;
  describe = (t: string) => DESCRIPTIONS[t] ?? '';

  get dirty(): boolean {
    return !this.loading && this.serialize() !== this.snapshot;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.notifications.getPreferences().subscribe({
      next: (res) => {
        CHANNELS.forEach(({ id }) => (this.muted[id] = new Set(res.muted?.[id] ?? [])));
        this.digest = new Set(res.emailDigest ?? []);
        this.emailAvailable = res.emailAvailable;
        this.groups = this.buildGroups(res.types ?? []);
        this.totalTypes = this.groups.reduce((n, g) => n + g.types.length, 0);
        if (!this.open.size) this.groups.forEach((g) => this.open.add(g.label));
        this.snapshot = this.serialize();
        this.loading = false;
      },
      error: () => { this.loading = false; this.error = 'Could not load your notification preferences'; },
    });
  }

  visibleGroups() {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups
      .map((g) => ({ label: g.label, types: g.label.toLowerCase().includes(q) ? g.types : g.types.filter((t) => labelOf(t).toLowerCase().includes(q)) }))
      .filter((g) => g.types.length);
  }

  isOpen(label: string): boolean {
    return !!this.query.trim() || this.open.has(label);
  }

  toggleGroup(label: string): void {
    if (this.open.has(label)) this.open.delete(label); else this.open.add(label);
  }

  isMuted(channel: NotificationChannel, type: string): boolean {
    return this.muted[channel].has(type);
  }

  enabledCount(channel: NotificationChannel): number {
    return this.totalTypes - this.groups.reduce((n, g) => n + g.types.filter((t) => this.muted[channel].has(t)).length, 0);
  }

  mutedInGroup(types: string[]): number {
    return types.filter((t) => CHANNELS.some((c) => this.muted[c.id].has(t))).length;
  }

  setChannel(channel: NotificationChannel, type: string, on: boolean): void {
    if (on) this.muted[channel].delete(type); else this.muted[channel].add(type);
  }

  setAll(channel: NotificationChannel, on: boolean): void {
    this.groups.forEach((g) => g.types.forEach((t) => this.setChannel(channel, t, on)));
  }

  setDigest(type: string, on: boolean): void {
    if (on) this.digest.add(type); else this.digest.delete(type);
  }

  reset(): void {
    const s = JSON.parse(this.snapshot);
    CHANNELS.forEach(({ id }) => (this.muted[id] = new Set(s.muted[id])));
    this.digest = new Set(s.emailDigest);
  }

  save(): void {
    this.saving = true;
    this.notifications.savePreferences({
      muted: { inapp: [...this.muted.inapp], push: [...this.muted.push], email: [...this.muted.email] },
      emailDigest: [...this.digest],
    }).subscribe({
      next: () => { this.saving = false; this.snapshot = this.serialize(); this.toast.success('Notification preferences saved'); },
      error: (e) => { this.saving = false; this.toast.error(e?.error?.message ?? 'Could not save notification preferences'); },
    });
  }

  private serialize(): string {
    return JSON.stringify({
      muted: { inapp: [...this.muted.inapp].sort(), push: [...this.muted.push].sort(), email: [...this.muted.email].sort() },
      emailDigest: [...this.digest].sort(),
    });
  }

  /** Known groups first, then any type the server reports that no group lists, so new types always show up. */
  private buildGroups(serverTypes: string[]) {
    serverTypes = serverTypes.filter((t) => !HIDDEN.has(t));
    const known = new Set(GROUPS.flatMap((g) => g.types));
    const groups = GROUPS
      .map((g) => ({ label: g.label, types: g.types.filter((t) => serverTypes.includes(t)) }))
      .filter((g) => g.types.length);
    const other = serverTypes.filter((t) => !known.has(t));
    return other.length ? [...groups, { label: 'Other modules', types: other }] : groups;
  }
}
