import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';
import {
  SalesRfq,
  SalesRfqComparison,
  SalesRfqEnquiryAward,
  SalesRfqFxRates,
  SalesRfqLineInput,
  SalesRfqQuoteInput,
  SalesRfqStockCheck,
  SalesRfqReplyPrice,
  SalesRfqSummary,
  SalesRfqSupplierActivity,
  SalesRfqSupplierInput,
  SalesRfqSupplierOption,
  SalesRfqSupplierStatus,
  SalesRfqTerms,
} from 'src/app/shared/interfaces/sales-rfq.interface';

// Every caller shows its own error toast, so requests opt out of the interceptor's global one.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

/** Sales RFQ: supplier price and availability collected between an enquiry and its quotation. */
@Injectable({ providedIn: 'root' })
export class SalesRfqService {
  private api = `${environment.api}/sales-rfq`;

  constructor(private http: HttpClient) {}

  /** `mode: 'suppliers'` returns one row per supplier asked (filtered by `supplierView`); otherwise one row per RFQ. */
  list(params: { page?: number; row?: number; status?: string[] | string; search?: string; enquiryId?: string; item?: string; mode?: 'suppliers' | 'rfqs'; supplierView?: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/list`, params, { context: context() });
  }

  summaries(enquiryIds: string[]): Observable<{ success: boolean; data: SalesRfqSummary[] }> {
    return this.http.post<{ success: boolean; data: SalesRfqSummary[] }>(`${this.api}/summaries`, { enquiryIds }, { context: context() });
  }

  draft(enquiryId: string): Observable<any> {
    return this.http.get<any>(`${this.api}/draft/${enquiryId}`, { context: context() });
  }

  stockCheck(lines: SalesRfqLineInput[]): Observable<{ success: boolean; data: SalesRfqStockCheck[] }> {
    return this.http.post<any>(`${this.api}/stock-check`, { lines }, { context: context() });
  }

  /** Raises one RFQ per supplier, each with only the lines that supplier is asked to price. */
  createFromEnquiry(enquiryId: string, body: { lines: SalesRfqLineInput[]; suppliers: SalesRfqSupplierInput[]; requestedTerms?: SalesRfqTerms; deadline?: string | null; requiredBy?: string | null; notes?: string }): Observable<{ success: boolean; data: { _id: string; rfqNo: string; supplierName: string }[] }> {
    return this.http.post<{ success: boolean; data: { _id: string; rfqNo: string; supplierName: string }[] }>(`${this.api}/from-enquiry/${enquiryId}`, body, { context: context() });
  }

  getById(id: string): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.get<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}`, { context: context() });
  }

