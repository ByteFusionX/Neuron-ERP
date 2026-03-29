import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface Warehouse {
  _id?: string;
  wareHouseName: string;
  createdBy?: any;
  createdDate: Date;
  isDeleted?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class WarehouseService {
  private api: string = environment.api;

  constructor(private http: HttpClient) { }

  getWarehouses(): Observable<Warehouse[]> {
    return this.http.get<Warehouse[]>(`${this.api}/warehouse`);
  }

  getWarehouseById(id: string): Observable<Warehouse> {
    return this.http.get<Warehouse>(`${this.api}/warehouse/${id}`);
  }

  createWarehouse(warehouse: Partial<Warehouse>): Observable<Warehouse> {
    return this.http.post<Warehouse>(`${this.api}/warehouse`, warehouse);
  }

  updateWarehouse(id: string, warehouse: Partial<Warehouse>): Observable<Warehouse> {
    return this.http.patch<Warehouse>(`${this.api}/warehouse/${id}`, warehouse);
  }

  deleteWarehouse(id: string): Observable<any> {
    return this.http.delete(`${this.api}/warehouse/${id}`);
  }
}


