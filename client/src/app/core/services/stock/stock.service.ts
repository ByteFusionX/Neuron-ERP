import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Components using these methods show their own error toast, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface StockPagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface StockWarehouseSplit {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  quarantined: number;
}

/** One product with its stock position across all warehouses. */
export interface StockRow {
  productId: string;
  itemCode: string;
  partNo: string;
  productDescription: string;
  productCategory: string;
  uom: string;
  reorderPoint: number;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  shortfallQuantity: number;
  quarantinedQuantity: number;
  stockValue: number;
  warehouses: StockWarehouseSplit[];
  warehouseText: string;
  rowNo?: number;
}

export interface StockOverviewParams {
  page?: number;
  row?: number;
  search?: string;
  productCategory?: string;
  view?: 'all' | 'exceptions' | 'quarantine';
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export interface StockOverviewResponse {
  success: boolean;
  data: {
    overview: StockRow[];
    summary: { totalItems: number; exceptionCount: number; quarantineCount: number };
    pagination: StockPagination;
  };
}

export interface StockMovement {
  _id: string;
  product: { _id: string; partNo?: string; itemCode?: string; productDescription?: string; unitOfMeasure?: string } | null;
  warehouse?: { _id: string; wareHouseName?: string } | null;
  movementType: string;
  stockStatus: 'Available' | 'Quarantine';
  quantityIn: number;
  quantityOut: number;
  unitCost?: number;
  referenceType?: string;
  referenceNo?: string;
  reason?: string;
  remarks?: string;
  reversalOf?: string;
  movementDate: string;
  createdBy?: { firstName?: string; lastName?: string } | null;
}

export interface StockLedgerParams {
  page?: number;
  row?: number;
  product?: string;
  warehouse?: string;
  movementType?: string;
  search?: string;
}

export interface StockAvailability {
  onHand: number;
  reserved: number;
  available: number;
  quarantined: number;
}

export interface StockAdjustPayload {
  product: string;
  warehouse: string;
  direction: 'add' | 'remove';
  quantity: number;
  reason: string;
  remarks?: string;
  unitCost?: number;
}

export interface StockQuarantinePayload {
  product: string;
  warehouse: string;
  quantity: number;
  action: 'Release' | 'WriteOff';
  remarks?: string;
}

export type StockReturnKind = 'customer' | 'supplier';

export interface StockReturnLine {
  product: string;
  partNo: string;
  description: string;
  uom: string;
  maxQuantity: number;
}

export interface StockReturnSource {
  number: string;
  lines: StockReturnLine[];
}

export interface StockReturnPayload {
  kind: StockReturnKind;
  sourceId: string;
  reason: string;
  remarks?: string;
  toQuarantine?: boolean;
  lines: { product: string; quantity: number }[];
}

export interface StockReservationRow {
  _id: string;
  product: { partNo?: string; itemCode?: string; productDescription?: string } | null;
  quote?: { quoteId?: string } | null;
  job?: { jobId?: string } | null;
  customer?: { companyName?: string } | null;
  sourceType: string;
  quantity: number;
  expiresAt?: string;
  createdDate: string;
}

export const ADJUSTMENT_REASONS = ['Opening stock', 'Count correction', 'Damaged', 'Lost / missing', 'Found', 'Other'] as const;

/**
 * Reasons that only make sense in one direction. The server enforces the same rules.
 */
export const ADD_ONLY_REASONS: readonly string[] = ['Opening stock', 'Found'];
export const REMOVE_ONLY_REASONS: readonly string[] = ['Damaged', 'Lost / missing'];

@Injectable({ providedIn: 'root' })
export class StockService {
  private api = `${environment.api}/stock`;

  constructor(private http: HttpClient) { }

  private toParams(params: object): HttpParams {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') httpParams = httpParams.set(key, String(value));
    });
    return httpParams;
  }

  getOverview(params: StockOverviewParams = {}): Observable<StockOverviewResponse> {
    return this.http.get<StockOverviewResponse>(`${this.api}/overview`, { params: this.toParams(params), context: context() });
  }

  getLedger(params: StockLedgerParams = {}): Observable<{ success: boolean; data: { movements: StockMovement[]; pagination: StockPagination } }> {
    return this.http.get<{ success: boolean; data: { movements: StockMovement[]; pagination: StockPagination } }>(`${this.api}/ledger`, { params: this.toParams(params), context: context() });
  }

  /** On hand, reserved and available for products, keyed by product id. Open to every module. */
  getAvailability(productIds: string[], warehouse?: string): Observable<{ success: boolean; data: Record<string, StockAvailability> }> {
    return this.http.get<{ success: boolean; data: Record<string, StockAvailability> }>(`${this.api}/availability`, {
      params: this.toParams({ productIds: productIds.join(','), warehouse }),
      context: context(),
    });
  }

  adjust(payload: StockAdjustPayload): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.api}/adjust`, payload, { context: context() });
  }

  moveQuarantine(payload: StockQuarantinePayload): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.api}/quarantine`, payload, { context: context() });
  }

  getReturnSource(kind: StockReturnKind, sourceId: string): Observable<{ success: boolean; data: StockReturnSource }> {
    return this.http.get<{ success: boolean; data: StockReturnSource }>(`${this.api}/returns/${kind}/${sourceId}`, { context: context() });
  }

  createReturn(payload: StockReturnPayload): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.api}/returns`, payload, { context: context() });
  }

  getReservations(product?: string): Observable<{ success: boolean; data: StockReservationRow[] }> {
    return this.http.get<{ success: boolean; data: StockReservationRow[] }>(`${this.api}/reservations`, { params: this.toParams({ product }), context: context() });
  }

  releaseReservation(id: string, reason?: string): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(`${this.api}/reservations/${id}/release`, { reason }, { context: context() });
  }
}
