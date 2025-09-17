import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

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
            default:
              break;
          }
        }
        return throwError(() => error)
      })
    )
  }
}
