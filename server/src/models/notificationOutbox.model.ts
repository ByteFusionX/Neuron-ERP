import { Schema, model } from "mongoose";

/**
 * Work waiting to be delivered by the outbox worker (see outbox.service.ts).
 *  - kind 'email':     one email to one address. priority 'digest' rows are batched into a single email per recipient.
 *  - kind 'scheduled': a job to run at `nextAttemptAt` (e.g. an announcement notification set for a future date),
 *                      executed by the handler registered under `handler`.
 */
export type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';

interface NotificationOutbox {
    kind: 'email' | 'scheduled';
    status: OutboxStatus;
    // Unique per logical send; makes enqueueing idempotent
    dedupeKey?: string;
    priority: 'immediate' | 'digest';
    // email
    to?: string;
    employee?: any;
    subject?: string;
    message?: string;
    // scheduled
    handler?: string;
    payload?: any;
    attempts: number;
    nextAttemptAt: Date;
    lockedAt?: Date;
    claimToken?: string;
    lastError?: string;
    sentAt?: Date;
}

const notificationOutboxSchema = new Schema<NotificationOutbox>({
    kind: { type: String, enum: ['email', 'scheduled'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'sent', 'failed', 'skipped'], default: 'pending' },
    dedupeKey: { type: String },
    priority: { type: String, enum: ['immediate', 'digest'], default: 'immediate' },
    to: String,
    employee: { type: Schema.Types.ObjectId, ref: 'Employee' },
    subject: String,
    message: String,
    handler: String,
    payload: Schema.Types.Mixed,
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedAt: Date,
    claimToken: String,
    lastError: String,
    sentAt: Date,
}, { timestamps: true });

notificationOutboxSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
// Sent and skipped rows are only history; failed rows stay for the admin to inspect
notificationOutboxSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { status: 'sent' } });

export default model<NotificationOutbox>('NotificationOutbox', notificationOutboxSchema);
