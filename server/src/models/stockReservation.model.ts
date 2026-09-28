import { Schema, model, Types } from "mongoose";

export const STOCK_RESERVATION_STATUSES = ['Active', 'Released', 'Expired', 'Converted'] as const;
export type StockReservationStatus = typeof STOCK_RESERVATION_STATUSES[number];

interface StockReservation {
    product: Types.ObjectId;
    warehouse?: Types.ObjectId;
    quote?: Types.ObjectId;
    deal?: Types.ObjectId;
    job?: Types.ObjectId;
    customer?: Types.ObjectId;
    project?: Types.ObjectId;
    sourceType: string;
    sourceRef?: Types.ObjectId;
    quantity: number;
    reservedFrom: Date;
    expiresAt: Date;
    status: StockReservationStatus;
    releaseReason?: string;
    releasedAt?: Date;
    releasedBy?: Types.ObjectId;
    createdBy: Types.ObjectId;
    createdDate: Date;
    updatedDate: Date;
    isDeleted: boolean;
}

const stockReservationSchema = new Schema<StockReservation>({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    warehouse: {
        type: Schema.Types.ObjectId,
        ref: 'Warehouse',
    },
    quote: {
        type: Schema.Types.ObjectId,
        ref: 'Quotation',
    },
    deal: {
        type: Schema.Types.ObjectId,
    },
    job: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
    },
    customer: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
    },
    project: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
    },
    sourceType: {
        type: String,
        enum: ['Manual', 'Quotation', 'Deal', 'Job', 'Project'],
        default: 'Manual',
    },
    sourceRef: {
        type: Schema.Types.ObjectId,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    reservedFrom: {
        type: Date,
        default: Date.now,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: STOCK_RESERVATION_STATUSES,
        default: 'Active',
    },
    releaseReason: {
        type: String,
        trim: true,
    },
    releasedAt: {
        type: Date,
    },
    releasedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
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
    updatedDate: {
        type: Date,
        default: Date.now,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

stockReservationSchema.index({ product: 1, warehouse: 1, status: 1, expiresAt: 1 });
stockReservationSchema.index({ quote: 1, status: 1 });
stockReservationSchema.index({ sourceType: 1, sourceRef: 1 });

export default model<StockReservation>('StockReservation', stockReservationSchema);
