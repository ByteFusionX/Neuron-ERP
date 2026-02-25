import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Invoice, InvoiceListResponse, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';

@Injectable({
    providedIn: 'root'
})
export class InvoiceService {

    api: string = environment.api;

    constructor(private http: HttpClient) { }

    getInvoices(params: InvoiceFilterParams): Observable<InvoiceListResponse> {
        return this.http.get<InvoiceListResponse>(`${this.api}/invoice`, { params: params as any });
    }

    getInvoiceDnLinkingReport(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/dn-linking-report`, { params });
    }

    createInvoice(data: Partial<Invoice>): Observable<any> {
        return this.http.post<any>(`${this.api}/invoice`, data);
    }

    getInvoiceById(id: string): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/${id}`);
    }

    updateInvoice(id: string, data: Partial<Invoice>): Observable<any> {
        return this.http.put<any>(`${this.api}/invoice/${id}`, data);
    }

    generateInvoiceNumber(): Observable<{ success: boolean, invoiceNo: string }> {
        return this.http.get<{ success: boolean, invoiceNo: string }>(`${this.api}/invoice/generate-number`);
    }

    getCancelledAdjustedInvoices(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/audit`, { params });
    }

    getCancelledReissuedInvoices(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/cancelled-reissued-report`, { params });
    }
}
