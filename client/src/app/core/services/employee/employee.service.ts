import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, combineLatest, filter, finalize, map, Observable, shareReplay, switchMap, tap } from 'rxjs';
import { ApprovalLimit, CreateEmployee, FilterEmployee, GetCategory, Responsibility, getEmployee, getEmployeeByID, MyProfile, Target, UpdateMyProfile } from 'src/app/shared/interfaces/employee.interface';
import { login } from 'src/app/shared/interfaces/login';
import { environment } from 'src/environments/environment';
import { jwtDecode } from "jwt-decode";
import { withSuperAdminAccess } from 'src/app/core/utils/super-admin-access';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {

  api: string = environment.api
  employeeSubject = new BehaviorSubject<getEmployee | undefined>(undefined)
  employeeData$ = this.employeeSubject.asObservable()
  constructor(private http: HttpClient) { }

  getAllEmployees(): Observable<getEmployee[]> {
    return this.http.get<getEmployee[]>(`${this.api}/employee`, { context: context() })
  }

  getPresaleEngineers(): Observable<getEmployee[]> {
    return this.http.get<getEmployee[]>(`${this.api}/employee/presale-engineers`)
  }

  getPresaleManagers(): Observable<getEmployee[]> {
    return this.http.get<getEmployee[]>(`${this.api}/employee/presale-managers`)
  }

  getProcurementEmployees(): Observable<getEmployee[]> {
    return this.http.get<getEmployee[]>(`${this.api}/employee/procurement-employees`, { context: context() })
  }

  /** Buyers a job's purchase work can be allocated to: purchase creators, never a super admin. */
  getPurchaseBuyers(): Observable<{ success: boolean, data: getEmployee[] }> {
    return this.http.get<{ success: boolean, data: getEmployee[] }>(`${this.api}/employee/purchase-buyers`, { context: context() })
  }

  getEmployees(filterData: FilterEmployee): Observable<{ total: number, employees: getEmployee[] }> {
    return this.http.post<{ total: number, employees: getEmployee[] }>(`${this.api}/employee/get`, filterData)
  }

  getEmployeesForCustomerTransfer(customerId: string): Observable<getEmployee[]> {
    return combineLatest([this.employeeData$]).pipe(
      filter(([employee]) => !!employee), // Ensure the employee data is defined
      switchMap(([employee]) =>
        this.http.get<getEmployee[]>(`${this.api}/employee/no-customer-access/${customerId}/${employee!._id}`).pipe(
          catchError(error => {
            console.error('Error fetching employees for customer transfer:', error);
            throw error;
          })
        )
      )
    );
  }

  createEmployees(employeeData: CreateEmployee): Observable<getEmployee> {
    return this.http.post<getEmployee>(`${this.api}/employee`, employeeData)
  }

  /** The signed-in user's own profile (populated employment, access, targets, preferences, security). */
  getMyProfile(): Observable<MyProfile> {
    return this.http.get<MyProfile>(`${this.api}/employee/me/profile`)
  }

  /** Self-service edit of name, phone and preferences; the server always acts on the authenticated user. */
  updateMyProfile(data: UpdateMyProfile): Observable<Pick<MyProfile, 'firstName' | 'lastName' | 'contactNo' | 'preferences'>> {
    return this.http.patch<Pick<MyProfile, 'firstName' | 'lastName' | 'contactNo' | 'preferences'>>(`${this.api}/employee/me`, data, { context: context() })
  }

  changeMyPassword(passwords: { oldPassword: string, newPassword: string }): Observable<{ passwordChanged: boolean }> {
    return this.http.patch<{ passwordChanged: boolean }>(`${this.api}/employee/me/password`, passwords, { context: context() })
  }

  uploadMyPhoto(photo: File): Observable<{ success: boolean, photo: string }> {
    const formData = new FormData();
    formData.append('photo', photo);
    return this.http.patch<{ success: boolean, photo: string }>(`${this.api}/employee/me/photo`, formData, { context: context() })
  }

  removeMyPhoto(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.api}/employee/me/photo`, { context: context() })
  }

  editEmployees(employeeData: CreateEmployee): Observable<getEmployee> {
    return this.http.patch<getEmployee>(`${this.api}/employee/edit`, employeeData)
  }

  setTarget(tagetValues: Target, userId?: string): Observable<Target[]> {
    return this.http.patch<Target[]>(`${this.api}/employee/setTarget/${userId}`, tagetValues)
  }

  updateTarget(tagetValues: Target, id: string, userId?: string): Observable<Target[]> {
    return this.http.patch<Target[]>(`${this.api}/employee/update-target/${userId}/${id}`, tagetValues)
  }

  createCategory(categroyData: GetCategory) {
    return this.http.post(`${this.api}/category`, categroyData)
  }

  updateCategory(categroyData: GetCategory, categoryId?: string) {
    return this.http.patch(`${this.api}/category/${categoryId}`, categroyData)
  }

  getCategory(): Observable<GetCategory[]> {
    return this.http.get<GetCategory[]>(`${this.api}/category`)
  }

  getResponsibilities(): Observable<Responsibility[]> {
    return this.http.get<Responsibility[]>(`${this.api}/responsibility`)
  }

  createResponsibility(data: Pick<Responsibility, 'label' | 'description'>): Observable<Responsibility> {
    return this.http.post<Responsibility>(`${this.api}/responsibility`, data)
  }

  updateResponsibility(id: string, data: Partial<Responsibility>): Observable<Responsibility> {
    return this.http.patch<Responsibility>(`${this.api}/responsibility/${id}`, data)
  }

  deleteResponsibility(id: string): Observable<any> {
    return this.http.delete(`${this.api}/responsibility/${id}`)
  }

  employeeLogin(employeeData: Object): Observable<login> {
    return this.http.post(`${this.api}/employee/login`, employeeData)
  }

  // There's no employeeToken yet at login time, so the Azure access token is
  // attached explicitly here rather than relying on JwtInterceptor.
  employeeLoginWithMicrosoft(azureAccessToken: string): Observable<login> {
    return this.http.post(`${this.api}/employee/login-microsoft`, {}, {
      headers: new HttpHeaders({ Authorization: `Bearer ${azureAccessToken}` })
    })
  }

  getToken(): string | null {
    return <string | null>localStorage.getItem('employeeToken')
  }

  employeeToken(): any {
    let token = this.getToken()
    if (token) {
      const decodedToken = <{ id: string, employeeId: string }>jwtDecode(token);
      return decodedToken
    }
  }

  /** All active employees with their personal approval limit; category is the role id, not populated. */
  getEmployeeApprovalLimits() {
    return this.http.get<{ _id: string; employeeId: string; firstName: string; lastName: string; category: string; approvalLimit?: ApprovalLimit }[] | null>(`${this.api}/employee`)
  }

  /** All active employees with their individually-granted privilege flags; category is the role id, not populated. */
  getEmployeeExtraPrivileges() {
    return this.http.get<{ _id: string; employeeId: string; firstName: string; lastName: string; category: string; extraPrivileges?: Record<string, any>; extraPrivilegesExpiresAt?: string | null }[] | null>(`${this.api}/employee`)
  }

  /** Sets how many days from now this employee's individual grants last; null removes the expiry. */
  setEmployeeExtraPrivilegeExpiry(employeeId: string, days: number | null) {
    return this.http.patch<{ expiresAt: string | null }>(`${this.api}/employee/extra-privilege-expiry/${employeeId}`, { days })
  }

  setEmployeeApprovalLimit(employeeId: string, limit: ApprovalLimit) {
    return this.http.patch<ApprovalLimit>(`${this.api}/employee/approval-limit/${employeeId}`, limit)
  }

  blockEmployee(employeeId: string) {
    return this.http.patch(`${this.api}/employee/block/${employeeId}`, {})
  }

  /** Grants (value: true) or revokes (value: false) one individual privilege flag for this employee, on top of their role. */
  setEmployeeExtraPrivilege(employeeId: string, modulePath: string, value: boolean, action?: string) {
    return this.http.patch<Record<string, any>>(`${this.api}/employee/extra-privilege/${employeeId}`, { modulePath, action, value })
  }

  /** Manually links (or, with null, clears) this employee's Microsoft account for Azure AD sign-in. */
  setEmployeeMicrosoftId(employeeId: string, microsoftId: string | null) {
    return this.http.patch<{ microsoftId: string | null }>(`${this.api}/employee/microsoft-link/${employeeId}`, { microsoftId })
  }

  private currentEmployee$?: Observable<getEmployee>

  // The route guard, nav bar and settings all ask for the signed-in user at page load;
  // concurrent callers share one request instead of each hitting /employee/get.
  getEmployee(): Observable<getEmployee> {
    if (!this.currentEmployee$) {
      this.currentEmployee$ = this.http.get<getEmployee>(`${this.api}/employee/get`).pipe(
        map(withSuperAdminAccess),
        finalize(() => this.currentEmployee$ = undefined),
        shareReplay({ bufferSize: 1, refCount: false })
      )
    }
    return this.currentEmployee$
  }

  isEmployeePresent(): Observable<{ exists: boolean }> {
    return this.http.get<{ exists: boolean }>(`${this.api}/employee/check`)
  }

  getEmployeeByEmployeeId(employeeId: string, access?: string, userId?: string): Observable<getEmployeeByID> {
    return this.http.get<getEmployeeByID>(`${this.api}/employee/view/get/${employeeId}?access=${access}&userId=${userId}`)
  }

  getEmployeeData() {
    this.getEmployee().subscribe(
      (employeeData: getEmployee) => {
        this.employeeSubject.next(employeeData);
      }
    );
  }

  deleteCategory(data: { dataId: string, employee: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/category/delete`, data);
  }

  deleteEmployee(data: { dataId: string, employeeId: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/employee/delete`, data, { context: context() });
  }

  checkCurrentUserBlockedStatus(): Observable<getEmployee> {
    const token = this.employeeToken();
    if (token) {
      return this.getEmployee();
    }
    throw new Error('No user token found');
  }
}
