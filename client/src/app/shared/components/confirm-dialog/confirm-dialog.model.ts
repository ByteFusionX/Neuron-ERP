export type ConfirmTone = 'approve' | 'reject' | 'warning' | 'note';

export interface ConfirmDetail {
  label: string;
  value: string;
}

export interface ConfirmConfig {
  tone: ConfirmTone;
  title: string;
  /** Plain statement of what will happen, e.g. "The customer will be invoiced QAR 12,000." */
  message: string;
  /** Key facts the user should check before confirming (record, amount, recipient). */
  details?: ConfirmDetail[];
  /** Emphasised line under the message, e.g. "This cannot be undone." */
  consequence?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Show a reason box; `true` makes it required before confirming. */
  reason?: boolean | 'optional';
  reasonLabel?: string;
  /** User must type this exact text (e.g. a record number) to enable the confirm button. */
  typeToConfirm?: string;
  /** Note tone only: hide the cancel button and show a single acknowledge button. */
  acknowledgeOnly?: boolean;
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

export const CONFIRM_TONES: Record<ConfirmTone, { confirmLabel: string; icon: string; iconBox: string; button: string }> = {
  approve: {
    confirmLabel: 'Approve',
    icon: 'M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z',
    iconBox: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900',
    button: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600',
  },
  reject: {
    confirmLabel: 'Reject',
    icon: 'M5.3 5.3a1 1 0 011.4 0L10 8.59l3.3-3.3a1 1 0 111.4 1.42L11.42 10l3.3 3.3a1 1 0 01-1.42 1.4L10 11.42l-3.3 3.3a1 1 0 01-1.4-1.42L8.58 10l-3.3-3.3a1 1 0 010-1.4z',
    iconBox: 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900',
    button: 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600',
  },
  warning: {
    confirmLabel: 'Continue',
    icon: 'M8.26 3.1c.77-1.33 2.7-1.33 3.47 0l6.02 10.4c.77 1.34-.19 3-1.73 3H3.97c-1.54 0-2.5-1.66-1.73-3L8.26 3.1zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 8a1 1 0 100-2 1 1 0 000 2z',
    iconBox: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900',
    button: 'bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-600',
  },
  note: {
    confirmLabel: 'Got it',
    icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-2 3a1 1 0 112 0v4a1 1 0 11-2 0v-4z',
    iconBox: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900',
    button: 'bg-violet-700 hover:bg-violet-800 focus-visible:outline-violet-700',
  },
};
