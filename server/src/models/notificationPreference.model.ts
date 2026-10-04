import { Schema, model } from "mongoose";

export type NotificationChannel = 'inapp' | 'push' | 'email';

interface NotificationPreference {
    employee: any;
    // Notification types the employee has switched off, per channel (absent = receives everything)
    muted: { inapp: string[]; push: string[]; email: string[] };
    // Email types the employee wants as one combined digest instead of separate emails
    emailDigest: string[];
}

const notificationPreferenceSchema = new Schema<NotificationPreference>({
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
    muted: {
        inapp: { type: [String], default: [] },
        push: { type: [String], default: [] },
        email: { type: [String], default: [] },
    },
    emailDigest: { type: [String], default: [] },
}, { timestamps: true });

export default model<NotificationPreference>('NotificationPreference', notificationPreferenceSchema);
