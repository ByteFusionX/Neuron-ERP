import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { JobHistoryResponse } from 'src/app/shared/interfaces/job-history.interface';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class JobHistoryService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getJobHistory(jobId: string): Observable<JobHistoryResponse> {
    return this.http.get<JobHistoryResponse>(`${this.api}/job/history/${jobId}`, { context: context() });
  }
}
