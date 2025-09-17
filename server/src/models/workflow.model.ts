import { Types } from "mongoose";
import { model, Schema } from "mongoose";

interface ApprovalStep {
    role: Types.ObjectId;
    order: number;
}

export interface Workflow {
    feature: string;
    steps: ApprovalStep[];
    needsManagerApproval: boolean;
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
});

const workflowSchema = new Schema<Workflow>({
    feature: {
        type: String,
        required: true,
        enum: ['claim', 'projectClaim']
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
    }
});

export default model<Workflow>('Workflow', workflowSchema);