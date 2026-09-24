import { Schema, Document, model, Types } from "mongoose";

interface Department extends Document {
    departmentName: string;
    departmentHead: Types.ObjectId;
    forCustomerContact:boolean;
    createdDate: Date;
    isDeleted: boolean;
    code?: string;
    isActive?: boolean;
    salesTarget?: number;
}

const departmentSchema = new Schema<Department>({
    departmentName: {
        type: String,
        unique: true,
        required: true,
    },
    departmentHead: {
        type: Schema.Types.ObjectId, 
        ref: 'Employee'
    },
    forCustomerContact: {
        type: Boolean,
        default: false
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
    code: { type: String, required: false },
    isActive: { type: Boolean, default: true },
    salesTarget: { type: Number, required: false, min: 0 }
});

export default model<Department>("Department", departmentSchema);
