import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';

import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DealWaiting } from 'src/app/shared/interfaces/quotation.interface';

/** Deal statuses; 'pending' is only ever a starting point. */
export const DEAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export interface DealDecisionResult {
  status: Exclude<DealStatus, 'pending'>;
  reason: string;
}

/**
 * The one Approve / Reject prompt for deal sheets (note optional for approval, required for a rejection),
 * shared by the list and the full deal-sheet page. Uses the same confirm dialog as presale reject/send.
 * Emits null when the user cancels, closes the dialog or presses Esc.
 */
@Injectable({ providedIn: 'root' })
export class DealDecisionService {
  private confirm = inject(ConfirmDialogService);

  ask(
    target: Exclude<DealStatus, 'pending'>,
    dealId?: string,
  ): Observable<DealDecisionResult | null> {
    const approving = target === 'approved';
    return from(
      this.confirm.open({
        tone: approving ? 'approve' : 'reject',
        title: approving ? 'Approve deal?' : 'Reject deal?',
        message: approving
          ? `Deal sheet ${dealId ?? ''} will be approved.`
          : `Deal sheet ${dealId ?? ''} goes back to the salesperson with your reason.`,
        reason: approving ? 'optional' : true,
        reasonLabel: approving ? 'Note' : 'Reason for rejection',
        reasonMaxLength: 500,
        confirmLabel: approving ? 'Approve' : 'Reject',
        cancelLabel: 'Cancel',
      }),
    ).pipe(
      map(({ confirmed, reason }) =>
        confirmed ? { status: target, reason: reason ?? '' } : null,
      ),
    );
  }
}

/** "Waiting on Sales Manager · due 14:20 (in 1 min)" for a pending deal; empty when nothing is pending. */
export function describeDealWaiting(waiting?: DealWaiting | null, now = Date.now()): string {
  if (!waiting) return '';
  const who = waiting.escalated ? `${waiting.roleName} (escalated)` : waiting.roleName;
  if (!waiting.dueAt) return `Waiting on ${who}`;
  const due = new Date(waiting.dueAt);
  const mins = Math.round((due.getTime() - now) / 60000);
  const clock = due.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const left = mins < 0 ? 'overdue' : mins < 60 ? `in ${mins} min` : mins < 24 * 60 ? `in ${Math.round(mins / 60)} h` : `in ${Math.round(mins / 1440)} d`;
  return `Waiting on ${who} · due ${clock} (${left})`;
}

/** Whether this user is the one the pending deal is currently waiting on (Super Admin can always act). */
export function canDecideDeal(waiting: DealWaiting | null | undefined, user: { _id?: string; roleId?: string; isSuperAdmin: boolean }): boolean {
  if (user.isSuperAdmin || !waiting) return true;
  return (!!user.roleId && waiting.roleIds.includes(user.roleId)) || (!!user._id && waiting.approverIds.includes(user._id));
}
