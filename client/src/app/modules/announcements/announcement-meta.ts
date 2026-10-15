import { announcementGetData, AnnouncementPriority, AnnouncementState, AnnouncementType } from 'src/app/shared/interfaces/announcement.interface';

export interface AnnouncementOption<T extends string> {
  value: T;
  label: string;
  icon: string;
  /** Chip colours (light + dark). */
  chip: string;
}

export const PRIORITY_OPTIONS: AnnouncementOption<AnnouncementPriority>[] = [
  { value: 'normal', label: 'Normal', icon: 'heroInformationCircle', chip: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'important', label: 'Important', icon: 'heroExclamationCircle', chip: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900' },
  { value: 'urgent', label: 'Urgent', icon: 'heroExclamationTriangle', chip: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900' },
];

export const TYPE_OPTIONS: AnnouncementOption<AnnouncementType>[] = [
  { value: 'general', label: 'General', icon: 'heroMegaphone', chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { value: 'policy', label: 'Policy', icon: 'heroShieldCheck', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  { value: 'event', label: 'Event', icon: 'heroCalendarDays', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { value: 'celebration', label: 'Celebration', icon: 'heroSparkles', chip: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300' },
  { value: 'maintenance', label: 'Maintenance', icon: 'heroWrenchScrewdriver', chip: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
];

export const STATE_META: Record<AnnouncementState, { label: string; chip: string }> = {
  active: { label: 'Live', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  scheduled: { label: 'Scheduled', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  draft: { label: 'Draft', chip: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  expired: { label: 'Expired', chip: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

/** Left-edge accent on list rows, so urgent items stand out while scanning. */
export const PRIORITY_ACCENT: Record<AnnouncementPriority, string> = {
  normal: 'border-l-transparent',
  important: 'border-l-amber-400',
  urgent: 'border-l-red-500',
};

export const priorityOf = (a: Pick<announcementGetData, 'priority'>) =>
  PRIORITY_OPTIONS.find((o) => o.value === (a.priority || 'normal'))!;

export const typeOf = (a: Pick<announcementGetData, 'type' | 'celeb'>) =>
  TYPE_OPTIONS.find((o) => o.value === (a.type || (a.celeb ? 'celebration' : 'general')))!;

export const publishDateOf = (a: Pick<announcementGetData, 'publishAt' | 'date'>) => a.publishAt || a.date;

export const initialsOf = (name?: string) =>
  (name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