  update(id: string, body: { lines?: SalesRfqLineInput[]; requestedTerms?: SalesRfqTerms; deadline?: string | null; requiredBy?: string | null; notes?: string }): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.put<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}`, body, { context: context() });
  }

  cancel(id: string, reason?: string): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.post<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/cancel`, { reason }, { context: context() });
  }

  addQuote(id: string, quote: SalesRfqQuoteInput): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.post<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/quotes`, quote, { context: context() });
  }

  updateQuote(id: string, quoteId: string, quote: SalesRfqQuoteInput): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.put<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/quotes/${quoteId}`, quote, { context: context() });
  }

  removeQuote(id: string, quoteId: string): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.delete<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/quotes/${quoteId}`, { context: context() });
  }

  uploadQuoteFiles(id: string, quoteId: string, files: File[]): Observable<{ success: boolean; data: SalesRfq }> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return this.http.post<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/quotes/${quoteId}/files`, formData, { context: context() });
  }

  /** Exactly one of `quoteId`, `unavailable` or `reopen`; `reason` is required when the price is not the lowest. */
  settleLine(id: string, lineKey: string, body: { quoteId?: string; unavailable?: boolean; reopen?: boolean; reason?: string }): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.put<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/lines/${encodeURIComponent(lineKey)}`, body, { context: context() });
  }

  /** Split award from the comparison grid; a null quoteId reopens that line. A pick above the lowest price needs a reason. */
  award(id: string, awards: { lineKey: string; quoteId: string | null; reason?: string }[]): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.put<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/award`, { awards }, { context: context() });
  }

  /** Every supplier RFQ of an enquiry side by side: one row per product, one column per supplier. */
  compare(enquiryId: string): Observable<{ success: boolean; data: SalesRfqComparison }> {
    return this.http.get<{ success: boolean; data: SalesRfqComparison }>(`${this.api}/enquiry/${enquiryId}/compare`, { context: context() });
  }

  /** Awards products across the enquiry's RFQs; the same product on the other RFQs becomes Lost. A null quoteId reopens it everywhere. */
  awardAcross(enquiryId: string, awards: SalesRfqEnquiryAward[]): Observable<{ success: boolean; message?: string }> {
    return this.http.put<{ success: boolean; message?: string }>(`${this.api}/enquiry/${enquiryId}/award`, { awards }, { context: context() });
  }

  /** Quotation seed from every awarded product of the enquiry. */
  prepareEnquiryQuotation(enquiryId: string, partial = false): Observable<any> {
    return this.http.post<any>(`${this.api}/enquiry/${enquiryId}/prepare-quotation${partial ? '?partial=1' : ''}`, {}, { context: context() });
  }

  addSupplier(id: string, body: SalesRfqSupplierInput): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.post<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/suppliers`, body, { context: context() });
  }

  updateSupplier(id: string, inviteId: string, body: { supplierId?: string; lineKeys?: string[]; contactEmail?: string; status?: SalesRfqSupplierStatus; sentVia?: string; remarks?: string; declineReason?: string; declineNote?: string }): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.put<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/suppliers/${inviteId}`, body, { context: context() });
  }

  removeSupplier(id: string, inviteId: string): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.delete<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/suppliers/${inviteId}`, { context: context() });
  }

  submitReply(id: string, inviteId: string, body: { terms: SalesRfqTerms; prices: SalesRfqReplyPrice[]; remarks?: string; markReplied?: boolean }): Observable<{ success: boolean; data: SalesRfq; message?: string }> {
    return this.http.post<{ success: boolean; data: SalesRfq; message?: string }>(`${this.api}/${id}/suppliers/${inviteId}/reply`, body, { context: context() });
  }

  uploadSupplierFiles(id: string, inviteId: string, files: File[]): Observable<{ success: boolean; data: SalesRfq }> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return this.http.post<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/suppliers/${inviteId}/files`, formData, { context: context() });
  }

  prepareQuotation(id: string): Observable<any> {
    return this.http.post<any>(`${this.api}/${id}/prepare-quotation`, {}, { context: context() });
  }

  supplierOptions(search: string): Observable<{ success: boolean; data: SalesRfqSupplierOption[] }> {
    const query = new URLSearchParams({ search }).toString();
    return this.http.get<{ success: boolean; data: SalesRfqSupplierOption[] }>(`${this.api}/supplier-options?${query}`, { context: context() });
  }

  fxRates(): Observable<{ success: boolean; data: SalesRfqFxRates }> {
    return this.http.get<{ success: boolean; data: SalesRfqFxRates }>(`${this.api}/fx-rates`, { context: context() });
  }

  supplierActivity(body: { supplierIds: string[]; excludeRfqId?: string; lines?: { partNo?: string; detail?: string }[] }): Observable<{ success: boolean; data: SalesRfqSupplierActivity[] }> {
    return this.http.post<{ success: boolean; data: SalesRfqSupplierActivity[] }>(`${this.api}/supplier-activity`, body, { context: context() });
  }

  scheduleFollowUp(id: string, body: { dueDate: string; note?: string; inviteId?: string }): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.post<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/follow-ups`, body, { context: context() });
  }

  closeFollowUp(id: string, followUpId: string, body: { action: 'complete' | 'cancel'; outcome?: string; note?: string; date?: string; nextFollowUpDate?: string | null; reason?: string }): Observable<{ success: boolean; data: SalesRfq }> {
    return this.http.put<{ success: boolean; data: SalesRfq }>(`${this.api}/${id}/follow-ups/${followUpId}`, body, { context: context() });
  }

  priceHistory(params: { detail?: string; partNo?: string; supplierId?: string }): Observable<any> {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]).toString();
    return this.http.get<any>(`${this.api}/price-history?${query}`, { context: context() });
  }

  /** One row per (supplier, product) from past quotes; pass a productId or a supplierId. */
  supplierProducts(params: { productId?: string; supplierId?: string }): Observable<any> {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]).toString();
    return this.http.get<any>(`${this.api}/supplier-products?${query}`, { context: context() });
  }
}
