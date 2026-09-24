export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'progress' | 'neutral';

export interface StatusHistoryEntry {
  status: string;
  at?: string | Date;
  by?: string;
  comment?: string;
}

/** Tailwind classes per tone: pill (bg/text/border), dot, solid (stepper node). */
export const STATUS_TONE_CLASSES: Record<StatusTone, { pill: string; dot: string; solid: string; line: string }> = {
  success:  { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', solid: 'bg-emerald-500 border-emerald-500 text-white', line: 'bg-emerald-400' },
  danger:   { pill: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500',     solid: 'bg-red-500 border-red-500 text-white',         line: 'bg-red-400' },
  warning:  { pill: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   solid: 'bg-amber-500 border-amber-500 text-white',     line: 'bg-amber-400' },
  info:     { pill: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500',     solid: 'bg-sky-500 border-sky-500 text-white',         line: 'bg-sky-400' },
  progress: { pill: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500',  solid: 'bg-violet-600 border-violet-600 text-white',   line: 'bg-violet-400' },
  neutral:  { pill: 'bg-gray-100 text-gray-700 border-gray-200',         dot: 'bg-gray-400',    solid: 'bg-gray-400 border-gray-400 text-white',       line: 'bg-gray-300' },
};

// Order matters: first match wins ("not delivered" must hit danger before "delivered" hits success).
const TONE_RULES: [RegExp, StatusTone][] = [
  [/\b(not|un)[ -]?(ordered|delivered|paid|approved)|reject|cancel|declin|lost|fail|overdue|expired|void|block/i, 'danger'],
  [/partial|hold|pending|await|draft|review|revision|waiting/i, 'warning'],
  [/progress|processing|ordered|issued|sent|submitted|dispatch|transit|presale|quoted/i, 'progress'],
  [/approv|complet|deliver|received|won|paid|closed|done|active|fully|success|accepted/i, 'success'],
  [/new|open|created|initiated|info/i, 'info'],
];

/** Enquiry statuses whose tone the generic rules would not pick (or would pick differently). */
export const ENQUIRY_STATUS_TONES: Record<string, StatusTone> = {
  'New': 'info',
  'In Review': 'warning',
  'Sent to Presales': 'progress',
  'Ready for Quotation': 'success',
  'Work In Progress': 'warning',
  'Assigned To Presale Manager': 'progress',
  'Assigned To Presale Engineer': 'progress',
  'Assigned To Presales': 'progress',
  'Rejected by Presale Engineer': 'danger',
  'Rejected by Presale Manager': 'danger',
  'Quoted': 'success',
  'Lost': 'danger',
};

export function statusTone(status: unknown, overrides?: Record<string, StatusTone>): StatusTone {
  if (status === null || status === undefined || status === '') return 'neutral';
  const s = String(status).trim();
  const override = overrides?.[s] ?? overrides?.[s.toLowerCase()];
  if (override) return override;
  return TONE_RULES.find(([re]) => re.test(s))?.[1] ?? 'neutral';
}

export function statusLabel(status: unknown): string {
  if (status === null || status === undefined || status === '') return '—';
  return String(status).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
