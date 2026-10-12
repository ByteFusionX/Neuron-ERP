import { formatDate } from '@angular/common';

/** A follow-up task as the server stores it on a quotation or a presale job. */
export interface FollowUpTaskEntry {
  _id?: string;
  status?: 'scheduled' | 'done' | 'cancelled';
  dueDate?: string;
  date?: string;
  outcome?: string;
  note?: string;
  completedAt?: string;
  cancelReason?: string;
  createdByName?: string;
}

/** The follow-up block a record keeps: its tasks plus the next-date summary the lists filter on. */
export interface FollowUpBlockData {
  history?: FollowUpTaskEntry[];
  nextFollowUpDate?: string;
  lastActivityDate?: string;
  lastOutcome?: string;
}

export interface FollowUpHistoryItem {
  id: string;
  status: 'done' | 'cancelled';
  outcome: string;
  note: string;
  date: string;
  createdByName: string;
}

export interface FollowUpOpen {
  due: string;
  dueIso: string;
  overdue: boolean;
  note: string;
}

export interface FollowUpViewModel {
  open: FollowUpOpen | null;
  history: FollowUpHistoryItem[];
}

/** List views every follow-up list offers, mapped to the server's `followUpView` value. */
export const FOLLOW_UP_VIEW_IDS = ['overdue', 'today', 'upcoming'] as const;
export type FollowUpViewId = typeof FOLLOW_UP_VIEW_IDS[number];

const fmt = (value: string | undefined) => (value ? formatDate(value, 'dd MMM yyyy', 'en-US') : '');

/** Cell class for a Next follow-up column: red once the date has passed on a record still being chased. */
export function followUpCellClass(nextDate: string | undefined | null, closed: boolean): string | null {
  if (!nextDate || closed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(nextDate) < today ? 'font-semibold text-red-600 dark:text-red-400' : null;
}

export function buildFollowUpView(block: FollowUpBlockData | undefined | null, closed: boolean): FollowUpViewModel {
  const list = block?.history ?? [];
  const openEntry = list.find((entry) => entry.status === 'scheduled');
  // Records chased before tasks existed carry only the scalar date; treat it as the open follow-up.
  const dueRaw = openEntry?.dueDate || block?.nextFollowUpDate;
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const open: FollowUpOpen | null = dueDate && !closed ? {
    due: fmt(dueRaw),
    dueIso: formatDate(dueDate, 'yyyy-MM-dd', 'en-US'),
    overdue: dueDate < startOfToday,
    note: openEntry?.note || '',
  } : null;

  // Stored oldest-first; newest first on screen.
  const history = [...list]
    .reverse()
    .filter((entry) => entry.status !== 'scheduled')
    .sort((a, b) => new Date(b.completedAt || b.date || 0).getTime() - new Date(a.completedAt || a.date || 0).getTime())
    .map((entry): FollowUpHistoryItem => ({
      id: entry._id || '',
      status: entry.status === 'cancelled' ? 'cancelled' : 'done',
      outcome: entry.status === 'cancelled' ? 'Follow-up cancelled' : (entry.outcome || 'Follow-up'),
      note: (entry.status === 'cancelled' ? entry.cancelReason : entry.note) || '',
      date: fmt(entry.date),
      createdByName: entry.createdByName || '',
    }));
  return { open, history };
}

/**
 * Memoised per row: the grid templates call this on every change-detection tick, and returning fresh objects
 * would rebuild the cards and swallow in-flight clicks. Cached against the block reference and the closed flag.
 */
export function followUpViewer() {
  const cache = new WeakMap<object, { block: unknown; next: unknown; closed: boolean; view: FollowUpViewModel }>();
  return (row: object, block: FollowUpBlockData | undefined | null, closed: boolean): FollowUpViewModel => {
    const cached = cache.get(row);
    if (cached && cached.block === block?.history && cached.next === block?.nextFollowUpDate && cached.closed === closed) return cached.view;
    const view = buildFollowUpView(block, closed);
    cache.set(row, { block: block?.history, next: block?.nextFollowUpDate, closed, view });
    return view;
  };
}
