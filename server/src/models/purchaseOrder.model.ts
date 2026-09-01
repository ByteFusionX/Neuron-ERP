import { Schema, Document, model } from "mongoose";

interface PurchaseOrder extends Document {
    poNo: string;
    poStatus: String;
    items: {
        detail: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
        partNo?: any;
    }[];
    supplierId: any;
    purchaseId: any;
    jobId: any;
    quoteId: any;
    etaTerms: string;
    paymentTerms: string;
    shippingTerms: string;
    deliveryTerms: string;
    placeOfDelivery: string;
    subject: string;
    poDate: Date;
    termsAndCondition: string;
    discount: number;
    supplierInvoices: {
        fileName: string;
        originalname: string;
        isUploaded?: boolean;
    }[];
    approvedHistory: {
        approvedBy: any;
        reason: string;
        date: Date;
    }[];
    rejectedHistory: {
        rejectedBy: any;
        reason: string;
        date: Date;
    }[];
    createdAt: Date;
    updatedAt: Date;
    createdBy: any;
    currency?: string;
    originalPoId?: any;
    supplierReturnId?: any;
}

const purchaseOrderItemSchema = new Schema({
    detail: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    unitCost: {
        type: Number,
        required: true
    },
    totalCost: {
        type: Number,
        required: true
    },
    partNo: {
        type: Schema.Types.ObjectId,
        ref: 'Product'
    }
}, { _id: false });

const purchaseOrderSchema = new Schema<PurchaseOrder>(
    {
        poNo: {
            type: String,
            required: true,
            unique: true,
        },
        poStatus: {
            type: String,
            enum: ["Draft", "Pending for Approval", "Approved", "Closed", "Rejected"],
            default: "Pending for Approval",
        },
        approvedHistory: {
            type: [{
                approvedBy: {
                    type: Schema.Types.ObjectId,
                    ref: 'Employee'
                },
                reason: String,
                date: {
                    type: Date,
                    default: Date.now
                }
            }],
            default: []
        },
        rejectedHistory: {
            type: [{
                rejectedBy: {
                    type: Schema.Types.ObjectId,
                    ref: 'Employee'
                },
                reason: String,
                date: {
                    type: Date,
                    default: Date.now
                }
            }],
            default: []
        },
        items: {
            type: [purchaseOrderItemSchema],
            default: []
        },
        purchaseId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "Purchase",
        },
        jobId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "Job",
        },
        quoteId: {
            type: Schema.Types.ObjectId,
            ref: "Quotation",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Employee",
        },
        poDate: {
            type: Date,
            required: true,
        },
        termsAndCondition: {
            type: String,
        },
        discount: {
            type: Number,
            required: true,
        },
        supplierId: {
            type: Schema.Types.ObjectId,
            ref: "Supplier",
        },
        shippingTerms: {
            type: String,
            required: true,
        },
        deliveryTerms: {
            type: String,
            required: true,
        },
        placeOfDelivery: {
            type: String,
            required: true,
        },
        subject: {
            type: String,
            required: true,
        },
        etaTerms: {
            type: String,
            required: true,
        },
        paymentTerms: {
            type: String,
            required: true,
        },
        supplierInvoices: {
            type: [{
                fileName: {
                    type: String,
                    required: true
                },
                originalname: {
                    type: String,
                    required: true
                },
                isUploaded: {
                    type: Boolean,
                    default: true
                }
            }],
            default: []
        },
        currency: {
            type: String
        },
        originalPoId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseOrder",
        },
        supplierReturnId: {
            type: Schema.Types.ObjectId,
            ref: "SupplierReturn",
        },
    },
    { timestamps: true }
);


export default model<PurchaseOrder>("PurchaseOrder", purchaseOrderSchema);
