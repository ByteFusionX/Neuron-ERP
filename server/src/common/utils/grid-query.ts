/** Translates data-grid filter/sort state sent by the client into Mongo `$match` / `$sort` stages. */

import { Types } from 'mongoose';

/** `id`: the grid sends ObjectId strings (columns whose options carry ids); arrays of ids match on any element. */
export type GridFieldType = 'text' | 'number' | 'date' | 'id';

export interface GridField {
    path: string;
    type?: GridFieldType;
    /** Display value -> stored value, for columns that show a label for a stored flag (e.g. Active -> true). */
    values?: Record<string, any>;
}

export type GridFieldMap = Record<string, GridField>;

interface GridFilter {
    key: string;
    op: string;
    value?: any;
    or?: boolean;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dayRange = (value: any): { start: Date; end: Date } | null => {
    const start = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(start.getTime())) return null;
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const conditionFor = (filter: GridFilter, field: GridField): any | null => {
    const { path } = field;
    const type = field.type ?? 'text';
    const value = filter.value;
    const emptyValues = [null, ''];

    if (filter.op === 'empty') return { $or: [{ [path]: { $in: emptyValues } }, { [path]: { $exists: false } }] };

    if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(field.values, String(value))) return null;
        const stored = field.values[String(value)];
        if (filter.op === 'is' || filter.op === 'eq') return { [path]: stored };
        if (filter.op === 'isNot' || filter.op === 'neq') return { [path]: { $ne: stored } };
        return null;
    }

    if (type === 'id') {
        if (!Types.ObjectId.isValid(String(value ?? ''))) return null;
        const id = new Types.ObjectId(String(value));
        if (filter.op === 'is' || filter.op === 'eq') return { [path]: id };
        if (filter.op === 'isNot' || filter.op === 'neq') return { [path]: { $ne: id } };
        return null;
    }

    if (type === 'number') {
        const n = Number(value);
        if (value === '' || value == null || isNaN(n)) return null;
        if (filter.op === 'eq') return { [path]: n };
        if (filter.op === 'neq') return { [path]: { $ne: n } };
        if (filter.op === 'gt') return { [path]: { $gt: n } };
        if (filter.op === 'lt') return { [path]: { $lt: n } };
        return null;
    }

    if (type === 'date') {
        // Two picked "on" days: everything from the first to the last, both days included.
        if (filter.op === 'between' && Array.isArray(value)) {
            const from = dayRange(value[0]);
            const to = dayRange(value[value.length - 1]);
            return from && to ? { [path]: { $gte: from.start, $lt: to.end } } : null;
        }
        const range = dayRange(value);
        if (!range) return null;
        if (filter.op === 'on') return { [path]: { $gte: range.start, $lt: range.end } };
        if (filter.op === 'notOn') return { $or: [{ [path]: { $lt: range.start } }, { [path]: { $gte: range.end } }, { [path]: null }] };
        if (filter.op === 'before') return { [path]: { $lt: range.start } };
        if (filter.op === 'after') return { [path]: { $gte: range.end } };
        return null;
    }

    const text = String(value ?? '').trim();
    if (!text) return null;
    switch (filter.op) {
        case 'contains': return { [path]: { $regex: escapeRegex(text), $options: 'i' } };
        case 'notContains': return { [path]: { $not: { $regex: escapeRegex(text), $options: 'i' } } };
        case 'is': return { [path]: { $regex: `^${escapeRegex(text)}$`, $options: 'i' } };
        case 'isNot': return { [path]: { $not: { $regex: `^${escapeRegex(text)}$`, $options: 'i' } } };
        // Alphabetical. Mongo string compare is case-sensitive, so this is a best effort for mixed-case data.
        case 'before': return { [path]: { $lt: text } };
        case 'after': return { [path]: { $gt: text } };
    }
    return null;
};

/** Consecutive `or` filters form a group; groups are AND'd together. Unknown keys and invalid values are skipped. */
export const buildGridFilterMatch = (filters: unknown, fields: GridFieldMap): any | null => {
    if (!Array.isArray(filters)) return null;

    const groups: any[][] = [];
    (filters as GridFilter[]).forEach((filter) => {
        const field = filter && Object.prototype.hasOwnProperty.call(fields, filter.key) ? fields[filter.key] : undefined;
        if (!field) return;
        const condition = conditionFor(filter, field);
        if (!condition) return;
        if (filter.or && groups.length) groups[groups.length - 1].push(condition);
        else groups.push([condition]);
    });

    if (!groups.length) return null;
    return { $and: groups.map((group) => (group.length > 1 ? { $or: group } : group[0])) };
};

