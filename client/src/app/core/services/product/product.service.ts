import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface Product {
  _id?: string;
  partNo: string;
  itemCode: string;
  productDescription: string;
  productCategory: any;
  productSegment: any;
  warehouse: any;
  createdBy?: any;
  createdDate: Date;
  updatedDate?: Date;
  updatedBy?: any;
  isDeleted?: boolean;
}

export interface ProductPagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ProductListResponse {
  success: boolean;
  message: string;
  data: {
    products: Product[];
    pagination: ProductPagination;
  };
}

export interface ProductQueryParams {
  page?: number;
  row?: number;
  search?: string;
  partNo?: string;
  itemCode?: string;
  productDescription?: string;
  productCategory?: string;
  productSegment?: string;
  warehouse?: string;
  createdBy?: string;
}

export interface PartNumberOption {
  _id: string;
  partNo: string;
  productDescription?: string;
}

export interface PartNumberResponse {
  success: boolean;
  message: string;
  data: PartNumberOption[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getProducts(params: ProductQueryParams = {}): Observable<ProductListResponse> {
    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });

    return this.http.get<ProductListResponse>(`${this.api}/product`, {
      params: httpParams,
      context: context()
    });
  }

  getProductById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.api}/product/${id}`);
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(`${this.api}/product`, product, { context: context() });
  }

  updateProduct(id: string, product: Partial<Product>): Observable<Product> {
    return this.http.patch<Product>(`${this.api}/product/${id}`, product);
  }

  deleteProduct(id: string): Observable<any> {
    return this.http.delete(`${this.api}/product/${id}`);
  }

  getPartNumbers(params: { search?: string; limit?: number } = {}): Observable<PartNumberResponse> {
    let httpParams = new HttpParams();

    if (params.search) {
      httpParams = httpParams.set('search', params.search);
    }

    if (params.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    return this.http.get<PartNumberResponse>(`${this.api}/product/part-numbers`, {
      params: httpParams
    });
  }
}

