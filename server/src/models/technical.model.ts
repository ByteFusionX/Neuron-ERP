import { Schema, Document, model, Types } from "mongoose";

interface Technical {
    jobId: Types.ObjectId;
    customer: Types.ObjectId;
    materialRequest: MaterialRequest[];
    tasks: Task[];
    assignedTo: Types.ObjectId;
    comment: string;
    status: string;
    projectType: string;
    assignedBy: Types.ObjectId;
    assignedAt: Date;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
    priority: string;
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
        type: [],
        required: true,
        default: [],
    },
    tasks: {
        type: [taskSchema],
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
})

export default model<Technical>('Technical', technicalSchema)