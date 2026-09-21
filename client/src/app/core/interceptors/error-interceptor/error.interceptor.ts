import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { normalizeApiError } from '../../errors/api-error';

// Set this to `true` in a request's HttpContext when the caller already shows its own
// error toast, so the global interceptor doesn't show a duplicate one for that request.
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

  constructor(private toast: ToastrService, private router: Router, private msalService: MsalService) { }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.error instanceof ErrorEvent) {
          console.error(error.error.message);
        } else {
          switch (error.status) {
            case 0:
              this.toast.warning('Failed to connect to the server, Please check your internet connection and try again.')
              break;
            case 401:
              this.toast.warning('Access Denied, Please sign in again.')
              localStorage.clear();
              sessionStorage.clear();
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
