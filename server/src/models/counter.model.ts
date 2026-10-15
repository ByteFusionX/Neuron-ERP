import { model, Schema } from "mongoose";

interface counterSchemaInterface {
    _id: string;
    seq: number;
}

const counterSchema = new Schema<counterSchemaInterface>({
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
});

const Counter = model<counterSchemaInterface>('Counter', counterSchema);

// Atomically returns the next sequence number for `key`. If no counter exists yet for
// this key, `computeSeed` (when given) is run once to seed the counter from whatever
// numbering scheme was already in the collection (e.g. the current max), so a fresh
// counter continues from existing data instead of restarting at 1 and colliding with
// documents created before this counter existed. There is a narrow, one-time race on
// the very first call for a brand-new key (between the seed check and its creation);
// every call after the counter document exists is a single atomic $inc.
export const getNextSequence = async (key: string, computeSeed?: () => Promise<number>): Promise<number> => {
    const existing = await Counter.findById(key);
    if (!existing) {
        const seed = computeSeed ? await computeSeed() : 0;
        await Counter.findOneAndUpdate(
            { _id: key },
            { $setOnInsert: { seq: seed } },
            { upsert: true }
        );
    }
    const counter = await Counter.findByIdAndUpdate(
        key,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

// Non-consuming peek at the next sequence number for `key` — does NOT increment the
// counter, so it is safe to call from preview/display endpoints without burning a
// number that may never be used. If the counter doesn't exist yet, falls back to
// `computeSeed` (same seeding logic as getNextSequence) to predict the first value.
export const peekNextSequence = async (key: string, computeSeed?: () => Promise<number>): Promise<number> => {
    const existing = await Counter.findById(key);
    if (existing) {
        return existing.seq + 1;
    }
    const seed = computeSeed ? await computeSeed() : 0;
    return seed + 1;
};

export default Counter;
