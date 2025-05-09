import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {

  api: string = environment.api
  constructor(private http: HttpClient) { }

  private purchaseJob = new BehaviorSubject<getJob | null>(null);
  selectedJob$ = this.purchaseJob.asObservable();

  setPurchaseJob(jobData: getJob) {
    this.purchaseJob.next(jobData)
  }

  getPurchases(params: {
    page?: number;
    row?: number;
    status?: string;
    category?: string;
    supplierType?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase`, params);
  }

}
