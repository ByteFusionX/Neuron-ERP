import { Schema, model, Types } from "mongoose";

interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
}

interface PushSubscription {
    employee: Types.ObjectId;
    endpoint: string;
    keys: PushSubscriptionKeys;
    userAgent?: string;
    createdAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscription>({
    employee: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    endpoint: {
        type: String,
        required: true,
        unique: true,
    },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
    },
    userAgent: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

export default model<PushSubscription>('PushSubscription', pushSubscriptionSchema);
