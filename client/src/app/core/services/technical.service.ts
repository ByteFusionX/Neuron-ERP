import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface MaterialRequest {
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
}

export interface TechnicalProject {
  jobId: string;
  materialRequest: MaterialRequest[];
  assignedTo: string;
  status: string;
  projectType: string;
}

@Injectable({
  providedIn: 'root'
})
export class TechnicalService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

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
} 