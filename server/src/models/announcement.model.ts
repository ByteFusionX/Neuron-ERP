import { Schema, Document, model, Types } from "mongoose";

export const ANNOUNCEMENT_PRIORITIES = ['normal', 'important', 'urgent'] as const;
export const ANNOUNCEMENT_TYPES = ['general', 'policy', 'event', 'celebration', 'maintenance'] as const;

interface announcment extends Document {
    title: String
    description: String
    // Legacy: the day the announcement goes out. New records keep it equal to publishAt; readers use publishAt ?? date.
    date: Date
    createdDate: Date,
    celeb: boolean
    viewedBy: string[]
    category: string[]
    createdBy: Types.ObjectId
    priority: typeof ANNOUNCEMENT_PRIORITIES[number]
    type: typeof ANNOUNCEMENT_TYPES[number]
    pinned: boolean
    status: 'draft' | 'published'
    publishAt?: Date
    expiresAt?: Date | null
    link?: string
    requireAck: boolean
    acknowledgedBy: { user: Types.ObjectId, at: Date }[]
    updatedAt?: Date
    updatedBy?: Types.ObjectId
}

const AnnouncementSchema = new Schema<announcment>({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    createdDate: {
        type: Date
    },
    date: {
        type: Date,
        required: true
    },
    // Set by the birthday/anniversary cron; shows confetti
    celeb: {
        type: Boolean,
        required: true
    },
    viewedBy: {
        type: [String]
    },
    category: {
        type: [String]
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    priority: { type: String, enum: ANNOUNCEMENT_PRIORITIES, default: 'normal' },
    type: { type: String, enum: ANNOUNCEMENT_TYPES, default: 'general' },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    publishAt: { type: Date },
    expiresAt: { type: Date, default: null },
    link: { type: String, trim: true },
    requireAck: { type: Boolean, default: false },
    acknowledgedBy: {
        type: [{
            _id: false,
            user: { type: Schema.Types.ObjectId, ref: 'Employee' },
            at: { type: Date, default: Date.now },
        }],
        default: [],
    },
    updatedAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
});

AnnouncementSchema.index({ status: 1, publishAt: -1 });
AnnouncementSchema.index({ createdBy: 1 });

export default model<announcment>("Announcement", AnnouncementSchema);
