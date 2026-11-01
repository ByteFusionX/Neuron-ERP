import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { JobHistoryResponse } from 'src/app/shared/interfaces/job-history.interface';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
export type StageKey = 'pr' | 'po' | 'grn' | 'dn' | 'invoice';
export interface StageLine {
  docId: string;
  docNo: string;
  description: string;
  totalQty: number;
  acceptedQty: number | null;
  rejectedQty: number | null;
  /** PR lines only: qty already on POs to that supplier. */
  poQty?: number;
  /** PO lines only: qty on a PO that has been approved. */
  approvedQty?: number;
  lineKey?: string;
  value: number;
  /** Supplier, or the client on a delivery note. */
  party: string;
  status: string;
}

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

  /** Line rows for each stage (PR, PO, GRN, DN) raised against the job. */
  getJobProcurement(jobId: string): Observable<{ success: boolean; data: Record<StageKey, StageLine[]> }> {
    return this.http.get<{ success: boolean; data: Record<StageKey, StageLine[]> }>(`${this.api}/job/procurement/${jobId}`, { context: context() });
  }
}
