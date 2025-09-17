import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { 
    CreateWorkflowRequest, 
    UpdateWorkflowRequest, 
    WorkflowResponse, 
    WorkflowListResponse, 
    WorkflowFilter, 
    DeleteWorkflowResponse,
    WorkflowFeature 
} from 'src/app/shared/interfaces/workflow.interface';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root'
})
export class WorkflowService {

    private readonly api: string = environment.api;

    constructor(private http: HttpClient) { }

    createWorkflow(workflowData: CreateWorkflowRequest): Observable<WorkflowResponse> {
        return this.http.post<WorkflowResponse>(`${this.api}/workflow`, workflowData);
    }

    getWorkflows(filter?: WorkflowFilter): Observable<WorkflowListResponse> {
        let params = new HttpParams();
        
        if (filter?.feature) {
            params = params.set('feature', filter.feature);
        }
        if (filter?.page) {
            params = params.set('page', filter.page.toString());
        }
        if (filter?.row) {
            params = params.set('row', filter.row.toString());
        }

        return this.http.get<WorkflowListResponse>(`${this.api}/workflow`, { params });
    }

    updateWorkflow(id: string, workflowData: UpdateWorkflowRequest): Observable<WorkflowResponse> {
        return this.http.put<WorkflowResponse>(`${this.api}/workflow/${id}`, workflowData);
    }

    deleteWorkflow(id: string): Observable<DeleteWorkflowResponse> {
        return this.http.delete<DeleteWorkflowResponse>(`${this.api}/workflow/${id}`);
    }


    createClaimWorkflow(steps: { role: string; order: number }[]): Observable<WorkflowResponse> {
        const workflowData: CreateWorkflowRequest = {
            feature: WorkflowFeature.CLAIM,
            steps: steps.sort((a, b) => a.order - b.order)
        };
        return this.createWorkflow(workflowData);
    }

    createProjectClaimWorkflow(steps: { role: string; order: number }[]): Observable<WorkflowResponse> {
        const workflowData: CreateWorkflowRequest = {
            feature: WorkflowFeature.PROJECT_CLAIM,
            steps: steps.sort((a, b) => a.order - b.order)
        };
        return this.createWorkflow(workflowData);
    }

    updateWorkflowSteps(id: string, steps: { role: string; order: number }[]): Observable<WorkflowResponse> {
        const updateData: UpdateWorkflowRequest = {
            steps: steps.sort((a, b) => a.order - b.order)
        };
        return this.updateWorkflow(id, updateData);
    }

    sortWorkflowSteps(steps: { role: string; order: number }[]): { role: string; order: number }[] {
        return [...steps].sort((a, b) => a.order - b.order);
    }

    getNextStepOrder(existingSteps: { role: string; order: number }[]): number {
        if (!existingSteps || existingSteps.length === 0) return 1;
        return Math.max(...existingSteps.map(step => step.order)) + 1;
    }
}
