import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Supplier, SupplierCreateRequest, SupplierResponse } from 'src/app/shared/interfaces/suppliers.interface';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SupplierService {

    api: string = environment.api
    constructor(private http: HttpClient) { }

    createSupplier(supplierDetails:SupplierCreateRequest): Observable<SupplierResponse> {
        return this.http.post<SupplierResponse>(`${this.api}/supplier/create`,supplierDetails)
    }

}