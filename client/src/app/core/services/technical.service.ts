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

export interface TechnicalProject {
  jobId: string;
  materialRequest: MaterialRequest[];
  status: string;
  projectType: string;
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

@Injectable({
  providedIn: 'root'
})
export class TechnicalService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

  assignEngineer(projectData: AssignEngineer): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/technical/assignEngineer`, projectData);
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
} 
