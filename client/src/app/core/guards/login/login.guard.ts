import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

export const LoginGuard: CanActivateFn = (route, state) => {
  const authService: MsalService = inject(MsalService);
  const router: Router = inject(Router);

  if (authService.instance.getAllAccounts().length > 0) {
    router.navigate(['/home']);
    return false;
  }

  return true;
};