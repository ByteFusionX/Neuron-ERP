import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function rangeValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const salesRevenue = control.get('salesRevenue');
      const grossProfit = control.get('grossProfit');
  
      const validate = (group: AbstractControl | null) => {
        const target = parseInt(group?.get('targetValue')?.value);
        const critical = parseInt(group?.get('criticalRange')?.value);
        const moderate = parseInt(group?.get('moderateRange')?.value);
  
        if (critical >= target) {
          return { invalidCriticalRange: true };
        }
  
        if (moderate <= critical || moderate >= target) {
          return { invalidModerateRange: true };
        }
  
        return null;
      };
  
      const salesRevenueErrors = validate(salesRevenue);
      const grossProfitErrors = validate(grossProfit);
  
      if (salesRevenueErrors) {
        salesRevenue?.setErrors(salesRevenueErrors);
      } else {
        salesRevenue?.setErrors(null);
      }
  
      if (grossProfitErrors) {
        grossProfit?.setErrors(grossProfitErrors);
      } else {
        grossProfit?.setErrors(null);
      }
  
      return null; // Return null so that the errors are set directly on the form controls
    };
  }
  