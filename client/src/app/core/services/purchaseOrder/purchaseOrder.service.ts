import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { PurchaseOrder } from 'src/app/shared/interfaces/purchase.interface';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class PurchaseOrderService {
  private baseUrl = `${environment.api}/purchase-orders`;

  constructor(private http: HttpClient) {}

  createPurchaseOrder(purchaseOrder: PurchaseOrder): Observable<any> {
    return this.http.post<any>(this.baseUrl, purchaseOrder);
  }

  updatePurchaseOrder(id: string, purchaseOrder: PurchaseOrder): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.baseUrl}/${id}`, purchaseOrder);
  }

  getPurchaseOrderById(id: string): Observable<PurchaseOrder> {
    return this.http.get<PurchaseOrder>(`${this.baseUrl}/${id}`, { context: context() });
  }

  getAllPurchaseOrders(params?: {
    page?: number;
    row?: number;
    search?: string;
    status?: string[];
    purchaseId?: string;
  }): Observable<any> {
    return this.http.get<any>(this.baseUrl, { params: params as any, context: context() });
  }

  deletePurchaseOrder(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  generatePONumber(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/generate-po-no`);
  }

  updatePurchaseOrderStatus(id: string, poStatus: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/status`, { poStatus }, { context: context() });
  }

  updateSupplierInvoices(lpoId: string, formData: FormData): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${lpoId}/supplier-invoices`, formData, { context: context() });
  }

  getSuppliersForPurchaseRequest(purchaseId: string, excludeLpoId?: string): Observable<any> {
    const params: any = {};
    if (excludeLpoId) {
      params.excludeLpoId = excludeLpoId;
    }
    return this.http.get<any>(`${this.baseUrl}/suppliers/${purchaseId}`, { params });
  }

  getItemsForPurchaseRequest(purchaseId: string, supplierId: string, excludeLpoId?: string): Observable<any> {
    const params: any = {};
    if (excludeLpoId) {
      params.excludeLpoId = excludeLpoId;
    }
    return this.http.get<any>(`${this.baseUrl}/items/${purchaseId}/${supplierId}`, { params });
  }

  reissuePurchaseOrder(lpoId: string, purchaseOrder: PurchaseOrder): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.baseUrl}/${lpoId}/reissue`, purchaseOrder);
  }

  approvePurchaseOrder(id: string, comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/approve`, { comment }, { context: context() });
  }

  rejectPurchaseOrder(id: string, comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/reject`, { comment }, { context: context() });
  }

  revokePurchaseOrder(id: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/${id}/revoke`, { context: context() });
  }
}
