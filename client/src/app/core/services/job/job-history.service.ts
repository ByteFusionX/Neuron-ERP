import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { JobHistoryResponse } from 'src/app/shared/interfaces/job-history.interface';

@Injectable({
  providedIn: 'root'
})
export class JobHistoryService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getJobHistory(jobId: string): Observable<JobHistoryResponse> {
    return this.http.get<JobHistoryResponse>(`${this.api}/job/history/${jobId}`);
  }
}
