import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, filter } from 'rxjs';
import { getCreators } from 'src/app/shared/interfaces/employee.interface';
import { JobStatus, JobTable, allocateType, filterJob, getJob } from 'src/app/shared/interfaces/job.interface';
import { QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class JobService {

  constructor(private http: HttpClient) { }
  apiUrl = environment.api

  getJobs(filterData: filterJob): Observable<JobTable> {
    return this.http.post<JobTable>(`${this.apiUrl}/job/getJobs`, filterData)
  }

  downloadFile(fileName: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/file/download?file=${encodeURIComponent(fileName)}`,
      { responseType: 'blob', observe: 'events', reportProgress: true })
  }

  updateJobStatus(jobId: string, status: JobStatus): Observable<JobStatus> {
    return this.http.patch<JobStatus>(`${this.apiUrl}/job/status/${jobId}`, { status })
  }

  totalJobs(access?: string, userId?: string): Observable<{ total: number }> {
    return this.http.get<{ total: number }>(`${this.apiUrl}/job/total?access=${access}&userId=${userId}`)
  }

  getJobSalesPerson(): Observable<getCreators[]> {
    return this.http.get<getCreators[]>(`${this.apiUrl}/job/sales`)
  }

  deleteJob(data: { dataId: string, employeeId: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/job/delete`, data);
  }

  updateAllocateType(data: { id: string, jobId: string, allocationType: allocateType }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/job/updateAllocateType`, data)
  }
}
