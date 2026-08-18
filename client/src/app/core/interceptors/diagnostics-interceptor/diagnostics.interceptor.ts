import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { DiagnosticsBufferService } from '../../diagnostics/diagnostics-buffer.service';

/**
 * Logs failed HTTP requests (status >= 400 or network failure) into
 * DiagnosticsBufferService for bug reports (Phase 1, Step 3). Registered
 * as its own interceptor, separate from ErrorInterceptor, so existing
 * auth/toast/redirect behavior there is untouched.
 */
@Injectable()
export class DiagnosticsInterceptor implements HttpInterceptor {

  constructor(private diagnosticsBuffer: DiagnosticsBufferService) { }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        this.diagnosticsBuffer.pushNetworkError({
          method: request.method,
          url: request.urlWithParams,
          status: error.status,
          body: stringifyBody(error.error),
          timestamp: Date.now(),
        });
        return throwError(() => error);
      })
    );
  }
}

function stringifyBody(body: unknown): string {
  if (body == null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
