import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type ProformaStatus = 'Pending' | 'Sent' | 'Accepted' | 'Received';
export const PI_STATUS_LIST: ProformaStatus[] = ['Pending', 'Sent', 'Accepted', 'Received'];
export const PAYMENT_METHODS = ['PDC', 'Account Transfer', 'Cash', 'Other'] as const;

export interface ProformaPayment {
  method: string;
  otherMethod?: string;
  referenceNo: string;
  document?: { fileName: string; originalname: string };
  receivedAt?: string;
}

export interface ProformaStatusPayload {
  status: ProformaStatus;
  note?: string;
  paymentMethod?: string;
  otherMethod?: string;
  referenceNo?: string;
  document?: File | null;
}

export interface ProformaItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

/** Deal cost snapshot saved with the PI. */
export interface ProformaSummary {
  itemsCost: number;
  itemsPrice: number;
  supplierDiscount: number;
  customerDiscount: number;
  additionalCost: number;
  totalCost: number;
  totalPrice: number;
}

export interface ProformaInvoice {
  _id: string;
  piNo: string;
  job: string;
  jobId: string;
  client: { customerId?: string; name: string };
  attention: string;
  paymentTerms: string;
  shipTo: string;
  lpoNo: string;
  subject: string;
  currency: string;
  quoteCompany?: string;
  items: ProformaItem[];
  amount: number;
  summary?: ProformaSummary;
  expectedAmount?: number;
  expectedDate?: string;
  status: ProformaStatus;
  payment?: ProformaPayment;
  createdBy?: { _id: string; firstName?: string; lastName?: string };
  statusUpdatedBy?: { _id: string; firstName?: string; lastName?: string };
  statusUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the drawer sends; the server issues the PI number and recomputes every amount. */
export type ProformaInvoicePayload = Pick<ProformaInvoice, 'attention' | 'paymentTerms' | 'shipTo' | 'lpoNo' | 'subject' | 'currency'> & {
  quoteCompany?: string;
  job?: string;
  client: { customerId?: string; name: string };
  items: ProformaItem[];
  summary: ProformaSummary;
  expectedAmount: number;
  expectedDate: string;
};

export interface ProformaInvoiceList {
  success: boolean;
  data: ProformaInvoice[];
  total: number;
  viewCounts: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class ProformaInvoiceService {
  private readonly api = `${environment.api}/proforma-invoice`;

  constructor(private http: HttpClient) {}

  list(params: { page: number; limit: number; status?: string; search?: string; job?: string }): Observable<ProformaInvoiceList> {
    const query: Record<string, string> = { page: String(params.page), limit: String(params.limit) };
    if (params.status) query['status'] = params.status;
    if (params.search) query['search'] = params.search;
    if (params.job) query['job'] = params.job;
    return this.http.get<ProformaInvoiceList>(this.api, { params: query });
  }

  /** Preview of the number the next PI will get; nothing is reserved. */
  nextNumber(): Observable<{ success: boolean; data: { piNo: string } }> {
    return this.http.get<{ success: boolean; data: { piNo: string } }>(`${this.api}/next-number`);
  }

  create(payload: ProformaInvoicePayload): Observable<{ success: boolean; data: ProformaInvoice }> {
    return this.http.post<{ success: boolean; data: ProformaInvoice }>(this.api, payload);
  }

  update(id: string, payload: ProformaInvoicePayload): Observable<{ success: boolean; data: ProformaInvoice }> {
    return this.http.put<{ success: boolean; data: ProformaInvoice }>(`${this.api}/${id}`, payload);
  }

  updateStatus(id: string, payload: ProformaStatusPayload): Observable<{ success: boolean; data: ProformaInvoice }> {
    const form = new FormData();
    form.append('status', payload.status);
    form.append('note', payload.note ?? '');
    if (payload.status === 'Received') {
      form.append('paymentMethod', payload.paymentMethod ?? '');
      form.append('otherMethod', payload.otherMethod ?? '');
      form.append('referenceNo', payload.referenceNo ?? '');
      if (payload.document) form.append('document', payload.document);
    }
    return this.http.patch<{ success: boolean; data: ProformaInvoice }>(`${this.api}/${id}/status`, form);
  }
}
