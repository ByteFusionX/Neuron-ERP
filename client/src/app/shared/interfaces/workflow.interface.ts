export interface ApprovalStep {
    role: string;
    order: number;
}

export interface ApprovalStepUI {
    role: {
        _id?: string;
        categoryName: string;
    };
    order: number;
}

export interface Workflow {
    _id?: string;
    feature: WorkflowFeature;
    steps: ApprovalStep[];
    needsManagerApproval?: boolean;
}

export interface CreateWorkflowRequest {
    feature: WorkflowFeature;
    steps: ApprovalStep[];
    needsManagerApproval?: boolean;
}

export interface UpdateWorkflowRequest {
    feature?: WorkflowFeature;
    steps?: ApprovalStep[];
    needsManagerApproval?: boolean;
}

export interface WorkflowResponse {
    success: boolean;
    message?: string;
    data?: Workflow;
    error?: string;
}

export interface WorkflowListResponse {
    success: boolean;
    message?: string;
    data?: Workflow[];
    pagination?: {
        page: number;
        row: number;
        total: number;
        totalPages: number;
    };
}

export interface WorkflowFilter {
    feature?: WorkflowFeature;
    page?: number;
    row?: number;
}

export enum WorkflowFeature {
    CLAIM = 'claim',
    PROJECT_CLAIM = 'projectClaim',
    PURCHASE_APPROVAL = 'purchaseApproval'
}

export interface DeleteWorkflowResponse {
    success: boolean;
    message: string;
} 