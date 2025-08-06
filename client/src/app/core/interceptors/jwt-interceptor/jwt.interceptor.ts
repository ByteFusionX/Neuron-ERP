import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { catchError, Observable, switchMap, throwError } from 'rxjs';
import { EmployeeService } from '../../services/employee/employee.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {

  private excludedUrls: string[] = [
    'https://latest.currency-api.pages.dev/v1/currencies/qar.min.json',
    `${environment.api}/employee/login`,
  ];

  constructor(private _employeeService: EmployeeService, private _router: Router, private _toastr: ToastrService) { }
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

     const isExcludedUrl = this.excludedUrls.some(url => request.url.includes(url));

    if (isExcludedUrl) {
      console.log('excluded url', request.url)
      return next.handle(request);
    }

    let token: string | null = this._employeeService.getToken()
    if (token) {
      const modifiedReq = request.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`
        }
      })
      return next.handle(modifiedReq).pipe(
        catchError(err => {
          if (err.status === 403) {
            this._toastr.error(err.error.message , 'Session Expired', {
              timeOut: 0,
              closeButton: true,
              tapToDismiss: true
            })
            localStorage.removeItem('employeeToken')
            this._router.navigate(['/login'])
          }
          return throwError(() => err);
        })
      );
    }

    return next.handle(request).pipe(
      catchError(err => {
        if (err.status === 401) {
          return this._employeeService.refreshToken().pipe(
            switchMap(() => {
              const newToken = this._employeeService.getToken();
              const retryReq = request.clone({
                setHeaders: {
                  'Authorization': `Bearer ${newToken}`
                }
              });
              return next.handle(retryReq);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }
}
