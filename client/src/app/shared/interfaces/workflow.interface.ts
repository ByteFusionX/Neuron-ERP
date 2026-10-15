export interface ApprovalStep {
    role: string;
    order: number;
    escalationHours?: number;
    escalationUnit?: 'minute' | 'hour' | 'day';
    /** Most this step can approve; larger requests skip it. */
    maxAmount?: number;
    /** Highest discount % this step can approve. */
    maxDiscount?: number;
    reminderPercent?: number;
    timeoutAction?: 'escalate' | 'notify' | 'reject';
    reminderEnabled?: boolean;
    /** Switched-off steps are skipped for new requests. */
    enabled?: boolean;
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

export interface ConditionFlags {
    time: boolean;
    amount: boolean;
    discount: boolean;
}

/** Values pre-filled into a new step when its condition is on. */
export interface ConditionDefaults {
    timeLimit?: number;
    timeUnit?: 'minute' | 'hour' | 'day';
    timeoutAction?: 'escalate' | 'notify' | 'reject';
    reminderPercent?: number;
    maxAmount?: number;
    maxDiscount?: number;
}

export interface WorkflowSettings {
    repeatReminder?: boolean;
    workingDays?: number[];
    /** "HH:mm" */
    workDayStart?: string;
    workDayEnd?: string;
    conditionFlags?: ConditionFlags;
    conditionDefaults?: ConditionDefaults;
}

export interface Workflow extends WorkflowSettings {
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

export interface CreateWorkflowRequest extends WorkflowSettings {
    feature: WorkflowFeature;
    steps: ApprovalStep[];
    needsManagerApproval?: boolean;
    skipRequesterRole?: boolean;
    repeatReminder?: boolean;
    businessHoursOnly?: boolean;
    workingDays?: number[];
    conditions?: WorkflowCondition[];
}

export interface UpdateWorkflowRequest extends WorkflowSettings {
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
    PO_APPROVAL = 'poApproval',
    DEAL_SHEET = 'dealSheet',
    PROJECT_CLAIM = 'projectClaim',
    CLAIM = 'claim',
}

export interface DeleteWorkflowResponse {
    success: boolean;
    message: string;
} 