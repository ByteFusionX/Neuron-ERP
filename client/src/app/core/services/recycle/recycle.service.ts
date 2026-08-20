import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

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
    return this.http.post(`${this.api}/trash/restore`, data, { context: context() })
  }
}

export interface Trash {
  deletedFrom: string,
  deletedData: any,
  deletedBy: getEmployee,
  date: Date
}