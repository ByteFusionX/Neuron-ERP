import { Schema, model, Types } from "mongoose";

interface InventoryDeduction {
    dnId: Types.ObjectId;
    dnNo: string;
    dnDate: Date;
    jobId: Types.ObjectId;
    customerName: string;
    stockEntryId: Types.ObjectId;
    productId: Types.ObjectId;
    partNo: string;
    description: string;
    uom?: string;
    quantityDeducted: number;
    stockBefore: number;
    stockAfter: number;
    deductedBy?: Types.ObjectId;
    deductedDate: Date;
    isReversed: boolean;
    reversedDate?: Date;
}

const inventoryDeductionSchema = new Schema<InventoryDeduction>({
    dnId: {
        type: Schema.Types.ObjectId,
        ref: 'DeliveryNote',
        required: true,
    },
    dnNo: {
        type: String,
        required: true,
    },
    dnDate: {
        type: Date,
        required: true,
    },
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
        required: true,
    },
    customerName: {
        type: String,
        default: '',
    },
    stockEntryId: {
        type: Schema.Types.ObjectId,
        ref: 'StockEntry',
        required: true,
    },
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    partNo: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    uom: {
        type: String,
        trim: true,
    },
    quantityDeducted: {
        type: Number,
        required: true,
        min: 0,
    },
    stockBefore: {
        type: Number,
        required: true,
    },
    stockAfter: {
        type: Number,
        required: true,
    },
    deductedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    deductedDate: {
        type: Date,
        required: true,
        default: Date.now,
    },
    isReversed: {
        type: Boolean,
        default: false,
    },
    reversedDate: {
        type: Date,
    },
});

inventoryDeductionSchema.index({ dnId: 1 });
inventoryDeductionSchema.index({ productId: 1 });
inventoryDeductionSchema.index({ stockEntryId: 1 });
inventoryDeductionSchema.index({ isReversed: 1 });

export default model<InventoryDeduction>('InventoryDeduction', inventoryDeductionSchema);
