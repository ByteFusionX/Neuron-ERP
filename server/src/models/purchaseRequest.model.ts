import { Schema, Document, model, Types,  } from "mongoose";
import { Item, itemSchema } from "./item.model";

interface discounts {
    supplierId: Types.ObjectId,
    discount: Number
}

const discountsSchema = new Schema<discounts>({
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
}

interface PurchaseRequest extends Document {
    jobId : Types.ObjectId;
    purchaseNo : String;
    items : Item[];
    discounts : discounts[]; // need reverification
    status : PurchaseRequestStatus; 
    rejectedReason : rejectedReason[]; // need reverification
    // comparisonSummary : [];
    revokedHistory : revokedHistory[]; // need reverification
    createdBy : Types.ObjectId;
    createdAt : Date;
    updatedBy : Types.ObjectId;
    updatedAt : Date;
    isDeleted : Boolean;
}

const purchaseRequestSchema = new Schema<PurchaseRequest>({
    jobId : {
        type: Schema.Types.ObjectId,
        ref:'Job',
        required: true
    },
    purchaseNo :{
        type: String,
        required: true
    },
    items : {
        type:[itemSchema],
        // required: true
    },
    discounts :{
        type: [discountsSchema],
        // required: true,
    },
    status : {
        type: String,
        enum: Object.values(PurchaseRequestStatus),
        required: true,
    },
    rejectedReason : {
        type: [rejectedReasonSchema],
    },
    // comparisonSummary : [];
    revokedHistory : {
        type: [revokedHistory],
    },
    createdBy : {
        type: Schema.Types.ObjectId,
        ref:'Employee',
        required: true
    },
    createdAt : { type: Date },
    updatedBy : {
        type: Schema.Types.ObjectId,
        ref:'Employee',
        required: true
    },
    updatedAt : { type: Date ,
        default: new Date()
    },
    isDeleted: {
        type: Boolean,
        default: false
      }
})




export default model<PurchaseRequest>("PurchaseRequest", purchaseRequestSchema);

