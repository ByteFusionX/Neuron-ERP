import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Supplier, SupplierCreateRequest, SupplierResponse, SupplierListResponse, CreateSupplierDto, PendingSupplier } from 'src/app/shared/interfaces/suppliers.interface';
import { environment } from 'src/environments/environment';
import { PartyMatch } from 'src/app/core/services/customer/customer.service';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Every method below is called from components that already show their own
// error toast on failure, so requests opt out of the interceptor's global toast.
export interface SupplierReportRow {
    id: string;
    name: string;
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    creditValue: number;
}

export interface SupplierReportSummaryResponse {
    success: boolean;
    data: {
        totals: Omit<SupplierReportRow, 'id' | 'name'>;
        byCategory: SupplierReportRow[];
        bySupplierType: SupplierReportRow[];
    };
}

const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
    providedIn: 'root'
})
export class SupplierService {

    api: string = environment.api
    constructor(private http: HttpClient) { }

    createSupplier(supplierDetails: SupplierCreateRequest): Observable<SupplierResponse> {
        return this.http.post<SupplierResponse>(`${this.api}/supplier/create`, supplierDetails, { context: context() })
    }

    getSuppliers(params: {
        page?: number;
        row?: number;
        status?: Array<string> | string;
        category?: string;
        supplierType?: string;
        fromDate?: string;
        toDate?: string;
        search?: string;
        productName?: string;
    }): Observable<SupplierListResponse> {
        return this.http.post<SupplierListResponse>(`${this.api}/supplier`, params, { context: context() });
    }

    getReportSummary(params: { category?: string; supplierType?: string; fromDate?: string; toDate?: string }): Observable<SupplierReportSummaryResponse> {
        return this.http.post<SupplierReportSummaryResponse>(`${this.api}/supplier/report-summary`, params, { context: context() });
    }

    getSupplierById(id: string): Observable<SupplierResponse> {
        return this.http.get<SupplierResponse>(`${this.api}/supplier/${id}`, { context: context() });
    }

    updateSupplierStatus(id?: string, status?: string, comment?: string): Observable<SupplierResponse> {
        return this.http.patch<SupplierResponse>(`${this.api}/supplier/status/${id}`, {
            status,
            comment
        }, { context: context() });
    }

    checkDuplicate(p: { supplierName?: string; email?: string[]; phone?: string[]; iban?: string[] }, excludeId?: string): Observable<{ matches: PartyMatch[] }> {
        const q = new URLSearchParams();
        Object.entries({ ...p, excludeId }).forEach(([k, v]) => {
            if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
            else if (v) q.set(k, v);
        });
        return this.http.get<{ matches: PartyMatch[] }>(`${this.api}/supplier/check-duplicate?${q}`, { context: context() });
    }

    createSupplierWithFiles(supplierData: CreateSupplierDto, files: File[]): Observable<any> {
        const formData = new FormData();

        // Append supplier data as JSON string
        formData.append('supplier', JSON.stringify(supplierData));

        // Append each file
        files.forEach((file, index) => {
            formData.append('documents', file);
        });

        return this.http.post(`${this.api}/supplier/create`, formData, { context: context() });
    }

    updateSupplierWithFiles(id: string, supplierData: any, files: File[]): Observable<any> {
        const formData = new FormData();

        // Append supplier data as JSON string
        formData.append('supplier', JSON.stringify(supplierData));

        // Append each file
        files.forEach((file, index) => {
            formData.append('documents', file);
        });

        return this.http.patch(`${this.api}/supplier/update/${id}`, formData, { context: context() });
    }

    supplierList(includePending = false): Observable<any> {
        return this.http.get(`${this.api}/supplier/suppliers-list`, {
            params: includePending ? { includePending: 'true' } : {}
        });
    }

    blockSupplier(id: string, reason?: string): Observable<{ isBlocked: boolean }> {
        return this.http.patch<{ isBlocked: boolean }>(`${this.api}/supplier/block/${id}`, { reason }, { context: context() });
    }

    previewSupplierId(category: string): Observable<{ success: boolean; data: { supplierId: string; departmentCode: string } }> {
        return this.http.get<{ success: boolean; data: { supplierId: string; departmentCode: string } }>(`${this.api}/supplier/preview-code`, {
            params: { category }
        });
    }
}
