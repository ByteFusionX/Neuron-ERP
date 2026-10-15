import Customer from "../../models/customer.model";
import Supplier from "../../models/supplier.model";
import { escapeRegex } from "./util";

/** Legal-form words: "ABC Trading LLC" and "A.B.C. Trading L.L.C." are the same company. */
const LEGAL_WORDS = new Set([
    'llc', 'ltd', 'limited', 'wll', 'co', 'company', 'corp', 'corporation', 'inc', 'incorporated', 'fze', 'fzco', 'fzc',
    'est', 'establishment', 'pvt', 'private', 'plc', 'sa', 'gmbh', 'bv', 'ag', 'spc', 'qsc', 'qpsc', 'the', 'and',
]);
/** Words so common that two companies differing only by them are probably related, not identical. */
const GENERIC_WORDS = new Set([
    'trading', 'general', 'services', 'service', 'group', 'international', 'intl', 'contracting', 'contractors',
    'enterprises', 'enterprise', 'holding', 'holdings', 'industries', 'industrial', 'solutions', 'technologies', 'technology',
]);

const words = (name: unknown): string[] => {
    // "L.L.C." and "W.L.L." collapse into one token before the remaining punctuation is dropped.
    let text = String(name ?? '').toLowerCase().replace(/&/g, ' and ');
    text = text.replace(/\b([a-z])\.(?=[a-z]\b)/g, '$1').replace(/\./g, '');
    return text.replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim().split(' ').filter(Boolean);
};

/** Name with punctuation and legal-form words removed: the "same company" key. */
export const nameKeyOf = (name: unknown): string => words(name).filter((w) => !LEGAL_WORDS.has(w)).join(' ');
/** `nameKeyOf` without the generic words too: the "may be related" key. */
export const nameCoreOf = (name: unknown): string => words(name).filter((w) => !LEGAL_WORDS.has(w) && !GENERIC_WORDS.has(w)).join(' ');
export const emailKeyOf = (v: unknown): string => String(v ?? '').trim().toLowerCase();
export const phoneKeyOf = (v: unknown): string => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
export const trnKeyOf = (v: unknown): string => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
export const ibanKeyOf = (v: unknown): string => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export type PartyField = 'name' | 'trn' | 'email' | 'phone' | 'iban';

export interface PartyMatch {
    _id: string;
    name: string;
    code?: string;
    level: 'block' | 'warn';
    field: PartyField;
    reason: string;
}

const FIELD_LABEL: Record<PartyField, string> = { name: 'company name', trn: 'TRN', email: 'email address', phone: 'phone number', iban: 'IBAN' };

/** Keeps one entry per record: a block on any field wins over warnings on others. */
const collect = (out: Map<string, PartyMatch>, doc: any, code: string | undefined, level: 'block' | 'warn', field: PartyField, kind: string) => {
    const id = String(doc._id);
    const prior = out.get(id);
    if (prior && (prior.level === 'block' || level === 'warn')) return;
    const name = doc.companyName ?? doc.supplierName;
    const lead = level === 'block' ? `A ${kind} with the same ${FIELD_LABEL[field]} already exists` : `A ${kind} with a similar ${FIELD_LABEL[field]} exists`;
    out.set(id, { _id: id, name, code, level, field, reason: `${lead}: ${name}${code ? ` (${code})` : ''}` });
};

const byLevel = (a: PartyMatch, b: PartyMatch) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1);

export interface CustomerProbe { companyName?: string; email?: string; phone?: unknown; trn?: string; excludeId?: string }

/**
 * Customers that look like the one being entered. Same name or TRN → block; email or phone → warn (a
 * switchboard number or info@ address can be shared); a name that matches only once generic words are
 * dropped → warn.
 */
