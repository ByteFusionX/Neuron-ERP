import { Schema, model } from 'mongoose';

const resolutionHistoryEntrySchema = new Schema({
    qty: { type: Number, required: true },
    resolutionType: {
        type: String,
        enum: ['Replacement', 'AlternateSupplierSourcing', 'CreditOnly', 'Disposed'],
        required: true
    },
    actionBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    date: { type: Date, default: Date.now },
    note: String
}, { _id: false });

const supplierReturnSchema = new Schema({
    supplierReturnNo: { type: String, required: true, unique: true },
    grnId: { type: Schema.Types.ObjectId, ref: 'GRN', required: true },
    itemId: { type: String },
    partNo: { type: String },
    itemDescription: { type: String },
    rejectedQty: { type: Number, required: true },
    resolvedQty: { type: Number, default: 0 },
    unresolvedQty: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },

    logisticsType: {
        type: String,
        enum: ['SupplierPickup', 'Courier', 'NoPhysicalReturn'],
        required: true
    },
    trackingRef: String,
    courierName: String,
    dispatchDate: Date,

    resolutionType: {
        type: String,
        enum: ['Replacement', 'AlternateSupplierSourcing', 'CreditOnly', 'Disposed'],
    },
    replacementPoId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    resolutionHistory: {
        type: [resolutionHistoryEntrySchema],
        default: []
    },

    disputeStatus: {
        type: String,
        enum: ['None', 'SupplierDisputed', 'DisputeResolved'],
        default: 'None'
    },
    disputeNote: String,
    disputedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    disputedAt: Date,
    disputeResolutionNote: String,
    disputeResolvedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    disputeResolvedAt: Date,

    financialResolution: {
        type: {
            type: String,
            enum: ['PreInvoiceAdjustment', 'DebitNote']
        },
        debitNoteId: { type: Schema.Types.ObjectId, ref: 'DebitNote' },
        adjustedAmount: Number,
        date: Date
    },
    relatedCreditNoteId: { type: Schema.Types.ObjectId, ref: 'CreditNote' },

    quarantineStockEntryId: { type: Schema.Types.ObjectId, ref: 'StockEntry' },

    status: {
        type: String,
        enum: ['Initiated', 'AwaitingReturn', 'AwaitingReplacement', 'PartiallyResolved', 'Resolved', 'Disposed'],
        default: 'Initiated'
    },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const SupplierReturn = model('SupplierReturn', supplierReturnSchema);
