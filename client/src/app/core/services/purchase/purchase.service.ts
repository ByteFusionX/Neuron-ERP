import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { PurchaseData, PurchaseStatus } from 'src/app/shared/interfaces/purchase.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {

  api: string = environment.api
  constructor(private http: HttpClient) { }

  private purchaseJob = new BehaviorSubject<getJob | null>(null);
  selectedJob$ = this.purchaseJob.asObservable();

  private supplierDiscount = new BehaviorSubject<any>(null);
  supplierDiscount$ = this.supplierDiscount.asObservable()

  private purchaseFormData = new BehaviorSubject<any>(null)
  purchaseFormData$ = this.purchaseFormData.asObservable()

  setPurchaseJob(jobData: getJob) {
    this.purchaseJob.next(jobData)
  }

  setSupplierDiscount(discounts: any) {
    this.supplierDiscount.next(discounts)
  }

  setPurchaseFormData(formData: any) {
    this.purchaseFormData.next(formData)
  }

  getPurchaseNo(): any {
    return this.http.get<any>(`${this.api}/purchase/purchase-request/generate-purchase-no`)
  }

  getPurchases(params: {
    page?: number;
    row?: number;
    status?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase/purchase-requests`, params);
  }

  createPurchase(purchaseData: PurchaseData): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase/purchase-request`, purchaseData)
  }

  getPurchaseById(purchaseId: string): Observable<any> {
    return this.http.get(`${this.api}/purchase/purchase-request/${purchaseId}`)
  }

  updatePurchaseStatus(purchaseId: string, status: PurchaseStatus, userId: string, comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/status/${purchaseId}`, { status, userId, comment });
  }
}
