import { Schema, Document, model, Types } from "mongoose";

export enum RfqStatus {
    Draft = 'Draft',
    Open = 'Open',
    Quoted = 'Quoted',
    Awarded = 'Awarded',
    Closed = 'Closed',
    Cancelled = 'Cancelled'
}

export interface RfqQuote {
    supplierId?: Types.ObjectId;
    supplierName?: string;
    itemDetailKey: string;
    itemName?: string;
    detail: string;
    quantity: number;
    unitPrice: number;
    discountType?: 'amount' | 'percent';
    discountValue?: number;
    taxPercent?: number;
    freightCost?: number;
    totalCost?: number;
    netAmount?: number;
    landedCost?: number;
    etaTerms?: string;
    paymentTerms?: string;
    validityDate?: Date;
    warrantyTerms?: string;
    remarks?: string;
    selected: boolean;
    createdBy?: Types.ObjectId;
    createdAt?: Date;
}

export interface Rfq extends Document {
    rfqNo: string;
    purchaseRequestId: Types.ObjectId;
    purchaseNo?: string;
    jobId?: Types.ObjectId;
    customerId?: Types.ObjectId;
    status: RfqStatus;
    requestedLines: {
        itemDetailKey: string;
        itemName?: string;
        detail: string;
        quantity: number;
        estimatedUnitCost?: number;
        partNo?: Types.ObjectId;
    }[];
    quotes: RfqQuote[];
    deadline?: Date;
    notes?: string;
    awardedAt?: Date;
    awardedBy?: Types.ObjectId;
    createdBy: Types.ObjectId;
    updatedBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt?: Date;
    isDeleted: boolean;
}

const rfqRequestedLineSchema = new Schema({
    itemDetailKey: { type: String, required: true },
    itemName: { type: String },
    detail: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    estimatedUnitCost: { type: Number, min: 0 },
    partNo: { type: Schema.Types.ObjectId, ref: 'Product' }
}, { _id: false });

const rfqQuoteSchema = new Schema<RfqQuote>({
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String },
    itemDetailKey: { type: String, required: true },
    itemName: { type: String },
    detail: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discountValue: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    freightCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, default: 0, min: 0 },
    landedCost: { type: Number, default: 0, min: 0 },
    etaTerms: { type: String },
    paymentTerms: { type: String },
    validityDate: { type: Date },
    warrantyTerms: { type: String },
    remarks: { type: String },
    selected: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const rfqSchema = new Schema<Rfq>({
    rfqNo: { type: String, required: true, unique: true },
    purchaseRequestId: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true },
    purchaseNo: { type: String },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    status: {
        type: String,
        enum: Object.values(RfqStatus),
        default: RfqStatus.Open,
        required: true
    },
    requestedLines: { type: [rfqRequestedLineSchema], default: [] },
    quotes: { type: [rfqQuoteSchema], default: [] },
    deadline: { type: Date },
    notes: { type: String },
    awardedAt: { type: Date },
    awardedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    isDeleted: { type: Boolean, default: false }
});

rfqSchema.index({ purchaseRequestId: 1, isDeleted: 1 });
rfqSchema.index({ status: 1, createdAt: -1 });

export default model<Rfq>('Rfq', rfqSchema);
