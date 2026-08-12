import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { Location } from '@angular/common';

// Azure AD login is temporarily disabled in favor of employeeId/password login.
// Restore the MsalService-based check below to re-enable it.
// import { MsalService } from '@azure/msal-angular';
// export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
//   const authService: MsalService = inject(MsalService);
//   const router: Router = inject(Router);
//
//   if (!authService.instance.getAllAccounts().length) {
//     router.navigate(['/login']);
//     return false;
//   }
//
//   return true;
// };

export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const token = <string>localStorage.getItem('employeeToken')
  const router: Router = inject(Router);
  if (!token) {
    router.navigate(['/login'])
    return false
  }
  return true;
};
