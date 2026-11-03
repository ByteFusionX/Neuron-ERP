import { Schema, model } from 'mongoose';

export const PAYMENT_METHODS = ['PDF', 'PDC', 'Bank Transfer', 'Cash', 'Open Credit', 'Other'] as const;

export const PI_STATUSES = ['Pending', 'Sent', 'Accepted', 'Received', 'Rejected', 'Completed'] as const;
// Completed is set only by confirm-payment, never picked as a status.
export const PI_PICKABLE_STATUSES = ['Pending', 'Sent', 'Accepted', 'Received', 'Rejected'] as const;

const proformaInvoiceSchema = new Schema({
    // NT/PI-<mm>-<yy>-0001, issued when the PI is created.
    piNo: { type: String, required: true, unique: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    jobId: { type: String, required: true },
    client: {
        customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
        name: { type: String, required: true },
    },
    attention: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    shipTo: { type: String, default: '' },
    lpoNo: { type: String, default: '' },
    subject: { type: String, default: '' },
    currency: { type: String, default: 'QAR' },
    // Which letterhead the PDF prints on (the security company has its own header).
    quoteCompany: { type: String, default: '' },
    items: [{
        description: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        amount: { type: Number, required: true, min: 0 },
    }],
    amount: { type: Number, required: true, min: 0 },
    // Deal cost snapshot taken when the PI is saved, plus what is expected to be received under the payment terms.
    summary: {
        itemsCost: { type: Number, default: 0 },
        itemsPrice: { type: Number, default: 0 },
        supplierDiscount: { type: Number, default: 0 },
        customerDiscount: { type: Number, default: 0 },
        additionalCost: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
        totalPrice: { type: Number, default: 0 },
    },
    expectedAmount: { type: Number, default: 0, min: 0 },
    expectedDate: { type: Date },
    status: { type: String, enum: PI_STATUSES, default: 'Pending' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    // Filled when the status moves to Received.
    payment: {
        method: { type: String, enum: PAYMENT_METHODS },
        otherMethod: { type: String },
        referenceNo: { type: String },
        document: { fileName: { type: String }, originalname: { type: String } },
        receivedAt: { type: Date },
    },
    statusUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    statusUpdatedAt: { type: Date },
    // Set when finance confirms the received payment after the invoice is raised; this releases the held job.
    paymentConfirmedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    paymentConfirmedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
}, {
    // createdAt is the PI create date; updatedAt drives "Last Updated".
    timestamps: true,
});

proformaInvoiceSchema.index({ status: 1, createdAt: -1 });
proformaInvoiceSchema.index({ job: 1 });

// History is recorded in the global audit log (entityType "proformaInvoice").
export const ProformaInvoice = model('ProformaInvoice', proformaInvoiceSchema);
