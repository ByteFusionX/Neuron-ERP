import { Types } from "mongoose";
import { model, Schema } from "mongoose";

interface ApprovalStep {
    role: Types.ObjectId;
    order: number;
    /** Time limit amount, in `escalationUnit` (name kept for stored data; defaults to hours). */
    escalationHours?: number;
    escalationUnit?: 'minute' | 'hour' | 'day';
    escalationRole?: Types.ObjectId;
    /** Most this step can approve; larger requests skip it and go to a higher step. Empty = no limit. */
    maxAmount?: number;
    /** Highest discount % this step can approve; larger discounts skip it. Empty = no limit. */
    maxDiscount?: number;
    /** Remind approvers once this % of the escalation window has elapsed. */
    reminderPercent?: number;
    /** What happens when the time limit passes: move up (default), only notify, or auto-reject. */
    timeoutAction?: 'escalate' | 'notify' | 'reject';
    /** Send the reminder at reminderPercent of the window. Defaults to on. */
    reminderEnabled?: boolean;
    /** Switched off steps are skipped for new requests. Defaults to on. */
    enabled?: boolean;
}

/** Which limits new steps of a module start with. Stored steps keep the conditions they were created with. */
export interface WorkflowConditionFlags {
    time: boolean;
    amount: boolean;
    discount: boolean;
}

/** Values pre-filled into a new step when its condition is on. */
export interface WorkflowConditionDefaults {
    timeLimit?: number;
    timeUnit?: 'minute' | 'hour' | 'day';
    timeoutAction?: 'escalate' | 'notify' | 'reject';
    reminderPercent?: number;
    maxAmount?: number;
    maxDiscount?: number;
}

export interface Workflow {
    feature: string;
    steps: ApprovalStep[];
    needsManagerApproval: boolean;
    /** Legacy flag, always true. getWorkflowSteps now always skips the requester's stage and every stage below it. */
    skipRequesterRole?: boolean;
    /** Super Admin (Stage 1): keep reminding daily once the last step is overdue. Defaults to on. */
    repeatReminder?: boolean;
    /** Bumped on every route change; stamped on approval entries so in-flight requests stay traceable. */
    version?: number;
    /** Legacy flag; time limits now always count working time. */
    businessHoursOnly?: boolean;
    /** Working weekdays, 0 = Sunday. Defaults to Sunday–Thursday (Qatar). */
    workingDays?: number[];
    /** Working day start/end as "HH:mm" (Qatar time). Time limits only run inside this window. */
    workDayStart?: string;
    workDayEnd?: string;
    conditionFlags?: WorkflowConditionFlags;
    conditionDefaults?: WorkflowConditionDefaults;
    /** 2 = global workflow (bottom step first, Admin pinned on top). */
    layoutVersion?: number;
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
    maxAmount: {
        type: Number,
        min: 0,
    },
    maxDiscount: {
        type: Number,
        min: 0,
        max: 100,
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
    enabled: {
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
    workDayStart: { type: String, default: '08:00' },
    workDayEnd: { type: String, default: '17:00' },
    conditionFlags: {
        type: new Schema({
            time: { type: Boolean, default: true },
            amount: { type: Boolean, default: false },
            discount: { type: Boolean, default: false },
        }, { _id: false }),
        default: () => ({ time: true, amount: false, discount: false }),
    },
    conditionDefaults: {
        type: new Schema({
            timeLimit: { type: Number, min: 1 },
            timeUnit: { type: String, enum: ['minute', 'hour', 'day'] },
            timeoutAction: { type: String, enum: ['escalate', 'notify', 'reject'] },
            reminderPercent: { type: Number, min: 1, max: 99 },
            maxAmount: { type: Number, min: 0 },
            maxDiscount: { type: Number, min: 0, max: 100 },
        }, { _id: false }),
        default: () => ({}),
    },
    layoutVersion: { type: Number, default: 2 },
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
