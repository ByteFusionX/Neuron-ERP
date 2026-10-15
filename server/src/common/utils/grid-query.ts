/** Translates data-grid filter/sort state sent by the client into Mongo `$match` / `$sort` stages. */

export type GridFieldType = 'text' | 'number' | 'date';

export interface GridField {
    path: string;
    type?: GridFieldType;
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

    if (type === 'number') {
        const n = Number(value);
        if (value === '' || value == null || isNaN(n)) return null;
        if (filter.op === 'eq') return { [path]: n };
        if (filter.op === 'gt') return { [path]: { $gt: n } };
        if (filter.op === 'lt') return { [path]: { $lt: n } };
        return null;
    }

    if (type === 'date') {
        const range = dayRange(value);
        if (!range) return null;
        if (filter.op === 'on') return { [path]: { $gte: range.start, $lt: range.end } };
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
