import { Schema, model } from "mongoose";

interface events {
    from: string,
    collectionId: any,
    event: string,
    date: Date,
    employee: any,
    summary: string,
    eventFiles: any,
    status: string,
    createdBy:any,
    endDate?: Date,
    location?: string,
    attendees?: string[],
    syncToOutlook?: boolean,
    onlineMeeting?: boolean,
    outlookEventId?: string,
    outlookSyncStatus?: string
}

const eventSchema = new Schema<events>({
    from: {
        type: String,
        required: true,
        enum: ['Employee', 'Customer', 'Quotation', 'Enquiry', 'Department', 'InternalDepartment', 'Category', 'Job'],
    },
    collectionId: {
        type: Schema.Types.ObjectId,
        refPath: 'from',
        required: true
    },
    event: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    employee: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    summary: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'pending',
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    eventFiles: [],
    // Outlook calendar sync (one-way push). All optional so existing events are unaffected.
    endDate: {
        type: Date
    },
    location: {
        type: String
    },
    attendees: {
        type: [String],
        default: []
    },
    syncToOutlook: {
        type: Boolean,
        default: false
    },
    onlineMeeting: {
        type: Boolean,
        default: false
    },
    outlookEventId: {
        type: String
    },
    outlookSyncStatus: {
        type: String,
        enum: ['not-synced', 'synced', 'failed'],
        default: 'not-synced'
    }
})

export default model<events>('Event', eventSchema)