import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
    providedIn: 'root'
})
export class ClaimService {

    private readonly api: string = environment.api;

    constructor(private http: HttpClient) { }

    createClaim(claimData: any): Observable<any> {
        return this.http.post<any>(`${this.api}/claim`, claimData, { context: context() });
    }

    getClaims(filters?: any): Observable<any> {
        let params = new HttpParams();
        
        if (filters?.reason) {
            params = params.set('reason', filters.reason);
        }
        if (filters?.raisedDate) {
            params = params.set('raisedDate', filters.raisedDate);
        }
        if (filters?.fromDate) {
            params = params.set('fromDate', filters.fromDate);
        }
        if (filters?.toDate) {
            params = params.set('toDate', filters.toDate);
        }
        if (filters?.firstName) {
            params = params.set('raisedBy', filters.firstName);
        }
        if (filters?.overallStatus) {
            params = params.set('status', filters.overallStatus );
        }
        if (filters?.page) {
            params = params.set('page', filters.page.toString());
        }
        if (filters?.row) {
            params = params.set('row', filters.row.toString());
        }
        if (filters?.technicalId) {
            params = params.set('technicalId', filters.technicalId);
        }

        return this.http.get<any>(`${this.api}/claim`, { params, context: context() });
    }

    getApprovalsByEmployee(filters?: any): Observable<any> {
        let params = new HttpParams();
        
        if (filters?.page) {
            params = params.set('page', filters.page.toString());
        }
        if (filters?.row) {
            params = params.set('row', filters.row.toString());
        }

        return this.http.get<any>(`${this.api}/claim/approvals`, { params, context: context() });
    }

    getClaimById(id: string): Observable<any> {
        return this.http.get<any>(`${this.api}/claim/${id}`);
    }

    updateClaimAndSubmit(id: string, claimData: any): Observable<any> {
        return this.http.put<any>(`${this.api}/claim/${id}`, claimData, { context: context() });
    }

    updateClaimStatus(id: string, statusData: any): Observable<any> {
        return this.http.put<any>(`${this.api}/claim/${id}/status`, statusData, { context: context() });
    }

    markClaimAsPaid(id: string, paymentData: { paidAmount?: number; paymentReference?: string }): Observable<any> {
        return this.http.patch<any>(`${this.api}/claim/${id}/mark-paid`, paymentData, { context: context() });
    }

    deleteClaim(id: string): Observable<any> {
        return this.http.delete<any>(`${this.api}/claim/${id}`, { context: context() });
    }

    removeClaimAttachment(id: string, fileName: string): Observable<any> {
        return this.http.put<any>(`${this.api}/claim/${id}/remove-attachment`, { fileName });
    }
}
