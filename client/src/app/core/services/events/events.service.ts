import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EventsService {

  api: string = environment.api
  constructor(private http: HttpClient, private msalService: MsalService) { }

  // Azure token for the server's on-behalf-of Graph call. The Authorization header
  // carries the ERP JWT, so this goes in its own header. Silent first, popup only if interaction is required;
  // returns null when there is no Microsoft session so non-synced calls are unaffected.
  private azureHeaders(signInIfNeeded = false): Observable<HttpHeaders | undefined> {
    const account = this.msalService.instance.getActiveAccount() || this.msalService.instance.getAllAccounts()[0];
    if (!account && !signInIfNeeded) {
      return of(undefined);
    }
    if (!account) {
      // Signed in with ERP credentials only: ask for a Microsoft sign-in so the event can reach Outlook.
      return this.msalService.loginPopup({ scopes: [environment.microsoftApiUrl] }).pipe(
        map((result) => {
          this.msalService.instance.setActiveAccount(result.account);
          return new HttpHeaders({ 'X-Azure-Token': result.accessToken });
        }),
        catchError(() => of(undefined))
      );
    }
    return this.msalService.acquireTokenSilent({ scopes: [environment.microsoftApiUrl], account }).pipe(
      map((result) => new HttpHeaders({ 'X-Azure-Token': result.accessToken })),
      // Expired session: ask for a fresh token with a popup, then give up quietly.
      catchError((error) => error instanceof InteractionRequiredAuthError
        ? this.msalService.acquireTokenPopup({ scopes: [environment.microsoftApiUrl], account }).pipe(
            map((result) => new HttpHeaders({ 'X-Azure-Token': result.accessToken })),
            catchError(() => of(undefined))
          )
        : of(undefined))
    );
  }

  newEvent(formData: FormData, syncToOutlook = false): Observable<{ message: string, event: any, outlookWarning?: string }> {
    const url = `${this.api}/events/new-event`;
    if (!syncToOutlook) {
      return this.http.post<{ message: string, event: any }>(url, formData)
    }
    // No sign-in popup: with no Microsoft session the server uses its app-only fallback.
    return this.azureHeaders().pipe(
      switchMap((headers) => this.http.post<{ message: string, event: any, outlookWarning?: string }>(url, formData, { headers }))
    )
  }

  fetchEvents(collectionId: string): Observable<any> {
    return this.http.get<any>(`${this.api}/events/fetch/${collectionId}`)
  }
  eventStatus(eventId: string, status: string): Observable<any> {
    return this.http.patch(`${this.api}/events/status`, { eventId, status })
  }

  eventDelete(eventId: string): Observable<any> {
    return this.azureHeaders().pipe(
      switchMap((headers) => this.http.delete(`${this.api}/events/delete/${eventId}`, { headers }))
    )
  }

  // Edit an event; the server mirrors the change to Outlook when it was synced.
  eventUpdate(eventId: string, changes: Record<string, any>): Observable<{ message: string, event: any, outlookWarning?: string }> {
    return this.azureHeaders().pipe(
      switchMap((headers) => this.http.patch<{ message: string, event: any, outlookWarning?: string }>(`${this.api}/events/update/${eventId}`, changes, { headers }))
    )
  }

  eventFileDelete(eventId: string, fileName: string): Observable<any> {
    return this.http.delete(`${this.api}/events/${eventId}/file/${encodeURIComponent(fileName)}`)
  }
}
