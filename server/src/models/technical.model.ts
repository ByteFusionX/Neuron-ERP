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
    activityPlan: ActivityPlan[];
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

const MaterialRequestSchema = new Schema({
    itemName: {
        type: String,
        required: true,
        trim: true  
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    estimatedCost: {
        type: Number,
        required: true,
        min: 0
    },
    requiredOn: {
        type: Date,
        required: true
    },
    remarks: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});


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
        required: true,
        ref: 'Job'
    },
    customer: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Customer'
    },
    materialRequest: {
        type: [MaterialRequestSchema],
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
        required: true,
        enum: ['project', 'amc']
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
})

export default model<Technical>('Technical', technicalSchema)