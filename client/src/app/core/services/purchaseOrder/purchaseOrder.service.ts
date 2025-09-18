import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { PurchaseOrder } from 'src/app/shared/interfaces/purchase.interface';

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
    return this.http.get<PurchaseOrder>(`${this.baseUrl}/${id}`);
  }

  getAllPurchaseOrders(params?: {
    page?: number;
    row?: number;
    search?: string;
    status?: string[];
    purchaseId?: string;
  }): Observable<any> {
    return this.http.get<any>(this.baseUrl, { params: params as any });
  }

  deletePurchaseOrder(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  generatePONumber(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/generate-po-no`);
  }

  updatePurchaseOrderStatus(id: string, poStatus: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/status`, { poStatus });
  }

  updateSupplierInvoices(lpoId: string, data: { supplierInvoices: any[] }): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${lpoId}/supplier-invoices`, data);
  }
}
