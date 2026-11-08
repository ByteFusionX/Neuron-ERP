import { Schema, Document, model, Types } from "mongoose";

interface Job extends Document {
    quoteId: Types.ObjectId;
    jobId: string;
    status: string;
    comment: string;
    createdDate: Date;
    updatedDate: Date;
    isDeleted: boolean;
    allocateStatus: string;
    allocateType : string;
    procurementPerson?: Types.ObjectId;
    allocatedBy?: Types.ObjectId;
    allocatedAt?: Date;
    productDistribution?: boolean;
    projectInstallation?: boolean;
    amc?: boolean;
    holdReason?: string;
    holdType?: string;
    lostReason?: string;
    lostAt?: Date;
    lostBy?: Types.ObjectId;
    // Set when a deal revoke puts the job on hold: where the job was, so a rejected re-submission can put it back.
    preRevokeStatus?: string;
    preRevokeAllocateStatus?: string;
}

export enum jobStatus {
    WorkInProgress = 'Work In Progress',
    Delivered = 'Delivered',
    PartiallyDelivered = 'Partially Delivered',
    Completed = 'Completed',
    Cancelled = 'Cancelled',
    OnHold = 'On Hold',
    PartiallyInvoiced = 'Partially Invoiced',
    Invoiced = 'Invoiced',
}

// Keep new values at the end: callers compare a job's position in this order against OpenToWork.
export enum allocateStatus {
    Pending = 'Pending',
    WorkInProgress = 'Work In Progress',
    OpenToWork = 'OpenToWork',
    Completed = 'Completed',
    Lost = 'Lost',
    OnHold = 'On Hold',
}

export enum allocateType {
    SupplyOnly = 'Supply Only',
    ProjectWithSupply = 'Project With Supply',
    ProjectsWithOutSupply = 'Projects With Out Supply',
    AMC = 'AMC'
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
    allocateStatus: {
        type: String,
        enum: Object.values(allocateStatus),
        default: allocateStatus.Pending
    },
    allocateType : {
        type : String,
        enum : Object.values(allocateType)
    },
    productDistribution: { type: Boolean },
    projectInstallation: { type: Boolean },
    amc: { type: Boolean },
    procurementPerson: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    allocatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    allocatedAt: { type: Date },
    holdReason: { type: String },
    // advance-payment: Finance raises a proforma, and receiving it returns the job to Pending.
    holdType: { type: String, enum: ['advance-payment', 'other'] },
    lostReason: { type: String },
    lostAt: { type: Date },
    lostBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    preRevokeStatus: { type: String },
    preRevokeAllocateStatus: { type: String },
});

export default model<Job>("Job", jobSchema);
