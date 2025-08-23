import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Project } from 'src/app/shared/interfaces/project.interface';

export interface MaterialRequest {
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
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
  jobId: string;
  materialRequest?: MaterialRequest[];
  status: string;
  projectType: string;
  supervisors?: string[];
  notes?: string;
  involvedPersons?: { name: string; designation: string }[];
  estimationCost:{type:string,value:string}[];
}

export interface AssignEngineer {
  jobId: string;
  engineerId: string;
  comment: string;
  assignedBy: string;
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

  updateMaterialRequest(technicalId: string, materialRequest: MaterialRequest[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/material-request/${technicalId}`, { materialRequest });
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

  // Activity Plan CRUD
  getActivityPlans(technicalId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/technical/activity-plan/${technicalId}`);
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
} 
