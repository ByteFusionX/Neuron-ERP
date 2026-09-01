import { Schema, model } from 'mongoose';

const debitNoteSchema = new Schema({
    debitNoteNo: { type: String, required: true, unique: true },
    poId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    grnId: { type: Schema.Types.ObjectId, ref: 'GRN' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierReturnId: { type: Schema.Types.ObjectId, ref: 'SupplierReturn', required: true },
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

export const DebitNote = model('DebitNote', debitNoteSchema);
