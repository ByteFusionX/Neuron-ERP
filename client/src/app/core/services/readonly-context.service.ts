import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ReadonlyContextQuery {
  search?: string;
  q?: string;
  limit?: number;
  type?: string;
  supplierType?: string;
  department?: string;
  role?: 'technician' | 'driver' | 'projectManager';
}

export interface ReadonlyContextResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ProductContext {
  _id: string;
  partNo: string;
  itemCode: string;
  productName?: string;
  productDescription: string;
  productCategory?: any;
  productSegment?: any;
  brand?: string;
  type?: string;
  unitOfMeasure?: string;
  defaultSellingPrice?: number;
  estimatedCost?: number;
  defaultVendor?: any;
  purchaseContext?: {
    lastStockEntry: any | null;
  };
}

export interface SupplierContext {
  _id: string;
  supplierId?: string;
  supplierName: string;
  supplierType?: string;
  category?: any;
  contactDetails?: {
    name?: string;
    email?: string;
    phoneNumber?: string;
  };
  products?: any[];
  creditDays?: number;
  creditValue?: number;
  status?: string;
  purchaseContext?: {
    lastPurchaseOrder: any | null;
  };
}

export interface EmployeeContext {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string;
  designation?: string;
  department?: any;
  reportingTo?: any;
  isTechnician?: boolean;
  isDriver?: boolean;
  isProjectManager?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ReadonlyContextService {
  private readonly api = `${environment.api}/context`;

  constructor(private http: HttpClient) {}

  getProducts(query: ReadonlyContextQuery = {}): Observable<ReadonlyContextResponse<ProductContext[]>> {
    return this.http.get<ReadonlyContextResponse<ProductContext[]>>(`${this.api}/products`, {
      params: this.toParams(query),
    });
  }

  getProduct(id: string): Observable<ReadonlyContextResponse<ProductContext>> {
    return this.http.get<ReadonlyContextResponse<ProductContext>>(`${this.api}/products/${id}`);
  }

  getSuppliers(query: ReadonlyContextQuery = {}): Observable<ReadonlyContextResponse<SupplierContext[]>> {
    return this.http.get<ReadonlyContextResponse<SupplierContext[]>>(`${this.api}/suppliers`, {
      params: this.toParams(query),
    });
  }

  getSupplier(id: string): Observable<ReadonlyContextResponse<SupplierContext>> {
    return this.http.get<ReadonlyContextResponse<SupplierContext>>(`${this.api}/suppliers/${id}`);
  }

  getEmployees(query: ReadonlyContextQuery = {}): Observable<ReadonlyContextResponse<EmployeeContext[]>> {
    return this.http.get<ReadonlyContextResponse<EmployeeContext[]>>(`${this.api}/employees`, {
      params: this.toParams(query),
    });
  }

  getEmployee(id: string): Observable<ReadonlyContextResponse<EmployeeContext>> {
    return this.http.get<ReadonlyContextResponse<EmployeeContext>>(`${this.api}/employees/${id}`);
  }

  private toParams(query: ReadonlyContextQuery): HttpParams {
    return Object.entries(query).reduce((params, [key, value]) => {
      if (value === undefined || value === null || value === '') return params;
      return params.set(key, String(value));
    }, new HttpParams());
  }
}
