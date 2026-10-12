import { NextFunction, Request, Response } from "express";
import Rfq, { RFQ_DECLINE_REASONS, RfqAvailability, RfqLineStatus, RfqStatus, RfqSupplierStatus, RfqType } from "../models/rfq.model";
import Enquiry from "../models/enquiry.model";
import Supplier, { supplierStatus } from "../models/supplier.model";
import { getEmployeeData, buildPrivilegeAccessFilter, getQarRates } from "../common/utils/util";
import { uploadFileToAws } from "../common/aws-connect";
import { nextRfqNo } from "../services/rfqNumber.service";
import { getActiveReservationFilter } from "./stockEntry.controller";
import Product from "../models/products.model";
import StockEntry from "../models/stockEntry.model";
import StockBlock from "../models/stockBlock.model";
import StockReservation from "../models/stockReservation.model";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

/** Statuses after which a sales RFQ can no longer be edited. */
const LOCKED_STATUSES: string[] = [RfqStatus.Closed, RfqStatus.Cancelled];
const QUOTE_FIELDS = [
    'supplierId', 'supplierName', 'unitPrice', 'availability', 'currency', 'leadTimeDays', 'quantity',
    'discountType', 'discountValue', 'taxPercent', 'freightCost', 'etaTerms', 'paymentTerms',
    'validityDate', 'warrantyTerms', 'brandOffered', 'modelOffered', 'moq', 'isAlternative', 'remarks'
];

// --- helpers -----------------------------------------------------------------

