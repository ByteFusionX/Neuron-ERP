import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface StockEntry {
  _id?: string;
  grn?: any;
  partNo: any;
  itemCode?: string;
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
  isQuarantined?: boolean;
  quarantineReason?: string;
  quarantinedAt?: Date | string;
  quarantineReleasedAt?: Date | string;
  dn?: any;
  supplierReturnStatus?: string | null;
  isHoldResolved?: boolean;
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
  isQuarantined?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class StockEntryService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getStockEntries(params: StockEntryQueryParams = {}): Observable<StockEntryListResponse> {
    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });

    return this.http.get<StockEntryListResponse>(`${this.api}/stock-entry`, {
      params: httpParams,
      context: context()
    });
  }

  getStockEntryById(id: string): Observable<StockEntry> {
    return this.http.get<StockEntry>(`${this.api}/stock-entry/${id}`);
  }

  createStockEntry(stockEntry: Partial<StockEntry>): Observable<StockEntry> {
    return this.http.post<StockEntry>(`${this.api}/stock-entry`, stockEntry, { context: context() });
  }

  updateStockEntry(id: string, stockEntry: Partial<StockEntry>): Observable<StockEntry> {
    return this.http.patch<StockEntry>(`${this.api}/stock-entry/${id}`, stockEntry, { context: context() });
  }

  deleteStockEntry(id: string): Observable<any> {
    return this.http.delete(`${this.api}/stock-entry/${id}`, { context: context() });
  }

  releaseFromQuarantine(id: string): Observable<any> {
    return this.http.patch<any>(`${this.api}/stock-entry/${id}/release-quarantine`, {}, { context: context() });
  }

  getAvailableQuantity(stockEntryId: string): Observable<AvailableQuantityResponse> {
    return this.http.get<AvailableQuantityResponse>(`${this.api}/stock-entry/available-quantity`, {
      params: { stockEntryId },
      context: context()
    });
  }

  createStockBlock(block: Partial<StockBlock>): Observable<StockBlockResponse> {
    return this.http.post<StockBlockResponse>(`${this.api}/stock-entry/block`, block, { context: context() });
  }

  getStockBlocks(stockEntryId: string): Observable<StockBlockResponse> {
    return this.http.get<StockBlockResponse>(`${this.api}/stock-entry/blocks`, {
      params: { stockEntryId }
    });
  }
}


