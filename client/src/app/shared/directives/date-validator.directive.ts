import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, Validator, ValidatorFn, ValidationErrors } from '@angular/forms';

@Directive({
    selector: '[datePastDirective]',
    providers: [{ provide: NG_VALIDATORS, useExisting: datePastDirective, multi: true }],
    standalone: false
})
export class datePastDirective implements Validator {

  validate(control: AbstractControl): ValidationErrors | null {
    const isValid: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
        
      if (!control.value) {
        return null
      }

      const inputDate = new Date(control.value).setHours(0,0,0,0);
      const currentDate = new Date().setHours(0,0,0,0)


      if (inputDate < currentDate) {
          return { 'pastDate': true }; 
        } else {
          return null; 
      }
    };

    return isValid(control);
  }
}
