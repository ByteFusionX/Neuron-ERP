import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Quotation, { quoteStatus } from "../models/quotation.model";
import Enquiry from "../models/enquiry.model";
import Rfq, { RfqType, RfqSupplierStatus } from "../models/rfq.model";
import Employee from "../models/employee.model";
import Customer from "../models/customer.model";
import { getUSDRated } from "../common/utils/util";

/**
 * Sales dashboard: one call returns everything the page shows, already scoped to the viewer.
 * All money is in QAR; the client converts to USD with the rate it is sent.
 */

const DAY = 86_400_000;
const OPEN_ENQUIRY = ['new', 'in progress', 'New', 'In Review', 'Work In Progress'];
const OPEN_PRESALE = ['assigned', 'in review', 'in revision', 'returned'];
const SENT = [quoteStatus.QuoteSubmitted, quoteStatus.UnderNegotiation, quoteStatus.UnderReview, quoteStatus.Won, quoteStatus.Lost, quoteStatus.Expired] as string[];
const AWAITING_CUSTOMER = [quoteStatus.QuoteSubmitted, quoteStatus.UnderNegotiation, quoteStatus.UnderReview] as string[];
const CLOSED = [quoteStatus.Won, quoteStatus.Lost, quoteStatus.Expired] as string[];

type Scope = 'all' | Types.ObjectId[];

const idStr = (v: any) => (v ? String(v._id ?? v) : '');
const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY;
const inRange = (d: Date | null | undefined, from: Date, to: Date) => !!d && d >= from && d <= to;
const round = (n: number, p = 0) => { const f = 10 ** p; return Math.round(n * f) / f; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Everyone below `rootId` in the reporting tree, at any depth. */
const reportsOf = async (rootId: Types.ObjectId): Promise<Types.ObjectId[]> => {
    const all = await Employee.find({ isDeleted: { $ne: true } }, '_id reportingTo').lean();
    const children = new Map<string, Types.ObjectId[]>();
    for (const e of all) {
        const boss = idStr(e.reportingTo);
        if (!boss) continue;
        if (!children.has(boss)) children.set(boss, []);
        children.get(boss)!.push(e._id as Types.ObjectId);
    }
    const out: Types.ObjectId[] = [];
    const seen = new Set<string>([String(rootId)]);
    const queue = [String(rootId)];
    while (queue.length) {
        for (const c of children.get(queue.shift()!) ?? []) {
            if (seen.has(String(c))) continue;
            seen.add(String(c));
            out.push(c);
            queue.push(String(c));
        }
    }
    return out;
};

/** Widest of the role's and the person's own grant for a module's viewReport. */
const reportAccess = (employee: any, module: string): string => {
    const rank = ['none', 'created', 'reported', 'createdAndReported'];
    const values = [employee.category?.privileges?.[module]?.viewReport];
    const expires = employee.extraPrivilegesExpiresAt;
    if (!expires || new Date(expires).getTime() > Date.now()) values.push(employee.extraPrivileges?.[module]?.viewReport);
    const set = values.filter(Boolean) as string[];
    if (!set.length) return 'none';
    if (set.some((v) => !rank.includes(v))) return 'all';
    return set.sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0];
};

const scopeFor = async (employee: any, module: string, reports: () => Promise<Types.ObjectId[]>): Promise<Scope> => {
    const role = employee.category?.role;
    if (role === 'superAdmin' || role === 'admin') return 'all';
    const access = reportAccess(employee, module);
    switch (access) {
        case 'none': return [];
        case 'created': return [employee._id];
        case 'reported': return await reports();
        case 'createdAndReported': return [employee._id, ...(await reports())];
        default: return 'all';
    }
};

const scopeLabel = (scope: Scope, selfId: string) => {
    if (scope === 'all') return 'Whole sales team';
    if (!scope.length) return 'No access';
    if (scope.length === 1 && String(scope[0]) === selfId) return 'Only you';
    return scope.some((id) => String(id) === selfId) ? 'You and your team' : 'Your team';
};

/**
 * Money on a quote in QAR, over the counted lines: list price (gross), the customer discount,
 * what the customer pays (value) and what it costs us (cost). Lines are grouped by item name for margin by product.
 */
