import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface ProductCategory {
  _id?: string;
  categoryName: string;
  createdBy?: any;
  createdDate: Date;
  isDeleted?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ProductCategoryService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getProductCategories(): Observable<ProductCategory[]> {
    return this.http.get<ProductCategory[]>(`${this.api}/productCategory`, { context: context() });
  }

  getProductCategoryById(id: string): Observable<ProductCategory> {
    return this.http.get<ProductCategory>(`${this.api}/productCategory/${id}`);
  }

  createProductCategory(category: Partial<ProductCategory>): Observable<ProductCategory> {
    return this.http.post<ProductCategory>(`${this.api}/productCategory`, category, { context: context() });
  }

  updateProductCategory(id: string, category: Partial<ProductCategory>): Observable<ProductCategory> {
    return this.http.patch<ProductCategory>(`${this.api}/productCategory/${id}`, category);
  }

  deleteProductCategory(id: string): Observable<any> {
    return this.http.delete(`${this.api}/productCategory/${id}`);
  }
}


