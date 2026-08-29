import { Schema, model } from 'mongoose';

const invoiceAuditSchema = new Schema({
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNo: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    originalAmount: { type: Number, required: true },
    adjustedAmount: { type: Number, required: true },
    reason: { type: String, required: true },
    actionBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    status: {
        type: String,
        enum: ['Cancelled', 'Adjusted', 'Rejected'],
        required: true
    },
    actionDate: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const InvoiceAudit = model('InvoiceAudit', invoiceAuditSchema);
