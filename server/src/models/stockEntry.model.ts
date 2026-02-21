import { Schema, model, Types } from "mongoose";

interface StockEntry {
    grn: string;
    partNo: Types.ObjectId;
    dateOfPurchase: Date;
    jobId?: Types.ObjectId;
    supplierName: Types.ObjectId;
    supplierLpoNo?: string;
    productDescription: string;
    productSegment: Types.ObjectId;
    productCategory: Types.ObjectId;
    targetWarehouse: Types.ObjectId;
    quantity: number;
    uom?: string;
    unitCost: number;
    totalCost: number;
    sellingPrice?: number;
    serialNumbers?: string[];
    remarks?: string;
    createdBy: Types.ObjectId;
    createdDate: Date;
    updatedDate: Date;
    updatedBy?: Types.ObjectId;
    isDeleted: boolean;
}

const stockEntrySchema = new Schema<StockEntry>({
    grn: {
        type: String,
        required: true,
        unique: true,
    },
    partNo: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    dateOfPurchase: {
        type: Date,
        required: true,
    },
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
    },
    supplierName: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true,
    },
    supplierLpoNo: {
        type: String,
    },
    productDescription: {
        type: String,
        required: true,
    },
    productSegment: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
    },
    productCategory: {
        type: Schema.Types.ObjectId,
        ref: 'ProductCategory',
        required: true,
    },
    targetWarehouse: {
        type: Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
    },
    uom: {
        type: String,
        trim: true,
    },
    unitCost: {
        type: Number,
        required: true,
        min: 0,
    },
    totalCost: {
        type: Number,
        required: true,
        min: 0,
    },
    sellingPrice: {
        type: Number,
        min: 0,
    },
    serialNumbers: {
        type: [String],
        default: [],
    },
    remarks: {
        type: String,
        trim: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    createdDate: {
        type: Date,
        required: true,
    },
    updatedDate: {
        type: Date,
        default: Date.now,
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

export default model<StockEntry>('StockEntry', stockEntrySchema);


