import { Schema, Document, model, Types } from "mongoose";

interface Department extends Document {
    departmentName: string;
    departmentHead: Types.ObjectId;
    createdDate: Date;
    isDeleted: boolean;
    description?: string;
    parentDepartment?: Types.ObjectId;
    code?: string;
    costCentre?: string;
    isActive?: boolean;
}

const internalDepartmentSchema = new Schema<Department>({
    departmentName: {
        type: String,
        unique: true,
        required: true,
    },
    departmentHead: {
        type: Schema.Types.ObjectId, 
        ref: 'Employee'
    },
    createdDate: {
        type: Date,
        default: Date.now
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    // Optional additions: absent on existing documents, no migration needed.
    description: {
        type: String,
        required: false
    },
    parentDepartment: {
        type: Schema.Types.ObjectId,
        ref: 'InternalDepartment',
        required: false
    },
    code: { type: String, required: false },
    costCentre: { type: String, required: false },
    isActive: { type: Boolean, default: true }
});

export default model<Department>("InternalDepartment", internalDepartmentSchema);
