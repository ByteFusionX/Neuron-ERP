import { Schema, model, Types } from "mongoose";

export const STOCK_MOVEMENT_TYPES = ['Receipt', 'Delivery', 'Adjustment', 'Transfer', 'Quarantine', 'Reservation', 'Release'] as const;
export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[number];

interface StockMovement {
    product: Types.ObjectId;
    warehouse?: Types.ObjectId;
    stockEntry?: Types.ObjectId;
    movementType: StockMovementType;
    quantityIn: number;
    quantityOut: number;
    reservedQuantity: number;
    unitCost?: number;
    totalCost?: number;
    referenceType?: string;
    referenceId?: Types.ObjectId;
    referenceNo?: string;
    remarks?: string;
    movementDate: Date;
    createdBy: Types.ObjectId;
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
    stockEntry: {
        type: Schema.Types.ObjectId,
        ref: 'StockEntry',
    },
    movementType: {
        type: String,
        enum: STOCK_MOVEMENT_TYPES,
        required: true,
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
    reservedQuantity: {
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
    remarks: {
        type: String,
        trim: true,
    },
    movementDate: {
        type: Date,
        default: Date.now,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
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
stockMovementSchema.index({ stockEntry: 1 });

export default model<StockMovement>('StockMovement', stockMovementSchema);
