import { Schema, model,Types } from "mongoose";

interface Notification {
    // Logical notification type (what the UI sees)
    type: string;
    // Actual Mongoose model referenced by referenceId (e.g. 'Event', 'Enquiry', 'Quotation', 'Announcement')
    referenceModel: string;
    title: string;
    message: string;
    recipients: any[];
    sentBy: any;
    date: Date;
    referenceId: Types.ObjectId;
    additionalData: any;
    // Idempotency key: a second notification with the same key is never created (retries, overlapping crons, several servers)
    dedupeKey?: string;
}


const notificationSchema = new Schema<Notification>({
    type: {
        type: String,
        required: true,
        enum: [
            'Event',
            'Announcement',
            'AssignedJob',
            'ReAssignedJob',
            'DealSheet',
            'DealSheetResponse',
            'FeedbackRequest',
            'Quotation',
            'Enquiry',
            'EnquiryEstimationReady',
            'EnquiryFollowUpOverdue',
            'RfqFollowUpOverdue',
            'JobAllocated',
            'ProcurementTransferred',
            'MrRequest',
            'TechnicalAssigned',
            'MrApprovalRequest',
            'MrRejected',
            'MrApproved',
            'PurchaseApprovalRequest',
            'PurchaseProcurementNotice',
            'PurchaseApproved',
            'PurchaseRejected',
            'PurchaseRequestAllocated',
            'LpoApprovalRequest',
            'LpoApproved',
            'LpoRejected',
            'SupplierApprovalRequest',
            'SupplierApproved',
            'SupplierRejected',
            'ClaimApprovalRequest',
            'ClaimApproved',
            'ClaimRejected',
            'BugReportAssigned',
            'BugReportResolved',
            'GrnItemsRejected',
            'LpoPlaced',
            'LpoPlacedBilling',
            'LpoDeliveryDue',
            'DnItemsRejected',
            'InvoiceRejected',
            'SupplierReturnInitiated',
            'StockHoldInitiated'
        ],
    },
    referenceModel: {
        type: String,
        required: true,
        enum: ['Event', 'Announcement', 'Enquiry', 'Quotation', 'Job', 'Purchase', 'Technical', 'PurchaseOrder', 'Supplier', 'Claim', 'BugReport', 'GRN', 'DeliveryNote', 'Invoice', 'SupplierReturn', 'StockHold', 'Rfq'],
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    recipients: {
        type: [{
            objectId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
            status: { type: String, enum: ['unread', 'read', 'archived'], default: 'unread' },
        }],
        required: true,
    },
    sentBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee', // System or employee who sent the notification
    },
    date: {
        type: Date,
        default: Date.now,
    },
    referenceId: {
        type: Schema.Types.ObjectId,
        refPath: 'referenceModel',
    },
    additionalData: {
        type: Schema.Types.Mixed,
        default: {},
    },
    dedupeKey: {
        type: String,
    },
});

notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export default model<Notification>('Notification', notificationSchema);
