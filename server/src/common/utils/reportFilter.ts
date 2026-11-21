import { Types } from 'mongoose';

/** Ids a report filter carries: one id, a comma-joined list or an array; invalid ids are dropped. */
export const reportIds = (value: unknown): Types.ObjectId[] =>
    (Array.isArray(value) ? value : value == null || value === '' ? [] : String(value).split(','))
        .map((v) => String(v).trim())
        .filter((v) => Types.ObjectId.isValid(v))
        .map((v) => new Types.ObjectId(v));

/** Plain string values (e.g. supplier type), same shapes as reportIds. */
export const reportValues = (value: unknown): string[] =>
    (Array.isArray(value) ? value : value == null || value === '' ? [] : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean);

/** `$in` for "is", `$nin` for "is not" (the `<key>Not` flag); undefined when nothing was picked. */
export const reportMatch = <T>(values: T[], not: unknown): { $in: T[] } | { $nin: T[] } | undefined =>
    values.length ? (not ? { $nin: values } : { $in: values }) : undefined;
