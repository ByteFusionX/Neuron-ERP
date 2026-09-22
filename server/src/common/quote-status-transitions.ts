import { quoteStatus as S } from '../models/quotation.model';

/**
 * Allowed quote status moves. Forward moves follow the sales pipeline; anything that reopens a closed
 * quote (leaving Won/Lost) or steps back is only allowed with a reason (see `requiresReason`).
 * Draft is a save state, so a quote can only enter it on creation and never return to it.
 */
const TRANSITIONS: Record<string, string[]> = {
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

export const isKnownQuoteStatus = (status: unknown): status is S => Object.values(S).includes(status as S);

export const canTransitionQuoteStatus = (from: string, to: string): boolean => TRANSITIONS[from]?.includes(to) ?? false;

/** Losing, reopening a closed quote, or moving backwards in the pipeline must be explained. */
export const quoteStatusRequiresReason = (from: string, to: string): boolean => {
    if (to === S.Lost || from === S.Won || from === S.Lost) return true;
    const f = PIPELINE.indexOf(from as S);
    const t = PIPELINE.indexOf(to as S);
    return f !== -1 && t !== -1 && t < f;
};
