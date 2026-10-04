import { Schema, model } from "mongoose";

interface CronLock {
    _id: string;
    owner: string;
    lockedUntil: Date;
}

const cronLockSchema = new Schema<CronLock>({
    _id: { type: String },
    owner: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
}, { _id: false });

export default model<CronLock>('CronLock', cronLockSchema);
