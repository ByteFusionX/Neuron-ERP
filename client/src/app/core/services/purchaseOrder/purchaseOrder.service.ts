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

  getAllPurchaseOrders(): Observable<PurchaseOrder[]> {
    return this.http.get<PurchaseOrder[]>(this.baseUrl);
  }

  deletePurchaseOrder(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }
}
