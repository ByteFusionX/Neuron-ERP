import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Project, ProjectFilter, ProjectResponse } from 'src/app/shared/interfaces/project.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  api: string = environment.api;

  constructor(private http: HttpClient) { }

  getProjects(filterParams: ProjectFilter): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${this.api}/technical/getProjects`, filterParams);
  }

  getProjectById(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.api}/project/${id}`);
  }

  createProject(project: Partial<Project>): Observable<Project> {
    return this.http.post<Project>(`${this.api}/project`, project);
  }

  updateProject(id: string, project: Partial<Project>): Observable<Project> {
    return this.http.patch<Project>(`${this.api}/project/${id}`, project);
  }

  deleteProject(id: string): Observable<any> {
    return this.http.delete(`${this.api}/project/${id}`);
  }

  updateProjectStatus(id: string, status: string): Observable<Project> {
    return this.http.patch<Project>(`${this.api}/project/status/${id}`, { status });
  }

  getProjectAndAMCJobs(filterParams: ProjectFilter): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${this.api}/project/getProjectAndAMCJobs`, filterParams);
  }

  transferEngineer(projectId: string, engineerId: string): Observable<any> {
    return this.http.post<any>(`${this.api}/technical/transferEngineer`, {
      projectId,
      engineerId
    })
  }

} 