/** Sort stage for a grid column, or the fallback when the key is unknown. `_id` keeps paging stable. */
export const buildGridSort = (sortKey: unknown, sortDir: unknown, fields: GridFieldMap, fallback: Record<string, 1 | -1>): Record<string, 1 | -1> => {
    if (typeof sortKey !== 'string' || !Object.prototype.hasOwnProperty.call(fields, sortKey)) return { ...fallback, _id: -1 };
    return { [fields[sortKey].path]: sortDir === 'desc' ? -1 : 1, _id: -1 };
};

/** One filter checked against a plain row, with the same rules as `conditionFor`. Undefined = filter is skipped. */
const rowPasses = (row: any, filter: GridFilter, field: GridField): boolean | undefined => {
    const raw = field.path.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), row);
    const type = field.type ?? 'text';
    const value = filter.value;
    const isEmpty = raw == null || raw === '';
    if (filter.op === 'empty') return isEmpty;

    if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(field.values, String(value))) return undefined;
        const hit = raw === field.values[String(value)];
        if (filter.op === 'is' || filter.op === 'eq') return hit;
        if (filter.op === 'isNot' || filter.op === 'neq') return !hit;
        return undefined;
    }
    if (type === 'id') {
        if (value == null || value === '') return undefined;
        const hit = String(raw ?? '') === String(value);
        if (filter.op === 'is' || filter.op === 'eq') return hit;
        if (filter.op === 'isNot' || filter.op === 'neq') return !hit;
        return undefined;
    }
    if (type === 'number') {
        const n = Number(value);
        if (value === '' || value == null || isNaN(n)) return undefined;
        const v = Number(raw);
        switch (filter.op) {
            case 'eq': return !isEmpty && v === n;
            case 'neq': return isEmpty || v !== n;
            case 'gt': return !isEmpty && v > n;
            case 'lt': return !isEmpty && v < n;
        }
        return undefined;
    }
    if (type === 'date') {
        const t = isEmpty ? NaN : new Date(raw).getTime();
        if (filter.op === 'between' && Array.isArray(value)) {
            const from = dayRange(value[0]);
            const to = dayRange(value[value.length - 1]);
            if (!from || !to) return undefined;
            return !isNaN(t) && t >= from.start.getTime() && t < to.end.getTime();
        }
        const range = dayRange(value);
        if (!range) return undefined;
        const inDay = !isNaN(t) && t >= range.start.getTime() && t < range.end.getTime();
        switch (filter.op) {
            case 'on': return inDay;
            case 'notOn': return !inDay;
            case 'before': return !isNaN(t) && t < range.start.getTime();
            case 'after': return !isNaN(t) && t >= range.end.getTime();
        }
        return undefined;
    }
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return undefined;
    const s = String(raw ?? '').toLowerCase();
    switch (filter.op) {
        case 'contains': return s.includes(text);
        case 'notContains': return !s.includes(text);
        case 'is': return s === text;
        case 'isNot': return s !== text;
        case 'before': return s < text;
        case 'after': return s > text;
    }
    return undefined;
};

/** In-memory twin of `buildGridFilterMatch`, for lists built in code rather than in a Mongo query. */
export const buildGridFilterPredicate = (filters: unknown, fields: GridFieldMap): ((row: any) => boolean) | null => {
    if (!Array.isArray(filters)) return null;
    const groups: { filter: GridFilter; field: GridField }[][] = [];
    (filters as GridFilter[]).forEach((filter) => {
        const field = filter && Object.prototype.hasOwnProperty.call(fields, filter.key) ? fields[filter.key] : undefined;
        if (!field) return;
        if (filter.or && groups.length) groups[groups.length - 1].push({ filter, field });
        else groups.push([{ filter, field }]);
    });
    if (!groups.length) return null;
    return (row: any) => groups.every((group) => {
        const results = group.map(({ filter, field }) => rowPasses(row, filter, field)).filter((r) => r !== undefined);
        return !results.length || results.some(Boolean);
    });
};
