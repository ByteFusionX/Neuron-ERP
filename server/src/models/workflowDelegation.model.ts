import { model, Schema, Types } from "mongoose";

interface WorkflowDelegation {
    fromEmployee: Types.ObjectId;
    toEmployee: Types.ObjectId;
    startDate: Date;
    endDate: Date;
    reason?: string;
    active: boolean;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt?: Date;
}

const workflowDelegationSchema = new Schema<WorkflowDelegation>({
    fromEmployee: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    toEmployee: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    reason: {
        type: String,
        default: ''
    },
    active: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date
    }
});

workflowDelegationSchema.index({ fromEmployee: 1, startDate: 1, endDate: 1, active: 1 });

export default model<WorkflowDelegation>('WorkflowDelegation', workflowDelegationSchema);
