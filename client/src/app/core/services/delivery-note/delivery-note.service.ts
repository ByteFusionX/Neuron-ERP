import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DeliveryNoteService {
  private apiUrl = `${environment.api}/delivery-note`;

  constructor(private http: HttpClient) { }

  generateDnNumber(): Observable<{ dnNumber: string }> {
    return this.http.get<{ dnNumber: string }>(`${this.apiUrl}/generate-dn-number`);
  }

  createDn(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}`, data);
  }

  getDnsByJobId(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/job/${jobId}`);
  }

  getAllDeliveryNotes(filter: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/get`, filter);
  }

  getDnById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  cancelDn(id: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/cancel`, {});
  }
}
