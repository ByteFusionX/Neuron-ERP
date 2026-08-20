import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Project, ProjectFilter, ProjectResponse } from 'src/app/shared/interfaces/project.interface';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  api: string = environment.api;

  constructor(private http: HttpClient) { }

  getProjects(filterParams: ProjectFilter): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${this.api}/technical/getProjects`, filterParams, { context: context() });
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
    return this.http.delete(`${this.api}/project/${id}`, { context: context() });
  }

  updateProjectStatus(id: string, status: string): Observable<Project> {
    return this.http.patch<Project>(`${this.api}/project/status/${id}`, { status });
  }

  getProjectAndAMCJobs(filterParams: ProjectFilter): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${this.api}/project/getProjectAndAMCJobs`, filterParams, { context: context() });
  }

  transferEngineer(projectId: string, engineerId: string): Observable<any> {
    return this.http.post<any>(`${this.api}/technical/transferEngineer`, {
      projectId,
      engineerId
    }, { context: context() })
  }

}