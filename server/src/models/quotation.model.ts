import { Schema, Document, model, Types } from "mongoose";

interface QuoteItemDetail {
    /** The catalogue product this line was picked from. itemCode/partNo stay as saved snapshots. */
    productId?: Types.ObjectId;
    detail: string;
    quantity: number;
    unitCost: number;
    unitSellingPrice: number;
    availability: string;
    supplierName?: string;
    email?: string;
    phoneNo?: string;
    supplierId?: Types.ObjectId;
    dealSelected?: boolean;
    purchaseItemDetailId?: Types.ObjectId;
    uom?: string;
    itemCode?: string;
    partNo?: string;
}

interface QuoteItem {
    itemName: string;
    isOptional?: boolean;
    includeInTotal?: boolean;
    customerDecision?: string;
    customerDecisionAt?: Date;
    itemDetails: QuoteItemDetail[]
}

interface OptionalItems {
    items: QuoteItem[];
    totalDiscount: number;
}

interface AdditionalCost {
    type: string;
    name?: string;
    supplierId?: Types.ObjectId;
    value: number;
}

interface FieldChange {
    field: string;
    from: string;
    to: string;
}

interface EditHistoryEntry {
    editedBy: Types.ObjectId;
    editedAt: Date;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    reason?: string;
    revision?: number;
    changes?: FieldChange[];
}

interface QuoteSendRecord {
    revision: number;
    sentAt: Date;
    sentBy: Types.ObjectId;
    recipient: string;
    emailStatus: string;
    pdfFileName?: string;
    note?: string;
}

interface QuoteApproval {
    status: string;
    requestedAt?: Date;
    requestedBy?: Types.ObjectId;
    approvedAt?: Date;
    approvedBy?: Types.ObjectId;
    rejectedAt?: Date;
    rejectedBy?: Types.ObjectId;
    reason?: string;
    breaches?: any[];
}

interface FollowUp {
    nextFollowUpDate?: Date;
    reminderOwner?: Types.ObjectId;
    lastActivityDate?: Date;
    note?: string;
}

interface CustomerDecision {
    decision: string;
    decidedAt: Date;
    decidedBy: Types.ObjectId;
    reason?: string;
    competitor?: string;
    expectedValueLost?: number;
}

interface CustomerAcceptance {
    acceptedRevision: number;
    acceptedAt: Date;
    acceptedBy: Types.ObjectId;
    customerPoNumber?: string;
    acceptedByName?: string;
    lpoFiles: [];
}

/** Content of a quote as it stood before a revision-creating edit. */
interface QuoteRevision {
    revision: number;
    savedAt: Date;
    savedBy: Types.ObjectId;
    reason?: string;
    snapshot: {
        subject: string;
        currency: string;
        optionalItems: OptionalItems[];
        customerNote: string;
        termsAndCondition: string;
        paymentTerms?: string;
        deliveryTerms?: string;
        warranty?: string;
        deliveryLocation?: string;
        validityDate?: Date;
    };
}

interface Deal {
    dealId: string;
    paymentTerms: string;
    additionalCosts: AdditionalCost[];
    savedDate: Date;
    seenByApprover: boolean;
    status: string;
    approvedBy: Types.ObjectId;
    comments: string[];
    seenedBySalsePerson: boolean;
    attachments: [];
    updatedItems: QuoteItem[];
    totalDiscount:number;
}

interface Quotation extends Document {
    quoteId: string;
    client: Types.ObjectId;
    attention: Types.ObjectId;
    date: Date;
    department: Types.ObjectId;
    departments: Types.ObjectId[];
    subject: string;
    currency: string;
    quoteCompany: string;
    optionalItems: OptionalItems[];
    customerNote: string;
    termsAndCondition: string;
    paymentTerms: string;
    deliveryTerms: string;
    warranty: string;
    deliveryLocation: string;
    validityDate: Date;
    expiryReminderDate: Date;
    expiryReminderSentAt: Date;
    sendHistory: QuoteSendRecord[];
    currentSentRevision: number;
    approval: QuoteApproval;
    followUp: FollowUp;
    customerDecision: CustomerDecision;
    lostReason: string;
    lostAt: Date;
    lostBy: Types.ObjectId;
    status: string;
    createdBy: Types.ObjectId;
    lpoFiles: [];
    dealData: Deal;
    enqId: Types.ObjectId;
    isDeleted: boolean;
    rfqNo: string;
    closingDate: Date;
    eventId: any;
    saveNote: string;
    editHistory: EditHistoryEntry[];
    revision: number;
    revisions: QuoteRevision[];
    customerAcceptance: CustomerAcceptance;
}

