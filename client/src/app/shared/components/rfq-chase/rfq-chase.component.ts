import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Observable, of, switchMap } from 'rxjs';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { SALES_RFQ_DECLINE_REASONS, SalesRfq, SalesRfqSupplier } from 'src/app/shared/interfaces/sales-rfq.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ModalService } from 'src/app/shared/components/modal';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { FollowUpCreateModalComponent, FollowUpModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/follow-up-create-modal.component';

interface ChaseHistoryItem {
  id: string;
  status: 'done' | 'cancelled';
  outcome: string;
  note: string;
  date: string;
  createdByName: string;
}

interface ChaseOpenItem {
  id: string;
  due: string;
  dueIso: string;
  overdue: boolean;
  note: string;
  auto: boolean;
}

/**
 * Chasing one supplier on one RFQ: sent, follow-ups, reply or decline. Used on the RFQ cards of both the
 * enquiry list (sales) and the presale list, so the two sides chase the same way.
 * The host decides whether chasing is allowed (`chaseable`) and refreshes its list on `changed`.
 */
@Component({
  selector: 'app-rfq-chase',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, DatePipe, ActionButtonComponent, DetailPanelIconComponent],
  template: `
    <div *ngIf="invite as inv" class="mt-2.5 space-y-2 border-t border-gray-100 pt-2.5 dark:border-erp-border-dark"
      (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()" (keydown.space)="$event.stopPropagation()">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span class="rounded-full border px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset" [ngClass]="statusClasses(inv.status)">
          {{ inv.status === 'Not Sent' ? 'Not sent to supplier' : inv.status === 'Sent' ? 'Sent · waiting for prices' : inv.status === 'Replied' ? 'Supplier replied' : 'Supplier declined' }}
        </span>
        <span *ngIf="inv.status === 'Sent' && inv.sentAt" class="text-gray-500 dark:text-gray-400">{{ inv.sentAt | date: 'dd MMM' }}<ng-container *ngIf="inv.sentVia"> via {{ inv.sentVia }}</ng-container></span>
        <span *ngIf="inv.status === 'Declined' && inv.declineReason" class="text-gray-500 dark:text-gray-400">{{ inv.declineReason }}</span>
      </div>
      <ng-container *ngIf="followUps as fu">
        <div *ngIf="fu.open as open" class="flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
          [ngClass]="open.overdue ? 'border-red-200 bg-red-50/60 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400' : 'border-sky-200 bg-sky-50/60 text-sky-800 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-300'">
          <span class="min-w-0">
            <span class="font-medium">Next follow-up {{ open.due }}</span><span *ngIf="open.overdue" class="ml-1.5 font-semibold">Overdue</span>
            <span *ngIf="open.note" class="block truncate text-[11px] opacity-80" [title]="open.note">{{ open.note }}</span>
          </span>
          <button *ngIf="chaseable" type="button" (click)="cancelFollowUp()" class="shrink-0 text-[11px] font-medium opacity-70 hover:opacity-100">Cancel</button>
        </div>
        <p *ngIf="!fu.open && inv.status === 'Sent' && chaseable" class="text-xs text-amber-700 dark:text-amber-400">No follow-up scheduled.</p>
        <ul *ngIf="fu.history.length" class="space-y-1">
          <li *ngFor="let h of fu.history" class="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <app-dp-icon [name]="h.status === 'cancelled' ? 'close' : 'check'" size="w-3.5 h-3.5" class="mt-px shrink-0"></app-dp-icon>
            <span class="min-w-0"><span class="font-medium text-gray-700 dark:text-gray-300">{{ h.outcome }}</span> · {{ h.date }}<ng-container *ngIf="h.createdByName"> · {{ h.createdByName }}</ng-container>
              <span *ngIf="h.note" class="block truncate" [title]="h.note">{{ h.note }}</span></span>
          </li>
        </ul>
      </ng-container>
      <div *ngIf="chaseable" class="flex flex-wrap gap-1.5">
        <app-action-button *ngIf="inv.status === 'Not Sent'" variant="outline" (click)="markSent()">Mark sent</app-action-button>
        <ng-container *ngIf="inv.status === 'Sent'">
          <app-action-button variant="outline" (click)="logFollowUp()">{{ followUps.open ? 'Mark done' : 'Log follow-up' }}</app-action-button>
          <app-action-button variant="outline" (click)="scheduleFollowUp()">{{ followUps.open ? 'Reschedule' : 'Schedule' }}</app-action-button>
        </ng-container>
        <app-action-button *ngIf="inv.status === 'Not Sent' || inv.status === 'Sent'" variant="outline" (click)="decline()">Declined</app-action-button>
      </div>
    </div>
  `,
})
export class RfqChaseComponent {
  @Input({ required: true }) rfq!: SalesRfq;
  /** False while the enquiry is locked to the other side, or once the RFQ is awarded, closed or cancelled. */
  @Input() allowed = true;
  /** Fires after any change, so the host re-reads its RFQ list. */
  @Output() changed = new EventEmitter<void>();

  private salesRfqService = inject(SalesRfqService);
  private confirm = inject(ConfirmDialogService);
  private modal = inject(ModalService);
  private toaster = inject(ToastrService);

  private cache = new WeakMap<object, { open: ChaseOpenItem | null; history: ChaseHistoryItem[] }>();
  /** True while one of this card's requests is in flight, so a stale button cannot fire twice. */
  private busy = false;

  /** An RFQ is raised for one supplier; this is that supplier's invite. */
  get invite(): SalesRfqSupplier | undefined {
    return this.rfq?.suppliers?.[0];
  }

  /** Still waiting on the supplier: nothing to chase once an RFQ is awarded, closed or cancelled. */
  get chaseable(): boolean {
    return this.allowed && ['Open', 'Quoted'].includes(this.rfq?.status);
  }