const quoteMoney = (quote: any, usdToQar: number) => {
    const fx = String(quote.currency).toUpperCase() === 'USD' ? usdToQar : 1;
    let gross = 0;
    let discount = 0;
    let cost = 0;
    const lines: { name: string; sell: number; cost: number }[] = [];
    for (const option of quote.optionalItems ?? []) {
        discount += Number(option?.totalDiscount) || 0;
        for (const item of option?.items ?? []) {
            if (item?.isOptional && !item?.includeInTotal) continue;
            let sell = 0; let buy = 0;
            for (const d of item?.itemDetails ?? []) {
                const qty = Number(d?.quantity) || 0;
                sell += (Number(d?.unitSellingPrice) || 0) * qty;
                buy += (Number(d?.unitCost) || 0) * qty;
            }
            gross += sell; cost += buy;
            lines.push({ name: String(item?.itemName ?? '').trim() || 'Unnamed item', sell: sell * fx, cost: buy * fx });
        }
    }
    discount = Math.min(discount, gross);
    return { gross: gross * fx, discount: discount * fx, value: (gross - discount) * fx, cost: cost * fx, lines };
};

/** Below this margin a won or sent quote is flagged. */
const LOW_MARGIN_PCT = 10;
const marginPct = (value: number, cost: number) => (value > 0 ? round(((value - cost) / value) * 100, 1) : null);

const lastStatusAt = (quote: any, status: string): Date | null => {
    const hit = [...(quote.editHistory ?? [])].reverse().find((h: any) => h.toStatus === status);
    return hit?.editedAt ? new Date(hit.editedAt) : null;
};

const wonAt = (q: any): Date | null =>
    lastStatusAt(q, quoteStatus.Won)
    ?? (q.customerDecision?.decision === 'accepted' && q.customerDecision.decidedAt ? new Date(q.customerDecision.decidedAt) : null)
    ?? (q.customerAcceptance?.acceptedAt ? new Date(q.customerAcceptance.acceptedAt) : null)
    ?? (q.date ? new Date(q.date) : null);

const lostAt = (q: any): Date | null =>
    (q.lostAt ? new Date(q.lostAt) : null) ?? lastStatusAt(q, quoteStatus.Lost) ?? (q.date ? new Date(q.date) : null);

const sentAt = (q: any): Date | null => {
    const first = (q.sendHistory ?? []).map((s: any) => s.sentAt).filter(Boolean).sort()[0];
    if (first) return new Date(first);
    const submitted = (q.editHistory ?? []).find((h: any) => h.toStatus === quoteStatus.QuoteSubmitted || h.action === 'QuoteSent');
    if (submitted?.editedAt) return new Date(submitted.editedAt);
    return SENT.includes(q.status) || q.currentSentRevision != null ? (q.date ? new Date(q.date) : null) : null;
};

const parseDay = (raw: any, endOfDay: boolean): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) d.setHours(23, 59, 59, 999); else d.setHours(0, 0, 0, 0);
    return d;
};

const validId = (v: any) => (typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);

