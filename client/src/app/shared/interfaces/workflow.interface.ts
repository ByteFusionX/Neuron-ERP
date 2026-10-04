export interface ApprovalStep {
    role: string;
    order: number;
    escalationHours?: number;
    escalationUnit?: 'minute' | 'hour' | 'day';
    minAmount?: number;
    reminderPercent?: number;
    timeoutAction?: 'escalate' | 'notify' | 'reject';
    reminderEnabled?: boolean;
    escalationRole?: string | { _id?: string; categoryName: string };
}

export interface ApprovalStepUI {
    role: {
        _id?: string;
        categoryName: string;
    };
    order: number;
}

export interface WorkflowCondition {
    field: string;
    operator: string;
    value?: any;
}

export interface Workflow {
    _id?: string;
    feature: WorkflowFeature;
    steps: ApprovalStep[];
    needsManagerApproval?: boolean;
    skipRequesterRole?: boolean;
    repeatReminder?: boolean;
    businessHoursOnly?: boolean;
    workingDays?: number[];
    conditions?: WorkflowCondition[];
    version?: number;
}

export interface CreateWorkflowRequest {
    feature: WorkflowFeature;
    steps: ApprovalStep[];
    needsManagerApproval?: boolean;
    skipRequesterRole?: boolean;
    repeatReminder?: boolean;
    businessHoursOnly?: boolean;
    workingDays?: number[];
    conditions?: WorkflowCondition[];
}

export interface UpdateWorkflowRequest {
    feature?: WorkflowFeature;
    steps?: ApprovalStep[];
    needsManagerApproval?: boolean;
    skipRequesterRole?: boolean;
    repeatReminder?: boolean;
    businessHoursOnly?: boolean;
    workingDays?: number[];
    conditions?: WorkflowCondition[];
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
    PRESALE = 'presale',
    PURCHASE_APPROVAL = 'purchaseApproval',
    PROJECT_CLAIM = 'projectClaim',
    CLAIM = 'claim',
}

export interface DeleteWorkflowResponse {
    success: boolean;
    message: string;
} 