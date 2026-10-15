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
    lostReason?: string;
    lostAt?: Date;
    lostBy?: Types.ObjectId;
}

export enum jobStatus {
    WorkInProgress = 'Work In Progress',
    Delivered = 'Delivered',
    PartiallyDelivered = 'Partially Delivered',
    Completed = 'Completed',
    Cancelled = 'Cancelled',
    OnHold = 'On Hold',
    Inovoiced = 'Inovoiced',
}

export enum allocateStatus {
    Pending = 'Pending',
    WorkInProgress = 'Work In Progress',
    OpenToWork = 'OpenToWork',
    Completed = 'Completed',
    Lost = 'Lost'
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
    lostReason: { type: String },
    lostAt: { type: Date },
    lostBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
});

export default model<Job>("Job", jobSchema);
