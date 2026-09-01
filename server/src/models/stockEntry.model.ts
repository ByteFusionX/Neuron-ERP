import { Schema, model, Types } from "mongoose";

interface StockEntry {
    grn?: Types.ObjectId;
    partNo: Types.ObjectId;
    itemCode?: string;
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
    isQuarantined: boolean;
    quarantineReason?: string;
    quarantinedAt?: Date;
    quarantineReleasedAt?: Date;
    quarantineReleasedBy?: Types.ObjectId;
    dn?: Types.ObjectId;
}

const stockEntrySchema = new Schema<StockEntry>({
    grn: {
        type: Schema.Types.ObjectId,
        ref: 'GRN',
    },
    partNo: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    itemCode: {
        type: String,
        trim: true,
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
    isQuarantined: {
        type: Boolean,
        default: false,
    },
    quarantineReason: {
        type: String,
        trim: true,
    },
    quarantinedAt: {
        type: Date,
    },
    quarantineReleasedAt: {
        type: Date,
    },
    quarantineReleasedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    dn: {
        type: Schema.Types.ObjectId,
        ref: 'DeliveryNote',
    },
});

export default model<StockEntry>('StockEntry', stockEntrySchema);


