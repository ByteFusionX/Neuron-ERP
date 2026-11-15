import { Schema, model, Types } from "mongoose";

export const PROJECT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Lost', 'Rejected'] as const;
export type ProjectWorkStatus = typeof PROJECT_STATUSES[number];

interface ProjectStatusHistory {
    status: ProjectWorkStatus;
    remarks: string;
    changedBy: Types.ObjectId;
    changedAt: Date;
}

export interface Project {
    projectNumber: string;
    technical: Types.ObjectId;
    jobId: Types.ObjectId;
    customer: Types.ObjectId;
    projectType: 'project' | 'amc';
    allocateType: string;
    priority: 'High' | 'Medium' | 'Low';
    assignedTo: Types.ObjectId;
    assignedBy: Types.ObjectId;
    assignedAt: Date;
    status: ProjectWorkStatus;
    startedAt: Date;
    startedBy: Types.ObjectId;
    completedAt?: Date;
    lostAt?: Date;
    closureRemarks: string;
    estimatedCostForProject: number;
    statusHistory: ProjectStatusHistory[];
    createdAt: Date;
    updatedAt: Date;
}

const statusHistorySchema = new Schema<ProjectStatusHistory>({
    status: { type: String, enum: PROJECT_STATUSES, required: true },
    remarks: { type: String, default: '' },
    changedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    changedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const projectSchema = new Schema<Project>({
    projectNumber: { type: String, required: true, unique: true },
    // The assignment record this project was started from.
    technical: { type: Schema.Types.ObjectId, ref: 'Technical', required: true, unique: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    projectType: { type: String, enum: ['project', 'amc'], required: true },
    allocateType: { type: String, default: '' },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    assignedAt: { type: Date, required: true },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: 'In Progress' },
    startedAt: { type: Date, required: true, default: Date.now },
    startedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    completedAt: { type: Date },
    lostAt: { type: Date },
    closureRemarks: { type: String, default: '' },
    estimatedCostForProject: { type: Number, default: 0 },
    statusHistory: { type: [statusHistorySchema], default: [] },
}, { timestamps: true });

projectSchema.index({ status: 1, updatedAt: -1 });
projectSchema.index({ assignedTo: 1 });

export default model<Project>('Project', projectSchema);
