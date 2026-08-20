import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Supplier, SupplierCreateRequest, SupplierResponse, SupplierListResponse, CreateSupplierDto, PendingSupplier } from 'src/app/shared/interfaces/suppliers.interface';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Every method below is called from components that already show their own
// error toast on failure, so requests opt out of the interceptor's global toast.
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

    getSupplierById(id: string): Observable<SupplierResponse> {
        return this.http.get<SupplierResponse>(`${this.api}/supplier/${id}`, { context: context() });
    }

    updateSupplierStatus(id?: string, status?: string, comment?: string): Observable<SupplierResponse> {
        return this.http.patch<SupplierResponse>(`${this.api}/supplier/status/${id}`, {
            status,
            comment
        }, { context: context() });
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

    supplierList(): Observable<any> {
        return this.http.get(`${this.api}/supplier/suppliers-list`);
    }

    blockSupplier(id: string): Observable<{ isBlocked: boolean }> {
        return this.http.patch<{ isBlocked: boolean }>(`${this.api}/supplier/block/${id}`, {}, { context: context() });
    }

    previewSupplierCode(category: string): Observable<{ success: boolean; data: { supplierCode: string; departmentCode: string } }> {
        return this.http.get<{ success: boolean; data: { supplierCode: string; departmentCode: string } }>(`${this.api}/supplier/preview-code`, {
            params: { category }
        });
    }
}