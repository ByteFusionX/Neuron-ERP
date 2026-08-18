import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { EmployeeService } from '../../services/employee/employee.service';

// Attaches the self-issued employeeId/password JWT (from localStorage) to outgoing
// requests. Pairs with jwt.middleware.ts on the server. This replaces MsalInterceptor
// while Azure AD login is temporarily disabled — see app.config.ts.
@Injectable()
export class JwtInterceptor implements HttpInterceptor {

  private excludedUrls: string[] = [
    'https://latest.currency-api.pages.dev/v1/currencies/qar.min.json',
    // Presigned Wasabi/S3 upload URLs (Phase 2, Step 8) already carry their own
    // query-string signature — attaching our Bearer token here would give the
    // request two conflicting auth mechanisms and Wasabi would reject it.
    'wasabisys.com'
  ];

  constructor(private _employeeService: EmployeeService) { }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const isExcludedUrl = this.excludedUrls.some(url => request.url.includes(url));

    if (isExcludedUrl) {
      return next.handle(request);
    }

    const token: string | null = this._employeeService.getToken();
    if (token) {
      const modifiedReq = request.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`
        }
      });
      return next.handle(modifiedReq).pipe(
        catchError((err) => {
          if (err.status === 401) {
            localStorage.removeItem('employeeToken');
          }
          return throwError(() => err);
        })
      );
    }

    return next.handle(request);
  }
}
