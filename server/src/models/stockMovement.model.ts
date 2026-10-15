import { Schema, model, Types } from "mongoose";

export const STOCK_MOVEMENT_TYPES = ['Receipt', 'Delivery', 'Return', 'Adjustment', 'Transfer', 'Quarantine', 'Release'] as const;
export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[number];

/** Sellable stock, or stock set aside until QC / a supplier return settles it. */
export const STOCK_BUCKETS = ['Available', 'Quarantine'] as const;
export type StockBucket = typeof STOCK_BUCKETS[number];

export const ADJUSTMENT_REASONS = ['Opening stock', 'Count correction', 'Damaged', 'Lost / missing', 'Found', 'Other'] as const;

/**
 * The only record of stock quantity. On hand is the sum of (quantityIn - quantityOut) per product and
 * warehouse, so nothing is ever edited or deleted: a cancel posts a reversing row (reversalOf).
 */
interface StockMovement {
    product: Types.ObjectId;
    warehouse?: Types.ObjectId;
    movementType: StockMovementType;
    stockStatus: StockBucket;
    quantityIn: number;
    quantityOut: number;
    unitCost?: number;
    totalCost?: number;
    referenceType?: string;
    referenceId?: Types.ObjectId;
    referenceNo?: string;
    reason?: string;
    remarks?: string;
    supplier?: Types.ObjectId;
    lpoNo?: string;
    reversalOf?: Types.ObjectId;
    movementDate: Date;
    createdBy?: Types.ObjectId;
    createdDate: Date;
    isDeleted: boolean;
}

const stockMovementSchema = new Schema<StockMovement>({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    warehouse: {
        type: Schema.Types.ObjectId,
        ref: 'Warehouse',
    },
    movementType: {
        type: String,
        enum: STOCK_MOVEMENT_TYPES,
        required: true,
    },
    stockStatus: {
        type: String,
        enum: STOCK_BUCKETS,
        default: 'Available',
    },
    quantityIn: {
        type: Number,
        default: 0,
        min: 0,
    },
    quantityOut: {
        type: Number,
        default: 0,
        min: 0,
    },
    unitCost: {
        type: Number,
        min: 0,
    },
    totalCost: {
        type: Number,
        min: 0,
    },
    referenceType: {
        type: String,
        trim: true,
    },
    referenceId: {
        type: Schema.Types.ObjectId,
    },
    referenceNo: {
        type: String,
        trim: true,
    },
    reason: {
        type: String,
        trim: true,
    },
    remarks: {
        type: String,
        trim: true,
    },
    supplier: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
    },
    lpoNo: {
        type: String,
        trim: true,
    },
    reversalOf: {
        type: Schema.Types.ObjectId,
        ref: 'StockMovement',
    },
    movementDate: {
        type: Date,
        default: Date.now,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    createdDate: {
        type: Date,
        default: Date.now,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

stockMovementSchema.index({ product: 1, warehouse: 1, movementDate: -1 });
stockMovementSchema.index({ referenceType: 1, referenceId: 1 });
stockMovementSchema.index({ reversalOf: 1 });

export default model<StockMovement>('StockMovement', stockMovementSchema);
