import { getNextSequence, peekNextSequence } from '../models/counter.model';

/**
 * Document numbers of the form NT/<CODE>-<mm>-<yy>-<seq:4>. The sequence restarts every month.
 * A code can be shared by several documents (customer invoices both use INV), because
 * the counter is keyed by code and month only.
 */
const prefixFor = (code: string) => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    return { prefix: `NT/${code}-${mm}-${yy}`, key: `doc:${code}:${yy}${mm}` };
};

const format = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(4, '0')}`;

/** Takes the next number. Call only when the document is being saved. */
export const issueDocNo = async (code: string): Promise<string> => {
    const { prefix, key } = prefixFor(code);
    return format(prefix, await getNextSequence(key));
};

/** Shows the next number without using it up. */
export const peekDocNo = async (code: string): Promise<string> => {
    const { prefix, key } = prefixFor(code);
    return format(prefix, await peekNextSequence(key));
};