export const getSalesDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = (req as any).employee;
        if (!employee) return res.status(401).json({ message: "Unauthorized" });
        const selfId = String(employee._id);
        const now = new Date();

        // Period: defaults to this month so far. The previous period is the same length right before it.
        const to = parseDay(req.body?.to, true) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const from = parseDay(req.body?.from, false) ?? new Date(to.getFullYear(), to.getMonth(), 1);
        if (from > to) return res.status(400).json({ message: "Start date must be before end date" });
        const span = to.getTime() - from.getTime();
        // Default comparison is the same length right before; the client may ask for a like-for-like window
        // (e.g. 1–12 Sep against 1–12 Oct) as long as it ends before this period starts.
        const askedFrom = parseDay(req.body?.compareFrom, false);
        const askedTo = parseDay(req.body?.compareTo, true);
        const useAsked = !!askedFrom && !!askedTo && askedFrom <= askedTo && askedTo < from;
        const prevTo = useAsked ? askedTo! : new Date(from.getTime() - 1);
        const prevFrom = useAsked ? askedFrom! : new Date(prevTo.getTime() - span);

        let reportsCache: Types.ObjectId[] | null = null;
        const reports = async () => (reportsCache ??= await reportsOf(employee._id));
        const quoteScope = await scopeFor(employee, 'quotation', reports);
        const enquiryScope = await scopeFor(employee, 'enquiry', reports);

        const personFilter = validId(req.body?.salesPerson);
        const customerFilter = validId(req.body?.customer);
        const departmentFilter = validId(req.body?.department);

        const ownerMatch = (field: string, scope: Scope) => {
            if (personFilter) {
                if (scope !== 'all' && !scope.some((id) => String(id) === String(personFilter))) return { [field]: { $in: [] } };
                return { [field]: personFilter };
            }
            return scope === 'all' ? {} : { [field]: { $in: scope } };
        };
        const extra = (deptField: string) => ({
            ...(customerFilter ? { client: customerFilter } : {}),
            ...(departmentFilter ? { [deptField]: departmentFilter } : {}),
        });

        const trendStart = new Date(to.getFullYear(), to.getMonth() - 11, 1);
        const earliest = new Date(Math.min(trendStart.getTime(), prevFrom.getTime()));

        const usdToQar = Number(await getUSDRated()) || 3.64;

        const [quotes, enquiries] = await Promise.all([
            Quotation.find({
                isDeleted: { $ne: true },
                status: { $ne: quoteStatus.Draft },
                ...ownerMatch('createdBy', quoteScope),
                ...extra('department'),
            })
                .select('quoteId subject client date status currency optionalItems sendHistory currentSentRevision approval followUp.nextFollowUpDate validityDate closingDate customerDecision customerAcceptance lostReason lostAt editHistory.toStatus editHistory.editedAt editHistory.action dealData.dealId dealData.status dealData.savedDate enqId createdBy department')
                .lean(),
            Enquiry.find({
                isDeleted: { $ne: true },
                ...ownerMatch('salesPerson', enquiryScope),
                ...extra('department'),
                $or: [
                    { date: { $gte: earliest } },
                    { status: { $in: OPEN_ENQUIRY } },
                    { 'preSale.status': { $in: OPEN_PRESALE } },
                ],
            })
                .select('enquiryId title client salesPerson date createdDate status source enquiryCategory lastFollowUpDate lostReason preSale.presalePerson preSale.status preSale.createdDate')
                .lean(),
        ]);

        // Names for people and customers referenced anywhere on the page.
        const personIds = new Set<string>();
        const customerIds = new Set<string>();
        quotes.forEach((q: any) => { personIds.add(idStr(q.createdBy)); customerIds.add(idStr(q.client)); });
        enquiries.forEach((e: any) => { personIds.add(idStr(e.salesPerson)); customerIds.add(idStr(e.client)); });
        const scopePeople = quoteScope === 'all'
            ? await Employee.find({ isDeleted: { $ne: true }, _id: { $in: [...personIds].filter(Boolean) } }, 'firstName lastName').lean()
            : await Employee.find({ _id: { $in: quoteScope } }, 'firstName lastName').lean();
        const extraPeople = await Employee.find({ _id: { $in: [...personIds].filter((id) => id && !scopePeople.some((p: any) => String(p._id) === id)) } }, 'firstName lastName').lean();
        const names = new Map<string, string>();
        [...scopePeople, ...extraPeople].forEach((p: any) => names.set(String(p._id), `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Unknown'));
        const customers = await Customer.find({ _id: { $in: [...customerIds].filter(Boolean) } }, 'companyName').lean();
        const customerName = new Map<string, string>(customers.map((c: any) => [String(c._id), c.companyName || 'Unknown']));
        const personName = (id: any) => names.get(idStr(id)) ?? 'Unassigned';
        const clientName = (id: any) => customerName.get(idStr(id)) ?? '—';

        // Pre-compute the facts each quote needs once.
        const enquiryDate = new Map<string, Date>();
        enquiries.forEach((e: any) => enquiryDate.set(String(e._id), new Date(e.date ?? e.createdDate)));
        const missingEnq = [...new Set(quotes.map((q: any) => idStr(q.enqId)).filter((id) => id && !enquiryDate.has(id)))];
        if (missingEnq.length) {
            (await Enquiry.find({ _id: { $in: missingEnq } }, 'date createdDate').lean())
                .forEach((e: any) => enquiryDate.set(String(e._id), new Date(e.date ?? e.createdDate)));
        }

        const Q = quotes.map((q: any) => {
            const sent = sentAt(q);
            const enqDate = enquiryDate.get(idStr(q.enqId));
            const money = quoteMoney(q, usdToQar);
            return {
                raw: q,
                id: String(q._id),
                ref: q.quoteId,
                subject: q.subject ?? '',
                owner: idStr(q.createdBy),
                client: idStr(q.client),
                enq: idStr(q.enqId),
                created: q.date ? new Date(q.date) : null,
                status: q.status as string,
                value: money.value,
                gross: money.gross,
                discount: money.discount,
                cost: money.cost,
                lines: money.lines,
                sent,
                won: q.status === quoteStatus.Won ? wonAt(q) : null,
                lost: q.status === quoteStatus.Lost ? lostAt(q) : null,
                turnaround: sent && enqDate && sent >= enqDate ? days(enqDate, sent) : null,
            };
        });
        const E = enquiries.map((e: any) => ({
            raw: e,
            id: String(e._id),
            ref: e.enquiryId as string,
            owner: idStr(e.salesPerson),
            client: idStr(e.client),
            created: new Date(e.date ?? e.createdDate),
        }));

        // ---- KPIs ------------------------------------------------------------------------------
        const periodKpis = (f: Date, t: Date) => {
            const enq = E.filter((e) => inRange(e.created, f, t)).length;
            const created = Q.filter((q) => inRange(q.created, f, t));
            const sentQ = Q.filter((q) => inRange(q.sent, f, t));
            const won = Q.filter((q) => inRange(q.won, f, t));
            const lost = Q.filter((q) => inRange(q.lost, f, t));
            const wonValue = won.reduce((s, q) => s + q.value, 0);
            const decided = won.length + lost.length;
            return {
                enquiries: enq,
                quotesCreated: created.length,
                quotesCreatedValue: created.reduce((s, q) => s + q.value, 0),
                quotesSent: sentQ.length,
                quotesSentValue: sentQ.reduce((s, q) => s + q.value, 0),
                won: won.length,
                wonValue,
                lost: lost.length,
                lostValue: lost.reduce((s, q) => s + q.value, 0),
                winRate: decided ? round((won.length / decided) * 100, 1) : null,
                avgDeal: won.length ? wonValue / won.length : null,
                turnaround: avg(sentQ.map((q) => q.turnaround).filter((x): x is number => x != null)),
            };
        };
        const current = periodKpis(from, to);
        const previous = periodKpis(prevFrom, prevTo);
        const open = Q.filter((q) => AWAITING_CUSTOMER.includes(q.status));
        const pipeline = { count: open.length, value: open.reduce((s, q) => s + q.value, 0) };

        // ---- Funnel: enquiries created in the period and how far each got --------------------
        const cohort = E.filter((e) => inRange(e.created, from, to));
        const quotesByEnq = new Map<string, typeof Q>();
        Q.forEach((q) => { if (q.enq) { if (!quotesByEnq.has(q.enq)) quotesByEnq.set(q.enq, []); quotesByEnq.get(q.enq)!.push(q); } });
        const reached = (test: (e: typeof E[number], qs: typeof Q) => boolean) => {
            let count = 0; let value = 0;
            cohort.forEach((e) => {
                const qs = quotesByEnq.get(e.id) ?? [];
                if (test(e, qs)) { count++; value += qs.length ? Math.max(...qs.map((q) => q.value)) : 0; }
            });
            return { count, value };
        };
        const funnel = [
            { key: 'enquiries', label: 'Enquiries', ...reached(() => true) },
            { key: 'presale', label: 'Presale / RFQ', ...reached((e, qs) => !!e.raw.preSale?.presalePerson || qs.length > 0) },
            { key: 'quoted', label: 'Quoted', ...reached((_e, qs) => qs.length > 0) },
            { key: 'sent', label: 'Sent to customer', ...reached((_e, qs) => qs.some((q) => !!q.sent)) },
            { key: 'won', label: 'Won', ...reached((_e, qs) => qs.some((q) => q.status === quoteStatus.Won)) },
            { key: 'deal', label: 'Deal sheet', ...reached((_e, qs) => qs.some((q) => !!q.raw.dealData?.dealId && q.raw.dealData.status !== 'rejected')) },
        ];

        // ---- Needs attention (a live snapshot, not limited by the period) ---------------------
        const item = (q: typeof Q[number], date: Date | null, note?: string) => ({
            id: q.id, ref: q.ref, title: q.subject, customer: clientName(q.client), owner: personName(q.owner), date, value: q.value, note: note ?? '',
            link: ['/quotations/view', q.id],
        });
        const enqItem = (e: typeof E[number], date: Date | null, note?: string) => ({
            id: e.id, ref: e.ref, title: String(e.raw.title ?? ''), customer: clientName(e.client), owner: personName(e.owner), date, value: null, note: note ?? '',
            link: ['/enquiry'], query: { search: e.ref },
        });
        const take = <T>(rows: T[], by: (r: T) => number) => rows.sort((a, b) => by(a) - by(b));

        const quotedEnq = new Set(Q.map((q) => q.enq).filter(Boolean));
        const staleEnq = take(E.filter((e) => OPEN_ENQUIRY.includes(e.raw.status) && !quotedEnq.has(e.id) && !OPEN_PRESALE.includes(e.raw.preSale?.status)
            && days(new Date(e.raw.lastFollowUpDate ?? e.created), now) >= 7), (e) => +new Date(e.raw.lastFollowUpDate ?? e.created));
        const presaleWait = take(E.filter((e) => OPEN_PRESALE.includes(e.raw.preSale?.status) && e.raw.preSale?.createdDate && days(new Date(e.raw.preSale.createdDate), now) >= 5),
            (e) => +new Date(e.raw.preSale.createdDate));

        const enqIdsInScope = E.map((e) => e.raw._id);
        const rfqs = enqIdsInScope.length ? await Rfq.find({
            rfqType: RfqType.Sales,
            isDeleted: { $ne: true },
            enquiryId: { $in: enqIdsInScope },
            status: { $nin: ['Closed', 'Cancelled', 'Awarded'] },
            suppliers: { $elemMatch: { status: RfqSupplierStatus.Sent, sentAt: { $lte: new Date(now.getTime() - 3 * DAY) } } },
        }, 'rfqNo enquiryId suppliers.status suppliers.sentAt suppliers.supplierName').lean() : [];
        const enqById = new Map(E.map((e) => [e.id, e]));
        const rfqWaiting = rfqs.map((r: any) => {
            const pending = (r.suppliers ?? []).filter((s: any) => s.status === RfqSupplierStatus.Sent && s.sentAt);
            const oldest = pending.map((s: any) => new Date(s.sentAt)).sort((a: Date, b: Date) => +a - +b)[0] ?? null;
            const e = enqById.get(idStr(r.enquiryId));
            return {
                id: String(r._id), ref: r.rfqNo, title: e ? String(e.raw.title ?? '') : '', customer: e ? clientName(e.client) : '—', owner: e ? personName(e.owner) : '—',
                date: oldest, value: null, note: `${pending.length} supplier${pending.length === 1 ? '' : 's'} not replied`,
                link: ['/enquiry'], query: { search: e?.ref ?? r.rfqNo },
            };
        }).sort((a, b) => +(a.date ?? 0) - +(b.date ?? 0));

        const approvalWait = take(Q.filter((q) => q.raw.approval?.status === 'pending'), (q) => +new Date(q.raw.approval?.requestedAt ?? q.created ?? 0));
        const followUpDue = take(Q.filter((q) => AWAITING_CUSTOMER.includes(q.status) && q.raw.followUp?.nextFollowUpDate && new Date(q.raw.followUp.nextFollowUpDate) < now),
            (q) => +new Date(q.raw.followUp.nextFollowUpDate));
        const silent = take(Q.filter((q) => AWAITING_CUSTOMER.includes(q.status) && !q.raw.followUp?.nextFollowUpDate && q.sent && days(q.sent, now) >= 14), (q) => +q.sent!);
        const validity = (q: any) => q.validityDate ?? q.closingDate;
        const expiring = take(Q.filter((q) => !CLOSED.includes(q.status) && validity(q.raw) && new Date(validity(q.raw)) >= now && days(now, new Date(validity(q.raw))) <= 7),
            (q) => +new Date(validity(q.raw)));
        const wonNoDeal = take(Q.filter((q) => q.status === quoteStatus.Won && (!q.raw.dealData?.dealId || q.raw.dealData.status === 'rejected')), (q) => +(q.won ?? 0));
        const dealPending = take(Q.filter((q) => q.raw.dealData?.dealId && q.raw.dealData.status === 'pending'), (q) => +new Date(q.raw.dealData.savedDate ?? 0));

        const group = (key: string, label: string, hint: string, tone: 'red' | 'amber' | 'sky' | 'violet', icon: string, rows: any[], viewAll: { link: string[]; query?: any }) => ({
            key, label, hint, tone, icon, count: rows.length,
            value: rows.reduce((s, r) => s + (r.value ?? 0), 0),
            items: rows.slice(0, 6),
            viewAll,
        });
        const attention = [
            group('approval', 'Quotes waiting for approval', 'Blocked until a manager approves them', 'violet', 'heroShieldCheck',
                approvalWait.map((q) => item(q, q.raw.approval?.requestedAt ? new Date(q.raw.approval.requestedAt) : q.created, q.raw.approval?.breaches?.length ? `${q.raw.approval.breaches.length} rule breach${q.raw.approval.breaches.length === 1 ? '' : 'es'}` : '')),
                { link: ['/quotations'] }),
            group('followup', 'Follow-ups overdue', 'Sent quotes whose follow-up date has passed', 'red', 'heroBellAlert',
                followUpDue.map((q) => item(q, new Date(q.raw.followUp.nextFollowUpDate))), { link: ['/quotations'] }),
            group('silent', 'Sent with no follow-up planned', 'Sent 14+ days ago and nobody is chasing', 'amber', 'heroPaperAirplane',
                silent.map((q) => item(q, q.sent)), { link: ['/quotations'] }),
            group('expiring', 'Expiring in 7 days', 'Extend, revise or close before they lapse', 'amber', 'heroClock',
                expiring.map((q) => item(q, new Date(validity(q.raw)))), { link: ['/quotations'] }),
            group('wonNoDeal', 'Won without a deal sheet', 'Hand these over so the job can start', 'sky', 'heroDocumentPlus',
                wonNoDeal.map((q) => item(q, q.won)), { link: ['/quotations'] }),
            group('dealPending', 'Deal sheets waiting for approval', 'Approved deals become jobs', 'violet', 'heroClipboardDocumentCheck',
                dealPending.map((q) => ({ ...item(q, q.raw.dealData.savedDate ? new Date(q.raw.dealData.savedDate) : null, q.raw.dealData.dealId), link: ['/deal-sheet/view', q.id] })),
                { link: ['/deal-sheet/pendings'] }),
            group('rfq', 'Supplier RFQs with no reply', 'Sent 3+ days ago; quotes wait on these prices', 'amber', 'heroInboxArrowDown',
                rfqWaiting, { link: ['/enquiry'] }),
            group('presale', 'Estimations waiting in presale', 'With presale for 5+ days', 'sky', 'heroWrenchScrewdriver',
                presaleWait.map((e) => enqItem(e, new Date(e.raw.preSale.createdDate), e.raw.preSale?.presalePerson ? `Presale: ${personName(e.raw.preSale.presalePerson)}` : 'No presale person picked it up yet')),
                { link: ['/presales'] }),
            group('staleEnquiry', 'Enquiries going cold', 'Open, not quoted and untouched for 7+ days', 'red', 'heroExclamationTriangle',
                staleEnq.map((e) => enqItem(e, new Date(e.raw.lastFollowUpDate ?? e.created))), { link: ['/enquiry'] }),
        ];

        // ---- 12-month trend ending at the period end --------------------------------------
        const months: { label: string; start: Date; end: Date }[] = [];
        for (let i = 0; i < 12; i++) {
            const start = new Date(trendStart.getFullYear(), trendStart.getMonth() + i, 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
            months.push({ label: start.toLocaleString('en-US', { month: 'short', year: '2-digit' }), start, end });
        }
        const trend = {
            months: months.map((m) => m.label),
            enquiries: months.map((m) => E.filter((e) => inRange(e.created, m.start, m.end)).length),
            quoted: months.map((m) => round(Q.filter((q) => inRange(q.created, m.start, m.end)).reduce((s, q) => s + q.value, 0))),
            won: months.map((m) => round(Q.filter((q) => inRange(q.won, m.start, m.end)).reduce((s, q) => s + q.value, 0))),
            winRate: months.map((m) => {
                const w = Q.filter((q) => inRange(q.won, m.start, m.end)).length;
                const l = Q.filter((q) => inRange(q.lost, m.start, m.end)).length;
                return w + l ? round((w / (w + l)) * 100, 1) : null;
            }),
        };

        // ---- People ------------------------------------------------------------------------
        const people = new Map<string, any>();
        const person = (id: string) => {
            if (!people.has(id)) people.set(id, { id, name: personName(id), enquiries: 0, quotes: 0, quotesValue: 0, sent: 0, won: 0, wonValue: 0, lost: 0, pipeline: 0, pipelineCount: 0, tat: [] as number[], gross: 0, discount: 0, discounted: 0 });
            return people.get(id);
        };
        if (quoteScope !== 'all') quoteScope.forEach((id) => person(String(id)));
        E.filter((e) => inRange(e.created, from, to)).forEach((e) => person(e.owner).enquiries++);
        Q.forEach((q) => {
            const p = person(q.owner);
            if (inRange(q.created, from, to)) {
                p.quotes++; p.quotesValue += q.value;
                p.gross += q.gross; p.discount += q.discount;
                if (q.discount > 0) p.discounted++;
            }
            if (inRange(q.sent, from, to)) { p.sent++; if (q.turnaround != null) p.tat.push(q.turnaround); }
            if (inRange(q.won, from, to)) { p.won++; p.wonValue += q.value; }
            if (inRange(q.lost, from, to)) p.lost++;
            if (AWAITING_CUSTOMER.includes(q.status)) { p.pipeline += q.value; p.pipelineCount++; }
        });
        const peopleRows = [...people.values()]
            .filter((p) => p.id && (p.enquiries || p.quotes || p.won || p.lost || p.pipelineCount || quoteScope !== 'all'))
            .map(({ tat, gross, ...p }) => ({
                ...p,
                winRate: p.won + p.lost ? round((p.won / (p.won + p.lost)) * 100, 1) : null,
                turnaround: avg(tat),
                discountPct: gross > 0 ? round((p.discount / gross) * 100, 1) : null,
            }))
            .sort((a, b) => b.wonValue - a.wonValue || b.pipeline - a.pipeline);

        // ---- Customers ---------------------------------------------------------------------
        const byCustomer = new Map<string, any>();
        Q.forEach((q) => {
            if (!q.client) return;
            const touched = inRange(q.created, from, to) || inRange(q.won, from, to) || inRange(q.lost, from, to) || AWAITING_CUSTOMER.includes(q.status);
            if (!touched) return;
            if (!byCustomer.has(q.client)) byCustomer.set(q.client, { id: q.client, name: clientName(q.client), quotes: 0, quotesValue: 0, won: 0, wonValue: 0, lost: 0, pipeline: 0 });
            const c = byCustomer.get(q.client);
            if (inRange(q.created, from, to)) { c.quotes++; c.quotesValue += q.value; }
            if (inRange(q.won, from, to)) { c.won++; c.wonValue += q.value; }
            if (inRange(q.lost, from, to)) c.lost++;
            if (AWAITING_CUSTOMER.includes(q.status)) c.pipeline += q.value;
        });
        const allCustomers = [...byCustomer.values()]
            .sort((a, b) => b.wonValue - a.wonValue || b.pipeline - a.pipeline || b.quotesValue - a.quotesValue);
        const wonTotal = allCustomers.reduce((s, c) => s + c.wonValue, 0);
        const share = (v: number) => (wonTotal > 0 ? round((v / wonTotal) * 100, 1) : null);
        const customerRows = allCustomers
            .map((c) => ({ ...c, winRate: c.won + c.lost ? round((c.won / (c.won + c.lost)) * 100, 1) : null, share: share(c.wonValue) }))
            .slice(0, 20);
        // How much of won revenue rides on a few customers. Risk when one customer is 30%+ or the top five 70%+.
        const top1 = share(allCustomers[0]?.wonValue ?? 0);
        const top5 = share(allCustomers.slice(0, 5).reduce((s, c) => s + c.wonValue, 0));
        const concentration = {
            wonCustomers: allCustomers.filter((c) => c.wonValue > 0).length,
            top1Name: allCustomers[0]?.wonValue ? allCustomers[0].name : null,
            top1Share: top1,
            top5Share: top5,
            risk: top1 == null ? 'none' : top1 >= 30 || (top5 ?? 0) >= 70 ? 'high' : top1 >= 20 || (top5 ?? 0) >= 50 ? 'medium' : 'low',
        };

        // ---- Margin on won quotes ----------------------------------------------------------
        const wonInPeriod = Q.filter((q) => inRange(q.won, from, to));
        const mValue = wonInPeriod.reduce((s, q) => s + q.value, 0);
        const mCost = wonInPeriod.reduce((s, q) => s + q.cost, 0);
        const byProduct = new Map<string, { name: string; sell: number; cost: number; quotes: Set<string> }>();
        wonInPeriod.forEach((q) => {
            // Spread the quote-level discount over its lines so product margins add up to the order margin.
            const factor = q.gross > 0 ? q.value / q.gross : 1;
            q.lines.forEach((l) => {
                const key = l.name.toLowerCase();
                if (!byProduct.has(key)) byProduct.set(key, { name: l.name, sell: 0, cost: 0, quotes: new Set() });
                const r = byProduct.get(key)!;
                r.sell += l.sell * factor; r.cost += l.cost; r.quotes.add(q.id);
            });
        });
        const marginRow = (sell: number, cost: number) => ({ value: sell, cost, margin: sell - cost, marginPct: marginPct(sell, cost) });
        // Open and won quotes both count as "low margin" so they can be fixed before or flagged after the deal.
        const lowMarginQuotes = Q.filter((q) => (inRange(q.won, from, to) || AWAITING_CUSTOMER.includes(q.status)) && q.value > 0 && q.cost > 0)
            .map((q) => ({ q, pct: marginPct(q.value, q.cost)! }))
            .filter((x) => x.pct < LOW_MARGIN_PCT)
            .sort((a, b) => a.pct - b.pct);
        const margin = {
            threshold: LOW_MARGIN_PCT,
            ...marginRow(mValue, mCost),
            missingCost: wonInPeriod.filter((q) => q.value > 0 && q.cost === 0).length,
            products: [...byProduct.values()]
                .map((p) => ({ name: p.name, quotes: p.quotes.size, ...marginRow(p.sell, p.cost) }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10),
            lowCount: lowMarginQuotes.length,
            low: lowMarginQuotes.slice(0, 8).map(({ q, pct }) => ({
                id: q.id, ref: q.ref, customer: clientName(q.client), owner: personName(q.owner),
                status: q.status, value: q.value, margin: q.value - q.cost, marginPct: pct,
                link: ['/quotations/view', q.id],
            })),
        };

        // ---- Lost reasons ------------------------------------------------------------------
        const reasons = new Map<string, { reason: string; count: number; value: number; competitors: Set<string> }>();
        Q.filter((q) => inRange(q.lost, from, to)).forEach((q) => {
            const text = String(q.raw.lostReason || q.raw.customerDecision?.reason || '').trim();
            const reason = text ? text.charAt(0).toUpperCase() + text.slice(1) : 'No reason given';
            const key = reason.toLowerCase();
            if (!reasons.has(key)) reasons.set(key, { reason, count: 0, value: 0, competitors: new Set() });
            const r = reasons.get(key)!;
            r.count++; r.value += q.value;
            if (q.raw.customerDecision?.competitor) r.competitors.add(q.raw.customerDecision.competitor);
        });
        const lostReasons = [...reasons.values()].map((r) => ({ reason: r.reason, count: r.count, value: r.value, competitors: [...r.competitors] }))
            .sort((a, b) => b.value - a.value || b.count - a.count);

        // ---- Pipeline aging (open quotes by days since sent) ------------------------------
        const bands = [
            { label: '0–7 days', max: 7 }, { label: '8–14 days', max: 14 }, { label: '15–30 days', max: 30 },
            { label: '31–60 days', max: 60 }, { label: '60+ days', max: Infinity },
        ].map((b) => ({ ...b, count: 0, value: 0 }));
        open.forEach((q) => {
            const age = days(q.sent ?? q.created ?? now, now);
            const band = bands.find((b) => age <= b.max)!;
            band.count++; band.value += q.value;
        });
        const aging = bands.map(({ label, count, value }) => ({ label, count, value }));

        // ---- Deal size bands: where we win and where we lose ------------------------------
        const sizeBands = [
            { label: '< 10K', max: 10_000 }, { label: '10K–50K', max: 50_000 }, { label: '50K–250K', max: 250_000 },
            { label: '250K–1M', max: 1_000_000 }, { label: '1M+', max: Infinity },
        ].map((b) => ({ ...b, won: 0, lost: 0, wonValue: 0 }));
        Q.forEach((q) => {
            const isWon = inRange(q.won, from, to);
            const isLost = inRange(q.lost, from, to);
            if (!isWon && !isLost) return;
            const band = sizeBands.find((b) => q.value < b.max)!;
            if (isWon) { band.won++; band.wonValue += q.value; } else band.lost++;
        });
        const dealSizes = sizeBands.map(({ label, won, lost, wonValue }) => ({ label, won, lost, wonValue, winRate: won + lost ? round((won / (won + lost)) * 100, 1) : null }));

        // ---- Enquiry source mix ------------------------------------------------------------
        const sourceMap = new Map<string, { label: string; enquiries: number; quoted: number; won: number }>();
        cohort.forEach((e) => {
            const label = String(e.raw.source || '').trim() || 'Not recorded';
            if (!sourceMap.has(label.toLowerCase())) sourceMap.set(label.toLowerCase(), { label, enquiries: 0, quoted: 0, won: 0 });
            const s = sourceMap.get(label.toLowerCase())!;
            const qs = quotesByEnq.get(e.id) ?? [];
            s.enquiries++;
            if (qs.length) s.quoted++;
            if (qs.some((q) => q.status === quoteStatus.Won)) s.won++;
        });
        const sources = [...sourceMap.values()].sort((a, b) => b.enquiries - a.enquiries);

        // ---- Filter options -----------------------------------------------------------------
        const peopleOptions = (quoteScope === 'all' ? [...new Set([...names.keys()])] : quoteScope.map(String))
            .map((id) => ({ value: id, label: names.get(id) ?? 'Unknown' }))
            .filter((o) => o.label !== 'Unknown')
            .sort((a, b) => a.label.localeCompare(b.label));
        const customerOptions = [...customerName.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));

        return res.status(200).json({
            generatedAt: now,
            usdToQar,
            period: { from, to, prevFrom, prevTo },
            scope: { label: scopeLabel(quoteScope, selfId), canPickPerson: quoteScope === 'all' || quoteScope.length > 1 },
            options: { people: peopleOptions, customers: customerOptions },
            kpis: { current, previous, pipeline },
            funnel,
            attention,
            trend,
            people: peopleRows,
            customers: customerRows,
            concentration,
            margin,
            lostReasons,
            aging,
            dealSizes,
            sources,
        });
    } catch (error) {
        next(error);
    }
};
