import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Loose "something@something.tld" check; blank is treated as valid so optional fields stay optional. */
export function isValidEmail(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return !text || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

/** True when a `yyyy-mm-dd` date is before today (local time). Blank or unparsable is not "past". */
export function isPastDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

/** Rejects text that is only spaces, which `Validators.required` lets through. Pair it with `Validators.required`.
 * The error is a string so smart-form fields show it as is. */
export const notBlankValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  return typeof value === 'string' && value.length > 0 && !value.trim() ? { notBlank: 'This field is required' } : null;
};

/** Rejects a `yyyy-mm-dd` date earlier than today, for dates that must point forward (follow-ups, deadlines). */
export const notPastDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  isPastDate(control.value) ? { notPast: 'Pick today or a later date' } : null;

/** Local calendar date `days` from today as yyyy-MM-dd (negative = past). */
export function isoDateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Keeps a `yyyy-mm-dd` date inside [min, max] (either may be omitted). Blank passes; pair with `Validators.required`. */
export function dateRangeValidator(min?: string, max?: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = String(control.value ?? '').slice(0, 10);
    if (!v) return null;
    if (min && v < min) return { dateRange: 'Date is too far in the past' };
    if (max && v > max) return { dateRange: 'Date cannot be in the future' };
    return null;
  };
}
