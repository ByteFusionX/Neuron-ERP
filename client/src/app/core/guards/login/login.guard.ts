import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Azure AD login is temporarily disabled in favor of employeeId/password login.
// Restore the MsalService-based check below to re-enable it.
// import { MsalService } from '@azure/msal-angular';
// export const LoginGuard: CanActivateFn = (route, state) => {
//   const authService: MsalService = inject(MsalService);
//   const router: Router = inject(Router);
//
//   if (authService.instance.getAllAccounts().length > 0) {
//     router.navigate(['/home']);
//     return false;
//   }
//
//   return true;
// };

export const LoginGuard: CanActivateFn = (route, state) => {
  const router: Router = inject(Router);
  const token = localStorage.getItem('employeeToken');

  if (token) {
    router.navigate(['/home']);
    return false;
  }

  return true;
};
