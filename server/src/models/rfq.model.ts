import { Schema, Document, model, Types } from "mongoose";

export enum RfqStatus {
    Draft = 'Draft',
    Open = 'Open',
    Quoted = 'Quoted',
    Awarded = 'Awarded',
    Closed = 'Closed',
    Cancelled = 'Cancelled'
}

/** Sales RFQs collect indicative supplier prices before a customer quote; Procurement RFQs come from an approved PR. */
export enum RfqType {
    Sales = 'Sales',
    Procurement = 'Procurement'
}

/** One business RFQ lifecycle, even when Sales and Procurement use different screens. */
export enum RfqStage {
    Draft = 'Draft',
    SentToSupplier = 'Sent to Supplier',
    SupplierResponded = 'Supplier Responded',
    SalesSelected = 'Sales Selected',
    ProcurementReview = 'Procurement Review',
    ProcurementRevised = 'Procurement Revised',
    FinalizedForPo = 'Finalized for PO',
    Closed = 'Closed',
    Cancelled = 'Cancelled'
}

/** Sales stage only: a line is ready for quoting once it is Confirmed or Unavailable. */
export enum RfqLineStatus {
    Pending = 'Pending',
    Confirmed = 'Confirmed',
    Unavailable = 'Unavailable',
    /** The same product was awarded to another supplier's RFQ on the same enquiry. */
    Lost = 'Lost'
}

export enum RfqAvailability {
    Available = 'Available',
    Limited = 'Limited',
    Unavailable = 'Unavailable'
}

/** Where one supplier's request stands. Sending happens outside the system (email, phone, WhatsApp). */
export enum RfqSupplierStatus {
    NotSent = 'Not Sent',
    Sent = 'Sent',
    Replied = 'Replied',
    Declined = 'Declined'
}

/** Why a supplier would not quote, so refusals can be read across suppliers later. */
export const RFQ_DECLINE_REASONS = ['Price not competitive', 'No stock', 'Lead time too long', 'Not in their range', 'Terms not acceptable', 'No response', 'Other'] as const;

/**
 * A chase on the RFQ, optionally for one supplier: `scheduled` (open, has `dueDate`), `done` (has an
 * outcome) or `cancelled`. Kept apart from the enquiry's own follow-ups.
 */
export interface RfqFollowUp {
    _id?: Types.ObjectId;
    inviteId?: Types.ObjectId;
    supplierName?: string;
    status: 'scheduled' | 'done' | 'cancelled';
    dueDate?: Date;
    outcome?: string;
    note?: string;
    completedAt?: Date;
    cancelReason?: string;
    auto?: boolean;
    createdBy?: Types.ObjectId;
    createdByName?: string;
    createdAt?: Date;
}

/** Terms asked of every supplier (on the RFQ) or given back by one supplier (on its invitation). */
export interface RfqTerms {
    paymentTerms?: string;
    deliveryTerms?: string;
    incoterm?: string;
    deliveryLocation?: string;
    validityDate?: Date;
    currency?: string;
    warrantyTerms?: string;
}

/** One supplier asked to price some of the RFQ's lines. */
export interface RfqSupplierInvite {
    _id?: Types.ObjectId;
    supplierId?: Types.ObjectId;
    supplierName: string;
    contactEmail?: string;
    isSupplierApproved?: boolean;
    lineKeys: string[];
    status: RfqSupplierStatus;
    sentAt?: Date;
    sentVia?: string;
    repliedAt?: Date;
    replyTerms?: RfqTerms;
    attachments?: RfqAttachment[];
    remarks?: string;
    declineReason?: string;
    declineNote?: string;
}

export interface RfqAttachment {
    fileName: string;
    originalname?: string;
    uploadedAt?: Date;
}

