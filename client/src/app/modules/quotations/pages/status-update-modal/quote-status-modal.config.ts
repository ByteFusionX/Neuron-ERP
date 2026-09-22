import { StatusChangeModalData } from 'src/app/shared/components/status-change-modal/status-change-modal.component';
import { QuoteStatus as S } from 'src/app/shared/interfaces/quotation.interface';

/** Mirrors the server's `quote-status-transitions.ts`; the server is the authority. */
const TRANSITIONS: Partial<Record<S, S[]>> = {
  [S.Draft]: [S.WorkInProgress, S.Lost],
  [S.WorkInProgress]: [S.ReadyForSubmission, S.QuoteSubmitted, S.Lost],
  [S.ReadyForSubmission]: [S.WorkInProgress, S.QuoteSubmitted, S.Lost],
  [S.QuoteSubmitted]: [S.UnderReview, S.UnderNegotiation, S.Won, S.Lost],
  [S.UnderReview]: [S.UnderNegotiation, S.QuoteSubmitted, S.Won, S.Lost],
  [S.UnderNegotiation]: [S.UnderReview, S.QuoteSubmitted, S.Won, S.Lost],
  [S.Won]: [S.UnderNegotiation, S.Lost],
  [S.Lost]: [S.WorkInProgress, S.QuoteSubmitted, S.UnderNegotiation],
};

const PIPELINE = [S.Draft, S.WorkInProgress, S.ReadyForSubmission, S.QuoteSubmitted, S.UnderReview, S.UnderNegotiation];

export function canSelectQuoteStatus(current: S, target: S): boolean {
  return TRANSITIONS[current]?.includes(target) ?? false;
}

function needsReason(current: S, target: S): boolean {
  if (target === S.Lost || current === S.Won || current === S.Lost) return true;
  const c = PIPELINE.indexOf(current);
  const t = PIPELINE.indexOf(target);
  return c !== -1 && t !== -1 && t < c;
}

/** Quotation rules for the shared `app-status-change-modal`. */
export function quoteStatusModalData(currentStatus: S, targetStatus?: S): StatusChangeModalData<S> {
  const statuses = Object.values(S).filter((s) => s !== S.Expired);
  const reopening = currentStatus === S.Won || currentStatus === S.Lost;
  return {
    currentStatus,
    targetStatus,
    statuses,
    canSelect: canSelectQuoteStatus,
    requireReasonFor: statuses.filter((s) => needsReason(currentStatus, s)),
    reasonLabels: {
      [S.Lost]: { label: 'Reason for losing', placeholder: 'Why did we lose this quote?' },
      ...(reopening ? Object.fromEntries(statuses.filter((s) => s !== S.Lost).map((s) => [s, { label: 'Reason for reopening', placeholder: `Why is this ${currentStatus} quote being reopened?` }])) : {}),
    },
    warnings: currentStatus === S.Won
      ? { [S.UnderNegotiation]: 'This removes the deal sheet and LPO files from the quote. Not allowed once the deal sheet is approved.', [S.Lost]: 'This removes the deal sheet and LPO files from the quote. Not allowed once the deal sheet is approved.' }
      : { [S.Won]: 'Upload the customer LPO next, then raise the deal sheet to continue the handover.' },
    subtitle: "Record the customer's response. Quote content is not changed.",
  };
}
