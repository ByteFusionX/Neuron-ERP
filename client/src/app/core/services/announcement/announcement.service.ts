// announcement.service.ts
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { announcementGetData, announcementListQuery, announcementListResponse, announcementPostData } from 'src/app/shared/interfaces/announcement.interface';
import { environment } from 'src/environments/environment';
import { Socket } from 'ngx-socket-io';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class AnnouncementService {
  public message$: BehaviorSubject<any> = new BehaviorSubject({})
  /** Live counts for the top-bar badge; refreshed by every unfiltered list load. */
  readonly unread = signal(0);
  readonly pendingAck = signal(0);

  constructor(private http: HttpClient, private socket: Socket) { }


  readonly apiUrl = environment.api;

  createAnnouncement(data: announcementPostData,): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/announcement/addAnnouncement`, data, { context: context() });
  }

  // The server works out who is asking from the login token, so only the filters are sent
  // `silent` is for background loads (badge, popover) that shouldn't toast on failure
  getAnnouncement(query: announcementListQuery, silent = false): Observable<announcementListResponse> {
    let params = new HttpParams().set('page', query.page).set('row', query.row);
    if (query.search) params = params.set('search', query.search);
    if (query.filter) params = params.set('filter', query.filter);
    if (query.state) params = params.set('state', query.state);
    if (query.priority) params = params.set('priority', query.priority);
    if (query.type) params = params.set('type', query.type);
    return this.http.get<announcementListResponse>(`${this.apiUrl}/announcement/getAnnouncement`, {
      params,
      ...(silent ? { context: context() } : {}),
    }).pipe(
      tap((res) => this.setCounts(res))
    );
  }

  getAnnouncementById(id: string): Observable<announcementGetData> {
    return this.http.get<announcementGetData>(`${this.apiUrl}/announcement/getAnnouncement/${id}`, { context: context() });
  }

  /** Re-reads the unread / to-acknowledge counts for the badge. */
  refreshCounts(): void {
    this.getAnnouncement({ page: 1, row: 1 }, true).subscribe({ error: () => {} });
  }

  markAsViewed(announcementId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcement/markAsViewed`, { announcementId }).pipe(
      tap(() => this.unread.update((n) => Math.max(0, n - 1)))
    );
  }

  markAllAsViewed(): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcement/markAllAsViewed`, {}, { context: context() }).pipe(
      tap(() => this.unread.set(0))
    );
  }

  acknowledge(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcement/acknowledge/${id}`, {}, { context: context() }).pipe(
      tap(() => this.pendingAck.update((n) => Math.max(0, n - 1)))
    );
  }

  togglePin(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/announcement/togglePin/${id}`, {}, { context: context() });
  }

  deleteAnnouncement(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/announcement/deleteAnnouncement/${id}`, { context: context() });
  }

  private setCounts(res: announcementListResponse | null): void {
    if (!res) return;
    this.unread.set(res.unread ?? 0);
    this.pendingAck.set(res.pendingAck ?? 0);
  }
}
