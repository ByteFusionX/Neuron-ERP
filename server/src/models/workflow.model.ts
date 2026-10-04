import { Types } from "mongoose";
import { model, Schema } from "mongoose";

interface ApprovalStep {
    role: Types.ObjectId;
    order: number;
    /** Time limit amount, in `escalationUnit` (name kept for stored data; defaults to hours). */
    escalationHours?: number;
    escalationUnit?: 'minute' | 'hour' | 'day';
    escalationRole?: Types.ObjectId;
    /** Step only applies to requests at or above this amount. */
    minAmount?: number;
    /** Remind approvers once this % of the escalation window has elapsed. */
    reminderPercent?: number;
    /** What happens when the time limit passes: move up (default), only notify, or auto-reject. */
    timeoutAction?: 'escalate' | 'notify' | 'reject';
    /** Send the reminder at reminderPercent of the window. Defaults to on. */
    reminderEnabled?: boolean;
}

export interface Workflow {
    feature: string;
    steps: ApprovalStep[];
    needsManagerApproval: boolean;
    /** Skip a stage when the requester already holds that stage's role. */
    skipRequesterRole?: boolean;
    /** Super Admin (Stage 1): keep reminding daily once the last step is overdue. Defaults to on. */
    repeatReminder?: boolean;
    /** Bumped on every route change; stamped on approval entries so in-flight requests stay traceable. */
    version?: number;
    /** Count escalation/reminder hours only on working days. */
    businessHoursOnly?: boolean;
    /** Working weekdays, 0 = Sunday. Defaults to Sunday–Thursday (Qatar). */
    workingDays?: number[];
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
    escalationUnit: {
        type: String,
        enum: ['minute', 'hour', 'day'],
        default: 'hour',
    },
    escalationRole: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
    },
    minAmount: {
        type: Number,
        min: 0,
    },
    reminderPercent: {
        type: Number,
        min: 1,
        max: 99,
    },
    timeoutAction: {
        type: String,
        enum: ['escalate', 'notify', 'reject'],
        default: 'escalate',
    },
    reminderEnabled: {
        type: Boolean,
        default: true,
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
    skipRequesterRole: {
        type: Boolean,
        default: true
    },
    repeatReminder: {
        type: Boolean,
        default: true
    },
    version: {
        type: Number,
        default: 1
    },
    businessHoursOnly: {
        type: Boolean,
        default: false
    },
    workingDays: {
        type: [Number],
        default: [0, 1, 2, 3, 4]
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
