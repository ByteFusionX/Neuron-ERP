import { Schema, Document, model, Types } from "mongoose";

interface Job extends Document {
    quoteId: Types.ObjectId;
    jobId: string;
    status: string;
    comment:string;
    createdDate: Date;
    updatedDate: Date;
    isDeleted: boolean;
    purchaseOrderId: Types.ObjectId
}

export enum jobStatus {
    WorkInProgress = 'Work In Progress',
    Delivered = 'Delivered',
    PartiallyDelivered = 'Partially Delivered',
    Completed = 'Completed',
    Cancelled = 'Cancelled',
    OnHold = 'On Hold',
    Inovoiced = 'Inovoiced',
    purchaseRequested = 'Purchase Requested'
}

const jobSchema = new Schema<Job>({
    quoteId: {
        type: Schema.Types.ObjectId,
        ref: 'Quotation',
        required: true,
    },
    jobId: {
        type: String,
        required: true,
        unique: true,
    },
    comment: {
        type: String,
    },
    status: {
        type: String,
        enum: Object.values(jobStatus),
        default: jobStatus.WorkInProgress,
    },
    createdDate: {
        type: Date,
        default: Date.now
    },
    updatedDate: {
        type: Date,
        default: Date.now
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    purchaseOrderId: {
        type: Schema.Types.ObjectId,
        ref: 'PurchaseOrder'
    }
});

export default model<Job>("Job", jobSchema);
