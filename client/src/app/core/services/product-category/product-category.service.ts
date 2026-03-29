import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

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
    return this.http.get<ProductCategory[]>(`${this.api}/productCategory`);
  }

  getProductCategoryById(id: string): Observable<ProductCategory> {
    return this.http.get<ProductCategory>(`${this.api}/productCategory/${id}`);
  }

  createProductCategory(category: Partial<ProductCategory>): Observable<ProductCategory> {
    return this.http.post<ProductCategory>(`${this.api}/productCategory`, category);
  }

  updateProductCategory(id: string, category: Partial<ProductCategory>): Observable<ProductCategory> {
    return this.http.patch<ProductCategory>(`${this.api}/productCategory/${id}`, category);
  }

  deleteProductCategory(id: string): Observable<any> {
    return this.http.delete(`${this.api}/productCategory/${id}`);
  }
}


