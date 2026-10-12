import { Schema, Document, model, Types } from "mongoose";
import { followUpTaskSchema } from "./followUpTask.schema";
import { File } from "../interface/enquiry.interface";
import FilesSchema from "./files.model";
import { Feedback } from "aws-sdk/clients/guardduty";

interface Enquiry extends Document {
    enquiryId: String
    client: Types.ObjectId;
    contact: Types.ObjectId;
    department: Types.ObjectId;
    salesPerson: Types.ObjectId;
    createdByUser?: Types.ObjectId;
    title: String;
    source?: string;
    enquiryCategory?: string;
    priority?: string;
    requirement?: string;
    followUpOutcome?: string;
    lostReason?: string;
    competitorName?: string;
    competitorPriceGap?: string;
    date: string | number | Date;
    nextFollowUpDate?: string | number | Date;
    lastFollowUpDate?: string | number | Date;
    followUpHistory: { date: Date, outcome: string, note: string, nextFollowUpDate: Date, createdBy: Types.ObjectId, createdByName: string, createdAt: Date, correctionOf?: Types.ObjectId | null, status?: 'scheduled' | 'done' | 'cancelled', dueDate?: Date, completedAt?: Date, cancelReason?: string }[];
    createdDate: Date;
    preSale: { followUp?: { history?: any[], nextFollowUpDate?: Date, lastActivityDate?: Date, lastOutcome?: string }, presalePerson: Types.ObjectId, estimations: { optionalItems: any[], currency: string, totalDiscount: number, presaleNote: string, version?: number }, estimationHistory?: any[], presaleFiles: [], comment: string, feedback: Feedback[], newFeedbackAccess: boolean, seenbyEmployee: boolean, seenbySalesPerson: boolean, revisionComment: string[], createdDate: Date, rejectionHistory: { rejectionReason: any; rejectedBy: Types.ObjectId; rejectedRole: string }[], assignApproval?: { stepIndex: number, role: Types.ObjectId, assignedAt: Date, escalationDueAt: Date, escalatedFrom?: Types.ObjectId, reminderDueAt?: Date, reminderSentAt?: Date, timeoutAction?: string, repeatReminder?: boolean, timeoutHandledAt?: Date, workflowVersion?: number }, status?: string };
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
    // v1 is the first submission; it only moves to v2, v3... when an estimation is re-submitted after a revision.
    version: {
        type: Number
    },
    // The supplier RFQ the costs were filled from; the quotation made from this estimation links the enquiry's RFQs through it.
    sourceRfqId: {
        type: Schema.Types.ObjectId,
        ref: 'Rfq'
    },
});

// A superseded estimation is kept here, never deleted.
const estimationHistorySchema = new Schema({
    version: { type: Number },
    optionalItems: { type: Array, default: [] },
    currency: { type: String },
    totalDiscount: { type: Number },
    presaleNote: { type: String },
    archivedAt: { type: Date, default: Date.now },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    reason: { type: String },
}, { _id: false });


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

const assignApprovalSchema = new Schema({
    stepIndex: {
        type: Number,
        default: 0
    },
    restartCount: {
        type: Number,
        default: 0
    },
    /** Roles a Super Admin switched off for this job when resetting the workflow; they are skipped on its ladder. */
    disabledRoles: [{
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }],
    role: {
        type: Schema.Types.ObjectId,
        ref: 'Category'
    },
    /** Every role that may assign at this stage; more than one when the workflow has an "Or" stage. */
    roles: [{
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }],
    assignedAt: {
        type: Date
    },
    escalationDueAt: {
        type: Date
    },
    escalatedFrom: {
        type: Schema.Types.ObjectId,
        ref: 'Category'
    },
    reminderDueAt: { type: Date },
    reminderSentAt: { type: Date },
    timeoutAction: { type: String, enum: ['escalate', 'notify', 'reject'], default: 'escalate' },
    repeatReminder: { type: Boolean, default: true },
    timeoutHandledAt: { type: Date },
    workflowVersion: { type: Number },
}, { _id: false });

