import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Department, getDepartment, getInternalDep } from 'src/app/shared/interfaces/department.interface';
import { NoteDelete, NotePatch, NotePost, Notes } from 'src/app/shared/interfaces/notes.interface';
import { TotalEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { getCompanyDetails } from 'src/app/shared/interfaces/company.interface';
import { Target } from 'src/app/shared/interfaces/employee.interface';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);


@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  readonly api: string = environment.api
  constructor(private http: HttpClient) { }

  getDepartments(): Observable<getDepartment[]> {
    return this.http.get<getDepartment[]>(`${this.api}/department`, { context: context() })
  }

  setDepartment(department: Department): Observable<getDepartment> {
    return this.http.post<getDepartment>(`${this.api}/department`, department)
  }

  updateDepartment(department: Department): Observable<getDepartment> {
    return this.http.put<getDepartment>(`${this.api}/department`, department)
  }

  getCustomerDepartments(): Observable<getDepartment[]> {
    return this.http.get<getDepartment[]>(`${this.api}/department/customer`)
  }

  getCustomerTypes(): Observable<getCustomerType[]> {
    return this.http.get<getCustomerType[]>(`${this.api}/customerType`)
  }

  setCustomerType(customerType: getCustomerType): Observable<getCustomerType> {
    return this.http.post<getCustomerType>(`${this.api}/customerType`, customerType)
  }

  updateCustomerType(customerType: getCustomerType): Observable<getCustomerType> {
    return this.http.put<getCustomerType>(`${this.api}/customerType`, customerType)
  }


  deleteCustomerType(data: { dataId: string, employee: string}): Observable<any> {
    return this.http.post<any>(`${this.api}/customerType/delete-customerType`, data, { context: context() })
  }

  updateCustomerDepartment(department: Department): Observable<getDepartment> {
    return this.http.put<getDepartment>(`${this.api}/department/customer`, department)
  }
  

  totalEnquiries(access?: string, userId?: string): Observable<TotalEnquiry[]> {
    return this.http.get<TotalEnquiry[]>(`${this.api}/department/enquiry-count?access=${access}&userId=${userId}`)
  }

  getNotes(): Observable<Notes> {
    return this.http.get<Notes>(`${this.api}/note`)
  }

  createCustomerNote(note: NotePost): Observable<Notes> {
    return this.http.post<Notes>(`${this.api}/note/customerNote`, note)
  }

  createTermsAndCondition(note: NotePost): Observable<Notes> {
    return this.http.post<Notes>(`${this.api}/note/termsCondition`, note)
  }

  updateNote(note: NotePatch, noteId: string): Observable<Notes> {
    return this.http.patch<Notes>(`${this.api}/note/${noteId}`, note)
  }

  deleteNote(noteType: string, noteId: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/note/${noteId}/${noteType}`)
  }

  getCompanyDetails() {
    return this.http.get<getCompanyDetails>(`${this.api}/company/getCompanyDetails`)
  }

  updateCompanyDetails(companyDetails: getCompanyDetails) {
    return this.http.patch<getCompanyDetails>(`${this.api}/company/updateCompanyDetails`, companyDetails)
  }

  setCompanyTarget(target: Target): Observable<Target[]> {
    return this.http.patch<Target[]>(`${this.api}/company/setTarget`, target)
  }

  updateCompanyTarget(id: string, target: Target): Observable<Target[]> {
    return this.http.patch<Target[]>(`${this.api}/company/update-target/${id}`, target)
  }

  getCompanyTargets(): Observable<{ targets: Target[] }> {
    return this.http.get<{ targets: Target[] }>(`${this.api}/company/target`)
  }

  getInternalDepartments(): Observable<getInternalDep[]> {
    return this.http.get<getInternalDep[]>(`${this.api}/department/internalDepartment`)
  }

  setInternalDepartment(department: getInternalDep): Observable<getInternalDep> {
    return this.http.post<getInternalDep>(`${this.api}/department/internalDepartment`, department)
  }

  updateInternalDepartment(department: getInternalDep): Observable<getInternalDep> {
    return this.http.put<getInternalDep>(`${this.api}/department/internalDepartment`, department)
  }

  deleteDepartment(data: { dataId: string, employee: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/department/delete-department`, data, { context: context() })
  }

  deleteInternalDepartment(data: { dataId: string, employee: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/department/delete-internalDepartment/`, data, { context: context() })
  }

  deleteCustomerDepartment(data: { dataId: string, employee: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/department/delete-customer`, data, { context: context() })
  }

  createPlaceOfDelivery(note: NotePost): Observable<Notes> {
    return this.http.post<Notes>(`${this.api}/note/placeOfDelivery`, note)
  }

  createShippingTerms(note: NotePost): Observable<Notes> {
    return this.http.post<Notes>(`${this.api}/note/shippingTerms`, note)
  }
}