export enum quoteStatus {
    Draft = 'Draft',
    WorkInProgress = 'Work In Progress',
    QuoteSubmitted = 'Quote Submitted',
    UnderNegotiation = 'Under negotiation',
    UnderReview = 'Under review',
    ReadyForSubmission = 'Ready for submission',
    Won = 'Won',
    Lost = 'Lost',
    Expired = 'Expired',
}

const quoteItemDetailsSchema = new Schema<QuoteItemDetail>({
    // Durable link back to the inventory catalogue. itemCode/partNo below remain plain-string
    // snapshots on purpose: a saved quote must not change if the product is later renamed.
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: false,
    },
    detail: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    unitCost: {
        type: Number,
        required: true,
    },
    unitSellingPrice: {
        type: Number,
        required: true,
    },
    availability: {
        type: String,
        required: false,
    },
    supplierName: {
        type: String,
        required: false,
    },
    email: {
        type: String,
        required: false,
    },
    phoneNo: {
        type: String,
        required: false,
    },
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
        required: false,
    },
    dealSelected: {
        type: Boolean,
        required: false,
    },
    purchaseItemDetailId: {
        type: Schema.Types.ObjectId,
        required: false,
    },
    uom: {
        type: String,
        required: false,
    },
    itemCode: {
        type: String,
        required: false,
    },
    partNo: {
        type: String,
        required: false,
    }
});

const quoteItem = new Schema<QuoteItem>({
    itemName: {
        type: String,
        required: true,
    },
    isOptional: {
        type: Boolean,
        default: false,
    },
    includeInTotal: {
        type: Boolean,
        default: false,
    },
    customerDecision: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending',
    },
    customerDecisionAt: {
        type: Date,
        required: false,
    },
    itemDetails: {
        type: [quoteItemDetailsSchema],
        required: true,
    },
});

const optionalItems = new Schema<OptionalItems>({
    items: {
        type: [quoteItem],
    },
    totalDiscount: {
        type: Number,
        default: 0,
    },
});

const additionalCostSchema = new Schema<AdditionalCost>({
    type: {
        type: String,
        enum: ['Additional Cost', 'Supplier Discount', 'Customer Discount']
    },
    name: {
        type: String,
        required: false
    },
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
        required: false
    },
    value: {
        type: Number,
        required: true,
    }
});

const dealDatas = new Schema<Deal>({
    dealId: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
    },
    paymentTerms: {
        type: String,
        required: false,
    },
    additionalCosts: {
        type: [additionalCostSchema],
        required: false,
    },
    savedDate: {
        type: Date,
        required: false,
    },
    attachments: [],
    totalDiscount: {
        type: Number
    },
    seenByApprover: {
        type: Boolean,
        default: false
    },
    seenedBySalsePerson: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    comments: {
        type: [String],
    },
    updatedItems: {
        type: [quoteItem],
        required: true,
    },
});

const editHistoryEntrySchema = new Schema<EditHistoryEntry>({
    editedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    editedAt: {
        type: Date,
        default: Date.now,
    },
    action: {
        type: String,
        enum: ['Created', 'Updated', 'StatusChanged', 'QuoteSent', 'ApprovalRequested', 'ApprovalApproved', 'ApprovalRejected', 'FollowUpUpdated', 'CustomerAccepted', 'CustomerRejected', 'CustomerNoResponse', 'OptionalItemsDecided', 'DealApproved', 'DealRejected', 'DealRevoked'],
        required: true,
    },
    fromStatus: {
        type: String,
        required: false,
    },
    toStatus: {
        type: String,
        required: false,
    },
    reason: {
        type: String,
        required: false,
    },
    revision: {
        type: Number,
        required: false,
    },
    changes: {
        type: [{
            field: { type: String, required: true },
            from: { type: String, default: '' },
            to: { type: String, default: '' },
        }],
        required: false,
        default: undefined,
    },
}, { _id: false });