// Chasing the estimation: one open task at a time, with next/last summary fields the presale list filters on.
const presaleFollowUpSchema = new Schema({
    history: { type: [followUpTaskSchema], default: [] },
    nextFollowUpDate: { type: Date },
    lastActivityDate: { type: Date },
    lastOutcome: { type: String },
}, { _id: false });

const preSaleSchema = new Schema({
    followUp: { type: presaleFollowUpSchema },
    presalePerson: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    estimations: {
        type: estimationSchema
    },
    estimationHistory: {
        type: [estimationHistorySchema],
        default: []
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
    rejectionHistory: [rejectionHistorySchema],
    assignApproval: assignApprovalSchema,
    status: {
        type: String,
        enum: ['new', 'assigned', 'in review', 'rejected', 'returned', 'in revision', 'approved', 'completed', 'cancelled'],
        default: 'new'
    },
    // Set when the enquiry is marked Lost while presale is still working on it.
    cancelReason: {
        type: String
    },
    cancelledAt: {
        type: Date
    }
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
        enum: ['assigned', 'reassigned', 'self-assigned'],
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

const followUpHistorySchema = new Schema({
    date: {
        type: Date,
        default: Date.now
    },
    outcome: {
        type: String,
        trim: true
    },
    note: {
        type: String,
        trim: true
    },
    nextFollowUpDate: {
        type: Date
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    createdByName: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // scheduled = open follow-up awaiting action; done = logged; cancelled = closed without action.
    // Entries saved before this field existed have no status and are read as done.
    status: {
        type: String,
        enum: ['scheduled', 'done', 'cancelled'],
        default: 'done'
    },
    dueDate: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    cancelReason: {
        type: String,
        trim: true
    },
    correctionOf: {
        type: Schema.Types.ObjectId,
        default: null
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
    createdByUser: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    },
    title: {
        type: String,
        required: true
    },
    source: {
        type: String,
        trim: true
    },
    enquiryCategory: {
        type: String,
        trim: true
    },
    priority: {
        type: String,
        trim: true
    },
    requirement: {
        type: String,
        trim: true
    },
    followUpOutcome: {
        type: String,
        trim: true
    },
    lostReason: {
        type: String,
        trim: true
    },
    competitorName: {
        type: String,
        trim: true
    },
    competitorPriceGap: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    nextFollowUpDate: {
        type: Date,
    },
    lastFollowUpDate: {
        type: Date,
    },
    followUpHistory: {
        type: [followUpHistorySchema],
        default: []
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
        enum: [
            // legacy values - kept for backward compatibility with existing documents, not used by new code paths
            'New',
            'In Review',
            'Sent to Presales',
            'Ready for Quotation',
            'Quoted',
            'Lost',
            'Work In Progress',
            'Assigned To Presale Manager',
            'Assigned To Presale Engineer',
            'Assigned To Presales',
            'Rejected by Presale Engineer',
            'Rejected by Presale Manager',
            'Sended by Presale Engineer',
            // current values - used by new code paths going forward
            'new',
            'in progress',
            'in presales',
            'rejected',
            'estimated',
            'revision',
            'quoted',
            'lost',
        ],
        default: 'new',
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

// Keeps the 1-minute assignment-workflow tick cheap: it only looks at jobs that are waiting with a due time set
enquirySchema.index({ 'preSale.assignApproval.escalationDueAt': 1 }, { partialFilterExpression: { 'preSale.assignApproval.escalationDueAt': { $exists: true } } });
enquirySchema.index({ 'preSale.assignApproval.reminderDueAt': 1 }, { partialFilterExpression: { 'preSale.assignApproval.reminderDueAt': { $exists: true } } });

export default model<Enquiry>("Enquiry", enquirySchema);
