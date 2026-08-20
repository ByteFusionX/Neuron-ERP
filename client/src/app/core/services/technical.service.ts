import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Project } from 'src/app/shared/interfaces/project.interface';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface MaterialRequestStatusHistory {
  status: 'pending' | 'approved' | 'rejected';
  comment: string;
  changedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  changedDate: Date;
}

export interface MaterialRequest {
  _id?: string;
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
  remarks?: string;
  status?: 'pending' | 'approved' | 'rejected';
  statusHistory?: MaterialRequestStatusHistory[];
}

export interface MaterialRequestAttachment {
  fileName: string;
  originalname: string;
  status?: 'pending' | 'approved' | 'rejected';
  statusHistory?: MaterialRequestStatusHistory[];
}

export interface BillingSummary {
  _id?: string;
  invoicedAmount: number;
  invoicedAgainst: number;
  invoicedDate: Date;
  createdBy: string;
  createdAt: Date;
}

export interface TechnicalProject {
  materialRequest?: MaterialRequest[];
  status: string;
  supervisors?: string[];
  notes?: string;
  involvedPersons?: { name: string; designation: string }[];
  estimations:{type:string,value:string}[];
  priority: string;
  jobId?: string;
  estimatedCostForProject?: number;
}

export interface AssignEngineer {
  jobId: string;
  engineerId: string;
  comment: string;
  assignedBy?: string;
  projectType: string;
  customerId: string;
  priority: string;
}

export interface ProjectUpdate {
  _id?: string;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  message: string;
  attachments: { fileName: string; originalname: string }[];
  status: 'Drafted' | 'Sent';
  updatedBy: string;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class TechnicalService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

