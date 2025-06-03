import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Supplier, SupplierCreateRequest, SupplierResponse, SupplierListResponse, CreateSupplierDto, PendingSupplier } from 'src/app/shared/interfaces/suppliers.interface';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SupplierService {

    api: string = environment.api
    constructor(private http: HttpClient) { }

    createSupplier(supplierDetails: SupplierCreateRequest): Observable<SupplierResponse> {
        return this.http.post<SupplierResponse>(`${this.api}/supplier/create`, supplierDetails)
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
    }): Observable<SupplierListResponse> {
        return this.http.post<SupplierListResponse>(`${this.api}/supplier`, params);
    }

    getSupplierById(id: string): Observable<SupplierResponse> {
        return this.http.get<SupplierResponse>(`${this.api}/supplier/${id}`);
    }

    updateSupplierStatus(id: string, status: string, comment?: string): Observable<SupplierResponse> {
        return this.http.patch<SupplierResponse>(`${this.api}/supplier/status/${id}`, {
            status,
            comment
        });
    }

    createSupplierWithFiles(supplierData: CreateSupplierDto, files: File[]): Observable<any> {
        const formData = new FormData();

        // Append supplier data as JSON string
        formData.append('supplier', JSON.stringify(supplierData));

        // Append each file
        files.forEach((file, index) => {
            formData.append('documents', file);
        });

        return this.http.post(`${this.api}/supplier/create`, formData);
    }

    updateSupplierWithFiles(id: string, supplierData: any, files: File[]): Observable<any> {
        const formData = new FormData();

        // Append supplier data as JSON string
        formData.append('supplier', JSON.stringify(supplierData));

        // Append each file
        files.forEach((file, index) => {
            formData.append('documents', file);
        });

        return this.http.patch(`${this.api}/supplier/update/${id}`, formData);
    }

    supplierList(): Observable<any> {
        return this.http.get(`${this.api}/supplier/suppliers-list`)
    }
}