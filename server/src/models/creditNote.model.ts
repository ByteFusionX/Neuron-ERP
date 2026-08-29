import { Schema, model } from 'mongoose';

const creditNoteSchema = new Schema({
    creditNoteNo: { type: String, required: true, unique: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    dnId: { type: Schema.Types.ObjectId, ref: 'DeliveryNote' },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    items: [{
        itemId: { type: String },
        description: String,
        rejectedQty: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        amount: { type: Number, required: true }
    }],
    totalAmount: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ['Issued'],
        default: 'Issued'
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const CreditNote = model('CreditNote', creditNoteSchema);
