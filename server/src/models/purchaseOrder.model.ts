import { Schema, Document, model } from "mongoose";

interface PurchaseOrder extends Document {
    poNo: string;
    poStatus: String;
    items: {
        detail: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
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
    createdAt: Date;
    updatedAt: Date;
    createdBy: any;
}

const purchaseOrderSchema = new Schema<PurchaseOrder>(
    {
        poNo: {
            type: String,
            required: true,
            unique: true,
        },
        poStatus: {
            type: String,
            enum: ["Open", 'Hold', 'Closed', 'Cancelled'],
            default: "Open",
        },
        items: [],
        purchaseId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "PurchaseRequest",
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
    },
    { timestamps: true }
);


export default model<PurchaseOrder>("PurchaseOrder", purchaseOrderSchema);
