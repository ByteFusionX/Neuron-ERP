import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Generic field validators. First consumer is the supplier form; written to be reused by other
 * forms later. Each one lets an empty value pass, so pair with `Validators.required` where needed.
 */

/** Rejects values that are only whitespace (Validators.required lets "   " through). */
export function notBlankValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    return typeof value === 'string' && value.length > 0 && value.trim().length === 0 ? { blank: 'Cannot be only spaces' } : null;
  };
}

/** Phone numbers: digits with an optional leading +, spaces, dashes and brackets, 6-20 characters. */
export function phoneValidator(): ValidatorFn {
  const pattern = /^\+?[\d\s\-()]{6,20}$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (!value) return null;
    return pattern.test(value) && (value.match(/\d/g) || []).length >= 6 ? null : { phone: 'Enter a valid phone number' };
  };
}

/** Stricter than Angular's built-in email check, which accepts "a@b" with no domain suffix. */
export function strictEmailValidator(): ValidatorFn {
  const pattern = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (!value) return null;
    return pattern.test(value) ? null : { email: true };
  };
}

/** Whole numbers only (no decimals). */
export function integerValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    return Number.isInteger(Number(value)) ? null : { integer: 'Enter a whole number' };
  };
}

/** IBAN: 15-34 alphanumerics starting with a 2-letter country code and 2 check digits (spaces ignored). */
export function ibanValidator(): ValidatorFn {
  const pattern = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().replace(/\s+/g, '').toUpperCase();
    if (!value) return null;
    return pattern.test(value) ? null : { iban: 'Enter a valid IBAN (e.g. QA58DOHB00001234567890ABCDEFG)' };
  };
}

/** SWIFT/BIC: 8 or 11 characters (4 bank letters, 2 country letters, 2 location, optional 3 branch). */
export function swiftValidator(): ValidatorFn {
  const pattern = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().replace(/\s+/g, '').toUpperCase();
    if (!value) return null;
    return pattern.test(value) ? null : { swift: 'Enter a valid SWIFT/BIC code (8 or 11 characters)' };
  };
}
