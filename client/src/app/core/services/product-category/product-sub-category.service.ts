import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface ProductSubCategory {
  _id?: string;
  subCategoryName: string;
  /** Parent sales department: populated ({ _id, departmentName }) on reads, an id on writes. */
  department: any;
  /** Head employee: populated ({ _id, firstName, lastName }) on reads, an id (or '' to clear) on writes. */
  departmentHead?: any;
  createdBy?: any;
  createdDate?: Date;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProductSubCategoryService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getProductSubCategories(department?: string): Observable<ProductSubCategory[]> {
    const params: Record<string, string> = department ? { department } : {};
    return this.http.get<ProductSubCategory[]>(`${this.api}/productSubCategory`, { params, context: context() });
  }

  createProductSubCategory(item: Partial<ProductSubCategory>): Observable<ProductSubCategory> {
    return this.http.post<ProductSubCategory>(`${this.api}/productSubCategory`, item, { context: context() });
  }

  updateProductSubCategory(id: string, item: Partial<ProductSubCategory>): Observable<ProductSubCategory> {
    return this.http.patch<ProductSubCategory>(`${this.api}/productSubCategory/${id}`, item, { context: context() });
  }

  deleteProductSubCategory(id: string): Observable<any> {
    return this.http.delete(`${this.api}/productSubCategory/${id}`);
  }
}
