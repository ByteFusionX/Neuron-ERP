import {  Types } from "mongoose";


interface PurchaseRequest extends Document {
    jobId : Types.ObjectId;
    purchaseNo : String;
    items : []; // need to revisit
    discounts : [];
    status : PurchaseRequestStatus; 
    rejectedReason : [];
    comparisonSummary : [];
    revokedHistory : [];
    createdBy : Types.ObjectId;
    createdAt : Date;
    updatedBy : Types.ObjectId;
    updatedAt : Date;
    isDeleted : Boolean;
}


export enum PurchaseRequestStatus {
    Drafted = 'Drafted',
    Pending = 'Pending',
    ReadyToProcessLPO = 'ReadyToProcessLPO',
    Rejected = 'Rejected',
    OnHoldCancelled = 'OnHoldCancelled',
}