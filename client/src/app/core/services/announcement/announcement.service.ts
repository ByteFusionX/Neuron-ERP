// announcement.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { announcementGetData, announcementPostData } from 'src/app/shared/interfaces/announcement.interface';
import { environment } from 'src/environments/environment';
import { Socket } from 'ngx-socket-io';

@Injectable({
  providedIn: 'root'
})
export class AnnouncementService {
  public message$: BehaviorSubject<any> = new BehaviorSubject({})

  constructor(private http: HttpClient, private socket: Socket) { }


  readonly apiUrl = environment.api;

  createAnnouncement(data: announcementPostData,): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/announcement/addAnnouncement`, data);
  }

  getAnnouncement(page: number, row: number,userCategoryId : string,userId : string): Observable<{ total: number, announcements: announcementGetData[] }> {
    return this.http.get<{ total: number, announcements: announcementGetData[] }>(`${this.apiUrl}/announcement/getAnnouncement?page=${page}&row=${row}&userCategoryId=${userCategoryId}&userId=${userId}`);
  }

  markAsViewed(announcementId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcement/markAsViewed`, { announcementId, userId });
  }

  deleteAnnouncement(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/announcement/deleteAnnouncement/${id}`);
  }
}