  assignEngineer(projectData: AssignEngineer): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/assignEngineer`, projectData);
  }

  createProject(projectData: AssignEngineer): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/createProject`, projectData, { context: context() });
  }

  getMaterialRequestByJobId(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/material-request/${jobId}`, { context: context() });
  }

  updateMaterialRequest(technicalId: string, formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-request/${technicalId}`, formData, { context: context() });
  }

  createTechnicalProject(projectData: TechnicalProject): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical`, projectData);
  }

  getTechnicalProjects(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical`);
  }

  getTechnicalProjectById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/${id}`);
  }

  updateTechnicalProject(id: string, projectData: Partial<TechnicalProject>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/${id}`, projectData);
  }

  deleteTechnicalProject(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/technical/${id}`);
  }

  getEngineers(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/getEngineers`);
  }

  getUnassignedJobsByCustomer(customerId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/unassigned-jobs/${customerId}`);
  }

  // Activity Plan CRUD
  getActivityPlans(technicalId: string, filters?: { 
    activityName?: string; 
    status?: string | string[]; 
    expectedStartDateFrom?: string; 
    expectedStartDateTo?: string;
    expectedEndDateFrom?: string;
    expectedEndDateTo?: string;
    actualStartDateFrom?: string;
    actualStartDateTo?: string;
    actualEndDateFrom?: string;
    actualEndDateTo?: string;
  }): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      if (filters.activityName) {
        params = params.set('activityName', filters.activityName);
      }
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          filters.status.forEach(s => params = params.append('status', s));
        } else {
          params = params.set('status', filters.status);
        }
      }
      if (filters.expectedStartDateFrom) {
        params = params.set('expectedStartDateFrom', filters.expectedStartDateFrom);
      }
      if (filters.expectedStartDateTo) {
        params = params.set('expectedStartDateTo', filters.expectedStartDateTo);
      }
      if (filters.expectedEndDateFrom) {
        params = params.set('expectedEndDateFrom', filters.expectedEndDateFrom);
      }
      if (filters.expectedEndDateTo) {
        params = params.set('expectedEndDateTo', filters.expectedEndDateTo);
      }
      if (filters.actualStartDateFrom) {
        params = params.set('actualStartDateFrom', filters.actualStartDateFrom);
      }
      if (filters.actualStartDateTo) {
        params = params.set('actualStartDateTo', filters.actualStartDateTo);
      }
      if (filters.actualEndDateFrom) {
        params = params.set('actualEndDateFrom', filters.actualEndDateFrom);
      }
      if (filters.actualEndDateTo) {
        params = params.set('actualEndDateTo', filters.actualEndDateTo);
      }
    }
    return this.http.get<any>(`${this.apiUrl}/technical/activity-plan/${technicalId}`, { params });
  }

  createActivityPlan(technicalId: string, activityPlan: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/activity-plan/${technicalId}`, activityPlan);
  }

  updateActivityPlan(technicalId: string, activityPlanId: string, activityPlan: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/activity-plan/${technicalId}/${activityPlanId}`, activityPlan);
  }

  closeActivityPlan(technicalId: string, activityPlanId: string, activityPlan: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/activity-plan/${technicalId}/${activityPlanId}/close`, activityPlan);
  }

  deleteActivityPlan(technicalId: string, activityPlanId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/technical/activity-plan/${technicalId}/${activityPlanId}`);
  }

  // Task CRUD
  getTasks(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/tasks/${id}`);
  }

  createTask(id: string, task: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/tasks/${id}`, task);
  }

  updateTask(id: string, taskId: string, task: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/tasks/${id}/${taskId}`, task);
  }

  getIssues(id: string, filterParams: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/issues/${id}`, filterParams);
  }

  createIssue(id: string, issue: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/issues/${id}`, issue);
  }

  updateIssue(id: string, issueId: string, issue: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/issues/${id}/${issueId}`, issue);
  }

  deleteIssue(id: string, issueId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/technical/issues/${id}/${issueId}`);
  }

  // Project Updates CRUD
  getProjectUpdates(technicalId: string, filterParams: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/project-updates/get/${technicalId}`, filterParams);
  }

  getProjectUpdateById(technicalId: string, updateId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/project-updates/${technicalId}/${updateId}`);
  }

  createProjectUpdate(technicalId: string, formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/project-updates/${technicalId}`, formData);
  }

  updateProjectUpdate(technicalId: string, updateId: string, formData: FormData): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/project-updates/${technicalId}/${updateId}`, formData);
  }

  deleteProjectUpdate(technicalId: string, updateId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/technical/project-updates/${technicalId}/${updateId}`);
  }

  removeProjectUpdateAttachment(technicalId: string, updateId: string, fileName: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/technical/project-updates/${technicalId}/${updateId}/remove-attachment`, { fileName });
  }

  // Billing Summary CRUD
  getBillingSummaries(technicalId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/billing-summary/${technicalId}`);
  }

  getBillingSummaryById(technicalId: string, billingSummaryId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/billing-summary/${technicalId}/${billingSummaryId}`);
  }

  createBillingSummary(technicalId: string, billingSummary: Omit<BillingSummary, '_id' | 'createdBy' | 'createdAt'>): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/billing-summary/${technicalId}`, billingSummary);
  }

  updateBillingSummary(technicalId: string, billingSummaryId: string, billingSummary: Partial<Omit<BillingSummary, '_id' | 'createdBy' | 'createdAt'>>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/technical/billing-summary/${technicalId}/${billingSummaryId}`, billingSummary);
  }

  deleteBillingSummary(technicalId: string, billingSummaryId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/technical/billing-summary/${technicalId}/${billingSummaryId}`);
  }

  getContacts(search: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/contacts/${search}`);
  }

  createContact(email: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/contacts`, { email });
  }

  getCostingDetails(projectId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/costing-details/${projectId}`);
  }

   getMrRequests(filterParams: any): Observable<any> {
      return this.http.post<any>(`${this.apiUrl}/technical/getMrRequests`, filterParams);
    }

  getPendingMaterialRequestProjects(filterParams: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/pending`, filterParams);
  }

  approveMaterialRequest(technicalId: string, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/approve`, { comment });
  }

  rejectMaterialRequest(technicalId: string, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/reject`, { comment });
  }

  approveMaterialRequestItem(technicalId: string, itemIndex: number, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/item/${itemIndex}/approve`, { comment }, { context: context() });
  }

  rejectMaterialRequestItem(technicalId: string, itemIndex: number, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/item/${itemIndex}/reject`, { comment }, { context: context() });
  }

  approveMaterialRequestFile(technicalId: string, fileIndex: number, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/file/${fileIndex}/approve`, { comment }, { context: context() });
  }

  rejectMaterialRequestFile(technicalId: string, fileIndex: number, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/file/${fileIndex}/reject`, { comment }, { context: context() });
  }

  approveAllPendingMaterialRequests(technicalId: string, comment: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-requests/${technicalId}/approve-all-pending`, { comment }, { context: context() });
  }
} 
