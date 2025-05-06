import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FilterCustomer, getCustomer, getCustomerByID, getFilteredCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getCreators, getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {

  constructor(private http: HttpClient) { }
  readonly apiUrl = environment.api

  createCustomer(data: getCustomer): Observable<getCustomer> {
    return this.http.post<getCustomer>(`${this.apiUrl}/customer`, data)
  }

  getAllCustomers(userId?:string | undefined): Observable<getCustomer[]> {
    return this.http.get<getCustomer[]>(`${this.apiUrl}/customer/${userId}`)
  }

  editCustomer(data: getCustomer): Observable<getCustomer> {
    return this.http.patch<getCustomer>(`${this.apiUrl}/customer/edit`, data)
  }

  shareOrTransferCustomer(data: {employees:string[],customerId:string,type:string}): Observable<getCustomer> {
    return this.http.patch<getCustomer>(`${this.apiUrl}/customer/shareOrTransferCustomer`, data)
  }

  getCustomerCreators(): Observable<getCreators[]> {
    return this.http.get<getCreators[]>(`${this.apiUrl}/customer/creators`)
  }

  getCustomers(filterData: FilterCustomer): Observable<getFilteredCustomer> {
    return this.http.post<getFilteredCustomer>(`${this.apiUrl}/customer/get`, filterData)
  }

  getCustomerByClientRef(employeeId: string, access?: string, userId?: string): Observable<getCustomerByID> {
    return this.http.get<getCustomerByID>(`${this.apiUrl}/customer/view/get/${employeeId}?access=${access}&userId=${userId}`)
  }

  deleteCustomer(data: { dataId: string, employeeId: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/customer/delete`, data);
  }

  stopSharingCustomer(data: { customerId: string, employeeId: string }): Observable<getCustomer> {
    return this.http.patch<getCustomer>(`${this.apiUrl}/customer/stopSharing`, data);
  }

}
