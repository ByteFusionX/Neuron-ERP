import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { InvoiceListResponse, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';

@Injectable({
    providedIn: 'root'
})
export class InvoiceService {

    api: string = environment.api;

    constructor(private http: HttpClient) { }

    getInvoices(params: InvoiceFilterParams): Observable<InvoiceListResponse> {
        // Convert array of statuses to query string if needed, 
        // but typically standard HttpClient handles simple objects.
        // However, existing pattern in SupplierService uses POST for listing with params?
        // Let's check SupplierService again. It uses POST to /supplier with params in body if complex?
        // The supplier service code: return this.http.post<SupplierListResponse>(`${this.api}/supplier`, params);
        // My backend implementation uses GET with query params. 
        // I should probably switch to POST or use GET with params. 
        // Existing patterns are safer. Supplier uses POST. 
        // But I implemented GET in the backend controller (req.query).
        // So I must use GET here.

        return this.http.get<InvoiceListResponse>(`${this.api}/invoice`, { params: params as any });
    }

    createInvoice(invoiceData: any): Observable<any> {
        return this.http.post<any>(`${this.api}/invoice`, invoiceData);
    }

    generateInvoiceNumber(): Observable<{ success: boolean, invoiceNo: string }> {
        return this.http.get<{ success: boolean, invoiceNo: string }>(`${this.api}/invoice/generate-number`);
    }
}
