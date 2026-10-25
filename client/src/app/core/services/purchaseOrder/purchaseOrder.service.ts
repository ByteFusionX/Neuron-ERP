import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
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
    return this.http.post<any>(this.baseUrl, purchaseOrder, { context: context() });
  }

  updatePurchaseOrder(id: string, purchaseOrder: PurchaseOrder): Observable<PurchaseOrder> {
    return this.http.put<PurchaseOrder>(`${this.baseUrl}/${id}`, purchaseOrder);
  }

  getPurchaseOrderById(id: string): Observable<PurchaseOrder> {
    return this.http.get<PurchaseOrder>(`${this.baseUrl}/${id}`, { context: context() });
  }

  getPurchaseOrderByPoNo(poNo: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/by-po-no/${encodeURIComponent(poNo)}`, { context: context() });
  }

  getAllPurchaseOrders(params?: {
    page?: number;
    row?: number;
    search?: string;
    status?: string[];
    purchaseId?: string;
    jobId?: string;
    receiptStatus?: string;
    vendorBills?: boolean;
    readyToDeliver?: boolean;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.page !== undefined) httpParams = httpParams.set('page', params.page);
    if (params?.row !== undefined) httpParams = httpParams.set('row', params.row);
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.purchaseId) httpParams = httpParams.set('purchaseId', params.purchaseId);
    if (params?.jobId) httpParams = httpParams.set('jobId', params.jobId);
    if (params?.receiptStatus) httpParams = httpParams.set('receiptStatus', params.receiptStatus);
    if (params?.vendorBills) httpParams = httpParams.set('vendorBills', 'true');
    if (params?.readyToDeliver) httpParams = httpParams.set('readyToDeliver', 'true');
    params?.status?.forEach((status) => {
      httpParams = httpParams.append('status', status);
    });
    return this.http.get<any>(this.baseUrl, { params: httpParams, context: context() });
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

  /** Approved → Placed: the order has been sent to the supplier. */
  addPurchaseOrderDocuments(id: string, files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return this.http.patch<any>(`${this.baseUrl}/${id}/documents`, formData, { context: context() });
  }

  removePurchaseOrderDocument(id: string, fileName: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/${id}/documents/${encodeURIComponent(fileName)}`, { context: context() });
  }

  getFile(fileName: string): Observable<Blob> {
    return this.http.get(`${environment.api}/file/${encodeURIComponent(fileName)}`, { responseType: 'blob' });
  }

  placePurchaseOrder(id: string, expectedDeliveryDate: string, contactId?: string, note?: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/place`, { expectedDeliveryDate, contactId: contactId || undefined, note: note || undefined }, { context: context() });
  }

  rejectPurchaseOrder(id: string, comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}/reject`, { comment }, { context: context() });
  }

  /** Super Admin restarts a pending PO's approval route; `stepRoleIds` are the stages that get another chance. */
  resetPurchaseOrderWorkflow(id: string, stepRoleIds: string[]): Observable<{ success: true; message: string }> {
    return this.http.post<{ success: true; message: string }>(`${this.baseUrl}/${id}/reset-workflow`, { stepRoleIds }, { context: context() });
  }

  revokePurchaseOrder(id: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/${id}/revoke`, { context: context() });
  }

  /** Per PO line: received so far and what a cancel can still take off. */
  getCancellable(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}/cancellable`, { context: context() });
  }

  /** Cancels the given quantities (`lines: [{ index, qty }]`), or everything not received when `lines` is left out. */
  cancelPurchaseOrder(id: string, reason: string, lines?: { index: number; qty: number }[]): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${id}/cancel`, { reason, ...(lines ? { lines } : {}) }, { context: context() });
  }
}
