import { Schema, model } from 'mongoose';

export const CUSTOMER_INVOICE_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export const PDC_STATUSES = ['Pending', 'Approved', 'Rejected', 'Revoked'] as const;
export const CUSTOMER_PAYMENT_METHODS = ['PDC', 'Cash', 'Bank Transfer', 'Open Credit'] as const;

// Raised from a delivery note (or, for finance, from an approved purchase order); has its own lifecycle,
// separate from the sales invoices in the invoice module.
const schema = new Schema({
    deliveryNote: { type: Schema.Types.ObjectId, ref: 'DeliveryNote' },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    poNo: { type: String, default: '' },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: String,
    client: { customerId: { type: Schema.Types.ObjectId, ref: 'Customer' }, name: { type: String, required: true } },
    attention: { type: String, default: '' },
    invoiceDate: { type: Date, required: true },
    invoiceNo: { type: String, required: true, trim: true, unique: true },
    dnNo: { type: String, default: '' },
    lpoRef: { type: String, default: '' },
    subject: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    job: { type: Schema.Types.ObjectId, ref: 'Job' },
    jobNo: String,
    status: { type: String, enum: CUSTOMER_INVOICE_STATUSES, default: 'Pending', required: true },
    paymentMethod: { type: String, enum: CUSTOMER_PAYMENT_METHODS, required: true },
    pdcStatus: { type: String, enum: PDC_STATUSES },
    pdcHistory: [{ status: { type: String, enum: PDC_STATUSES }, changedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }, changedAt: Date }],
    currency: { type: String, default: 'QAR' },
    amount: { type: Number, required: true },
    // The DN's share of the job's customer discount; amount stays the gross total.
    discount: { type: Number, default: 0 },
    items: [{ description: String, quantity: Number, unitCost: Number, totalCost: Number }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
}, { timestamps: true });
schema.index({ status: 1, createdAt: -1 });
schema.index({ purchaseOrder: 1 });
schema.index({ deliveryNote: 1 });
export const CustomerInvoice = model('CustomerInvoice', schema);
