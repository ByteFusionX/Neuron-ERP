import { Schema, Document, model, Types, } from "mongoose";
import { Item, itemSchema } from "./item.model";

interface discounts {
    suppliers: [{
        supplierId: Types.ObjectId,
        discount: Number
    }],
    totalDiscount: Number
}

const discountsSchema = new Schema({
    supplierId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    discount: {
        type: Number,
        required: true
    }
})

interface rejectedReason {
    rejectedBy: Types.ObjectId,
    comment: String,
    rejectedAt: Date
}

const rejectedReasonSchema = new Schema<rejectedReason>({
    rejectedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    comment: {
        type: String,
        required: true
    },
    rejectedAt: {
        type: Date,
        required: true
    }
})

interface revokedHistory {
    revokedBy: Types.ObjectId,
    reason: String,
    date: Date
}

const revokedHistory = new Schema<revokedHistory>({
    revokedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
})

export enum PurchaseRequestStatus {
    Drafted = 'Drafted',
    Pending = 'Pending',
    ReadyToProcessLPO = 'ReadyToProcessLPO',
    Rejected = 'Rejected',
    OnHoldCancelled = 'OnHoldCancelled',
    Approved = 'Approved'
}

interface PurchaseRequest extends Document {
    jobId: Types.ObjectId;
    purchaseNo: String;
    items: Item[];
    supplierDiscounts: discounts[];
    status: PurchaseRequestStatus;
    rejectedReason: rejectedReason[];
    // comparisonSummary : [];
    revokedHistory: revokedHistory[];
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
    isDeleted: Boolean;
    mrRequest: {
        engineer: Types.ObjectId;
        message: string;
        createdDate: Date;
    };
    customerId: Types.ObjectId;
    totalLpo: Number | String;
}

const purchaseRequestSchema = new Schema<PurchaseRequest>({
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    purchaseNo: {
        type: String,
        required: true
    },
    items: {
        type: [itemSchema],
        required: true
    },
    supplierDiscounts: {
        suppliers: {
            type: [discountsSchema],
        },
        totalDiscount: {
            type: Number,
        }
    },
    status: {
        type: String,
        enum: Object.values(PurchaseRequestStatus),
        required: true,
    },
    rejectedReason: {
        type: [rejectedReasonSchema],
    },
    // comparisonSummary : [],
    revokedHistory: {
        type: [revokedHistory],
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    createdAt: {
        type: Date,
        default: new Date()
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    updatedAt: { type: Date },
    isDeleted: {
        type: Boolean,
        default: false
    },
    mrRequest: {
        engineer: {
            // type: Schema.Types.ObjectId,
            type: String,
        },
        message: {
            type: String,
        },
        createdDate: {
            type: Date,
            default: new Date()
        }
    },
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'Customer'
    },
    totalLpo: {
        type: Number
    }
})

export default model<PurchaseRequest>('Purchase', purchaseRequestSchema)