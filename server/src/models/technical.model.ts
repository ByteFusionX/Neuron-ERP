import { Schema, Document, model, Types } from "mongoose";

interface Technical {
    jobId: Types.ObjectId;
    materialRequest: MaterialRequest[];
    assignedTo: Types.ObjectId;
    status: string;
    projectType: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
}

interface MaterialRequest {
    itemName: string;
    quantity: number;
    estimatedCost: number;
    requiredOn: Date;    
}

const technicalSchema = new Schema<Technical>({
    jobId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Job'
    },
    materialRequest: {
        type: [],
        required: true,
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
        required: true
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
    updatedBy: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Employee'
    },
    updatedAt: {
        type: Date,
        required: true,
    },
})

export default model<Technical>('Technical', technicalSchema)