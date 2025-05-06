import { AbstractControl, ValidatorFn } from '@angular/forms';

export function customerNoteValidator(selectedCutomerNote: string | null): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    const customerNote = control.value;
    if (!customerNote && !selectedCutomerNote) {
      return { 'noteRequired': true };
    }
    return null;
  };
}