export const findCustomerDuplicates = async (p: CustomerProbe): Promise<PartyMatch[]> => {
    const name = String(p.companyName ?? '').trim();
    const key = nameKeyOf(name), core = nameCoreOf(name);
    const email = emailKeyOf(p.email), phone = phoneKeyOf(p.phone), trn = trnKeyOf(p.trn);
    const or: any[] = [];
    if (name) or.push({ companyName: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (key) or.push({ nameKey: key });
    if (core) or.push({ nameCore: core });
    if (trn) or.push({ normalizedTrn: trn });
    if (email) or.push({ normalizedEmail: email });
    if (phone) or.push({ normalizedPhone: phone });
    if (!or.length) return [];

    const filter: any = { isDeleted: { $ne: true }, $or: or };
    if (p.excludeId) filter._id = { $ne: p.excludeId };
    const docs: any[] = await Customer.find(filter)
        .select('companyName clientRef nameKey nameCore normalizedTrn normalizedEmail normalizedPhone').limit(20).lean();

    const out = new Map<string, PartyMatch>();
    for (const d of docs) {
        const exact = name && String(d.companyName ?? '').trim().toLowerCase() === name.toLowerCase();
        if (exact || (key && d.nameKey === key)) collect(out, d, d.clientRef, 'block', 'name', 'customer');
        if (trn && d.normalizedTrn === trn) collect(out, d, d.clientRef, 'block', 'trn', 'customer');
        if (core && d.nameCore === core) collect(out, d, d.clientRef, 'warn', 'name', 'customer');
        if (email && d.normalizedEmail === email) collect(out, d, d.clientRef, 'warn', 'email', 'customer');
        if (phone && d.normalizedPhone === phone) collect(out, d, d.clientRef, 'warn', 'phone', 'customer');
    }
    return [...out.values()].sort(byLevel);
};

export interface SupplierProbe { supplierName?: string; emails?: unknown[]; phones?: unknown[]; ibans?: unknown[]; excludeId?: string }

const uniqueKeys = (values: unknown[] | undefined, keyOf: (v: unknown) => string) =>
    [...new Set((values ?? []).map(keyOf).filter(Boolean))];

/**
 * Suppliers that look like the one being entered. Same name or IBAN → block; near-name, or an email or phone
 * (company or any contact) found on another supplier → warn. A company and its own contact may share an email or phone.
 */
export const findSupplierDuplicates = async (p: SupplierProbe): Promise<PartyMatch[]> => {
    const name = String(p.supplierName ?? '').trim();
    const key = nameKeyOf(name), core = nameCoreOf(name);
    const emails = uniqueKeys(p.emails, emailKeyOf), phones = uniqueKeys(p.phones, phoneKeyOf), ibans = uniqueKeys(p.ibans, ibanKeyOf);
    const or: any[] = [];
    if (name) or.push({ supplierName: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (key) or.push({ nameKey: key });
    if (core) or.push({ nameCore: core });
    // `ibanKey` is the single-account key older records carry until they are re-saved.
    if (ibans.length) or.push({ ibanKeys: { $in: ibans } }, { ibanKey: { $in: ibans } });
    // `emailKey`/`phoneKey` are the single-contact keys older records carry until they are re-saved.
    if (emails.length) or.push({ emailKeys: { $in: emails } }, { emailKey: { $in: emails } });
    if (phones.length) or.push({ phoneKeys: { $in: phones } }, { phoneKey: { $in: phones } });
    if (!or.length) return [];

    const filter: any = { isDeleted: { $ne: true }, $or: or };
    if (p.excludeId) filter._id = { $ne: p.excludeId };
    const docs: any[] = await Supplier.find(filter)
        .select('supplierName supplierId nameKey nameCore ibanKey ibanKeys emailKey phoneKey emailKeys phoneKeys').limit(20).lean();

    const out = new Map<string, PartyMatch>();
    for (const d of docs) {
        const exact = name && String(d.supplierName ?? '').trim().toLowerCase() === name.toLowerCase();
        if (exact || (key && d.nameKey === key)) collect(out, d, d.supplierId, 'block', 'name', 'supplier');
        const theirIbans: string[] = [...(d.ibanKeys ?? []), d.ibanKey].filter(Boolean);
        if (ibans.some((i) => theirIbans.includes(i))) collect(out, d, d.supplierId, 'block', 'iban', 'supplier');
        if (core && d.nameCore === core) collect(out, d, d.supplierId, 'warn', 'name', 'supplier');
        const theirEmails: string[] = [...(d.emailKeys ?? []), d.emailKey].filter(Boolean);
        const theirPhones: string[] = [...(d.phoneKeys ?? []), d.phoneKey].filter(Boolean);
        if (emails.some((e) => theirEmails.includes(e))) collect(out, d, d.supplierId, 'warn', 'email', 'supplier');
        if (phones.some((ph) => theirPhones.includes(ph))) collect(out, d, d.supplierId, 'warn', 'phone', 'supplier');
    }
    return [...out.values()].sort(byLevel);
};

/** Keys stored on a supplier so later checks can match on them. Spread into every create and update. */
export const supplierKeys = (s: { supplierName?: string; companyEmail?: string; companyPhone?: string; contacts?: any[]; bankAccounts?: any[] }) => ({
    nameKey: nameKeyOf(s.supplierName),
    nameCore: nameCoreOf(s.supplierName),
    emailKeys: uniqueKeys([s.companyEmail, ...(s.contacts ?? []).map((c) => c?.email)], emailKeyOf),
    phoneKeys: uniqueKeys([s.companyPhone, ...(s.contacts ?? []).map((c) => c?.phoneNumber)], phoneKeyOf),
    ibanKeys: uniqueKeys((s.bankAccounts ?? []).map((b) => b?.iban), ibanKeyOf),
});

/** Every email and phone a supplier is reachable on: the company's own plus each salesperson's. */
export const supplierContactPoints = (s: { companyEmail?: string; companyPhone?: string; contacts?: any[] }) => ({
    emails: [s.companyEmail, ...(s.contacts ?? []).map((c) => c?.email)],
    phones: [s.companyPhone, ...(s.contacts ?? []).map((c) => c?.phoneNumber)],
});

export const customerNameKeys = (companyName?: string) => ({ nameKey: nameKeyOf(companyName), nameCore: nameCoreOf(companyName) });

/** Groups of live records sharing a stored key, for the duplicates report. Records without the key are skipped. */
export const duplicateGroups = async (model: any, field: string, fields: string[]) => {
    const project = Object.fromEntries(fields.map((f) => [f, `$${f}`]));
    const groups: any[] = await model.aggregate([
        { $match: { isDeleted: { $ne: true }, [field]: { $type: 'string', $ne: '' } } },
        { $group: { _id: `$${field}`, count: { $sum: 1 }, records: { $push: project } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 200 },
    ]);
    return groups.map((g) => ({ key: g._id, count: g.count, records: g.records }));
};