export interface RfqQuote {
    inviteId?: Types.ObjectId;
    supplierId?: Types.ObjectId;
    supplierName?: string;
    itemDetailKey: string;
    itemName?: string;
    detail: string;
    quantity: number;
    unitPrice?: number;
    availability?: RfqAvailability;
    currency?: string;
    /** QAR per one unit of `currency`, captured when the price was entered; comparisons convert with it. */
    exchangeRate?: number;
    leadTimeDays?: number;
    isSupplierApproved?: boolean;
    attachments?: RfqAttachment[];
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

export interface RfqRevision {
    _id?: Types.ObjectId;
    itemDetailKey?: string;
    itemName?: string;
    detail?: string;
    supplierId?: Types.ObjectId;
    supplierName?: string;
    previousSupplierId?: Types.ObjectId;
    previousSupplierName?: string;
    previousUnitPrice?: number;
    revisedUnitPrice?: number;
    previousCurrency?: string;
    revisedCurrency?: string;
    previousPaymentTerms?: string;
    revisedPaymentTerms?: string;
    previousDeliveryTerms?: string;
    revisedDeliveryTerms?: string;
    previousLeadTimeDays?: number;
    revisedLeadTimeDays?: number;
    previousSelected?: boolean;
    revisedSelected?: boolean;
    savingsAmount?: number;
    reason?: string;
    revisedBy?: Types.ObjectId;
    revisedAt?: Date;
}

export interface Rfq extends Document {
    rfqNo: string;
    rfqType: RfqType;
    /** Lets one Supplier RFQ keep its original sales context and later procurement review state. */
    sourceRfqId?: Types.ObjectId;
    purchaseRequestId?: Types.ObjectId;
    enquiryId?: Types.ObjectId;
    fromPresale?: boolean;
    quotationId?: Types.ObjectId;
    ownerId?: Types.ObjectId;
    purchaseNo?: string;
    jobId?: Types.ObjectId;
    customerId?: Types.ObjectId;
    status: RfqStatus;
    stage?: RfqStage;
    requestedLines: {
        itemDetailKey: string;
        itemName?: string;
        detail: string;
        quantity: number;
        estimatedUnitCost?: number;
        partNo?: Types.ObjectId;
        isNewItem?: boolean;
        lineStatus?: RfqLineStatus;
        uom?: string;
        /** Why the confirmed price is not the lowest one on the line. */
        awardReason?: string;
    }[];
    quotes: RfqQuote[];
    revisions?: RfqRevision[];
    suppliers?: RfqSupplierInvite[];
    requestedTerms?: RfqTerms;
    deadline?: Date;
    /** When the customer needs the goods; a supplier lead time that misses it is flagged. */
    requiredBy?: Date;
    followUps?: RfqFollowUp[];
    /** Earliest open follow-up, mirrored for the list filters. */
    nextFollowUpDate?: Date;
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
    partNo: { type: Schema.Types.ObjectId, ref: 'Product' },
    isNewItem: { type: Boolean, default: false },
    lineStatus: { type: String, enum: Object.values(RfqLineStatus) },
    uom: { type: String },
    awardReason: { type: String }
}, { _id: false });

