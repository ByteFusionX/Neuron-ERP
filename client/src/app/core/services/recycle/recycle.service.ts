import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RecycleService {

  api: string = environment.api
  constructor(private http: HttpClient) { }

  fetchTrash(): Observable<Trash> {
    return this.http.get<Trash>(`${this.api}/trash`)
  }

  restoreTrash(data: { from: string, dataId: string }): Observable<any> {
    return this.http.post(`${this.api}/trash/restore`, data)
  }
}

export interface Trash {
  deletedFrom: string,
  deletedData: any,
  deletedBy: getEmployee,
  date: Date
}