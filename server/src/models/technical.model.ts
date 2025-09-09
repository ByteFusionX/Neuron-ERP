import { Schema, Document, model, Types } from "mongoose";

interface Technical {
    jobId: Types.ObjectId;
    customer: Types.ObjectId;
    materialRequest: MaterialRequest[];
    tasks: Task[];
    issues: Issue[];
    assignedTo: Types.ObjectId;
    comment: string;
    status: string;
    projectType: string;
    assignedBy: Types.ObjectId;
    assignedAt: Date;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
    priority: string;
    supervisors: Types.ObjectId[];
    notes: string;
    involvedPersons: { name: string; designation: string }[];
    estimations: { type: string; value: string }[];
    activityPlan: ActivityPlan[];
    projectUpdates: ProjectUpdate[];
    billingSummary: BillingSummary[];
}

interface MaterialRequest {
    itemName: string;
    quantity: number;
    estimatedCost: number;
    requiredOn: Date;    
    remarks: string;
}

interface Task {
    taskName: string;
    description: string;
    priority: string;
    timeline: {
        expectedStartDate: Date;
        expectedEndDate: Date;
        expectedDuration: number;
    };
    progress: number;
    notes: string;
    associatedWith: Types.ObjectId[];
    status: string;
}

interface Issue {
    subject: string;
    customer: Types.ObjectId;
    issueType: string;
    raisedBy: string;
    description: string;
    status: string;
    respondedOn: Date;
    closedBy: Types.ObjectId;
    closedOn: Date;
    comments: string;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
}

interface ActivityPlan {
    activityName: string;
    startDate: Date;
    endDate: Date;
    orginalStartDate: Date;
    orginalEndDate: Date;
    includedEmployees: Types.ObjectId[];
    status: string;
    comment: string;
}

interface ProjectUpdate {
    subject: string;
    from: string;
    to: string[];
    cc: string[];
    message: string;
    attachments: { fileName: string; originalname: string }[];
    status: string;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
    createdDate: Date;
}

interface BillingSummary {
    invoicedAmount: number;
    invoicedAgainst: string;
    invoicedDate: Date;
    createdBy: Types.ObjectId;
    createdAt: Date;
}

const billingSummarySchema = new Schema<BillingSummary>({
    invoicedAmount: {
        type: Number,
        required: true,
    },
    invoicedAgainst: {
        type: String,
        required: true,
    },
    invoicedDate: {
        type: Date,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Employee'
    },
    createdAt: {
        type: Date,
        required: true,
    },
})

const projectUpdateSchema = new Schema<ProjectUpdate>({
    subject: {
        type: String,
        required: true,
    },
    from: {
        type: String,
        required: true,
    },
    to: {
        type: [String],
    },
    cc: {
        type: [String],
    },
    message: {
        type: String,
        required: true,
    },
    attachments: {
        type: [{
            fileName: String,
            originalname: String
        }],
        default: []
    },
    createdDate: {
        type: Date,
        required: true,
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    updatedAt: {
        type: Date,
    },
    status: {
        type: String,
        required: true,
        enum: ['Drafted', 'Sent', 'Failed']
    },
})

const activityPlanSchema = new Schema<ActivityPlan>({
    activityName: {
        type: String,
        required: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    orginalStartDate: {
        type: Date,
        required: false,
    },
    orginalEndDate: {
        type: Date,
        required: false,
    },
    includedEmployees: {
        type: [Schema.Types.ObjectId],
        ref: 'Employee'
    },
    status: {
        type: String,
        required: true,
        default: 'Pending',
        enum: ['Pending', 'Closed']
    },
    comment: {
        type: String,
        default: '',
        required: false,
    },
})

const issueSchema = new Schema<Issue>({
    subject: {
        type: String
    },
    customer: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Customer'
    },
    issueType: {
        type: String,
        enum: ['Hardware', 'Software', 'Network', 'Other']
    },
    raisedBy: {
        type: String
    },
    description: {
        type: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Resolved', 'Closed']
    },
    respondedOn: {
        type: Date
    },
    closedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    closedOn: {
        type: Date
    },
    comments: {
        type: String
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    updatedAt: {
        type: Date
    },
})

const taskSchema = new Schema<Task>({
    taskName: {
        type: String
    },
    description: {
        type: String
    },
    priority: {
        type: String,
        enum: ['High', 'Medium', 'Low']
    },
    timeline: {
        expectedStartDate: {
            type: Date
        },
        expectedEndDate: {
            type: Date
        },
        expectedDuration: {
            type: Number
        },
    },
    progress: {
        type: Number
    },
    notes: {
        type: String
    },
    associatedWith: {
        type: [Schema.Types.ObjectId],
        ref: 'Employee'
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Completed', 'Cancelled']
    },
})

const technicalSchema = new Schema<Technical>({
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job'
    },
    customer: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Customer'
    },
    materialRequest: {
        type: [],
        required: true,
        default: [],
    },
    tasks: {
        type: [taskSchema],
        required: true,
        default: [],
    },
    issues: {
        type: [issueSchema],
        required: true,
        default: [],
    },
    assignedTo: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Employee'
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Approved', 'Rejected']
    },
    projectType: {
        type: String,
        required:true,
        enum:['project','amc']
    },
    priority: {
        type: String,
        required: true,
        enum: ['High', 'Medium', 'Low']
    },
    assignedBy: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Employee'
    },
    assignedAt: {
        type: Date,
        required: true,
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    updatedAt: {
        type: Date,
    },
    activityPlan: {
        type: [activityPlanSchema],
        default: [],
    },
    projectUpdates: {
        type: [projectUpdateSchema],
        default: [],
    },
    billingSummary: {
        type: [billingSummarySchema],
        default: [],
    },
    supervisors: {
        type: [Types.ObjectId],
        default: [],
    },
    notes: {
        type: String,
        default: '',
    },
    involvedPersons: {
        type: [{ name: String, designation: String }],
        default: [],
    },
    estimations: {
        type: [
            {
              type: { type: String, required: true },
              value: { type: String, required: true },
            },
          ],
        default: [],
    },
})

export default model<Technical>('Technical', technicalSchema)