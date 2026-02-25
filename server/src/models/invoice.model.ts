import { Schema, model } from 'mongoose';

const invoiceSchema = new Schema({
    invoiceNo: { type: String, required: true },
    date: { type: Date, required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    salesperson: { type: Schema.Types.ObjectId, ref: 'Employee' }, // Assuming Employee model for salesperson
    amount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Paid', 'Unpaid', 'Partially Paid', 'Cancelled', 'Reissued'],
        default: 'Unpaid'
    },
    items: [{
        dnId: { type: Schema.Types.ObjectId, ref: 'DeliveryNote' },
        description: String,
        amount: Number,
        quantity: Number
    }],
    parentInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // For reissued invoice referencing original
    referenceInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // For original invoice referencing reissued
    cancellationReason: { type: String },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    cancelledAt: { type: Date },
    reissuedInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // To track which invoice replaced this one
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const Invoice = model('Invoice', invoiceSchema);

