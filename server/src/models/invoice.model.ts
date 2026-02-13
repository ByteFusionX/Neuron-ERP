import { Schema, model } from 'mongoose';

const invoiceSchema = new Schema({
    invoiceNo: { type: String, required: true },
    date: { type: Date, required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer'},
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    salesperson: { type: Schema.Types.ObjectId, ref: 'Employee' }, // Assuming Employee model for salesperson
    amount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Paid', 'Unpaid', 'Partially Paid'],
        default: 'Unpaid'
    },
    items: [{
        dnId: { type: Schema.Types.ObjectId, ref: 'DeliveryNote' },
        description: String,
        amount: Number
    }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const Invoice = model('Invoice', invoiceSchema);
