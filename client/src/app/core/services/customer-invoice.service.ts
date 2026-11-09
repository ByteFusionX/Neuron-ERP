import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor/error.interceptor';

export interface CustomerInvoicePayload {
  purchaseOrder?: string;
  deliveryNote?: string;
  /** Raised from a received proforma invoice. */
  proformaInvoice?: string;
  receivedAmount?: number;
  receivedDate?: string;
  client: { name: string; customerId?: string };
  attention: string;
  invoiceDate: string;
  invoiceNo: string;
  dnNo: string;
  lpoRef: string;
  subject: string;
  paymentTerms: string;
  paymentMethod: string;
}
@Injectable({ providedIn: 'root' })
export class CustomerInvoiceService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.api}/customer-invoice`;
  list(params: { page: number; limit: number; search: string; status?: string; deliveryNote?: string; proformaInvoices?: string }) {
    return this.http.get<any>(this.url, { params, context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  listPdc(params: { page: number; limit: number; search: string; status?: string }) {
    return this.http.get<any>(this.url + '/pdc', { params, context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  updatePdcStatus(id: string, status: string) {
    return this.http.patch<any>(this.url + '/pdc/' + id + '/status', { status }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  create(payload: CustomerInvoicePayload) {
    return this.http.post<any>(this.url, payload, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  update(id: string, payload: Partial<CustomerInvoicePayload>) {
    return this.http.put<any>(`${this.url}/${id}`, payload, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  prepareDn(deliveryNote: string) {
    return this.http.get<any>(`${this.url}/delivery-note/${deliveryNote}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  get(id: string) {
    return this.http.get<any>(`${this.url}/${id}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
  prepare(purchaseOrder: string) {
    return this.http.get<any>(`${this.url}/purchase-order/${purchaseOrder}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
}
