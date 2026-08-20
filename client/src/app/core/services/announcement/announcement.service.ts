// announcement.service.ts
import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { announcementGetData, announcementPostData } from 'src/app/shared/interfaces/announcement.interface';
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

  constructor(private http: HttpClient, private socket: Socket) { }


  readonly apiUrl = environment.api;

  createAnnouncement(data: announcementPostData,): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/announcement/addAnnouncement`, data, { context: context() });
  }

  getAnnouncement(page: number, row: number,userCategoryId : string,userId : string): Observable<{ total: number, announcements: announcementGetData[] }> {
    return this.http.get<{ total: number, announcements: announcementGetData[] }>(`${this.apiUrl}/announcement/getAnnouncement?page=${page}&row=${row}&userCategoryId=${userCategoryId}&userId=${userId}`);
  }

  markAsViewed(announcementId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcement/markAsViewed`, { announcementId, userId });
  }

  deleteAnnouncement(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/announcement/deleteAnnouncement/${id}`, { context: context() });
  }
}
