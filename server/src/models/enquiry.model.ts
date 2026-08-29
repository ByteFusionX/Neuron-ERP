import { Schema, Document, model, Types } from "mongoose";
import { File } from "../interface/enquiry.interface";
import FilesSchema from "./files.model";
import { Feedback } from "aws-sdk/clients/guardduty";

interface Enquiry extends Document {
    enquiryId: String
    client: Types.ObjectId;
    contact: Types.ObjectId;
    department: Types.ObjectId;
    salesPerson: Types.ObjectId;
    title: String;
    date: string | number | Date;
    createdDate: Date;
    preSale: { presalePerson: Types.ObjectId, estimations: { optionalItems: any[], currency: string, totalDiscount: number, presaleNote: string }, presaleFiles: [], comment: string, feedback: Feedback[], newFeedbackAccess: boolean, seenbyEmployee: boolean, seenbySalesPerson: boolean, revisionComment: string[], createdDate: Date, rejectionHistory: { rejectionReason: any; rejectedBy: Types.ObjectId; rejectedRole: string }[] };
    // preSale: { presalePerson: Types.ObjectId, estimations: { optionalItems: any[], currency: string, totalDiscount: number, presaleNote: string }, presaleFiles: [], comment: string, feedback: Feedback[], newFeedbackAccess: boolean, seenbyEmployee: boolean, seenbySalesPerson: boolean, revisionComment: string[], createdDate: Date, rejectionHistory: { rejectionReason: any; rejectedBy: Types.ObjectId; }[] };
    assignedFiles: []
    status: string;
    attachments: []
    isDeleted: boolean,
    reAssignedSeen: boolean,
    reAssignedDate: Date,
    assignmentHistory: { employee: Types.ObjectId, employeeName: string, action: string, role: string, assignedBy: Types.ObjectId, assignedByName: string, date: Date }[],
    reAssigned: any,
    eventId: string,
}

interface ItemDetail {
    detail: string;
    quantity: number;
    unitCost: number;
    unitSellingPrice: number;
    availability: string;
}

interface QuoteItem {
    itemName: string;
    itemDetails: ItemDetail[]
}

const feedbackSchema = new Schema({
    _id: {
        type: Schema.Types.ObjectId,
        default: () => new Types.ObjectId()
    },
    employeeId: {
        type: Types.ObjectId
    },
    comment: {
        type: String
    },
    feedback: {
        type: String
    },
    requestedDate: {
        type: Date
    },
    seenByFeedbackProvider: {
        type: Boolean,
        default: false
    },
    seenByFeedbackRequester: {
        type: Boolean,
        default: false
    },
})

const estimationSchema = new Schema({
    optionalItems: {
        type: Array,
        default: []
    },
    currency: {
        type: String
    },
    totalDiscount: {
        type: Number
    },
    presaleNote: {
        type: String
    },
});


const rejectionHistorySchema = new Schema({
    rejectedAt: {
        type: Date,
        default: Date.now
    },
    rejectionReason: {
        type: String
    },
    rejectedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    rejectedRole: {
        type: String
    }
});

const preSaleSchema = new Schema({
    presalePerson: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    estimations: {
        type: estimationSchema
    },
    presaleFiles: [],
    comment: {
        type: String
    },
    feedback: {
        type: [feedbackSchema]
    },
    newFeedbackAccess: {
        type: Boolean,
        default: true
    },
    seenbyEmployee: {
        type: Boolean,
        default: false
    },
    seenbySalesPerson: {
        type: Boolean,
        default: false
    },
    revisionComment: {
        type: [String],
        default: []
    },
    createdDate: {
        type: Date,
        default: Date.now()
    },
    rejectionHistory: [rejectionHistorySchema]
})


const assignmentHistorySchema = new Schema({
    _id: {
        type: Schema.Types.ObjectId,
        default: () => new Types.ObjectId()
    },
    employee: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    employeeName: {
        type: String
    },
    action: {
        type: String,
        enum: ['assigned', 'reassigned'],
        default: 'assigned'
    },
    role: {
        type: String
    },
    assignedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    assignedByName: {
        type: String
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const enquirySchema = new Schema<Enquiry>({
    client: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
    },
    contact: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
    },
    department: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
    },
    salesPerson: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    createdDate: {
        type: Date,
        default: Date.now()
    },
    attachments: [],
    preSale: preSaleSchema,
    assignedFiles: [FilesSchema],
    enquiryId: {
        type: String,
        unique: true,
        required: true,
    },
    status: {
        type: String,
        required: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    reAssigned: {
        type: Schema.Types.ObjectId,
    },
    reAssignedDate: {
        type: Date,
    },
    reAssignedSeen: {
        type: Boolean,
        default: false
    },
    assignmentHistory: [assignmentHistorySchema],
    eventId: {
        type: String,
    }
});

export default model<Enquiry>("Enquiry", enquirySchema);

