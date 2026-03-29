import { Schema, model, Types } from "mongoose";

interface StockBlock {
    stockEntryId: Types.ObjectId;
    salesPersonName: string;
    customerId?: Types.ObjectId;
    customerName: string;
    quantity: number;
    fromDate: Date;
    toDate: Date;
    createdBy: Types.ObjectId;
    createdDate: Date;
    updatedDate: Date;
    isDeleted: boolean;
}

const stockBlockSchema = new Schema<StockBlock>({
    stockEntryId: {
        type: Schema.Types.ObjectId,
        ref: 'StockEntry',
        required: true,
    },
    salesPersonName: {
        type: String,
        required: true,
        trim: true,
    },
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
    },
    customerName: {
        type: String,
        required: true,
        trim: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    fromDate: {
        type: Date,
        required: true,
    },
    toDate: {
        type: Date,
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    createdDate: {
        type: Date,
        required: true,
        default: Date.now,
    },
    updatedDate: {
        type: Date,
        default: Date.now,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

stockBlockSchema.index({ stockEntryId: 1, isDeleted: 1 });
stockBlockSchema.index({ toDate: 1 });

export default model<StockBlock>('StockBlock', stockBlockSchema);
