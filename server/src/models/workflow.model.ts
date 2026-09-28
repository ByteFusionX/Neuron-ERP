import { Types } from "mongoose";
import { model, Schema } from "mongoose";

interface ApprovalStep {
    role: Types.ObjectId;
    order: number;
    escalationHours?: number;
    escalationRole?: Types.ObjectId;
}

export interface Workflow {
    feature: string;
    steps: ApprovalStep[];
    needsManagerApproval: boolean;
    conditions?: WorkflowCondition[];
    autoActions?: WorkflowAutoAction[];
}

interface WorkflowCondition {
    field: string;
    operator: string;
    value: any;
}

interface WorkflowAutoAction {
    triggerStatus: string;
    action: string;
    enabled: boolean;
}

const approvalStepSchema = new Schema<ApprovalStep>({
    role: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Category'
    },
    order: {
        type: Number,
        required: true
    },
    escalationHours: {
        type: Number,
        min: 1,
    },
    escalationRole: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
    },
});

const workflowConditionSchema = new Schema<WorkflowCondition>({
    field: {
        type: String,
        required: true,
        trim: true
    },
    operator: {
        type: String,
        required: true,
        enum: ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'in', 'notIn', 'exists']
    },
    value: {
        type: Schema.Types.Mixed
    }
}, { _id: false });

const workflowAutoActionSchema = new Schema<WorkflowAutoAction>({
    triggerStatus: {
        type: String,
        required: true,
        trim: true
    },
    action: {
        type: String,
        required: true,
        enum: ['createSalesOrder', 'createProject']
    },
    enabled: {
        type: Boolean,
        default: true
    }
}, { _id: false });

const workflowSchema = new Schema<Workflow>({
    feature: {
        type: String,
        required: true,
        enum: ['claim', 'projectClaim', 'purchaseApproval', 'presale']
    },
    steps: {
        type: [approvalStepSchema],
        required: true,
        default: []
    },
    needsManagerApproval: {
        type: Boolean,
        required: true,
        default: false
    },
    conditions: {
        type: [workflowConditionSchema],
        default: []
    },
    autoActions: {
        type: [workflowAutoActionSchema],
        default: []
    },
});

export default model<Workflow>('Workflow', workflowSchema);
