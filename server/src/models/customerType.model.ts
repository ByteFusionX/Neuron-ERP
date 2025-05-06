import { Schema, Document, model, Types } from "mongoose";

interface customerType extends Document {
    customerTypeName: string;
    createdDate: Date;
    isDeleted: boolean;
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
    }
});

export default model<customerType>("CustomerType", customerTypeSchema);
