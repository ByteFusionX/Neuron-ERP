import { Schema, Document, model, Types, } from "mongoose";
import { Item, ItemDetail, itemSchema } from "./item.model";

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

interface PurchaseRequestApprovalStatus {
    status: string;
    role: Types.ObjectId;
    step: number;
    managerApproval: boolean;
    updatedBy: Types.ObjectId;
    updatedDate: Date;
    comment: string;
}

const PurchaseRequestApprovalStatusSchema = new Schema<PurchaseRequestApprovalStatus>({
    status: {
        type: String,
        required: true,
        enum: ['pending', 'approved', 'rejected']
    },
    role: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
    },
    comment: {
        type: String,
        default: ''
    },
    step: {
        type: Number,
        required: true
    },
    managerApproval: {
        type: Boolean,
        required: true,
        default: false
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    updatedDate: {
        type: Date,
    }
})

type PurchaseRequestItem = Omit<Item, 'itemDetails'> & {
    itemDetails: ItemDetail[];
};

export enum PurchaseRequestStatus {
    Drafted = 'Drafted',
    Pending = 'Pending',
    ReadyToProcessLPO = 'ReadyToProcessLPO',
    Rejected = 'Rejected',
    OnHoldCancelled = 'OnHoldCancelled',
    Approved = 'Approved'
}

export enum PurchaseRequestSourceType {
    Job = 'job',
    Manual = 'manual'
}

interface PurchaseRequest extends Document {
    jobId?: Types.ObjectId;
    sourceType: PurchaseRequestSourceType;
    purchaseNo: String;
    items: PurchaseRequestItem[];
    supplierDiscounts: discounts[];
    status: PurchaseRequestStatus;
    rejectedReason: rejectedReason[];
    approvalStatus: PurchaseRequestApprovalStatus[];
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
        totalPurchase?: number;
        createdDate: Date;
    };
    customerId: Types.ObjectId;
    supplierId?: Types.ObjectId;
    totalLpo: Number | String;
    procurementPerson?: Types.ObjectId;
    currency?: String;
}

const purchaseRequestSchema = new Schema<PurchaseRequest>({
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
        required: false
    },
    sourceType: {
        type: String,
        enum: Object.values(PurchaseRequestSourceType),
        default: PurchaseRequestSourceType.Job
    },
    purchaseNo: {
        type: String,
        required: true,
        unique: true
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
    approvalStatus: {
        type: [PurchaseRequestApprovalStatusSchema],
        default: []
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
            type: Schema.Types.ObjectId,
            // type: String,
        },
        message: {
            type: String,
        },
        totalPurchase: {
            type: Number,
            default: 0
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
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier'
    },
    totalLpo: {
        type: Number
    },
    procurementPerson: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    currency: {
        type: String
    }
})

export default model<PurchaseRequest>('Purchase', purchaseRequestSchema)