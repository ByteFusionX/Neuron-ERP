import { Schema, Document, model, Types } from "mongoose";

interface Department extends Document {
    departmentName: string;
    departmentHead: Types.ObjectId;
    forCustomerContact:boolean;
    createdDate: Date;
    isDeleted: boolean;
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
    }
});

export default model<Department>("Department", departmentSchema);
