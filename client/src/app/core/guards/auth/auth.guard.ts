import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { Location } from '@angular/common';

export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const token = <string>localStorage.getItem('employeeToken')
  const router: Router = inject(Router);
  if (!token) {
    router.navigate(['/login'])
    return false
  } 
  return true;
};
