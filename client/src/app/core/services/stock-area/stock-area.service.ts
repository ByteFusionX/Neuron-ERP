import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Callers show their own error toast, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

/** A place inside a warehouse (shelf, rack, zone) used by the Area field on stock adjustments. */
export interface StockArea {
  _id?: string;
  areaName: string;
  createdBy?: any;
  createdDate?: Date | string;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class StockAreaService {
  private api = `${environment.api}/stock-area`;

  constructor(private http: HttpClient) { }

  getAreas(): Observable<StockArea[]> {
    return this.http.get<StockArea[]>(this.api, { context: context() });
  }

  createArea(area: Partial<StockArea>): Observable<StockArea> {
    return this.http.post<StockArea>(this.api, area, { context: context() });
  }

  updateArea(id: string, area: Partial<StockArea>): Observable<StockArea> {
    return this.http.patch<StockArea>(`${this.api}/${id}`, area, { context: context() });
  }

  deleteArea(id: string): Observable<any> {
    return this.http.delete(`${this.api}/${id}`, { context: context() });
  }
}