const quotationSchema = new Schema<Quotation>({
    quoteId: {
        type: String,
        required: true,
        unique: true,
    },
    client: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    attention: {
        type: Schema.Types.ObjectId,
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    date: {
        type: Date,
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    department: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    departments: {
        type: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
        default: [],
    },
    subject: {
        type: String,
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    currency: {
        type: String,
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    quoteCompany: {
        type: String,
    },
    optionalItems: {
        type: [optionalItems],
        required: true,
    },
    customerNote: {
        type: String,
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    termsAndCondition: {
        type: String,
        required: function (this: Quotation) { return this.status !== quoteStatus.Draft; },
    },
    paymentTerms: {
        type: String,
        required: false,
    },
    deliveryTerms: {
        type: String,
        required: false,
    },
    warranty: {
        type: String,
        required: false,
    },
    deliveryLocation: {
        type: String,
        required: false,
    },
    validityDate: {
        type: Date,
        required: false,
    },
    expiryReminderDate: {
        type: Date,
        required: false,
    },
    expiryReminderSentAt: {
        type: Date,
        required: false,
    },
    sendHistory: {
        type: [{
            revision: { type: Number, required: true },
            sentAt: { type: Date, default: Date.now },
            sentBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
            recipient: { type: String, required: true },
            emailStatus: { type: String, enum: ['prepared', 'sent', 'failed'], default: 'prepared' },
            pdfFileName: { type: String },
            note: { type: String },
        }],
        default: [],
    },
    currentSentRevision: {
        type: Number,
        required: false,
    },
    approval: {
        status: { type: String, enum: ['not_required', 'required', 'pending', 'approved', 'rejected'], default: 'not_required' },
        requestedAt: { type: Date },
        requestedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
        approvedAt: { type: Date },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
        rejectedAt: { type: Date },
        rejectedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
        reason: { type: String },
        breaches: { type: [Schema.Types.Mixed], default: [] },
    },
    followUp: {
        nextFollowUpDate: { type: Date },
        reminderOwner: { type: Schema.Types.ObjectId, ref: 'Employee' },
        lastActivityDate: { type: Date },
        note: { type: String },
    },
    customerDecision: {
        decision: { type: String, enum: ['accepted', 'rejected', 'no_response'] },
        decidedAt: { type: Date },
        decidedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
        reason: { type: String },
        competitor: { type: String },
        expectedValueLost: { type: Number },
    },
    lostReason: {
        type: String,
        required: false,
    },
    lostAt: {
        type: Date,
        required: false,
    },
    lostBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: false,
    },
    status: {
        type: String,
        enum: Object.values(quoteStatus),
        default: quoteStatus.WorkInProgress,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    lpoFiles: [],
    dealData: {
        type: dealDatas
    },
    enqId: {
        type: Schema.Types.ObjectId,
        ref: 'Enquiry'
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    closingDate: {
        type: Date,
        required: false,
    },
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event'
    },
    saveNote: {
        type: String,
        required: false,
    },
    editHistory: {
        type: [editHistoryEntrySchema],
        default: [],
    },
    revision: {
        type: Number,
        default: 0,
    },
    revisions: {
        type: [{
            revision: { type: Number, required: true },
            savedAt: { type: Date, default: Date.now },
            savedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
            reason: { type: String },
            snapshot: { type: Schema.Types.Mixed },
        }],
        default: [],
        select: false,
    },
    customerAcceptance: {
        acceptedRevision: { type: Number },
        acceptedAt: { type: Date },
        acceptedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
        customerPoNumber: { type: String },
        acceptedByName: { type: String },
        lpoFiles: [],
    },
});

export default model<Quotation>("Quotation", quotationSchema);
