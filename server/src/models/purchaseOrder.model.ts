import { Schema, Document, model } from "mongoose";
import { PurchaseRequestApprovalStatusSchema } from "./purchaseRequest.model";

interface PurchaseOrder extends Document {
    poNo: string;
    poStatus: String;
    items: {
        detail: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
        partNo?: any;
        prLineKey?: string;
        rfqQuoteId?: any;
        receivedQty?: number;
    }[];
    supplierId: any;
    purchaseId: any;
    jobId: any;
    quoteId: any;
    rfqId?: any;
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
    // Routed through the "purchaseApproval" workflow; empty for LPOs raised before it was wired in.
    approvalStatus: any[];
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
    stockHoldId?: any;
    placedAt?: Date;
    placedBy?: any;
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
    },
    // Links the line back to the PR line it covers and the RFQ quote it was awarded from.
    prLineKey: {
        type: String
    },
    rfqQuoteId: {
        type: Schema.Types.ObjectId
    },
    receivedQty: {
        type: Number,
        default: 0,
        min: 0
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
            // Draft, Placed and Cancelled are for POs raised from a PR's awards; Placed is set by hand after approval.
            enum: ["Draft", "Pending for Approval", "Approved", "Placed", "Closed", "Rejected", "Cancelled"],
            default: "Pending for Approval",
        },
        approvalStatus: {
            type: [PurchaseRequestApprovalStatusSchema as any],
            default: []
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
        // Optional: PRs raised without a job sheet have no job.
        jobId: {
            type: Schema.Types.ObjectId,
            ref: "Job",
        },
        quoteId: {
            type: Schema.Types.ObjectId,
            ref: "Quotation",
        },
        // The RFQ the supplier price came from, for sales-vs-final price variance.
        rfqId: {
            type: Schema.Types.ObjectId,
            ref: "Rfq",
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
        stockHoldId: {
            type: Schema.Types.ObjectId,
            ref: "StockHold",
        },
        placedAt: {
            type: Date,
        },
        placedBy: {
            type: Schema.Types.ObjectId,
            ref: "Employee",
        },
    },
    { timestamps: true }
);


export default model<PurchaseOrder>("PurchaseOrder", purchaseOrderSchema);
