import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EmployeeService } from '../../services/employee/employee.service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {

  private excludedUrls: string[] = [
    'https://latest.currency-api.pages.dev/v1/currencies/qar.min.json'
  ];

  constructor(private _employeeService: EmployeeService) { }
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

     const isExcludedUrl = this.excludedUrls.some(url => request.url.includes(url));

    if (isExcludedUrl) {
      return next.handle(request);
    }

    let token: string | null = this._employeeService.getToken()
    if (token) {
      const modifiedReq = request.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`
        }
      })
      return next.handle(modifiedReq)
    }

    return next.handle(request)
  }
}
