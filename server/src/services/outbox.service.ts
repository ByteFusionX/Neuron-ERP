import { randomUUID } from "crypto";
import NotificationOutbox from "../models/notificationOutbox.model";
import { isAppMailConfigured, sendAppEmail } from "./email.service";

const MAX_ATTEMPTS = 5;
const STALE_LOCK_MS = 10 * 60 * 1000;
const DIGEST_WINDOW_MS = 15 * 60 * 1000;
const BATCH_SIZE = 50;

type ScheduledHandler = (payload: any) => Promise<void>;
const handlers = new Map<string, ScheduledHandler>();

/** Features register what a scheduled job of theirs does when it comes due. */
export const registerScheduledHandler = (name: string, handler: ScheduledHandler) => { handlers.set(name, handler); };

const isDuplicate = (error: any) => error?.code === 11000;

/** Queues a job to run at `sendAt`. With a dedupeKey, scheduling the same job twice is a no-op (`replace` swaps a still-pending one). */
export const scheduleJob = async (handler: string, payload: any, sendAt: Date, dedupeKey?: string, replace = false) => {
    try {
        if (dedupeKey && replace) await NotificationOutbox.deleteOne({ dedupeKey, status: 'pending' });
        await NotificationOutbox.create({ kind: 'scheduled', handler, payload, nextAttemptAt: sendAt, dedupeKey });
    } catch (error) {
        if (!isDuplicate(error)) throw error;
    }
};

/** Drops a still-pending scheduled job (e.g. its announcement was deleted or pulled back to draft). */
export const cancelScheduledJob = async (dedupeKey: string) => {
    await NotificationOutbox.deleteOne({ dedupeKey, status: 'pending' });
};

const backoffMs =(attempts: number) => Math.min(60, 2 ** attempts) * 60 * 1000;

const recordFailure = async (row: any, error: any) => {
    const attempts = (row.attempts || 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await NotificationOutbox.updateOne({ _id: row._id }, {
        $set: {
            status: exhausted ? 'failed' : 'pending',
            attempts,
            nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
            lastError: String(error?.message || error).slice(0, 500),
        },
        $unset: { claimToken: '', lockedAt: '' },
    });
};

const recordSent = (filter: any) =>
    NotificationOutbox.updateMany(filter, { $set: { status: 'sent', sentAt: new Date() }, $unset: { claimToken: '', lockedAt: '', lastError: '' } });

const deliver = async (row: any) => {
    if (row.kind === 'scheduled') {
        const handler = handlers.get(row.handler);
        if (!handler) throw new Error(`No handler registered for "${row.handler}"`);
        await handler(row.payload);
        return;
    }
    await sendAppEmail({ to: row.to, subject: row.subject, message: row.message });
};

/** Skips email rows when no sender mailbox is configured, instead of retrying them for nothing. */
const skipUnconfiguredEmail = async (filter: any) => {
    if (isAppMailConfigured()) return false;
    await NotificationOutbox.updateMany(filter, { $set: { status: 'skipped', lastError: 'Email sender is not configured (MAIL_SENDER_ADDRESS and Microsoft app credentials)' } });
    return true;
};

const processImmediate = async () => {
    for (let i = 0; i < BATCH_SIZE; i++) {
        const row: any = await NotificationOutbox.findOneAndUpdate(
            { status: 'pending', priority: { $ne: 'digest' }, nextAttemptAt: { $lte: new Date() } },
            { $set: { status: 'processing', lockedAt: new Date() } },
            { sort: { nextAttemptAt: 1 }, new: true }
        );
        if (!row) return;
        try {
            if (row.kind === 'email' && await skipUnconfiguredEmail({ _id: row._id })) continue;
            await deliver(row);
            await recordSent({ _id: row._id });
        } catch (error) {
            await recordFailure(row, error);
        }
    }
};

/** Sends each recipient's waiting digest rows as one email, once the oldest of them has waited out the digest window. */
const processDigests = async () => {
    const now = new Date();
    const due = await NotificationOutbox.aggregate([
        { $match: { kind: 'email', priority: 'digest', status: 'pending', nextAttemptAt: { $lte: now } } },
        { $group: { _id: '$to', oldest: { $min: '$createdAt' } } },
        { $match: { oldest: { $lte: new Date(now.getTime() - DIGEST_WINDOW_MS) } } },
    ]);

    for (const group of due) {
        const claimToken = randomUUID();
        const claimed = await NotificationOutbox.updateMany(
            { kind: 'email', priority: 'digest', status: 'pending', nextAttemptAt: { $lte: now }, to: group._id },
            { $set: { status: 'processing', lockedAt: now, claimToken } }
        );
        if (!claimed.modifiedCount) continue;

        const rows: any[] = await NotificationOutbox.find({ claimToken }).sort({ createdAt: 1 }).lean();
        try {
            if (await skipUnconfiguredEmail({ claimToken })) continue;
            const single = rows.length === 1;
            await sendAppEmail({
                to: group._id,
                subject: single ? rows[0].subject : `${rows.length} new notifications`,
                message: single ? rows[0].message : rows.map(row => `• ${row.subject}\n  ${row.message}`).join('\n\n'),
            });
            await recordSent({ claimToken });
        } catch (error) {
            for (const row of rows) await recordFailure(row, error);
        }
    }
};

/** Rows left "processing" by a crashed worker go back to the queue. */
const releaseStaleClaims = () =>
    NotificationOutbox.updateMany(
        { status: 'processing', lockedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) } },
        { $set: { status: 'pending' }, $unset: { claimToken: '', lockedAt: '' } }
    );

/** One dispatcher pass: due scheduled jobs and immediate emails (with retries), then digests. Called by the cron tick. */
export const processOutbox = async () => {
    await releaseStaleClaims();
    await processImmediate();
    await processDigests();
};
