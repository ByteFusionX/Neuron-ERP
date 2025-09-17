import { model, Schema, Types } from "mongoose";

interface Claim {
    reason:string;
    amount:number;
    raisedBy:Types.ObjectId;
    raisedDate:Date;
    attachements:{
        fileName:string;
        originalname:string;
    }[];
    type:string;
    approvalStatus: ClaimStatus[]
    technicalId: Types.ObjectId;
    jobId: string;
    category: string;
}

interface ClaimStatus {
    status:string;
    role:Types.ObjectId;
    step:number;
    managerApproval:boolean;
    updatedBy:Types.ObjectId;
    updatedDate:Date;
    comment:string;
}

const ClaimStatusSchema = new Schema<ClaimStatus>({
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

const ClaimSchema = new Schema<Claim>({
    reason: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    raisedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    raisedDate: {
        type: Date,
        required: true
    },
    attachements: {
        type: [],
        default: []
    },
    category: {
        type: String,
        required: false,
        enum: ['manpower', 'others']
    },
    type: {
        type: String,
        required: true,
        enum: ['normal', 'project']
    },
    approvalStatus: {
        type: [ClaimStatusSchema],
        required: true
    },
    technicalId: {
        type: Schema.Types.ObjectId,
        ref: 'Technical',
    },
    jobId: {
        type: String,
    },
})
const Claim = model<Claim>('Claim', ClaimSchema);

export default Claim;