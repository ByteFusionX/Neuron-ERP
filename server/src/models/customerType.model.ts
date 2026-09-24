import { Schema, Document, model, Types } from "mongoose";

interface customerType extends Document {
    customerTypeName: string;
    createdDate: Date;
    isDeleted: boolean;
    isActive?: boolean;
    defaultDiscount?: number;
}

const customerTypeSchema = new Schema<customerType>({
    customerTypeName: {
        type: String,
        required: true,
    },
   createdDate: {
        type: Date,
        default: Date.now
    },
    isDeleted: {          
        type: Boolean,
        default: false
    },
    isActive: { type: Boolean, default: true },
    defaultDiscount: { type: Number, required: false, min: 0, max: 100 }
});

export default model<customerType>("CustomerType", customerTypeSchema);
