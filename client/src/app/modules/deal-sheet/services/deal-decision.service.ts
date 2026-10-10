import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';

import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';

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
