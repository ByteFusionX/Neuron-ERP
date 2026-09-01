import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface CreateSupplierReturnPayload {
  grnId: string;
  itemIndex: number;
  qty?: number;
  logisticsType: 'SupplierPickup' | 'Courier' | 'NoPhysicalReturn';
  trackingRef?: string;
  courierName?: string;
  dispatchDate?: string;
}

export interface ResolveSupplierReturnPayload {
  qty?: number;
  resolutionType: 'Replacement' | 'AlternateSupplierSourcing' | 'CreditOnly' | 'Disposed';
  replacementPoId?: string;
  note?: string;
  invoiced?: boolean;
  poId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupplierReturnService {
  private baseUrl = `${environment.api}/supplier-return`;

  constructor(private http: HttpClient) {}

  createSupplierReturn(payload: CreateSupplierReturnPayload): Observable<any> {
    return this.http.post<any>(this.baseUrl, payload, { context: context() });
  }

  getSupplierReturns(params?: { grnId?: string; supplierId?: string; status?: string }): Observable<any> {
    return this.http.get<any>(this.baseUrl, { params: params as any, context: context() });
  }

  getSupplierReturnById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, { context: context() });
  }

  resolveSupplierReturn(id: string, payload: ResolveSupplierReturnPayload): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/resolve`, payload, { context: context() });
  }

  disputeSupplierReturn(id: string, payload: { disputeStatus: 'None' | 'SupplierDisputed' | 'DisputeResolved'; disputeNote?: string }): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/dispute`, payload, { context: context() });
  }
}
