import { Schema } from "mongoose";

/**
 * One chase on a record (quotation, presale job). `scheduled` is the single open task with a `dueDate`,
 * `done` carries the outcome, `cancelled` was closed without action. Same shape the enquiry uses.
 */
export const followUpTaskSchema = new Schema({
    status: { type: String, enum: ['scheduled', 'done', 'cancelled'], default: 'done' },
    dueDate: { type: Date },
    date: { type: Date, default: Date.now },
    outcome: { type: String, trim: true },
    note: { type: String, trim: true },
    completedAt: { type: Date },
    cancelReason: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdByName: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
});

export interface FollowUpTask {
    _id?: any;
    status: 'scheduled' | 'done' | 'cancelled';
    dueDate?: Date;
    date?: Date;
    outcome?: string;
    note?: string;
    completedAt?: Date;
    cancelReason?: string;
    createdBy?: any;
    createdByName?: string;
    createdAt?: Date;
}
