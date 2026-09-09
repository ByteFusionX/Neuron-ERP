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

const stockHoldSchema = new Schema({
    holdNo: { type: String, required: true, unique: true },
    // Only set for holds with a physical quarantine (logisticsType !== 'NoPhysicalReturn')
    stockEntryId: { type: Schema.Types.ObjectId, ref: 'StockEntry' },
    grnId: { type: Schema.Types.ObjectId, ref: 'GRN' },
    itemId: { type: String },
    partNo: { type: String },
    itemDescription: { type: String },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },

    logisticsType: {
        type: String,
        enum: ['PhysicalReturn', 'SupplierPickup', 'Courier', 'NoPhysicalReturn'],
        default: 'PhysicalReturn'
    },
    trackingRef: String,
    courierName: String,
    dispatchDate: Date,

    rejectedQty: { type: Number, required: true },
    resolvedQty: { type: Number, default: 0 },
    unresolvedQty: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },

    resolutionType: {
        type: String,
        enum: ['Replacement', 'AlternateSupplierSourcing', 'CreditOnly', 'Disposed']
    },
    replacementPoId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    resolutionHistory: {
        type: [resolutionHistoryEntrySchema],
        default: []
    },
    financialResolution: {
        type: {
            type: String,
            enum: ['PreInvoiceAdjustment', 'CreditNote']
        },
        creditNoteId: { type: Schema.Types.ObjectId, ref: 'CreditNote' },
        adjustedAmount: Number,
        date: Date
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

    status: {
        type: String,
        enum: ['AwaitingReturn', 'AwaitingReplacement', 'PartiallyResolved', 'Resolved', 'Disposed'],
        default: 'AwaitingReturn'
    },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

stockHoldSchema.index({ stockEntryId: 1 });
stockHoldSchema.index({ grnId: 1, itemId: 1 });

export const StockHold = model('StockHold', stockHoldSchema);
