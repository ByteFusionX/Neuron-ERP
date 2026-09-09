import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface CreateStockHoldPayload {
  grnId: string;
  itemIndex: number;
  qty?: number;
  logisticsType: 'PhysicalReturn' | 'SupplierPickup' | 'Courier' | 'NoPhysicalReturn';
  trackingRef?: string;
  courierName?: string;
  dispatchDate?: string;
}

export interface ResolveStockHoldPayload {
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
export class StockHoldService {
  private baseUrl = `${environment.api}/stock-hold`;

  constructor(private http: HttpClient) {}

  createStockHold(payload: CreateStockHoldPayload): Observable<any> {
    return this.http.post<any>(this.baseUrl, payload, { context: context() });
  }

  getStockHolds(params?: { grnId?: string; stockEntryId?: string; supplierId?: string; status?: string }): Observable<any> {
    return this.http.get<any>(this.baseUrl, { params: params as any, context: context() });
  }

  getStockHoldById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, { context: context() });
  }

  resolveStockHold(id: string, payload: ResolveStockHoldPayload): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/resolve`, payload, { context: context() });
  }

  disputeStockHold(id: string, payload: { disputeStatus: 'None' | 'SupplierDisputed' | 'DisputeResolved'; disputeNote?: string }): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/dispute`, payload, { context: context() });
  }
}
