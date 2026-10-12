import { Request, Response } from 'express';
import { getEmployeeData } from '../common/utils/util';
import { FollowUpTask } from '../models/followUpTask.schema';

/** The follow-up block a record keeps: its tasks plus the summary fields lists filter and sort on. */
export interface FollowUpBlock {
    history?: FollowUpTask[];
    nextFollowUpDate?: Date;
    lastActivityDate?: Date;
    lastOutcome?: string;
    [key: string]: any;
}

export const parseFollowUpDate = (value: any): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
};

export const followUpActor = async (req: Request) => {
    const user: any = await getEmployeeData((req as any).user);
    return { id: user?._id, name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '' };
};

const plain = (block: any): FollowUpBlock => {
    const base = block?.toObject ? block.toObject() : { ...(block || {}) };
    return { ...base, history: [...(base.history || [])] };
};

/** Re-derives the summary: next date = the open task's due date; last activity/outcome = the newest completed one. */
const syncSummary = (block: FollowUpBlock): FollowUpBlock => {
    const history = block.history || [];
    const open = history.find((entry) => entry.status === 'scheduled');
    if (open) block.nextFollowUpDate = open.dueDate;
    else delete block.nextFollowUpDate;
    const done = history
        .filter((entry) => entry.status === 'done')
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
    if (done) {
        block.lastActivityDate = done.date;
        block.lastOutcome = done.outcome;
    }
    return block;
};

type Actor = { id: any; name: string };

/** Schedules the open follow-up, or moves it when one is already open (one open follow-up per record). */
export const scheduleInBlock = (current: any, dueDate: Date, note: string, actor: Actor): FollowUpBlock => {
    const block = plain(current);
    const open = block.history!.find((entry) => entry.status === 'scheduled');
    if (open) {
        open.dueDate = dueDate;
        open.date = dueDate;
        if (note) open.note = note;
    } else {
        block.history!.push({ status: 'scheduled', dueDate, date: dueDate, note, createdBy: actor.id, createdByName: actor.name, createdAt: new Date() });
    }
    return syncSummary(block);
};

/** Marks the open follow-up done with its outcome, optionally scheduling the next one in the same step. */
export const completeInBlock = (current: any, input: { outcome: string; note?: string; doneOn: Date; nextDate: Date | null }, actor: Actor): FollowUpBlock => {
    const block = plain(current);
    const now = new Date();
    const open = block.history!.find((entry) => entry.status === 'scheduled');
    if (open) {
        open.status = 'done';
        open.date = input.doneOn;
        open.outcome = input.outcome;
        open.note = input.note || open.note || '';
        open.completedAt = now;
        open.createdBy = actor.id;
        open.createdByName = actor.name;
    } else {
        // Nothing was scheduled (an ad-hoc call): log it as done.
        block.history!.push({ status: 'done', date: input.doneOn, outcome: input.outcome, note: input.note || '', completedAt: now, createdBy: actor.id, createdByName: actor.name, createdAt: now });
    }
    if (input.nextDate) {
        block.history!.push({ status: 'scheduled', dueDate: input.nextDate, date: input.nextDate, createdBy: actor.id, createdByName: actor.name, createdAt: now });
    }
    return syncSummary(block);
};

/** Closes the open follow-up without an outcome. Returns null when nothing is open (a bare legacy date counts as open). */
export const cancelInBlock = (current: any, reason: string): FollowUpBlock | null => {
    const block = plain(current);
    const open = block.history!.find((entry) => entry.status === 'scheduled');
    if (!open && !block.nextFollowUpDate) return null;
    if (open) {
        open.status = 'cancelled';
        open.cancelReason = reason;
        open.completedAt = new Date();
    }
    return syncSummary(block);
};

/** Express-facing body validation shared by every record's follow-up endpoints. */
export const readScheduleBody = (req: Request, res: Response): { dueDate: Date; note: string } | null => {
    const dueDate = parseFollowUpDate(req.body.dueDate);
    if (!dueDate) { res.status(400).json({ success: false, message: 'Choose a follow-up date.' }); return null; }
    return { dueDate, note: String(req.body.note ?? '').trim() };
};

export const readCompleteBody = (req: Request, res: Response): { outcome: string; note: string; doneOn: Date; nextDate: Date | null } | null => {
    const outcome = String(req.body.outcome ?? '').trim();
    if (!outcome) { res.status(400).json({ success: false, message: 'Enter the follow-up outcome.' }); return null; }
    return { outcome, note: String(req.body.note ?? '').trim(), doneOn: parseFollowUpDate(req.body.date) || new Date(), nextDate: parseFollowUpDate(req.body.nextFollowUpDate) };
};

/** Mongo filter on a record's next follow-up date for the Overdue / Today / Upcoming list views. */
export const followUpViewFilter = (field: string, view: unknown): Record<string, any> => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    switch (view) {
        case 'overdue': return { [field]: { $lt: todayStart } };
        case 'today': return { [field]: { $gte: todayStart, $lte: todayEnd } };
        case 'upcoming': return { [field]: { $gt: todayEnd } };
        case 'none': return { [field]: { $exists: false } };
        default: return {};
    }
};
