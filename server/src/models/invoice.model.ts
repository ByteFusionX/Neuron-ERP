import { Schema, model } from 'mongoose';

const invoiceSchema = new Schema({
    invoiceNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    salesperson: { type: Schema.Types.ObjectId, ref: 'Employee' }, // Assuming Employee model for salesperson
    amount: { type: Number, required: true },
    paymentTerms: { type: String },
    status: {
        type: String,
        enum: ['Pending to submit', 'PI Submitted', 'Partial invoicing', 'Submitted', 'Hold', 'Rejected by customer', 'Cancelled', 'Reissued'],
        default: 'Pending to submit'
    },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Partially paid', 'Advance received', 'Pending'],
        default: 'Pending'
    },
    items: [{
        dnId: { type: Schema.Types.ObjectId, ref: 'DeliveryNote' },
        dnRefs: [{
            dnId: { type: Schema.Types.ObjectId, ref: 'DeliveryNote' },
            quantity: { type: Number }
        }],
        itemId: { type: String },
        description: String,
        amount: Number,
        quantity: Number
    }],
    parentInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // For reissued invoice referencing original
    referenceInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // For original invoice referencing reissued
    cancellationReason: { type: String },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    cancelledAt: { type: Date },
    rejectionReason: { type: String },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    rejectedAt: { type: Date },
    reissuedInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // To track which invoice replaced this one
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const Invoice = model('Invoice', invoiceSchema);

