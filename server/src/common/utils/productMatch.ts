import { Types } from "mongoose";
import Product, { PRODUCT_ALIAS_TYPES } from "../../models/products.model";

/** `AB-123`, `ab 123` and `AB123` all become `AB123`. */
export const normalizePartNo = (value: unknown): string =>
    String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const brandKeyOf = (value: unknown): string =>
    String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Fields derived from partNo / brand; spread into every create and update. */
export const derivedKeys = (partNo?: string, brand?: string) => ({
    partNoNormalized: normalizePartNo(partNo),
    brandKey: brandKeyOf(brand),
});

export interface CleanAlias {
    value: string;
    valueNormalized: string;
    type: string;
    supplierId?: string;
    customerId?: string;
    note?: string;
}

/** Trims, drops blanks and repeats within the list. Returns an error message when an alias is unusable. */
export const cleanAliases = (raw: unknown): { aliases: CleanAlias[]; error?: string } => {
    if (raw === undefined || raw === null) return { aliases: [] };
    if (!Array.isArray(raw)) return { aliases: [], error: 'Aliases must be a list' };
    if (raw.length > 50) return { aliases: [], error: 'A product can have at most 50 aliases' };

    const seen = new Set<string>();
    const aliases: CleanAlias[] = [];
    for (const a of raw) {
        const value = String(a?.value ?? '').trim();
        if (!value) continue;
        const valueNormalized = normalizePartNo(value);
        if (!valueNormalized) return { aliases: [], error: `Alias "${value}" needs letters or numbers` };
        const type = (PRODUCT_ALIAS_TYPES as readonly string[]).includes(a?.type) ? a.type : 'Superseded';
        const key = `${valueNormalized}|${type}|${a?.supplierId ?? ''}|${a?.customerId ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        aliases.push({
            value,
            valueNormalized,
            type,
            supplierId: a?.supplierId && Types.ObjectId.isValid(a.supplierId) ? a.supplierId : undefined,
            customerId: a?.customerId && Types.ObjectId.isValid(a.customerId) ? a.customerId : undefined,
            note: typeof a?.note === 'string' && a.note.trim() ? a.note.trim() : undefined,
        });
    }
    return { aliases };
};

export interface DuplicateMatch {
    _id: string;
    itemCode: string;
    partNo: string;
    brand: string;
    productDescription?: string;
    approvalStatus?: string;
    /** `block` stops the save; `warn` is shown to the user but allowed. */
    level: 'block' | 'warn';
    reason: string;
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LIVE = { isDeleted: { $ne: true } };

/**
 * Looks for products that already cover this part number.
 * - Same brand + same normalised part number, or the part number is another product's alias: block.
 * - Same normalised part number under another brand: warn.
 * - An alias being added that is another product's part number (same brand) or alias: block.
 */
export const findDuplicates = async (input: {
    partNo?: string;
    brand?: string;
    aliases?: CleanAlias[];
    excludeId?: string;
}): Promise<DuplicateMatch[]> => {
    const matches = new Map<string, DuplicateMatch>();
    const exclude = input.excludeId && Types.ObjectId.isValid(input.excludeId) ? { _id: { $ne: new Types.ObjectId(input.excludeId) } } : {};
    const select = 'itemCode partNo brand productDescription approvalStatus';
    const add = (p: any, level: 'block' | 'warn', reason: string) => {
        const id = String(p._id);
        const prev = matches.get(id);
        if (prev && (prev.level === 'block' || level === 'warn')) return;
        matches.set(id, {
            _id: id, itemCode: p.itemCode, partNo: p.partNo, brand: p.brand,
            productDescription: p.productDescription, approvalStatus: p.approvalStatus, level, reason,
        });
    };

    const norm = normalizePartNo(input.partNo);
    const brandKey = brandKeyOf(input.brand);

    if (norm) {
        // Exact match only (ignoring case and outer spaces); AB-123 is not treated as AB123.
        const exact = new RegExp(`^\\s*${escapeRegex(String(input.partNo).trim())}\\s*$`, 'i');
        const sameNumber: any[] = await Product.find({
            ...LIVE, ...exclude,
            $or: [{ partNo: exact }, { 'aliases.value': exact }],
        }).select(`${select} brandKey aliases`).lean();
        for (const p of sameNumber) {
            const sameBrand = (p.brandKey ?? brandKeyOf(p.brand)) === brandKey;
            const viaAlias = !exact.test(String(p.partNo ?? ''));
            if (viaAlias) add(p, 'block', `This number is already an alias of ${p.itemCode}`);
            else if (sameBrand) add(p, 'block', `Same brand and part number as ${p.itemCode}`);
            else add(p, 'warn', `Same part number under another brand (${p.brand}): ${p.itemCode}`);
        }
    }

    for (const alias of input.aliases ?? []) {
        const aliasExact = new RegExp(`^\\s*${escapeRegex(alias.value.trim())}\\s*$`, 'i');
        const clash: any[] = await Product.find({
            ...LIVE, ...exclude,
            $or: [
                { partNo: aliasExact, brandKey },
                { aliases: { $elemMatch: { value: aliasExact, type: alias.type, ...(alias.supplierId ? { supplierId: alias.supplierId } : {}), ...(alias.customerId ? { customerId: alias.customerId } : {}) } } },
            ],
        }).select(select).lean();
        for (const p of clash) add(p, 'block', `Alias "${alias.value}" already belongs to ${p.itemCode}`);
    }

    return [...matches.values()];
};
