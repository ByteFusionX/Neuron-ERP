import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { clearSessionStorage } from 'src/app/shared/utils/clear-session.util';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { normalizeApiError } from '../../errors/api-error';
import { EmployeeService } from '../../services/employee/employee.service';

// Set this to `true` in a request's HttpContext when the caller already shows its own
// error toast, so the global interceptor doesn't show a duplicate one for that request.
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

  // One refresh at a time: requests that 401 together share the same renewal, then each is retried.
  private refreshing$: Observable<{ token: string }> | null = null;

  constructor(private toast: ToastrService, private router: Router, private msalService: MsalService, private employeeService: EmployeeService) { }

  private isAuthCall(url: string): boolean {
    return /\/employee\/(refresh|login|login-microsoft|logout)(\?|$)/.test(url);
  }

  private endSession(): void {
    this.toast.warning('Your session has ended, please sign in again.');
    clearSessionStorage();
    // Keep MSAL's notion of the signed-in account in sync with the app session, otherwise a re-click of
    // "Continue with Microsoft" silently reuses the now-invalid session instead of prompting.
    this.msalService.instance.setActiveAccount(null);
    this.router.navigate(['/login']);
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // A failed renewal is handled once, by the request that triggered it.
        if (error.status === 401 && /\/employee\/refresh(\?|$)/.test(request.url)) return throwError(() => error);

        // Access token expired: renew it silently with the refresh cookie and replay the request once.
        if (error.status === 401 && !this.isAuthCall(request.url) && this.employeeService.getToken()) {
          this.refreshing$ ??= this.employeeService.refreshAccessToken().pipe(
            finalize(() => (this.refreshing$ = null)),
            shareReplay(1),
          );
          return this.refreshing$.pipe(
            switchMap(({ token }) => {
              localStorage.setItem('employeeToken', token);
              return next.handle(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
            }),
            catchError((retryError: HttpErrorResponse) => {
              if (retryError.status === 401) this.endSession();
              return throwError(() => retryError);
            }),
          );
        }
        if (error.error instanceof ErrorEvent) {
          console.error(error.error.message);
        } else {
          switch (error.status) {
            case 0:
              this.toast.warning('The server could not be reached. Your session may have ended; refresh and sign in again if the problem continues.')
              break;
            case 401:
              this.toast.warning('Access Denied, Please sign in again.')
              clearSessionStorage();
              // Keep MSAL's notion of the signed-in account in sync with the
              // app JWT — otherwise a re-click of "Continue with Microsoft"
              // silently reuses the now-invalid session instead of prompting.
              this.msalService.instance.setActiveAccount(null);
              this.router.navigate(['/login'])
              break;
            case 400:
            case 422:
            case 403:
            case 404:
            case 409:
            case 500:
              if (!request.context.get(SKIP_ERROR_TOAST)) {
                this.toast.error(normalizeApiError(error).message);
              }
              break;
            default:
              break;
          }
        }
        return throwError(() => error)
      })
    )
  }
}