  statusClasses(status?: string): string {
    switch (status) {
      case 'Replied': return 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900';
      case 'Sent': return 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900';
      case 'Declined': return 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900';
      default: return 'bg-gray-100 text-gray-600 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700';
    }
  }

  /** The open chase and what already happened; memoized because the template reads it on every check. */
  get followUps() {
    const rfq = this.rfq;
    const key = (rfq.followUps || rfq) as object;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const list = rfq.followUps || [];
    const openEntry = list.find((f) => f.status === 'scheduled');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const due = openEntry?.dueDate ? new Date(openEntry.dueDate) : null;
    const open: ChaseOpenItem | null = openEntry && due ? {
      id: openEntry._id,
      due: this.displayDate(openEntry.dueDate),
      dueIso: due.toISOString().slice(0, 10),
      overdue: due < startOfToday,
      note: openEntry.note || '',
      auto: !!openEntry.auto,
    } : null;
    const history: ChaseHistoryItem[] = list
      .filter((f) => f.status !== 'scheduled')
      .sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())
      .slice(0, 4)
      .map((f) => ({
        id: f._id,
        status: f.status === 'cancelled' ? 'cancelled' as const : 'done' as const,
        outcome: f.status === 'cancelled' ? 'Follow-up cancelled' : (f.outcome || 'Follow-up'),
        note: (f.status === 'cancelled' ? f.cancelReason : f.note) || '',
        date: this.displayDate(f.completedAt || f.createdAt),
        createdByName: f.createdByName || '',
      }));
    const view = { open, history };
    this.cache.set(key, view);
    return view;
  }

  private displayDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private save(request: Observable<unknown>, successMessage: string): void {
    if (this.busy) return;
    this.busy = true;
    request.subscribe({
      next: () => {
        this.busy = false;
        this.toaster.success(successMessage);
        this.changed.emit();
      },
      error: (err) => {
        this.busy = false;
        this.toaster.error(err?.error?.message || 'Failed to update the RFQ');
      },
    });
  }

  async markSent(): Promise<void> {
    const invite = this.invite;
    if (!invite) return;
    const { confirmed, choice } = await this.confirm.open({
      tone: 'approve',
      title: 'Mark RFQ as sent',
      message: `Record that ${this.rfq.rfqNo} was sent to ${invite.supplierName}? A chase is booked automatically for the prices-needed-by date, or in 3 days.`,
      choices: ['Email', 'Phone', 'WhatsApp', 'Portal', 'In person'].map((v) => ({ value: v, label: v })),
      confirmLabel: 'Mark as sent',
    });
    if (!confirmed) return;
    this.save(this.salesRfqService.updateSupplier(this.rfq._id, invite._id, { status: 'Sent', sentVia: choice }), 'RFQ marked as sent');
  }

  scheduleFollowUp(): void {
    const invite = this.invite;
    const open = this.followUps.open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: `${this.rfq.rfqNo} · ${invite?.supplierName || ''}`, mode: 'schedule', dueDate: open?.dueIso || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') {
        this.save(this.salesRfqService.scheduleFollowUp(this.rfq._id, { dueDate: result.dueDate, note: result.note, inviteId: invite?._id }), 'Follow-up scheduled');
      }
    });
  }

  logFollowUp(): void {
    const invite = this.invite;
    const open = this.followUps.open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: `${this.rfq.rfqNo} · ${invite?.supplierName || ''}`, mode: 'complete', plannedFor: open?.due || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode !== 'complete') return;
      const body = { action: 'complete' as const, date: result.date, outcome: result.outcome, note: result.note, nextFollowUpDate: result.nextFollowUpDate };
      if (open) {
        this.save(this.salesRfqService.closeFollowUp(this.rfq._id, open.id, body), 'Follow-up logged');
        return;
      }
      // Nothing was scheduled: book one for today so the outcome is recorded, then close it straight away.
      this.save(
        this.salesRfqService.scheduleFollowUp(this.rfq._id, { dueDate: result.date, inviteId: invite?._id }).pipe(
          switchMap((res) => {
            const created = (res.data.followUps || []).filter((f) => f.status === 'scheduled').pop();
            return created ? this.salesRfqService.closeFollowUp(this.rfq._id, created._id, body) : of(res);
          }),
        ),
        'Follow-up logged',
      );
    });
  }

  async cancelFollowUp(): Promise<void> {
    const open = this.followUps.open;
    if (!open) return;
    const { confirmed, reason } = await this.confirm.open({
      tone: 'warning',
      title: 'Cancel Follow-up',
      message: 'Close this follow-up without logging an outcome?',
      details: [{ label: 'Planned for', value: open.due }],
      reason: 'optional',
      confirmLabel: 'Cancel follow-up',
      cancelLabel: 'Keep',
    });
    if (!confirmed) return;
    this.save(this.salesRfqService.closeFollowUp(this.rfq._id, open.id, { action: 'cancel', reason }), 'Follow-up cancelled');
  }

  async decline(): Promise<void> {
    const invite = this.invite;
    if (!invite) return;
    const { confirmed, choice, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Supplier declined',
      message: `${invite.supplierName} will not quote on ${this.rfq.rfqNo}. Open follow-ups for this supplier are closed.`,
      choices: SALES_RFQ_DECLINE_REASONS.map((v) => ({ value: v, label: v })),
      reason: 'optional',
      reasonLabel: 'Note',
      confirmLabel: 'Mark declined',
    });
    if (!confirmed) return;
    this.save(this.salesRfqService.updateSupplier(this.rfq._id, invite._id, { status: 'Declined', declineReason: choice, declineNote: reason }), 'Marked as declined');
  }
}
