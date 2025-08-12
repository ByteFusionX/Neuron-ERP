import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { Location } from '@angular/common';
import { MsalService } from '@azure/msal-angular';

export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService: MsalService = inject(MsalService);
  const router: Router = inject(Router);

  if (!authService.instance.getAllAccounts().length) {
    router.navigate(['/login']);
    return false;
  }
  
  return true;
};
