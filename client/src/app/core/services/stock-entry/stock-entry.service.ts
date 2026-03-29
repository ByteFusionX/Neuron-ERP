import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface StockEntry {
  _id?: string;
  grn: string;
  partNo: any;
  dateOfPurchase: Date;
  jobId?: any;
  supplierName: any;
  supplierLpoNo?: string;
  productDescription: string;
  productSegment: any;
  productCategory: any;
  targetWarehouse: any;
  quantity: number;
  uom?: string;
  unitCost: number;
  totalCost: number;
  sellingPrice?: number;
  serialNumbers?: string[];
  remarks?: string;
  createdBy?: any;
  createdDate: Date;
  updatedDate?: Date;
  updatedBy?: any;
  isDeleted?: boolean;
  stockInDays?: number;
  rowNo?: number;
  availableQuantity?: number;
  blockedQuantity?: number;
  activeBlocks?: StockBlock[];
}

export interface StockBlock {
  _id?: string;
  stockEntryId: string;
  salesPersonName: string;
  customerName: string;
  quantity: number;
  fromDate: Date | string;
  toDate: Date | string;
  createdBy?: any;
  createdDate?: Date;
  updatedDate?: Date;
  isDeleted?: boolean;
}

export interface AvailableQuantityResponse {
  success: boolean;
  data: {
    availableQuantity: number;
    totalQuantity: number;
    blockedQuantity: number;
  };
}

export interface StockBlockResponse {
  success: boolean;
  message?: string;
  data: StockBlock | StockBlock[];
}

export interface StockEntryPagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface StockEntryListResponse {
  success: boolean;
  message: string;
  data: {
    stockEntries: StockEntry[];
    pagination: StockEntryPagination;
  };
}

export interface StockEntryQueryParams {
  page?: number;
  row?: number;
  search?: string;
  grn?: string;
  partNo?: string;
  supplierName?: string;
  productCategory?: string;
  productSegment?: string;
  targetWarehouse?: string;
  jobId?: string;
  fromDate?: string;
  toDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StockEntryService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  generateGRN(): Observable<{ grn: string }> {
    return this.http.get<{ grn: string }>(`${this.api}/stock-entry/generate-grn`);
  }

  getStockEntries(params: StockEntryQueryParams = {}): Observable<StockEntryListResponse> {
    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });

    return this.http.get<StockEntryListResponse>(`${this.api}/stock-entry`, {
      params: httpParams
    });
  }

  getStockEntryById(id: string): Observable<StockEntry> {
    return this.http.get<StockEntry>(`${this.api}/stock-entry/${id}`);
  }

  createStockEntry(stockEntry: Partial<StockEntry>): Observable<StockEntry> {
    return this.http.post<StockEntry>(`${this.api}/stock-entry`, stockEntry);
  }

  updateStockEntry(id: string, stockEntry: Partial<StockEntry>): Observable<StockEntry> {
    return this.http.patch<StockEntry>(`${this.api}/stock-entry/${id}`, stockEntry);
  }

  deleteStockEntry(id: string): Observable<any> {
    return this.http.delete(`${this.api}/stock-entry/${id}`);
  }

  getAvailableQuantity(stockEntryId: string): Observable<AvailableQuantityResponse> {
    return this.http.get<AvailableQuantityResponse>(`${this.api}/stock-entry/available-quantity`, {
      params: { stockEntryId }
    });
  }

  createStockBlock(block: Partial<StockBlock>): Observable<StockBlockResponse> {
    return this.http.post<StockBlockResponse>(`${this.api}/stock-entry/block`, block);
  }

  getStockBlocks(stockEntryId: string): Observable<StockBlockResponse> {
    return this.http.get<StockBlockResponse>(`${this.api}/stock-entry/blocks`, {
      params: { stockEntryId }
    });
  }
}


