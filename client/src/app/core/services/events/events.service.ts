import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EventsService {

  api: string = environment.api
  constructor(private http: HttpClient) { }

  newEvent(formData: FormData): Observable<{ message: string, event: any }> {
    return this.http.post<{ message: string, event: any }>(`${this.api}/events/new-event`, formData)
  }

  fetchEvents(collectionId: string): Observable<any> {
    return this.http.get<any>(`${this.api}/events/fetch/${collectionId}`)
  }
  eventStatus(eventId: string, status: string): Observable<any> {
    return this.http.patch(`${this.api}/events/status`, { eventId, status })
  }

  eventDelete(eventId: string): Observable<any> {
    return this.http.delete(`${this.api}/events/delete/${eventId}`)
  }

  eventFileDelete(eventId: string, fileName: string): Observable<any> {
    return this.http.delete(`${this.api}/events/${eventId}/file/${encodeURIComponent(fileName)}`)
  }
}