const toNumber = (value: any, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

/** Same arithmetic as the procurement RFQ sync, so both kinds of quote line read alike. */
const applyQuoteTotals = (quote: any) => {
    if (quote.availability === RfqAvailability.Unavailable) {
        quote.totalCost = 0;
        quote.netAmount = 0;
        quote.landedCost = 0;
        return quote;
    }
    const quantity = toNumber(quote.quantity);
    const gross = quantity * toNumber(quote.unitPrice);
    const discountValue = toNumber(quote.discountValue);
    const discountAmount = quote.discountType === 'percent' ? gross * (discountValue / 100) : discountValue;
    const netAmount = Math.max(gross - discountAmount, 0);
    quote.totalCost = gross;
    quote.netAmount = netAmount;
    quote.landedCost = netAmount + netAmount * (toNumber(quote.taxPercent) / 100) + toNumber(quote.freightCost);
    return quote;
};

/** Per-unit landed cost of a quote line: what the quotation uses as its unit cost. */
const unitLandedCost = (quote: any) => {
    const quantity = toNumber(quote.quantity);
    if (quantity > 0 && toNumber(quote.landedCost) > 0) return Number((toNumber(quote.landedCost) / quantity).toFixed(2));
    return toNumber(quote.unitPrice);
};

/**
 * QAR value of an amount in a quote's currency: the rate captured with the price first, today's rate
 * when none was captured. Null when no rate is known, so the caller can tell it apart from zero.
 */
const toQar = (amount: number, quote: any, rates: Record<string, number>): number | null => {
    const currency = String(quote?.currency || 'QAR').toUpperCase();
    if (currency === 'QAR') return amount;
    const rate = toNumber(quote?.exchangeRate) || rates[currency];
    return rate ? amount * rate : null;
};

/**
 * Whether confirming `chosen` passes over a cheaper available price on the same line (compared in QAR,
 * per unit landed). Prices without a known rate are left out of the comparison rather than guessed.
 */
const isAboveLowest = (rfq: any, chosen: any, rates: Record<string, number>): boolean => {
    const chosenQar = toQar(unitLandedCost(chosen), chosen, rates);
    if (chosenQar == null) return false;
    return (rfq.quotes || []).some((quote: any) => {
        if (quote.itemDetailKey !== chosen.itemDetailKey || String(quote._id) === String(chosen._id)) return false;
        if (quote.availability === RfqAvailability.Unavailable) return false;
        const qar = toQar(unitLandedCost(quote), quote, rates);
        return qar != null && qar < chosenQar - 0.005;
    });
};

/**
 * Loads a supplier that may be put on an RFQ: in the master and not blocked. Supplier approval is
 * skipped for now, so a supplier registered from the RFQ form can be asked straight away.
 */
const loadAskableSupplier = async (supplierId: any): Promise<{ supplier?: any; error?: string }> => {
    if (!supplierId || !ObjectId.isValid(supplierId)) return { error: 'Pick a supplier from the list.' };
    const supplier: any = await Supplier.findById(supplierId, { supplierName: 1, status: 1, isBlocked: 1, 'contactDetails.email': 1 }).lean();
    if (!supplier) return { error: 'Supplier not found.' };
    if (supplier.isBlocked) return { error: `${supplier.supplierName} is blocked.` };
    return { supplier };
};

// --- follow-ups --------------------------------------------------------------

const FOLLOW_UP_OPEN = 'scheduled';

const employeeName = (employee: any) => `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim();

/** Mirrors the earliest open follow-up onto the RFQ, so lists can filter and sort on it. */
const syncNextFollowUp = (rfq: any) => {
    const due = (rfq.followUps || [])
        .filter((f: any) => f.status === FOLLOW_UP_OPEN && f.dueDate)
        .map((f: any) => new Date(f.dueDate).getTime())
        .sort((a: number, b: number) => a - b)[0];
    rfq.nextFollowUpDate = due ? new Date(due) : undefined;
};

const openFollowUpsFor = (rfq: any, inviteId?: any) =>
    (rfq.followUps || []).filter((f: any) =>
        f.status === FOLLOW_UP_OPEN && (inviteId === undefined || String(f.inviteId || '') === String(inviteId || '')));

/** Closes the open chases for one supplier (or the whole RFQ) once there is nothing left to chase. */
const closeFollowUps = (rfq: any, inviteId: any, how: { done?: string; cancel?: string }) => {
    openFollowUpsFor(rfq, inviteId).forEach((f: any) => {
        f.completedAt = new Date();
        if (how.done) {
            f.status = 'done';
            f.outcome = how.done;
        } else {
            f.status = 'cancelled';
            f.cancelReason = how.cancel;
        }
    });
    syncNextFollowUp(rfq);
};

/** A supplier just marked as sent gets a chase on the "prices needed by" date, or in three days. */
const scheduleChase = (rfq: any, invite: any, employee: any) => {
    if (openFollowUpsFor(rfq, invite._id).length) return;
    const now = Date.now();
    const deadline = rfq.deadline ? new Date(rfq.deadline).getTime() : 0;
    const dueDate = deadline > now ? new Date(deadline) : new Date(now + 3 * 24 * 60 * 60 * 1000);
    rfq.followUps.push({
        inviteId: invite._id,
        supplierName: invite.supplierName,
        status: FOLLOW_UP_OPEN,
        dueDate,
        note: `Chase ${invite.supplierName} for prices`,
        auto: true,
        createdBy: employee?._id,
        createdByName: employeeName(employee),
        createdAt: new Date(),
    });
    syncNextFollowUp(rfq);
};

/**
 * Open → Quoted once any price is in → Awarded once every line is settled and at least one was won.
 * Every line settled with none won (lost to other suppliers or unavailable) closes the RFQ.
 */
const recomputeStatus = (rfq: any) => {
    if (LOCKED_STATUSES.includes(rfq.status)) return;
    const lines = rfq.requestedLines || [];
    const settled = lines.length > 0 && lines.every((line: any) => line.lineStatus && line.lineStatus !== RfqLineStatus.Pending);
    const lostAll = settled && lines.some((line: any) => line.lineStatus === RfqLineStatus.Lost)
        && !lines.some((line: any) => line.lineStatus === RfqLineStatus.Confirmed);
    if (lostAll) rfq.status = RfqStatus.Closed;
    else if (settled) rfq.status = RfqStatus.Awarded;
    else if ((rfq.quotes || []).length > 0) rfq.status = RfqStatus.Quoted;
    else if (rfq.status !== RfqStatus.Draft) rfq.status = RfqStatus.Open;
};

const buildLine = (line: any) => ({
    itemDetailKey: line.itemDetailKey || new ObjectId().toString(),
    itemName: String(line.itemName || '').trim(),
    detail: String(line.detail || '').trim(),
    quantity: toNumber(line.quantity),
    estimatedUnitCost: line.estimatedUnitCost != null ? toNumber(line.estimatedUnitCost) : undefined,
    partNo: ObjectId.isValid(line.partNo) ? line.partNo : undefined,
    uom: line.uom || undefined,
    isNewItem: !!line.isNewItem,
    lineStatus: line.lineStatus || RfqLineStatus.Pending,
});

/** Lines a presale estimation already lists, so the sales person does not retype them. */
const linesFromEstimation = (enquiry: any) => {
    const option = enquiry?.preSale?.estimations?.optionalItems?.[0];
    const lines: any[] = [];
    (option?.items || []).forEach((item: any) => {
        (item.itemDetails || []).forEach((detail: any) => {
            if (!detail?.detail) return;
            lines.push(buildLine({
                itemName: item.itemName,
                detail: detail.detail,
                quantity: detail.quantity,
                estimatedUnitCost: detail.unitCost,
                partNo: detail.productId,
                uom: detail.uom,
                isNewItem: !detail.productId,
            }));
        });
    });
    return lines;
};

const validateLines = (lines: any[]): string | null => {
    if (!lines.length) return 'Add at least one item to request prices for.';
    const bad = lines.find((line) => !line.itemName || !line.detail || !(line.quantity > 0));
    return bad ? 'Every line needs an item name, a description and a quantity above zero.' : null;
};

const TERM_FIELDS = ['paymentTerms', 'deliveryTerms', 'incoterm', 'deliveryLocation', 'validityDate', 'currency', 'warrantyTerms'];

/** Keeps only the known term fields; empty strings are dropped. */
const buildTerms = (body: any) => {
    const terms: any = {};
    TERM_FIELDS.forEach((field) => {
        const value = body?.[field];
        if (value !== undefined && value !== null && value !== '') terms[field] = typeof value === 'string' ? value.trim() : value;
    });
    return terms;
};

/**
 * Builds a supplier invitation from `{ supplierId, contactEmail?, lineKeys }`, stamping the name from the
 * master. Unknown line keys are dropped.
 */
const buildInvite = async (body: any, validKeys: Set<string>): Promise<{ invite?: any; error?: string }> => {
    const invite: any = {
        lineKeys: Array.from(new Set<string>((Array.isArray(body?.lineKeys) ? body.lineKeys : []).map(String))).filter((key) => validKeys.has(key)),
        contactEmail: String(body?.contactEmail || '').trim() || undefined,
        status: RfqSupplierStatus.NotSent,
    };
    if (invite.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.contactEmail)) {
        return { error: `"${invite.contactEmail}" is not a valid email address.` };
    }
    const { supplier, error } = await loadAskableSupplier(body?.supplierId);
    if (error) return { error };
    invite.supplierId = supplier._id;
    invite.supplierName = supplier.supplierName;
    invite.isSupplierApproved = supplier.status === supplierStatus.approved;
    if (!invite.contactEmail && supplier.contactDetails?.email) invite.contactEmail = supplier.contactDetails.email;
    if (!invite.lineKeys.length) return { error: `Choose at least one line for ${invite.supplierName}.` };
    return { invite };
};

const sameSupplier = (a: any, b: any) =>
    a.supplierId && b.supplierId
        ? String(a.supplierId) === String(b.supplierId)
        : !a.supplierId && !b.supplierId && String(a.supplierName || '').trim().toLowerCase() === String(b.supplierName || '').trim().toLowerCase();

/** Releases a line whose confirmed price was just removed or became unavailable. */
const releaseLineIfSelected = (rfq: any, quote: any) => {
    if (!quote.selected) return;
    quote.selected = false;
    const line = rfq.requestedLines.find((l: any) => l.itemDetailKey === quote.itemDetailKey);
    if (line) { line.lineStatus = RfqLineStatus.Pending; line.awardReason = undefined; }
};

const touch = (rfq: any, employee: any) => {
    recomputeStatus(rfq);
    if (rfq.status === RfqStatus.Awarded && !rfq.awardedAt) {
        rfq.awardedAt = new Date();
        rfq.awardedBy = employee?._id;
    }
    rfq.updatedBy = employee?._id;
    rfq.updatedAt = new Date();
};

const loadSalesRfq = async (id: string) => {
    if (!ObjectId.isValid(id)) return null;
    return Rfq.findOne({ _id: id, rfqType: RfqType.Sales, isDeleted: false });
};

const populateSalesRfq = (query: any) => query
    .populate({ path: 'enquiryId', populate: [{ path: 'client' }, { path: 'contact' }, { path: 'department' }, { path: 'salesPerson', select: '-password' }] })
    .populate('customerId')
    .populate('requestedLines.partNo', 'itemCode partNo')
    .populate('quotationId', 'quoteId status')
    .populate('ownerId', '-password')
    .populate('createdBy', '-password');

const sendRfq = async (res: Response, rfq: any, message?: string, statusCode = 200) => {
    const data = await populateSalesRfq(Rfq.findById(rfq._id));
    return res.status(statusCode).json({ success: true, message, data });
};

const lockedResponse = (res: Response) =>
    res.status(409).json({ success: false, message: 'This RFQ is closed or cancelled and can no longer be changed.' });

/**
 * Copies the editable quote fields, stamping supplier name and approval state from the master. The
 * exchange rate to QAR is captured with the price, and again only when its currency changes.
 */
const fillQuote = async (target: any, body: any) => {
    const previousCurrency = target.currency;
    QUOTE_FIELDS.forEach((field) => {
        if (body[field] !== undefined) target[field] = body[field] === '' ? undefined : body[field];
    });
    target.currency = String(target.currency || 'QAR').toUpperCase();
    if (target.currency === 'QAR') {
        target.exchangeRate = 1;
    } else if (!target.exchangeRate || target.currency !== previousCurrency) {
        const { rates } = await getQarRates();
        target.exchangeRate = rates[target.currency] ? Number(rates[target.currency].toFixed(6)) : undefined;
    }
    if (target.supplierId && ObjectId.isValid(target.supplierId)) {
        const supplier: any = await Supplier.findById(target.supplierId, { supplierName: 1, status: 1, isBlocked: 1 }).lean();
        if (!supplier) return 'Supplier not found.';
        if (supplier.isBlocked) return `${supplier.supplierName} is blocked.`;
        target.supplierName = supplier.supplierName;
        target.isSupplierApproved = supplier.status === supplierStatus.approved;
    } else {
        // A supplier not yet in the master can still quote; it is named only and flagged unapproved.
        target.supplierId = undefined;
        target.isSupplierApproved = false;
        if (!String(target.supplierName || '').trim()) return 'Pick a supplier or enter its name.';
    }
    const price = target.unitPrice;
    if (target.availability !== RfqAvailability.Unavailable && (price == null || !(toNumber(price, -1) >= 0))) {
        return 'Enter the unit price, or mark the supplier as unavailable.';
    }
    applyQuoteTotals(target);
    return null;
};

// --- handlers ----------------------------------------------------------------

const escapeRegex = (value: any) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Supplier views of the RFQ tab, each a filter on one supplier's request. */
const supplierViewMatch = (view: string, now: Date): any => {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const waiting = [RfqSupplierStatus.NotSent, RfqSupplierStatus.Sent];
    switch (view) {
        case 'notSent': return { 'suppliers.status': RfqSupplierStatus.NotSent, status: { $nin: LOCKED_STATUSES } };
        case 'awaiting': return { 'suppliers.status': RfqSupplierStatus.Sent, status: { $nin: LOCKED_STATUSES } };
        case 'replied': return { 'suppliers.status': RfqSupplierStatus.Replied };
        case 'declined': return { 'suppliers.status': RfqSupplierStatus.Declined };
        case 'overdue': return { 'suppliers.status': { $in: waiting }, status: { $nin: LOCKED_STATUSES }, deadline: { $lt: new Date(now.setHours(0, 0, 0, 0)) } };
        case 'followUp': return { nextFollowUpForSupplier: { $lte: endOfToday } };
        default: return {};
    }
};

/**
 * One row per supplier asked on an RFQ: what it was asked for, what it priced, and when to chase it.
 * This is the default way the RFQ tab is tracked; `item` narrows to suppliers asked for a matching line.
 */
const getSalesRfqSupplierRows = async (req: Request, res: Response, matchStage: any) => {
    const { page, row, search, item, supplierView } = req.body;
    const pageNumber = Number(page) || 1;
    const pageSize = Number(row) || 15;
    const now = new Date();
    const itemRegex = item ? { $regex: escapeRegex(item), $options: 'i' } : null;

    const pipeline: any[] = [
        { $match: matchStage },
        { $unwind: '$suppliers' },
        {
            $addFields: {
                askedLines: {
                    $filter: {
                        input: { $ifNull: ['$requestedLines', []] }, as: 'line',
                        cond: { $in: ['$$line.itemDetailKey', { $ifNull: ['$suppliers.lineKeys', []] }] }
                    }
                },
                supplierQuotes: {
                    $filter: {
                        input: { $ifNull: ['$quotes', []] }, as: 'q',
                        cond: { $eq: ['$$q.inviteId', '$suppliers._id'] }
                    }
                },
                nextFollowUpForSupplier: {
                    $min: {
                        $map: {
                            input: {
                                $filter: {
                                    input: { $ifNull: ['$followUps', []] }, as: 'f',
                                    cond: { $and: [{ $eq: ['$$f.status', FOLLOW_UP_OPEN] }, { $eq: ['$$f.inviteId', '$suppliers._id'] }] }
                                }
                            },
                            as: 'f', in: '$$f.dueDate'
                        }
                    }
                },
            }
        },
    ];
    if (itemRegex) {
        pipeline.push({ $match: { askedLines: { $elemMatch: { $or: [{ detail: itemRegex }, { itemName: itemRegex }] } } } });
    }
    const viewMatch = supplierViewMatch(String(supplierView || 'all'), new Date(now));
    if (Object.keys(viewMatch).length) pipeline.push({ $match: viewMatch });
    pipeline.push(
        { $lookup: { from: 'enquiries', localField: 'enquiryId', foreignField: '_id', as: 'enquiryId', pipeline: [{ $project: { enquiryId: 1, title: 1, status: 1 } }] } },
        { $unwind: { path: '$enquiryId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customerId', pipeline: [{ $project: { companyName: 1 } }] } },
        { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'createdBy', pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
        { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
    );
    if (search) {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        pipeline.push({ $match: { $or: [{ rfqNo: regex }, { 'suppliers.supplierName': regex }, { 'enquiryId.enquiryId': regex }, { 'enquiryId.title': regex }, { 'customerId.companyName': regex }] } });
    }
    pipeline.push(
        {
            $project: {
                _id: { $concat: [{ $toString: '$_id' }, ':', { $toString: '$suppliers._id' }] },
                rfqId: '$_id',
                inviteId: '$suppliers._id',
                rfqNo: 1, status: 1, deadline: 1, requiredBy: 1, createdAt: 1,
                enquiryId: 1, customerId: 1, createdBy: 1,
                supplierId: '$suppliers.supplierId',
                supplierName: '$suppliers.supplierName',
                contactEmail: '$suppliers.contactEmail',
                supplierStatus: '$suppliers.status',
                sentAt: '$suppliers.sentAt',
                sentVia: '$suppliers.sentVia',
                repliedAt: '$suppliers.repliedAt',
                declineReason: '$suppliers.declineReason',
                lineCount: { $size: { $ifNull: ['$suppliers.lineKeys', []] } },
                pricedCount: {
                    $size: { $filter: { input: '$supplierQuotes', as: 'q', cond: { $ne: ['$$q.availability', RfqAvailability.Unavailable] } } }
                },
                unavailableCount: {
                    $size: { $filter: { input: '$supplierQuotes', as: 'q', cond: { $eq: ['$$q.availability', RfqAvailability.Unavailable] } } }
                },
                awardedCount: { $size: { $filter: { input: '$supplierQuotes', as: 'q', cond: { $eq: ['$$q.selected', true] } } } },
                items: { $map: { input: { $slice: ['$askedLines', 6] }, as: 'line', in: '$$line.detail' } },
                nextFollowUp: '$nextFollowUpForSupplier',
                overdue: {
                    $and: [
                        { $in: ['$suppliers.status', [RfqSupplierStatus.NotSent, RfqSupplierStatus.Sent]] },
                        { $not: [{ $in: ['$status', LOCKED_STATUSES] }] },
                        { $lt: [{ $ifNull: ['$deadline', now] }, new Date(new Date(now).setHours(0, 0, 0, 0))] },
                    ]
                },
            }
        },
        { $sort: { createdAt: -1, supplierName: 1 } },
        { $facet: { data: [{ $skip: (pageNumber - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'count' }] } }
    );

    const result = await Rfq.aggregate(pipeline);
    const data = result[0]?.data || [];
    const total = result[0]?.total?.[0]?.count || 0;
    return res.status(200).json({ success: true, rfqs: { data, total, page: pageNumber, row: pageSize } });
};

export const getSalesRfqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, row, status, search, enquiryId, item, mode } = req.body;
        const pageNumber = Number(page) || 1;
        const pageSize = Number(row) || 15;
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: "Employee not found" });

        const viewReport = employee.category?.privileges?.enquiry?.viewReport;
        const accessFilter = viewReport ? await buildPrivilegeAccessFilter(employee._id, viewReport, 'createdBy') : {};

        const matchStage: any = { isDeleted: false, rfqType: RfqType.Sales, ...accessFilter };
        if (Array.isArray(status) && status.length) matchStage.status = { $in: status };
        else if (status) matchStage.status = status;
        if (enquiryId && ObjectId.isValid(enquiryId)) matchStage.enquiryId = new ObjectId(enquiryId);

        if (mode === 'suppliers') return getSalesRfqSupplierRows(req, res, matchStage);

        if (item) {
            const itemRegex = { $regex: escapeRegex(item), $options: 'i' };
            matchStage.requestedLines = { $elemMatch: { $or: [{ detail: itemRegex }, { itemName: itemRegex }] } };
        }

        const pipeline: any[] = [
            { $match: matchStage },
            { $lookup: { from: 'enquiries', localField: 'enquiryId', foreignField: '_id', as: 'enquiryId', pipeline: [{ $project: { enquiryId: 1, title: 1, status: 1, client: 1 } }] } },
            { $unwind: { path: '$enquiryId', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customerId', pipeline: [{ $project: { companyName: 1 } }] } },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'createdBy', pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'quotations', localField: 'quotationId', foreignField: '_id', as: 'quotationId', pipeline: [{ $project: { quoteId: 1, status: 1 } }] } },
            { $unwind: { path: '$quotationId', preserveNullAndEmptyArrays: true } },
        ];
        if (search) {
            const regex = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
            pipeline.push({ $match: { $or: [{ rfqNo: regex }, { 'enquiryId.enquiryId': regex }, { 'enquiryId.title': regex }, { 'customerId.companyName': regex }] } });
        }
        pipeline.push(
            {
                $addFields: {
                    requestedLineCount: { $size: { $ifNull: ['$requestedLines', []] } },
                    quoteLineCount: { $size: { $ifNull: ['$quotes', []] } },
                    supplierCount: { $size: { $ifNull: ['$suppliers', []] } },
                    repliedSupplierCount: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ['$suppliers', []] }, as: 's',
                                cond: { $in: ['$$s.status', [RfqSupplierStatus.Replied, RfqSupplierStatus.Declined]] }
                            }
                        }
                    },
                    pendingLineCount: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ['$requestedLines', []] }, as: 'line',
                                cond: { $in: [{ $ifNull: ['$$line.lineStatus', RfqLineStatus.Pending] }, [RfqLineStatus.Pending]] }
                            }
                        }
                    },
                }
            },
            { $sort: { createdAt: -1 } },
            { $facet: { data: [{ $skip: (pageNumber - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'count' }] } }
        );

        const result = await Rfq.aggregate(pipeline);
        const data = result[0]?.data || [];
        const total = result[0]?.total?.[0]?.count || 0;
        return res.status(200).json({ success: true, rfqs: { data, total, page: pageNumber, row: pageSize } });
    } catch (error) {
        next(error);
    }
};

/** Lightweight lookup for the enquiry badge: every live sales RFQ per enquiry id. */
export const getSalesRfqSummaries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ids = (Array.isArray(req.body?.enquiryIds) ? req.body.enquiryIds : []).filter((id: any) => ObjectId.isValid(id));
        if (!ids.length) return res.status(200).json({ success: true, data: [] });
        const data = await Rfq.find(
            { rfqType: RfqType.Sales, isDeleted: false, enquiryId: { $in: ids.map((id: string) => new ObjectId(id)) }, status: { $ne: RfqStatus.Cancelled } },
            { rfqNo: 1, enquiryId: 1, status: 1, 'requestedLines.lineStatus': 1, 'suppliers.status': 1, deadline: 1, createdAt: 1 }
        ).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getSalesRfqById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rfq = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        return sendRfq(res, rfq);
    } catch (error) {
        next(error);
    }
};

/** What the create form starts from: the enquiry header and any lines its presale estimation lists. */
export const getSalesRfqDraft = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enquiryId } = req.params;
        if (!ObjectId.isValid(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry" });
        const enquiry: any = await Enquiry.findById(enquiryId)
            .populate('client', 'companyName')
            .populate('contact', 'firstName lastName')
            .lean();
        if (!enquiry || enquiry.isDeleted) return res.status(404).json({ success: false, message: "Enquiry not found" });
        return res.status(200).json({
            success: true,
            data: {
                enquiry: { _id: enquiry._id, enquiryId: enquiry.enquiryId, title: enquiry.title, status: enquiry.status, client: enquiry.client, requirement: enquiry.requirement },
                fromPresale: !!enquiry.preSale?.estimations?.optionalItems?.length,
                lines: linesFromEstimation(enquiry),
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Raises one RFQ per supplier picked on the form, each holding only the lines that supplier is asked
 * to price. An enquiry can have any number of RFQs, so each card on the enquiry is one supplier.
 */
export const createSalesRfqFromEnquiry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: "Employee not found" });

        const { enquiryId } = req.params;
        if (!ObjectId.isValid(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry" });
        const enquiry: any = await Enquiry.findById(enquiryId).lean();
        if (!enquiry || enquiry.isDeleted) return res.status(404).json({ success: false, message: "Enquiry not found" });
        if (['Lost', 'lost', 'Quoted', 'quoted'].includes(enquiry.status)) {
            return res.status(409).json({ success: false, message: `Enquiry is ${enquiry.status}; supplier prices are no longer needed.` });
        }

        const fromPresale = !!enquiry.preSale?.estimations?.optionalItems?.length;
        const lines = Array.isArray(req.body?.lines) ? req.body.lines.map(buildLine) : [];
        const error = validateLines(lines);
        if (error) return res.status(400).json({ success: false, message: error });

        const validKeys = new Set<string>(lines.map((line: any) => line.itemDetailKey));
        const invites: any[] = [];
        for (const body of (Array.isArray(req.body?.suppliers) ? req.body.suppliers : [])) {
            const built = await buildInvite(body, validKeys);
            if (built.error) return res.status(400).json({ success: false, message: built.error });
            if (invites.some((existing) => sameSupplier(existing, built.invite))) {
                return res.status(400).json({ success: false, message: `${built.invite.supplierName} is listed twice.` });
            }
            invites.push(built.invite);
        }
        if (!invites.length) return res.status(400).json({ success: false, message: 'Pick at least one supplier to ask.' });
        // Without a "prices needed by" date the overdue and chasing logic has nothing to count from.
        if (!req.body?.deadline) return res.status(400).json({ success: false, message: 'Say when the supplier prices are needed by.' });

        const created: any[] = [];
        for (const invite of invites) {
            const keys = new Set<string>(invite.lineKeys);
            const rfq = await Rfq.create({
                rfqNo: await nextRfqNo(),
                rfqType: RfqType.Sales,
                enquiryId,
                fromPresale,
                customerId: enquiry.client,
                ownerId: employee._id,
                status: RfqStatus.Open,
                requestedLines: lines.filter((line: any) => keys.has(line.itemDetailKey)),
                quotes: [],
                suppliers: [invite],
                requestedTerms: buildTerms(req.body?.requestedTerms),
                deadline: req.body?.deadline || undefined,
                requiredBy: req.body?.requiredBy || undefined,
                notes: req.body?.notes || undefined,
                createdBy: employee._id,
            });
            created.push({ _id: rfq._id, rfqNo: rfq.rfqNo, supplierName: invite.supplierName });
        }
        return res.status(201).json({ success: true, message: `${created.length} RFQ(s) created`, data: created });
    } catch (error) {
        next(error);
    }
};

/** Header and line edits. Lines that already carry quotes keep their key, so the quotes stay attached. */
export const updateSalesRfq = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        if (Array.isArray(req.body?.lines)) {
            const previous = new Map<string, any>((rfq.requestedLines || []).map((line: any) => [line.itemDetailKey, line]));
            const lines = req.body.lines.map((line: any) => buildLine({
                ...line,
                lineStatus: previous.get(line.itemDetailKey)?.lineStatus || RfqLineStatus.Pending,
            }));
            const error = validateLines(lines);
            if (error) return res.status(400).json({ success: false, message: error });
            const keys = new Set(lines.map((line: any) => line.itemDetailKey));
            rfq.requestedLines = lines;
            // Quotes for a removed line have nothing to price any more.
            rfq.quotes = (rfq.quotes || []).filter((quote: any) => keys.has(quote.itemDetailKey));
            const invites = rfq.suppliers || [];
            invites.forEach((invite: any) => {
                // An RFQ raised for one supplier asks it for every line, including lines added later.
                invite.lineKeys = invites.length === 1 ? Array.from(keys) : (invite.lineKeys || []).filter((key: string) => keys.has(key));
            });
        }
        if (req.body?.requestedTerms !== undefined) rfq.requestedTerms = buildTerms(req.body.requestedTerms);
        if (req.body?.deadline !== undefined) rfq.deadline = req.body.deadline || undefined;
        if (req.body?.requiredBy !== undefined) rfq.requiredBy = req.body.requiredBy || undefined;
        if (req.body?.notes !== undefined) rfq.notes = req.body.notes;

        recomputeStatus(rfq);
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, "RFQ updated");
    } catch (error) {
        next(error);
    }
};

export const addSalesRfqQuote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        const line = (rfq.requestedLines || []).find((l: any) => l.itemDetailKey === req.body?.itemDetailKey);
        if (!line) return res.status(400).json({ success: false, message: "Pick the line this price is for." });
        const approved = await loadAskableSupplier(req.body?.supplierId);
        if (approved.error) return res.status(400).json({ success: false, message: approved.error });

        const quote: any = {
            itemDetailKey: line.itemDetailKey,
            itemName: line.itemName,
            detail: line.detail,
            quantity: line.quantity,
            productId: line.partNo || undefined,
            selected: false,
            createdBy: employee?._id,
            createdAt: new Date(),
        };
        const error = await fillQuote(quote, req.body);
        if (error) return res.status(400).json({ success: false, message: error });

        rfq.quotes.push(quote);
        recomputeStatus(rfq);
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, "Supplier price added", 201);
    } catch (error) {
        next(error);
    }
};

export const updateSalesRfqQuote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        const quote = rfq.quotes.id(req.params.quoteId);
        if (!quote) return res.status(404).json({ success: false, message: "Supplier price not found" });
        // Moving a price to another supplier follows the same rule as adding one; older name-only prices can still be edited.
        if (req.body?.supplierId !== undefined && String(req.body.supplierId || '') !== String(quote.supplierId || '')) {
            const approved = await loadAskableSupplier(req.body.supplierId);
            if (approved.error) return res.status(400).json({ success: false, message: approved.error });
        }
        const error = await fillQuote(quote, req.body);
        if (error) return res.status(400).json({ success: false, message: error });

        // A confirmed price that is now unavailable can no longer back the line.
        if (quote.selected && quote.availability === RfqAvailability.Unavailable) {
            quote.selected = false;
            const line = rfq.requestedLines.find((l: any) => l.itemDetailKey === quote.itemDetailKey);
            if (line) { line.lineStatus = RfqLineStatus.Pending; line.awardReason = undefined; }
        }
        recomputeStatus(rfq);
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, "Supplier price updated");
    } catch (error) {
        next(error);
    }
};

export const removeSalesRfqQuote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        const quote = rfq.quotes.id(req.params.quoteId);
        if (!quote) return res.status(404).json({ success: false, message: "Supplier price not found" });
        if (quote.selected) {
            const line = rfq.requestedLines.find((l: any) => l.itemDetailKey === quote.itemDetailKey);
            if (line) { line.lineStatus = RfqLineStatus.Pending; line.awardReason = undefined; }
        }
        quote.deleteOne();
        recomputeStatus(rfq);
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, "Supplier price removed");
    } catch (error) {
        next(error);
    }
};

/**
 * Settles one line: `quoteId` confirms that supplier's price, `unavailable: true` records that no
 * supplier can supply it, and `reopen: true` puts it back to Pending.
 */
export const settleSalesRfqLine = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        const key = req.params.lineKey;
        const line = rfq.requestedLines.find((l: any) => l.itemDetailKey === key);
        if (!line) return res.status(404).json({ success: false, message: "Line not found" });
        const lineQuotes = rfq.quotes.filter((quote: any) => quote.itemDetailKey === key);
        const { quoteId, unavailable, reopen } = req.body || {};
        const reason = String(req.body?.reason || '').trim();

        if (quoteId) {
            const chosen = lineQuotes.find((quote: any) => String(quote._id) === String(quoteId));
            if (!chosen) return res.status(404).json({ success: false, message: "Supplier price not found on this line" });
            if (chosen.availability === RfqAvailability.Unavailable) {
                return res.status(400).json({ success: false, message: "That supplier marked the item unavailable." });
            }
            const { rates } = await getQarRates();
            const aboveLowest = isAboveLowest(rfq, chosen, rates);
            if (aboveLowest && !reason) {
                return res.status(400).json({ success: false, reasonRequired: true, message: "This is not the lowest price on the line. Say why it was chosen." });
            }
            lineQuotes.forEach((quote: any) => (quote.selected = String(quote._id) === String(quoteId)));
            line.lineStatus = RfqLineStatus.Confirmed;
            line.awardReason = aboveLowest ? reason : undefined;
        } else if (unavailable) {
            lineQuotes.forEach((quote: any) => (quote.selected = false));
            line.lineStatus = RfqLineStatus.Unavailable;
            line.awardReason = undefined;
        } else if (reopen) {
            lineQuotes.forEach((quote: any) => (quote.selected = false));
            line.lineStatus = RfqLineStatus.Pending;
            line.awardReason = undefined;
        } else {
            return res.status(400).json({ success: false, message: "Nothing to change." });
        }

        recomputeStatus(rfq);
        if (rfq.status === RfqStatus.Awarded && !rfq.awardedAt) {
            rfq.awardedAt = new Date();
            rfq.awardedBy = employee?._id;
        }
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, "Line updated");
    } catch (error) {
        next(error);
    }
};

export const uploadSalesRfqQuoteFiles = async (req: any, res: Response, next: NextFunction) => {
    try {
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const quote = rfq.quotes.id(req.params.quoteId);
        if (!quote) return res.status(404).json({ success: false, message: "Supplier price not found" });
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ success: false, message: "No files uploaded" });

        const uploaded = await Promise.all(files.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path, file.mimetype);
            return { fileName: file.filename, originalname: file.originalname, uploadedAt: new Date() };
        }));
        quote.attachments = [...(quote.attachments || []), ...uploaded];
        await rfq.save();
        return sendRfq(res, rfq, "Files attached");
    } catch (error) {
        next(error);
    }
};

// --- suppliers: who is asked, what they were sent, what they replied ----------

export const addSalesRfqSupplier = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        const validKeys = new Set<string>((rfq.requestedLines || []).map((line: any) => line.itemDetailKey));
        const built = await buildInvite(req.body, validKeys);
        if (built.error) return res.status(400).json({ success: false, message: built.error });
        if ((rfq.suppliers || []).some((existing: any) => sameSupplier(existing, built.invite))) {
            return res.status(409).json({ success: false, message: `${built.invite.supplierName} is already on this RFQ.` });
        }
        rfq.suppliers.push(built.invite);
        touch(rfq, employee);
        await rfq.save();
        return sendRfq(res, rfq, "Supplier added", 201);
    } catch (error) {
        next(error);
    }
};

/** Changes the lines a supplier is asked for, its contact, or its send state (`Sent` stamps the date). */
export const updateSalesRfqSupplier = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const invite = rfq.suppliers.id(req.params.inviteId);
        if (!invite) return res.status(404).json({ success: false, message: "Supplier not found on this RFQ" });

        const { lineKeys, contactEmail, status, sentVia, remarks, declineReason, declineNote, supplierId } = req.body || {};
        if (supplierId !== undefined && String(supplierId || '') !== String(invite.supplierId || '')) {
            const { supplier, error } = await loadAskableSupplier(supplierId);
            if (error) return res.status(400).json({ success: false, message: error });
            if ((rfq.suppliers || []).some((s: any) => String(s._id) !== String(invite._id) && String(s.supplierId || '') === String(supplier._id))) {
                return res.status(400).json({ success: false, message: `${supplier.supplierName} is already asked on this RFQ.` });
            }
            // The old supplier's prices and replies do not carry over to the new one.
            const inviteId = String(invite._id);
            (rfq.quotes || []).filter((quote: any) => String(quote.inviteId || '') === inviteId).forEach((quote: any) => {
                releaseLineIfSelected(rfq, quote);
                quote.deleteOne();
            });
            closeFollowUps(rfq, invite._id, { cancel: 'Supplier changed on this RFQ' });
            invite.supplierId = supplier._id;
            invite.supplierName = supplier.supplierName;
            invite.isSupplierApproved = supplier.status === supplierStatus.approved;
            if (contactEmail === undefined) invite.contactEmail = supplier.contactDetails?.email || undefined;
            invite.status = RfqSupplierStatus.NotSent;
            invite.sentAt = undefined;
            invite.repliedAt = undefined;
            invite.declineReason = undefined;
            invite.declineNote = undefined;
        }
        if (Array.isArray(lineKeys)) {
            const validKeys = new Set<string>((rfq.requestedLines || []).map((line: any) => line.itemDetailKey));
            const keys = Array.from(new Set<string>(lineKeys.map(String))).filter((key) => validKeys.has(key));
            if (!keys.length) return res.status(400).json({ success: false, message: "A supplier needs at least one line." });
            invite.lineKeys = keys;
        }
        if (contactEmail !== undefined) invite.contactEmail = String(contactEmail || '').trim() || undefined;
        if (remarks !== undefined) invite.remarks = remarks;
        if (status !== undefined) {
            if (!Object.values(RfqSupplierStatus).includes(status)) return res.status(400).json({ success: false, message: "Unknown status" });
            if (status === RfqSupplierStatus.Sent && invite.status === RfqSupplierStatus.Sent) {
                return res.status(409).json({ success: false, message: "This RFQ is already marked as sent. Refresh to see its current state." });
            }
            if (status === RfqSupplierStatus.Declined && !(RFQ_DECLINE_REASONS as readonly string[]).includes(declineReason)) {
                return res.status(400).json({ success: false, message: "Pick why the supplier declined." });
            }
            invite.status = status;
            if (status === RfqSupplierStatus.Sent) {
                invite.sentAt = new Date();
                if (sentVia) invite.sentVia = sentVia;
                scheduleChase(rfq, invite, employee);
            }
            if (status === RfqSupplierStatus.NotSent) {
                invite.sentAt = undefined;
                closeFollowUps(rfq, invite._id, { cancel: 'Marked as not sent' });
            }
            if (status === RfqSupplierStatus.Declined) {
                invite.repliedAt = new Date();
                invite.declineReason = declineReason;
                invite.declineNote = String(declineNote || '').trim() || undefined;
                closeFollowUps(rfq, invite._id, { done: `Declined: ${declineReason}` });
            } else {
                invite.declineReason = undefined;
                invite.declineNote = undefined;
            }
        }
        touch(rfq, employee);
        await rfq.save();
        return sendRfq(res, rfq, "Supplier updated");
    } catch (error) {
        next(error);
    }
};

/** Drops a supplier and every price it gave; a line it was confirmed on goes back to Pending. */
export const removeSalesRfqSupplier = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const invite = rfq.suppliers.id(req.params.inviteId);
        if (!invite) return res.status(404).json({ success: false, message: "Supplier not found on this RFQ" });

        const inviteId = String(invite._id);
        (rfq.quotes || []).filter((quote: any) => String(quote.inviteId || '') === inviteId).forEach((quote: any) => {
            releaseLineIfSelected(rfq, quote);
            quote.deleteOne();
        });
        closeFollowUps(rfq, invite._id, { cancel: 'Supplier removed from the RFQ' });
        invite.deleteOne();
        touch(rfq, employee);
        await rfq.save();
        return sendRfq(res, rfq, "Supplier removed");
    } catch (error) {
        next(error);
    }
};

/**
 * Records one supplier's reply in one go: the terms it gave (applied to every line it priced) and a
 * price per line. A row with neither a price nor "Unavailable" is left unpriced. Prices it gave
 * before are updated in place, so the import can be re-run. Used by both the grid and the Excel import.
 */
export const submitSalesRfqSupplierReply = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const invite = rfq.suppliers.id(req.params.inviteId);
        if (!invite) return res.status(404).json({ success: false, message: "Supplier not found on this RFQ" });

        const terms = buildTerms(req.body?.terms);
        const prices: any[] = Array.isArray(req.body?.prices) ? req.body.prices : [];
        const inviteId = String(invite._id);
        const asked = new Set<string>(invite.lineKeys || []);
        let priced = 0;

        for (const row of prices) {
            const key = String(row?.itemDetailKey || '');
            const line = (rfq.requestedLines || []).find((l: any) => l.itemDetailKey === key);
            if (!line) continue;
            const unavailable = row.availability === RfqAvailability.Unavailable;
            const hasPrice = row.unitPrice !== undefined && row.unitPrice !== null && row.unitPrice !== '' && toNumber(row.unitPrice, -1) >= 0;
            let quote = (rfq.quotes || []).find((q: any) => String(q.inviteId || '') === inviteId && q.itemDetailKey === key);

            if (!unavailable && !hasPrice) {
                // A cleared row withdraws an earlier price from this supplier.
                if (quote) {
                    releaseLineIfSelected(rfq, quote);
                    quote.deleteOne();
                }
                continue;
            }

            const isNew = !quote;
            if (isNew) {
                quote = {
                    inviteId: invite._id,
                    itemDetailKey: line.itemDetailKey,
                    itemName: line.itemName,
                    detail: line.detail,
                    quantity: line.quantity,
                    productId: line.partNo || undefined,
                    selected: false,
                    createdBy: employee?._id,
                    createdAt: new Date(),
                };
            }
            const error = await fillQuote(quote, {
                supplierId: invite.supplierId ? String(invite.supplierId) : '',
                supplierName: invite.supplierName,
                availability: unavailable ? RfqAvailability.Unavailable : (row.availability || RfqAvailability.Available),
                unitPrice: unavailable ? '' : toNumber(row.unitPrice),
                quantity: row.quantity != null && row.quantity !== '' ? toNumber(row.quantity, line.quantity) : line.quantity,
                leadTimeDays: row.leadTimeDays != null && row.leadTimeDays !== '' ? toNumber(row.leadTimeDays) : '',
                remarks: row.remarks ?? '',
                modelOffered: String(row.modelOffered || '').trim(),
                isAlternative: !!String(row.modelOffered || '').trim() && !!row.isAlternative,
                currency: row.currency || terms.currency || 'QAR',
                // A line's own terms win over the ones given for the whole reply.
                paymentTerms: String(row.paymentTerms || '').trim() || terms.paymentTerms || '',
                etaTerms: String(row.deliveryTerms || '').trim() || terms.deliveryTerms || '',
                validityDate: terms.validityDate ?? '',
                warrantyTerms: terms.warrantyTerms ?? '',
                discountType: row.discountType,
                discountValue: row.discountValue,
                taxPercent: row.taxPercent,
                freightCost: row.freightCost,
            });
            if (error) return res.status(400).json({ success: false, message: `${line.detail}: ${error}` });
            if (quote.availability === RfqAvailability.Unavailable) releaseLineIfSelected(rfq, quote);
            if (isNew) rfq.quotes.push(quote);
            // A supplier may price a line it was not asked for; keep it on its list.
            if (!asked.has(key)) {
                asked.add(key);
                invite.lineKeys.push(key);
            }
            priced++;
        }

        invite.replyTerms = terms;
        if (req.body?.remarks !== undefined) invite.remarks = req.body.remarks;
        if (priced > 0 || req.body?.markReplied) {
            invite.status = RfqSupplierStatus.Replied;
            invite.repliedAt = invite.repliedAt || new Date();
            if (!invite.sentAt) invite.sentAt = invite.repliedAt;
            invite.declineReason = undefined;
            invite.declineNote = undefined;
            closeFollowUps(rfq, invite._id, { done: 'Supplier replied' });
        }
        touch(rfq, employee);
        await rfq.save();
        return sendRfq(res, rfq, priced ? `${priced} price(s) saved for ${invite.supplierName}` : "Reply saved");
    } catch (error) {
        next(error);
    }
};

/** The supplier's quote document (PDF, email), kept once on the supplier rather than per line. */
export const uploadSalesRfqSupplierFiles = async (req: any, res: Response, next: NextFunction) => {
    try {
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const invite = rfq.suppliers.id(req.params.inviteId);
        if (!invite) return res.status(404).json({ success: false, message: "Supplier not found on this RFQ" });
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ success: false, message: "No files uploaded" });

        const uploaded = await Promise.all(files.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path, file.mimetype);
            return { fileName: file.filename, originalname: file.originalname, uploadedAt: new Date() };
        }));
        invite.attachments = [...(invite.attachments || []), ...uploaded];
        await rfq.save();
        return sendRfq(res, rfq, "Files attached");
    } catch (error) {
        next(error);
    }
};

/**
 * Awards many lines at once from the comparison grid (split award: each line can go to a different
 * supplier). `awards: [{ lineKey, quoteId, reason? }]`; a null quoteId reopens that line. A pick that
 * passes over a cheaper price needs a reason, kept on the line.
 */
export const awardSalesRfqLines = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const awards: any[] = Array.isArray(req.body?.awards) ? req.body.awards : [];
        if (!awards.length) return res.status(400).json({ success: false, message: "Nothing to award." });
        const { rates } = await getQarRates();

        for (const award of awards) {
            const line = rfq.requestedLines.find((l: any) => l.itemDetailKey === award?.lineKey);
            if (!line) continue;
            const lineQuotes = rfq.quotes.filter((quote: any) => quote.itemDetailKey === line.itemDetailKey);
            if (!award.quoteId) {
                lineQuotes.forEach((quote: any) => (quote.selected = false));
                line.lineStatus = RfqLineStatus.Pending;
                line.awardReason = undefined;
                continue;
            }
            const chosen = lineQuotes.find((quote: any) => String(quote._id) === String(award.quoteId));
            if (!chosen) return res.status(404).json({ success: false, message: `Price not found for "${line.detail}".` });
            if (chosen.availability === RfqAvailability.Unavailable) {
                return res.status(400).json({ success: false, message: `${chosen.supplierName} marked "${line.detail}" unavailable.` });
            }
            const reason = String(award.reason || '').trim();
            const aboveLowest = isAboveLowest(rfq, chosen, rates);
            if (aboveLowest && !reason) {
                return res.status(400).json({ success: false, reasonRequired: true, message: `"${line.detail}" is not going to the lowest price. Say why.` });
            }
            lineQuotes.forEach((quote: any) => (quote.selected = String(quote._id) === String(award.quoteId)));
            line.lineStatus = RfqLineStatus.Confirmed;
            line.awardReason = aboveLowest ? reason : undefined;
        }
        touch(rfq, employee);
        await rfq.save();
        return sendRfq(res, rfq, "Award saved");
    } catch (error) {
        next(error);
    }
};

// --- enquiry-wide comparison and award ------------------------------------------
// One enquiry fans out into one RFQ per supplier, so the same product sits on several RFQs. These
// handlers look at all of them at once: a product is won by one supplier and lost on the others.

const normText = (value: any) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The live RFQs of an enquiry, oldest first so columns keep their order. */
const loadEnquiryRfqs = (enquiryId: string) =>
    Rfq.find({ rfqType: RfqType.Sales, isDeleted: false, enquiryId: new ObjectId(enquiryId), status: { $ne: RfqStatus.Cancelled } })
        .sort({ createdAt: 1 });

const rfqSupplierName = (rfq: any) => (rfq.suppliers || []).map((s: any) => s.supplierName).filter(Boolean).join(', ') || rfq.rfqNo;

/**
 * Groups the lines of sibling RFQs into products. Lines raised together share their key; lines raised
 * later are matched by catalogue product, then by description.
 */
const groupEnquiryLines = (rfqs: any[]) => {
    const rows: { key: string; members: { rfq: any; line: any }[] }[] = [];
    const index = new Map<string, any>();
    rfqs.forEach((rfq) => (rfq.requestedLines || []).forEach((line: any) => {
        const keys = [`k:${line.itemDetailKey}`, line.partNo ? `p:${line.partNo}` : '', `d:${normText(line.itemName)}|${normText(line.detail)}`].filter(Boolean);
        let row = keys.map((k) => index.get(k)).find(Boolean);
        if (!row || row.members.some((m: any) => String(m.rfq._id) === String(rfq._id))) {
            row = { key: line.itemDetailKey, members: [] };
            rows.push(row);
        }
        row.members.push({ rfq, line });
        keys.forEach((k) => { if (!index.has(k)) index.set(k, row); });
    }));
    return rows;
};

const quoteFor = (rfq: any, line: any) => (rfq.quotes || [])
    .filter((q: any) => q.itemDetailKey === line.itemDetailKey)
    .sort((a: any, b: any) => Number(b.selected) - Number(a.selected) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

/**
 * The comparison matrix for an enquiry: one row per product, one column per supplier RFQ, each cell
 * the price that supplier gave. Rows say whether the product is still open or who won it.
 */
export const getEnquiryRfqComparison = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enquiryId } = req.params;
        if (!ObjectId.isValid(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry" });
        const enquiry: any = await Enquiry.findById(enquiryId, { enquiryId: 1, title: 1, status: 1, client: 1 }).populate('client', 'companyName').lean();
        if (!enquiry || enquiry.isDeleted) return res.status(404).json({ success: false, message: "Enquiry not found" });
        const rfqs: any[] = await loadEnquiryRfqs(enquiryId).lean();
        const { rates } = await getQarRates();

        const grouped = groupEnquiryLines(rfqs);
        const productIds = [...new Set(grouped.map((r) => r.members[0].line.partNo).filter((id: any) => id && ObjectId.isValid(String(id))).map(String))];
        const products: any[] = productIds.length ? await Product.find({ _id: { $in: productIds } }).select('itemCode partNo').lean() : [];
        const productById = new Map(products.map((p) => [String(p._id), p]));

        const rows = grouped.map((row) => {
            const first = row.members[0].line;
            const product = productById.get(String(first.partNo));
            const cells = row.members.map(({ rfq, line }) => {
                const quote = quoteFor(rfq, line);
                const unit = quote && quote.availability !== RfqAvailability.Unavailable ? unitLandedCost(quote) : null;
                return {
                    rfqId: rfq._id,
                    lineKey: line.itemDetailKey,
                    lineStatus: line.lineStatus || RfqLineStatus.Pending,
                    awardReason: line.awardReason,
                    quote: quote ? {
                        _id: quote._id,
                        unitPrice: quote.unitPrice,
                        unitLanded: unit,
                        unitLandedQar: unit != null ? toQar(unit, quote, rates) : null,
                        currency: quote.currency || 'QAR',
                        leadTimeDays: quote.leadTimeDays,
                        availability: quote.availability,
                        quantity: quote.quantity,
                        remarks: quote.remarks,
                        selected: !!quote.selected,
                    } : null,
                };
            });
            const priced = cells.filter((c) => c.quote?.unitLandedQar != null);
            const lowest = priced.sort((a, b) => a.quote!.unitLandedQar! - b.quote!.unitLandedQar!)[0];
            const won = cells.find((c) => c.lineStatus === RfqLineStatus.Confirmed);
            const status = won ? 'awarded'
                : cells.every((c) => c.lineStatus === RfqLineStatus.Unavailable) ? 'unavailable'
                    : cells.some((c) => c.quote && c.quote.availability !== RfqAvailability.Unavailable) ? 'open' : 'waiting';
            return {
                key: row.key,
                itemName: first.itemName || 'Items',
                detail: first.detail,
                quantity: first.quantity,
                uom: first.uom,
                partNo: product?.partNo || '',
                itemCode: product?.itemCode || '',
                status,
                awardedRfqId: won?.rfqId ?? null,
                lowestRfqId: lowest?.rfqId ?? null,
                cells,
            };
        });

        const count = (s: string) => rows.filter((r) => r.status === s).length;
        return res.status(200).json({
            success: true,
            data: {
                enquiry: { _id: enquiry._id, enquiryId: enquiry.enquiryId, title: enquiry.title, status: enquiry.status, client: enquiry.client },
                rfqs: rfqs.map((rfq) => ({
                    _id: rfq._id,
                    rfqNo: rfq.rfqNo,
                    status: rfq.status,
                    supplierName: rfqSupplierName(rfq),
                    supplierStatus: rfq.suppliers?.[0]?.status,
                    deadline: rfq.deadline,
                    quotationId: rfq.quotationId,
                    lineCount: (rfq.requestedLines || []).length,
                    wonCount: (rfq.requestedLines || []).filter((l: any) => l.lineStatus === RfqLineStatus.Confirmed).length,
                })),
                rows,
                coverage: { total: rows.length, awarded: count('awarded'), unavailable: count('unavailable'), open: count('open') + count('waiting') },
                quotationId: rfqs.find((rfq) => rfq.quotationId)?.quotationId ?? null,
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Awards products across an enquiry's RFQs. `awards: [{ rfqId, lineKey, quoteId, reason? }]`: the
 * chosen line is Confirmed and the same product on every sibling RFQ becomes Lost. A null quoteId
 * reopens the product on all of them. RFQs left with nothing won close; reopening brings them back.
 * Refused once a quotation was made from the enquiry's RFQs.
 */
export const awardEnquiryRfqLines = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const { enquiryId } = req.params;
        if (!ObjectId.isValid(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry" });
        const awards: any[] = Array.isArray(req.body?.awards) ? req.body.awards : [];
        if (!awards.length) return res.status(400).json({ success: false, message: "Nothing to award." });

        const rfqs: any[] = await loadEnquiryRfqs(enquiryId);
        if (rfqs.some((rfq) => rfq.quotationId)) {
            return res.status(409).json({ success: false, message: "A quotation was already made from these RFQs, so awards can no longer change." });
        }
        const rows = groupEnquiryLines(rfqs);
        const { rates } = await getQarRates();
        const changed = new Set<any>();

        for (const award of awards) {
            const row = rows.find((r) => r.members.some((m) => String(m.rfq._id) === String(award?.rfqId) && m.line.itemDetailKey === award?.lineKey));
            if (!row) return res.status(404).json({ success: false, message: "That product is not on this enquiry's RFQs." });
            const member = row.members.find((m) => String(m.rfq._id) === String(award.rfqId))!;

            if (!award.quoteId) {
                row.members.forEach(({ rfq, line }) => {
                    if (line.lineStatus === RfqLineStatus.Unavailable) return;
                    (rfq.quotes || []).filter((q: any) => q.itemDetailKey === line.itemDetailKey).forEach((q: any) => (q.selected = false));
                    line.lineStatus = RfqLineStatus.Pending;
                    line.awardReason = undefined;
                    changed.add(rfq);
                });
                continue;
            }

            const chosen = (member.rfq.quotes || []).find((q: any) => String(q._id) === String(award.quoteId) && q.itemDetailKey === member.line.itemDetailKey);
            if (!chosen) return res.status(404).json({ success: false, message: `Price not found for "${member.line.detail}".` });
            if (chosen.availability === RfqAvailability.Unavailable) {
                return res.status(400).json({ success: false, message: `${chosen.supplierName || rfqSupplierName(member.rfq)} marked "${member.line.detail}" unavailable.` });
            }
            const chosenQar = toQar(unitLandedCost(chosen), chosen, rates);
            const aboveLowest = chosenQar != null && row.members.some(({ rfq, line }) => {
                if (rfq === member.rfq) return false;
                const quote = quoteFor(rfq, line);
                if (!quote || quote.availability === RfqAvailability.Unavailable) return false;
                const qar = toQar(unitLandedCost(quote), quote, rates);
                return qar != null && qar < chosenQar - 0.005;
            }) || isAboveLowest(member.rfq, chosen, rates);
            const reason = String(award.reason || '').trim();
            if (aboveLowest && !reason) {
                return res.status(400).json({ success: false, reasonRequired: true, message: `"${member.line.detail}" is not going to the lowest price. Say why.` });
            }

            row.members.forEach(({ rfq, line }) => {
                const lineQuotes = (rfq.quotes || []).filter((q: any) => q.itemDetailKey === line.itemDetailKey);
                if (rfq === member.rfq) {
                    lineQuotes.forEach((q: any) => (q.selected = String(q._id) === String(chosen._id)));
                    line.lineStatus = RfqLineStatus.Confirmed;
                    line.awardReason = aboveLowest ? reason : undefined;
                } else {
                    lineQuotes.forEach((q: any) => (q.selected = false));
                    if (line.lineStatus !== RfqLineStatus.Unavailable) line.lineStatus = RfqLineStatus.Lost;
                    line.awardReason = undefined;
                }
                changed.add(rfq);
            });
        }

        for (const rfq of changed) {
            // An RFQ closed because it lost everything comes back when one of its products reopens.
            if (rfq.status === RfqStatus.Closed) rfq.status = RfqStatus.Quoted;
            touch(rfq, employee);
            if (rfq.status === RfqStatus.Closed) closeFollowUps(rfq, undefined, { cancel: 'Products awarded to other suppliers' });
            if (rfq.status !== RfqStatus.Awarded) { rfq.awardedAt = undefined; rfq.awardedBy = undefined; }
            await rfq.save();
        }
        // Awarding is real work on the enquiry; a still-new one moves on so it can be converted to a quotation.
        if (awards.some((a) => a?.quoteId)) {
            await Enquiry.updateOne({ _id: enquiryId, status: { $in: ['new', 'New'] } }, { $set: { status: 'in progress' } });
        }
        return res.status(200).json({ success: true, message: "Award saved", data: { changed: changed.size } });
    } catch (error) {
        next(error);
    }
};

/**
 * The quotation seed for a whole enquiry: every awarded product from every supplier RFQ, grouped by
 * item name, costs brought into the enquiry's quote currency. Refused while any product is still open,
 * unless `partial` is set (the presale estimation takes what is awarded so far and says what was left out).
 */
export const prepareQuotationFromEnquiryRfqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enquiryId } = req.params;
        if (!ObjectId.isValid(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry" });
        const rfqs: any[] = await loadEnquiryRfqs(enquiryId).lean();
        if (!rfqs.length) return res.status(404).json({ success: false, message: "This enquiry has no supplier RFQs." });
        if (rfqs.some((rfq) => rfq.quotationId)) return res.status(409).json({ success: false, message: "A quotation was already made from these RFQs." });

        const rows = groupEnquiryLines(rfqs);
        const partial = req.query.partial === '1' || req.body?.partial === true;
        const open = rows.filter((row) => !row.members.some((m) => m.line.lineStatus === RfqLineStatus.Confirmed)
            && !row.members.every((m) => m.line.lineStatus === RfqLineStatus.Unavailable));
        if (open.length && !partial) {
            return res.status(409).json({ success: false, message: `${open.length} product(s) still open. Award them or mark them unavailable first.` });
        }

        const currency = String(rfqs[0].requestedTerms?.currency || 'QAR').toUpperCase();
        const { rates } = await getQarRates();
        const unconverted = new Set<string>();
        const costIn = (quote: any): number => {
            const unit = unitLandedCost(quote);
            const from = String(quote.currency || 'QAR').toUpperCase();
            if (from === currency) return unit;
            const qar = toQar(unit, quote, rates);
            const target = currency === 'QAR' ? 1 : rates[currency];
            if (qar == null || !target) { unconverted.add(from); return unit; }
            return Number((qar / target).toFixed(2));
        };

        // The quotation lines show each product's code and part no, so look them up once.
        const productIds = rows.flatMap((row) => row.members.map((m) => m.line.partNo)).filter((id) => id && ObjectId.isValid(String(id)));
        const productCodes = new Map<string, { itemCode?: string; partNo?: string }>();
        if (productIds.length) {
            const products: any[] = await Product.find({ _id: { $in: productIds } }).select('itemCode partNo').lean();
            products.forEach((p) => productCodes.set(String(p._id), { itemCode: p.itemCode, partNo: p.partNo }));
        }

        const items = new Map<string, any>();
        let sourceRfqId: any = null;
        rows.forEach((row) => {
            const won = row.members.find((m) => m.line.lineStatus === RfqLineStatus.Confirmed);
            if (!won) return;
            const quote = (won.rfq.quotes || []).find((q: any) => q.itemDetailKey === won.line.itemDetailKey && q.selected);
            if (!quote) return;
            sourceRfqId = sourceRfqId || won.rfq._id;
            const name = won.line.itemName || 'Items';
            if (!items.has(name)) items.set(name, { itemName: name, isOptional: false, includeInTotal: false, itemDetails: [] });
            items.get(name).itemDetails.push({
                productId: won.line.partNo || undefined,
                itemCode: productCodes.get(String(won.line.partNo))?.itemCode || '',
                partNo: productCodes.get(String(won.line.partNo))?.partNo || '',
                detail: won.line.detail,
                quantity: won.line.quantity,
                unitCost: costIn(quote),
                unitSellingPrice: null,
                availability: quote.leadTimeDays != null ? `${quote.leadTimeDays} days` : (quote.etaTerms || 'Available'),
                supplierId: quote.supplierId || undefined,
                uom: won.line.uom || '',
            });
        });
        if (!items.size) return res.status(409).json({ success: false, message: "No product has an awarded price, so there is nothing to quote." });

        return res.status(200).json({
            success: true,
            data: {
                rfqId: sourceRfqId,
                rfqNo: rfqs.filter((rfq) => (rfq.requestedLines || []).some((l: any) => l.lineStatus === RfqLineStatus.Confirmed)).map((rfq) => rfq.rfqNo).join(', '),
                currency,
                warnings: [
                    ...(unconverted.size ? [`No exchange rate for ${[...unconverted].join(', ')}; those costs were copied unconverted.`] : []),
                    ...(open.length ? [`${open.length} product(s) are not awarded yet and were left out.`] : []),
                ],
                optionalItems: [{ items: Array.from(items.values()), totalDiscount: 0 }],
            }
        });
    } catch (error) {
        next(error);
    }
};

export const cancelSalesRfq = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        rfq.status = RfqStatus.Cancelled;
        if (req.body?.reason) rfq.notes = [rfq.notes, `Cancelled: ${req.body.reason}`].filter(Boolean).join('\n');
        closeFollowUps(rfq, undefined, { cancel: 'RFQ cancelled' });
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, "RFQ cancelled");
    } catch (error) {
        next(error);
    }
};

/**
 * Builds the quotation seed from the confirmed prices: one option, items grouped by item name,
 * unit cost = the supplier's per-unit landed cost. Selling prices are left for sales to set.
 * Unavailable lines are left out. Refused while any line is still Pending.
 */
export const prepareQuotationFromSalesRfq = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rfq: any = await populateSalesRfq(Rfq.findOne({ _id: req.params.id, rfqType: RfqType.Sales, isDeleted: false }));
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (rfq.status === RfqStatus.Cancelled) return lockedResponse(res);
        if (rfq.quotationId) {
            return res.status(409).json({ success: false, message: `Quotation ${rfq.quotationId.quoteId || ''} was already created from this RFQ.`.replace(/\s+/g, ' ') });
        }

        const pending = (rfq.requestedLines || []).filter((line: any) => !line.lineStatus || line.lineStatus === RfqLineStatus.Pending);
        if (pending.length) {
            return res.status(409).json({ success: false, message: `${pending.length} line(s) still pending. Confirm a price or mark them unavailable first.` });
        }

        // Suppliers may quote in different currencies; every cost is brought into the one the customer is quoted in.
        const currency = String(rfq.requestedTerms?.currency || 'QAR').toUpperCase();
        const { rates } = await getQarRates();
        const unconverted = new Set<string>();
        const costIn = (quote: any): number => {
            const unit = unitLandedCost(quote);
            const from = String(quote.currency || 'QAR').toUpperCase();
            if (from === currency) return unit;
            const qar = toQar(unit, quote, rates);
            const target = rates[currency];
            if (qar == null || !target) {
                unconverted.add(from);
                return unit;
            }
            return Number((qar / target).toFixed(2));
        };

        const items = new Map<string, any>();
        (rfq.requestedLines || []).forEach((line: any) => {
            if (line.lineStatus !== RfqLineStatus.Confirmed) return;
            const quote = (rfq.quotes || []).find((q: any) => q.itemDetailKey === line.itemDetailKey && q.selected);
            if (!quote) return;
            const name = line.itemName || 'Items';
            if (!items.has(name)) items.set(name, { itemName: name, isOptional: false, includeInTotal: false, itemDetails: [] });
            items.get(name).itemDetails.push({
                productId: line.partNo || undefined,
                detail: line.detail,
                quantity: line.quantity,
                unitCost: costIn(quote),
                unitSellingPrice: null,
                availability: quote.leadTimeDays != null ? `${quote.leadTimeDays} days` : (quote.etaTerms || 'Available'),
                supplierId: quote.supplierId || undefined,
                uom: line.uom || '',
            });
        });
        if (!items.size) {
            return res.status(409).json({ success: false, message: "No line has a confirmed price, so there is nothing to quote." });
        }

        return res.status(200).json({
            success: true,
            data: {
                rfqId: rfq._id,
                rfqNo: rfq.rfqNo,
                currency,
                warnings: unconverted.size ? [`No exchange rate for ${[...unconverted].join(', ')}; those costs were copied unconverted.`] : [],
                enquiry: rfq.enquiryId,
                optionalItems: [{ items: Array.from(items.values()), totalDiscount: 0 }],
            }
        });
    } catch (error) {
        next(error);
    }
};

/** Supplier picker for RFQs: unblocked suppliers whose name matches. Approval is not required for now. */
export const searchSalesRfqSuppliers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const search = String((req.query as any)?.search || '').trim();
        const match: any = { isDeleted: { $ne: true }, isBlocked: { $ne: true } };
        if (search) match.supplierName = { $regex: escapeRegex(search), $options: 'i' };
        const suppliers: any[] = await Supplier.find(match, { supplierName: 1, status: 1, 'contactDetails.email': 1 })
            .collation({ locale: 'en', strength: 2 })
            .sort({ supplierName: 1 })
            .limit(search ? 20 : 200)
            .lean();
        const data = suppliers.map((s) => ({
            supplierId: String(s._id),
            supplierName: s.supplierName,
            contactEmail: s.contactDetails?.email || '',
            isSupplierApproved: s.status === supplierStatus.approved,
        }));
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/** QAR per one unit of each currency, for showing supplier prices in the currency the user picks. */
export const getSalesRfqFxRates = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const { rates, asOf } = await getQarRates();
        return res.status(200).json({ success: true, data: { base: 'QAR', rates, asOf } });
    } catch (error) {
        next(error);
    }
};

/**
 * Other open requests to the same suppliers, so a sales person can see that a supplier was already asked
 * this week (for the same product, or for other products) and bundle instead of sending twice. Covers
 * requests not yet sent or still awaiting a reply, plus any raised in the last seven days.
 * Body: `{ supplierIds, excludeRfqId?, lines?: [{ partNo?, detail? }] }`; `overlap` lists the asked
 * lines that match one of `lines` by product or description.
 */
export const getSalesRfqSupplierActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ids = (Array.isArray(req.body?.supplierIds) ? req.body.supplierIds : [])
            .filter((id: any) => ObjectId.isValid(id)).slice(0, 50).map((id: string) => new ObjectId(id));
        if (!ids.length) return res.status(200).json({ success: true, data: [] });
        const exclude = ObjectId.isValid(req.body?.excludeRfqId) ? new ObjectId(req.body.excludeRfqId) : null;
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const wanted = Array.isArray(req.body?.lines) ? req.body.lines : [];
        const wantedParts = new Set<string>(wanted.map((l: any) => String(l?.partNo || '')).filter((v: string) => ObjectId.isValid(v)));
        const wantedDetails = new Set<string>(wanted.map((l: any) => String(l?.detail || '').trim().toLowerCase()).filter(Boolean));

        const query: any = {
            rfqType: RfqType.Sales, isDeleted: false, status: { $nin: LOCKED_STATUSES },
            'suppliers.supplierId': { $in: ids },
        };
        if (exclude) query._id = { $ne: exclude };
        const rfqs: any[] = await Rfq.find(query)
            .select('rfqNo enquiryId customerId status createdAt requestedLines suppliers')
            .populate('enquiryId', 'enquiryId')
            .populate('customerId', 'companyName')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        const idSet = new Set(ids.map((id: any) => String(id)));
        const data: any[] = [];
        rfqs.forEach((rfq) => {
            (rfq.suppliers || []).forEach((invite: any) => {
                if (!invite.supplierId || !idSet.has(String(invite.supplierId))) return;
                const waiting = [RfqSupplierStatus.NotSent, RfqSupplierStatus.Sent].includes(invite.status);
                const recent = new Date(invite.sentAt || rfq.createdAt) >= weekAgo;
                if (!waiting && !recent) return;
                const keys = new Set<string>(invite.lineKeys || []);
                const asked = (rfq.requestedLines || []).filter((line: any) => keys.has(line.itemDetailKey));
                const overlap = asked
                    .filter((line: any) => (line.partNo && wantedParts.has(String(line.partNo))) || wantedDetails.has(String(line.detail || '').trim().toLowerCase()))
                    .map((line: any) => line.detail);
                data.push({
                    supplierId: String(invite.supplierId),
                    supplierName: invite.supplierName,
                    rfqId: rfq._id,
                    rfqNo: rfq.rfqNo,
                    enquiryNo: rfq.enquiryId?.enquiryId || '',
                    customer: rfq.customerId?.companyName || '',
                    status: invite.status,
                    sentAt: invite.sentAt || null,
                    createdAt: rfq.createdAt,
                    lineCount: asked.length,
                    overlap,
                    thisWeek: recent,
                });
            });
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/** Schedules (or moves) a chase on the RFQ, for one supplier when `inviteId` is given. */
export const scheduleSalesRfqFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);

        const dueDate = new Date(req.body?.dueDate);
        if (isNaN(dueDate.getTime())) return res.status(400).json({ success: false, message: "Pick the follow-up date." });
        const inviteId = req.body?.inviteId ? String(req.body.inviteId) : '';
        const invite = inviteId ? rfq.suppliers.id(inviteId) : null;
        if (inviteId && !invite) return res.status(404).json({ success: false, message: "Supplier not found on this RFQ" });
        const note = String(req.body?.note || '').trim() || undefined;

        const open = openFollowUpsFor(rfq, invite ? invite._id : '')[0];
        if (open) {
            open.dueDate = dueDate;
            if (note !== undefined) open.note = note;
            open.auto = false;
        } else {
            rfq.followUps.push({
                inviteId: invite?._id,
                supplierName: invite?.supplierName,
                status: FOLLOW_UP_OPEN,
                dueDate,
                note,
                createdBy: employee?._id,
                createdByName: employeeName(employee),
                createdAt: new Date(),
            });
        }
        syncNextFollowUp(rfq);
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, open ? "Follow-up moved" : "Follow-up scheduled");
    } catch (error) {
        next(error);
    }
};

/**
 * Closes one follow-up. `action: 'complete'` records what happened (`outcome`, `note`, `date`) and may
 * book the next one (`nextFollowUpDate`); `action: 'cancel'` drops it with a `reason`.
 */
export const closeSalesRfqFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (LOCKED_STATUSES.includes(rfq.status)) return lockedResponse(res);
        const followUp = rfq.followUps.id(req.params.followUpId);
        if (!followUp) return res.status(404).json({ success: false, message: "Follow-up not found" });
        if (followUp.status !== FOLLOW_UP_OPEN) return res.status(409).json({ success: false, message: "This follow-up is already closed." });

        const { action, outcome, note, date, nextFollowUpDate, reason } = req.body || {};
        if (action === 'complete') {
            if (!String(outcome || '').trim()) return res.status(400).json({ success: false, message: "Say what happened." });
            const done = date ? new Date(date) : new Date();
            followUp.status = 'done';
            followUp.outcome = String(outcome).trim();
            if (note) followUp.note = [followUp.note, String(note).trim()].filter(Boolean).join('\n');
            followUp.completedAt = isNaN(done.getTime()) ? new Date() : done;
            const nextDue = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
            if (nextDue && !isNaN(nextDue.getTime())) {
                rfq.followUps.push({
                    inviteId: followUp.inviteId,
                    supplierName: followUp.supplierName,
                    status: FOLLOW_UP_OPEN,
                    dueDate: nextDue,
                    createdBy: employee?._id,
                    createdByName: employeeName(employee),
                    createdAt: new Date(),
                });
            }
        } else if (action === 'cancel') {
            followUp.status = 'cancelled';
            followUp.cancelReason = String(reason || '').trim() || 'Cancelled';
            followUp.completedAt = new Date();
        } else {
            return res.status(400).json({ success: false, message: "Nothing to change." });
        }
        syncNextFollowUp(rfq);
        rfq.updatedBy = employee?._id;
        rfq.updatedAt = new Date();
        await rfq.save();
        return sendRfq(res, rfq, action === 'complete' ? "Follow-up logged" : "Follow-up cancelled");
    } catch (error) {
        next(error);
    }
};

/** Last prices for an item across past RFQs (sales and procurement), newest first. */
export const getRfqPriceHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { detail, partNo, supplierId } = req.query as any;
        if (!detail && !partNo) return res.status(200).json({ success: true, data: [] });
        const quoteMatch: any = { 'quotes.availability': { $ne: RfqAvailability.Unavailable } };
        if (detail) quoteMatch['quotes.detail'] = { $regex: `^${String(detail).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
        if (supplierId && ObjectId.isValid(supplierId)) quoteMatch['quotes.supplierId'] = new ObjectId(supplierId);

        const pipeline: any[] = [{ $match: { isDeleted: false } }];
        if (partNo && ObjectId.isValid(partNo)) {
            pipeline.push({ $match: { 'requestedLines.partNo': new ObjectId(partNo) } });
        }
        pipeline.push(
            { $unwind: '$quotes' },
            { $match: quoteMatch },
            { $sort: { 'quotes.createdAt': -1 } },
            { $limit: 10 },
            {
                $project: {
                    _id: 0, rfqId: '$_id', rfqNo: 1, rfqType: 1,
                    supplierId: '$quotes.supplierId', supplierName: '$quotes.supplierName',
                    unitPrice: '$quotes.unitPrice', currency: '$quotes.currency', leadTimeDays: '$quotes.leadTimeDays',
                    selected: '$quotes.selected', date: '$quotes.createdAt'
                }
            }
        );
        const data = await Rfq.aggregate(pipeline);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/**
 * Supplier-product history: one row per (supplier, product) built from past quotes, newest data first.
 * Pass `productId` to see who supplies a product, or `supplierId` to see what a supplier has quoted.
 */
export const getSupplierProductHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId, supplierId } = req.query as any;
        const match: any = { 'quotes.productId': { $ne: null }, 'quotes.availability': { $ne: RfqAvailability.Unavailable } };
        if (productId && ObjectId.isValid(productId)) match['quotes.productId'] = new ObjectId(productId);
        else if (!supplierId) return res.status(200).json({ success: true, data: [] });
        if (supplierId && ObjectId.isValid(supplierId)) match['quotes.supplierId'] = new ObjectId(supplierId);

        const data = await Rfq.aggregate([
            { $match: { isDeleted: false, rfqType: RfqType.Sales } },
            { $unwind: '$quotes' },
            { $match: match },
            { $sort: { 'quotes.createdAt': -1 } },
            {
                $group: {
                    _id: { supplierId: '$quotes.supplierId', productId: '$quotes.productId' },
                    supplierName: { $first: '$quotes.supplierName' },
                    detail: { $first: '$quotes.detail' },
                    lastPrice: { $first: '$quotes.unitPrice' },
                    currency: { $first: '$quotes.currency' },
                    leadTimeDays: { $first: '$quotes.leadTimeDays' },
                    brandOffered: { $first: '$quotes.brandOffered' },
                    moq: { $first: '$quotes.moq' },
                    lastQuotedAt: { $first: '$quotes.createdAt' },
                    lastRfqNo: { $first: '$rfqNo' },
                    lowestPrice: { $min: '$quotes.unitPrice' },
                    timesQuoted: { $sum: 1 },
                    timesSelected: { $sum: { $cond: ['$quotes.selected', 1, 0] } },
                },
            },
            {
                $lookup: { from: 'products', localField: '_id.productId', foreignField: '_id', as: 'product' },
            },
            {
                $project: {
                    _id: 0, supplierId: '$_id.supplierId', productId: '$_id.productId',
                    supplierName: 1, detail: 1, lastPrice: 1, currency: 1, leadTimeDays: 1, brandOffered: 1, moq: 1,
                    lastQuotedAt: 1, lastRfqNo: 1, lowestPrice: 1, timesQuoted: 1, timesSelected: 1,
                    partNo: { $arrayElemAt: ['$product.partNo', 0] },
                    productName: { $arrayElemAt: ['$product.productDescription', 0] },
                },
            },
            { $sort: { timesSelected: -1, lastQuotedAt: -1 } },
            { $limit: 200 },
        ]);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/**
 * Stock position for each RFQ line. A line matches a catalogue product by id, part no, item code or
 * description (case-insensitive). Available = stock entries less active blocks and reservations.
 * Suppliers to ask when it is short: the product's default vendor, then the suppliers it was bought
 * from before, newest first. Only approved, unblocked suppliers are suggested.
 */
export const checkSalesRfqStock = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lines: any[] = Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 500) : [];
        const terms = [...new Set(lines.flatMap((l) => [l.partNo, l.itemName, l.detail])
            .map((v) => String(v || '').trim()).filter(Boolean))];
        const idTerms = terms.filter((v) => ObjectId.isValid(v)).map((v) => new ObjectId(v));
        const products: any[] = terms.length
            ? await Product.find({
                isDeleted: { $ne: true },
                $or: [
                    { _id: { $in: idTerms } },
                    { partNo: { $in: terms } },
                    { 'aliases.value': { $in: terms } },
                    { itemCode: { $in: terms } },
                    { productDescription: { $in: terms } },
                ],
            }).select('partNo aliases itemCode productDescription defaultVendor unitOfMeasure').collation({ locale: 'en', strength: 2 }).lean()
            : [];

        const byKey = new Map<string, any>();
        products.forEach((p) => {
            [p._id?.toString(), p.partNo, ...(p.aliases ?? []).map((a: any) => a.value), p.itemCode, p.productDescription]
                .map((v) => String(v || '').trim().toLowerCase())
                .filter(Boolean)
                .forEach((k) => { if (!byKey.has(k)) byKey.set(k, p); });
        });

        const productIds = products.map((p) => p._id);
        const now = new Date();
        const entries: any[] = productIds.length
            ? await StockEntry.find({ partNo: { $in: productIds }, isDeleted: { $ne: true }, isQuarantined: { $ne: true } })
                .select('partNo quantity supplierName unitCost dateOfPurchase')
                .sort({ dateOfPurchase: -1 })
                .lean()
            : [];
        const blocks: any[] = entries.length
            ? await StockBlock.find({ stockEntryId: { $in: entries.map((e) => e._id) }, isDeleted: { $ne: true }, toDate: { $gte: now } })
                .select('stockEntryId quantity').lean()
            : [];
        const blockedByEntry = new Map<string, number>();
        blocks.forEach((b: any) => {
            const id = b.stockEntryId?.toString();
            blockedByEntry.set(id, (blockedByEntry.get(id) || 0) + (b.quantity || 0));
        });
        const onHandByProduct = new Map<string, number>();
        // What the stock on hand cost us: the unit cost of the newest batch that still has free quantity.
        const stockCostByProduct = new Map<string, { unitCost: number | null; date: Date | null }>();
        entries.forEach((e: any) => {
            const id = String(e.partNo);
            const free = Math.max(0, (e.quantity || 0) - (blockedByEntry.get(e._id.toString()) || 0));
            onHandByProduct.set(id, (onHandByProduct.get(id) || 0) + free);
            if (free > 0 && !stockCostByProduct.has(id)) {
                stockCostByProduct.set(id, { unitCost: e.unitCost ?? null, date: e.dateOfPurchase ?? null });
            }
        });
        const reserved: any[] = productIds.length
            ? await StockReservation.aggregate([
                { $match: { ...getActiveReservationFilter(now), product: { $in: productIds } } },
                { $group: { _id: '$product', quantity: { $sum: '$quantity' } } },
            ])
            : [];
        const reservedByProduct = new Map<string, number>(reserved.map((r: any) => [r._id.toString(), r.quantity || 0]));

        const supplierIds = new Set<string>();
        products.forEach((p) => p.defaultVendor && supplierIds.add(String(p.defaultVendor)));
        entries.forEach((e) => e.supplierName && supplierIds.add(String(e.supplierName)));
        const suppliers: any[] = await Supplier.find({
            _id: { $in: [...supplierIds].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) },
        }).select('supplierName isBlocked status contactDetails.email').lean();
        const suppliersById = new Map<string, any>(suppliers.map((s: any) => [s._id.toString(), s]));

        const suppliersFor = (product: any) => {
            const list: any[] = [];
            const seen = new Set<string>();
            const add = (id: string, source: string, unitCost?: number, date?: Date) => {
                const s = suppliersById.get(id);
                // Only approved suppliers can be asked, so the others are not suggested either.
                if (!s || s.isBlocked || s.status !== supplierStatus.approved || seen.has(id)) return;
                seen.add(id);
                list.push({
                    supplierId: id,
                    supplierName: s.supplierName,
                    contactEmail: s.contactDetails?.email || '',
                    source,
                    lastUnitCost: unitCost ?? null,
                    lastDate: date ?? null,
                });
            };
            if (product.defaultVendor) add(String(product.defaultVendor), 'Default vendor');
            entries
                .filter((e) => String(e.partNo) === String(product._id))
                .forEach((e) => add(String(e.supplierName), 'Bought before', e.unitCost, e.dateOfPurchase));
            return list;
        };

        const data = lines.map((line) => {
            const product = [line.partNo, line.itemName, line.detail]
                .map((v) => String(v || '').trim().toLowerCase())
                .filter(Boolean)
                .map((k) => byKey.get(k))
                .find(Boolean);
            if (!product) return { itemDetailKey: line.itemDetailKey, matched: false, requested: Number(line.quantity) || 0, available: null, inStock: false, suppliers: [] };
            const pid = String(product._id);
            const available = Math.max(0, (onHandByProduct.get(pid) || 0) - (reservedByProduct.get(pid) || 0));
            const requested = Number(line.quantity) || 0;
            return {
                itemDetailKey: line.itemDetailKey,
                matched: true,
                productId: pid,
                partNo: product.partNo,
                itemCode: product.itemCode,
                uom: product.unitOfMeasure || '',
                requested,
                available,
                inStock: available >= requested,
                stockUnitCost: stockCostByProduct.get(pid)?.unitCost ?? null,
                stockCostDate: stockCostByProduct.get(pid)?.date ?? null,
                suppliers: suppliersFor(product),
            };
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/** Called by the quotation save: links the quote back and closes the RFQ and its chases. Never blocks the save. */
export const linkSalesRfqToQuotation = async (rfqId: any, quotationId: any, employeeId: any) => {
    try {
        if (!rfqId || !ObjectId.isValid(rfqId)) return;
        const rfq: any = await Rfq.findOne({ _id: rfqId, rfqType: RfqType.Sales, isDeleted: false, quotationId: { $exists: false } });
        if (!rfq) return;
        rfq.quotationId = quotationId;
        rfq.status = RfqStatus.Closed;
        closeFollowUps(rfq, undefined, { cancel: 'Quotation created' });
        rfq.updatedBy = employeeId;
        rfq.updatedAt = new Date();
        await rfq.save();
        // The quotation covers the whole enquiry, so its other supplier RFQs are done too.
        if (rfq.enquiryId) {
            const siblings: any[] = await Rfq.find({ rfqType: RfqType.Sales, isDeleted: false, enquiryId: rfq.enquiryId, _id: { $ne: rfq._id }, status: { $ne: RfqStatus.Cancelled }, quotationId: { $exists: false } });
            for (const sibling of siblings) {
                sibling.quotationId = quotationId;
                sibling.status = RfqStatus.Closed;
                closeFollowUps(sibling, undefined, { cancel: 'Quotation created' });
                sibling.updatedBy = employeeId;
                sibling.updatedAt = new Date();
                await sibling.save();
            }
        }
    } catch (error) {
        console.error('Failed to link RFQ to quotation:', error);
    }
};
