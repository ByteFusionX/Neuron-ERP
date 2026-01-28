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
}


const notificationSchema = new Schema<Notification>({
    type: {
        type: String,
        required: true,
        enum: ['Event', 'Announcement', 'AssignedJob', 'ReAssignedJob', 'DealSheet', 'FeedbackRequest', 'Quotation', 'Enquiry'],
    },
    referenceModel: {
        type: String,
        required: true,
        enum: ['Event', 'Announcement', 'Enquiry', 'Quotation'],
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
});

export default model<Notification>('Notification', notificationSchema);
