import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';

export const LoginGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const token = <string>localStorage.getItem('employeeToken')
  const router: Router = inject(Router);
  if (token) {
    router.navigate(['/home'])
    return false
  }
  return true;
};
