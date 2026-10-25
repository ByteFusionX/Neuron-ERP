import { Schema } from 'mongoose';

// attachEmployee loads the signed-in employee (+ category, reportingTo) on every request, and the
// database is remote, so that lookup alone costs a full round trip per call. Entries are short-lived
// and the whole cache is dropped on any employee/category write, so privilege changes apply at once.
const TTL_MS = 30_000;
const MAX_ENTRIES = 500;

const entries = new Map<string, { value: any; expires: number }>();

export const getCachedEmployee = (key: string): any | undefined => {
    const hit = entries.get(key);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
        entries.delete(key);
        return undefined;
    }
    return hit.value;
};

export const setCachedEmployee = (key: string, value: any): void => {
    if (!value) return;
    if (entries.size >= MAX_ENTRIES) entries.clear();
    entries.set(key, { value, expires: Date.now() + TTL_MS });
};

export const clearEmployeeCache = (): void => entries.clear();

export const invalidateEmployeeCacheOnWrite = (schema: Schema): void => {
    const writeHooks = [
        'save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace',
        'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne', 'insertMany',
    ] as const;
    writeHooks.forEach((hook) => schema.post(hook as any, clearEmployeeCache));
};