const rfqFollowUpSchema = new Schema<RfqFollowUp>({
    inviteId: { type: Schema.Types.ObjectId },
    supplierName: { type: String },
    status: { type: String, enum: ['scheduled', 'done', 'cancelled'], default: 'scheduled' },
    dueDate: { type: Date },
    outcome: { type: String, trim: true },
    note: { type: String, trim: true },
    completedAt: { type: Date },
    cancelReason: { type: String, trim: true },
    auto: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdByName: { type: String },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const rfqAttachmentSchema = new Schema<RfqAttachment>({
    fileName: { type: String, required: true },
    originalname: { type: String },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const rfqTermsSchema = new Schema<RfqTerms>({
    paymentTerms: { type: String },
    deliveryTerms: { type: String },
    incoterm: { type: String },
    deliveryLocation: { type: String },
    validityDate: { type: Date },
    currency: { type: String },
    warrantyTerms: { type: String }
}, { _id: false });

const rfqSupplierInviteSchema = new Schema<RfqSupplierInvite>({
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, required: true },
    contactEmail: { type: String },
    isSupplierApproved: { type: Boolean, default: false },
    lineKeys: { type: [String], default: [] },
    status: { type: String, enum: Object.values(RfqSupplierStatus), default: RfqSupplierStatus.NotSent },
    sentAt: { type: Date },
    sentVia: { type: String },
    repliedAt: { type: Date },
    replyTerms: { type: rfqTermsSchema },
    attachments: { type: [rfqAttachmentSchema], default: [] },
    remarks: { type: String },
    declineReason: { type: String },
    declineNote: { type: String }
}, { _id: true });

const rfqQuoteSchema = new Schema<RfqQuote>({
    inviteId: { type: Schema.Types.ObjectId },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String },
    itemDetailKey: { type: String, required: true },
    itemName: { type: String },
    detail: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    // A supplier may reply "not available", so a price is only required when it can supply.
    unitPrice: {
        type: Number,
        min: 0,
        required: function (this: RfqQuote) { return this.availability !== RfqAvailability.Unavailable; }
    },
    availability: { type: String, enum: Object.values(RfqAvailability), default: RfqAvailability.Available },
    currency: { type: String, default: 'QAR' },
    exchangeRate: { type: Number, min: 0 },
    leadTimeDays: { type: Number, min: 0 },
    isSupplierApproved: { type: Boolean },
    attachments: { type: [rfqAttachmentSchema], default: [] },
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

const rfqRevisionSchema = new Schema<RfqRevision>({
    itemDetailKey: { type: String },
    itemName: { type: String },
    detail: { type: String },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String },
    previousSupplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    previousSupplierName: { type: String },
    previousUnitPrice: { type: Number, min: 0 },
    revisedUnitPrice: { type: Number, min: 0 },
    previousCurrency: { type: String },
    revisedCurrency: { type: String },
    previousPaymentTerms: { type: String },
    revisedPaymentTerms: { type: String },
    previousDeliveryTerms: { type: String },
    revisedDeliveryTerms: { type: String },
    previousLeadTimeDays: { type: Number, min: 0 },
    revisedLeadTimeDays: { type: Number, min: 0 },
    previousSelected: { type: Boolean },
    revisedSelected: { type: Boolean },
    savingsAmount: { type: Number },
    reason: { type: String },
    revisedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    revisedAt: { type: Date, default: Date.now }
}, { _id: true });

const rfqSchema = new Schema<Rfq>({
    rfqNo: { type: String, required: true, unique: true },
    rfqType: { type: String, enum: Object.values(RfqType), default: RfqType.Procurement, required: true },
    sourceRfqId: { type: Schema.Types.ObjectId, ref: 'Rfq' },
    // Required for procurement RFQs only; a sales RFQ hangs off an enquiry instead.
    purchaseRequestId: {
        type: Schema.Types.ObjectId,
        ref: 'Purchase',
        required: function (this: Rfq) { return this.rfqType !== RfqType.Sales; }
    },
    enquiryId: {
        type: Schema.Types.ObjectId,
        ref: 'Enquiry',
        required: function (this: Rfq) { return this.rfqType === RfqType.Sales; }
    },
    fromPresale: { type: Boolean, default: false },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    purchaseNo: { type: String },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    status: {
        type: String,
        enum: Object.values(RfqStatus),
        default: RfqStatus.Open,
        required: true
    },
    stage: { type: String, enum: Object.values(RfqStage) },
    requestedLines: { type: [rfqRequestedLineSchema], default: [] },
    quotes: { type: [rfqQuoteSchema], default: [] },
    revisions: { type: [rfqRevisionSchema], default: [] },
    suppliers: { type: [rfqSupplierInviteSchema], default: [] },
    requestedTerms: { type: rfqTermsSchema },
    deadline: { type: Date },
    requiredBy: { type: Date },
    followUps: { type: [rfqFollowUpSchema], default: [] },
    nextFollowUpDate: { type: Date },
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
rfqSchema.index({ enquiryId: 1, isDeleted: 1 });
rfqSchema.index({ sourceRfqId: 1, isDeleted: 1 });
rfqSchema.index({ rfqType: 1, status: 1, createdAt: -1 });
rfqSchema.index({ 'suppliers.supplierId': 1, rfqType: 1, isDeleted: 1 });

export default model<Rfq>('Rfq', rfqSchema);
