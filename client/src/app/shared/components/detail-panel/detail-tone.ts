/**
 * The detail panel's colour vocabulary. Modules classify their data semantically — "this number is bad",
 * "this status is active" — and never name a colour; the classes below are the single place a tone
 * becomes Tailwind. Adding a colour to a module is a bug: add a tone here instead.
 */
export type DetailTone = 'good' | 'warn' | 'bad' | 'info' | 'active' | 'neutral';

export interface DetailToneClasses {
  /** Pill background + text + ring, for badges. */
  chip: string;
  /** Solid fill, for the dot inside a badge or in front of a list item. */
  dot: string;
  /** Solid fill, for the filled part of a progress bar. */
  bar: string;
  /** Text colour, for a highlighted value. */
  text: string;
}

export const DETAIL_TONE: Record<DetailTone, DetailToneClasses> = {
  good: {
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  warn: {
    chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
  bad: {
    chip: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-300',
  },
  info: {
    chip: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
    dot: 'bg-sky-500',
    bar: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
  },
  active: {
    chip: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30',
    dot: 'bg-violet-500',
    bar: 'bg-violet-600',
    text: 'text-violet-700 dark:text-violet-300',
  },
  neutral: {
    chip: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/30',
    dot: 'bg-gray-400',
    bar: 'bg-gray-400',
    text: 'text-gray-700 dark:text-gray-300',
  },
};

/** Falls back to `neutral` so an unmapped tone renders rather than throwing. */
export function toneClasses(tone: DetailTone | undefined | null): DetailToneClasses {
  return DETAIL_TONE[tone as DetailTone] ?? DETAIL_TONE.neutral;
}
