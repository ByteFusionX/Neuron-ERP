import { randomUUID } from "crypto";
import CronLock from "../models/cronLock.model";

const owner = `${process.pid}-${randomUUID()}`;
const runningHere = new Set<string>();

/**
 * Runs `fn` unless the same job is already running, on this server (overlapping ticks) or on another one
 * (several instances sharing the database). The lock expires after `ttlMs`, so a crashed run cannot block the job forever.
 */
export const runExclusive = async (name: string, ttlMs: number, fn: () => Promise<void>) => {
    if (runningHere.has(name)) return;
    runningHere.add(name);
    let locked = false;
    try {
        const now = new Date();
        try {
            await CronLock.findOneAndUpdate(
                { _id: name, lockedUntil: { $lte: now } },
                { $set: { owner, lockedUntil: new Date(now.getTime() + ttlMs) } },
                { upsert: true }
            );
            locked = true;
        } catch (error: any) {
            // The lock row exists and is still held: another instance is running this job
            if (error?.code === 11000) return;
            throw error;
        }
        await fn();
    } catch (error: any) {
        console.error(`Cron job "${name}" error:`, error.message);
    } finally {
        if (locked) await CronLock.updateOne({ _id: name, owner }, { $set: { lockedUntil: new Date(0) } }).catch(() => undefined);
        runningHere.delete(name);
    }
};
