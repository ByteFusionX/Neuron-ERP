import {  Types } from "mongoose";


interface PurchaseRequest extends Document {
    jobId : Types.ObjectId;
    purchaseNo : String;
    items : []; // need to revisit
    discounts : [];
    status : Enumerator; 
    rejectedReason : [];
    comparisonSummary : [];
    revokedHistory : [];
    createdBy : Types.ObjectId;
    createdAt : Date;
    updatedBy : Types.ObjectId;
    updatedAt : Date;
    isDeleted : Boolean;
}


