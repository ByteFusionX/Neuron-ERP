import { NextFunction, Request, Response } from "express";
import Rfq, { RFQ_DECLINE_REASONS, RfqAvailability, RfqLineStatus, RfqStatus, RfqSupplierStatus, RfqType } from "../models/rfq.model";
import Enquiry from "../models/enquiry.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import Supplier, { supplierStatus } from "../models/supplier.model";
import { getEmployeeData, buildPrivilegeAccessFilter, getQarRates } from "../common/utils/util";
import { uploadFileToAws } from "../common/aws-connect";
import { nextRfqNo } from "../services/rfqNumber.service";
import { resolveSourceSalesRfqId } from "./rfq.controller";
import { getAvailability, getLastReceiptCosts } from "../services/stock.service";
import Product from "../models/products.model";
import StockMovement from "../models/stockMovement.model";
import PurchaseOrder from "../models/purchaseOrder.model";
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
    if (bad) return 'Every line needs an item name, a description and a quantity above zero.';
    const unlinked = lines.findIndex((line) => !line.partNo);
    return unlinked >= 0 ? `Line ${unlinked + 1} (${lines[unlinked].itemName}) is not linked to a product in the catalogue. Pick it from the catalogue or create the product first.` : null;
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

/** A purchase request takes RFQ prices and awards only until it is sent for approval. */
export const PR_EDITABLE_STATUSES = ['New', 'In Progress', 'Drafted', 'Rejected'];

const isRfqLocked = (rfq: any) => LOCKED_STATUSES.includes(rfq.status) || !!rfq.$locals?.purchaseLocked;

/** Loads a sales RFQ, or a supplier RFQ raised from a purchase request (those freeze with the request). */
const loadSalesRfq = async (id: string) => {
    if (!ObjectId.isValid(id)) return null;
    const rfq: any = await Rfq.findOne({
        _id: id,
        isDeleted: false,
        $or: [{ rfqType: RfqType.Sales }, { rfqType: RfqType.Procurement, purchaseRequestId: { $exists: true, $ne: null }, 'suppliers.0': { $exists: true } }],
    });
    if (rfq?.rfqType === RfqType.Procurement) {
        const purchase: any = await PurchaseRequest.findById(rfq.purchaseRequestId, { status: 1 }).lean();
        rfq.$locals.purchaseLocked = !purchase || !PR_EDITABLE_STATUSES.includes(purchase.status);
    }
    return rfq;
};

const populateSalesRfq = (query: any) => query
    .populate({ path: 'enquiryId', populate: [{ path: 'client' }, { path: 'contact' }, { path: 'department' }, { path: 'salesPerson', select: '-password' }] })
    .populate('customerId')
    .populate('requestedLines.partNo', 'itemCode partNo')
    .populate('quotationId', 'quoteId status')
    .populate('ownerId', '-password')
    .populate('createdBy', '-password');

const sendRfq = async (res: Response, rfq: any, message?: string, statusCode = 200, syncPurchase = true, reopenAwards: boolean | string[] = false) => {
    // The purchase request mirrors its RFQs' prices and awards, so it follows every change made to them.
    if (reopenAwards && rfq.rfqType === RfqType.Procurement && rfq.purchaseRequestId) {
        const keys = Array.isArray(reopenAwards) ? reopenAwards : (rfq.requestedLines || []).map((line: any) => line.itemDetailKey);
        await reopenPurchaseAwards(rfq.purchaseRequestId, keys);
    }
    if (syncPurchase && rfq.rfqType === RfqType.Procurement && rfq.purchaseRequestId) await syncPurchaseFromRfqs(rfq.purchaseRequestId);
    const data = await populateSalesRfq(Rfq.findById(rfq._id));
    return res.status(statusCode).json({ success: true, message, data });
};

const lockedResponse = (res: Response) =>
    res.status(409).json({ success: false, message: 'This RFQ can no longer be changed: it is closed or cancelled, or its purchase request is with the approvers.' });

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
        return res.status(200).json({ success: true, data, coverage: await getEnquiryAwardCoverage(ids) });
    } catch (error) {
        next(error);
    }
};

export const getSalesRfqById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rfq = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        return sendRfq(res, rfq, undefined, 200, false);
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
        const alreadyAsked = await askedSuppliersOfEnquiry(enquiryId);
        for (const body of (Array.isArray(req.body?.suppliers) ? req.body.suppliers : [])) {
            const built = await buildInvite(body, validKeys);
            if (built.error) return res.status(400).json({ success: false, message: built.error });
            const existing = built.invite.supplierId && alreadyAsked.get(String(built.invite.supplierId));
            if (existing) {
                return res.status(409).json({ success: false, message: `${built.invite.supplierName} already has ${existing} for this enquiry. Open that RFQ instead, or withdraw it first.` });
            }
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
            created.push({ _id: rfq._id, rfqNo: rfq.rfqNo, supplierName: invite.supplierName, supplierId: String(invite.supplierId), inviteId: String(rfq.suppliers?.[0]?._id ?? '') });
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
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        return sendRfq(res, rfq, "Supplier price added", 201, true, [line.itemDetailKey]);
    } catch (error) {
        next(error);
    }
};

export const updateSalesRfqQuote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        return sendRfq(res, rfq, "Supplier price updated", 200, true, [quote.itemDetailKey]);
    } catch (error) {
        next(error);
    }
};

export const removeSalesRfqQuote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        return sendRfq(res, rfq, "Supplier price removed", 200, true, [quote.itemDetailKey]);
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
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        if (isRfqLocked(rfq)) return lockedResponse(res);
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
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        if (isRfqLocked(rfq)) return lockedResponse(res);
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
        if (isRfqLocked(rfq)) return lockedResponse(res);
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
        if (isRfqLocked(rfq)) return lockedResponse(res);
        const invite = rfq.suppliers.id(req.params.inviteId);
        if (!invite) return res.status(404).json({ success: false, message: "Supplier not found on this RFQ" });

        const terms = buildTerms(req.body?.terms);
        const prices: any[] = Array.isArray(req.body?.prices) ? req.body.prices : [];
        const inviteId = String(invite._id);
        const asked = new Set<string>(invite.lineKeys || []);
        let priced = 0;
        const changedKeys: string[] = [];

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
                    changedKeys.push(key);
                }
                continue;
            }

            const isNew = !quote;
            const snapshot = (q: any) => q ? [q.unitPrice, q.currency, q.leadTimeDays, q.availability, q.discountValue, q.taxPercent, q.freightCost, q.quantity].join('|') : '';
            const before = snapshot(quote);
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
            if (isNew || snapshot(quote) !== before) changedKeys.push(key);
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
        return sendRfq(res, rfq, priced ? `${priced} price(s) saved for ${invite.supplierName}` : "Reply saved", 200, true, changedKeys);
    } catch (error) {
        next(error);
    }
};

/** The supplier's quote document (PDF, email), kept once on the supplier rather than per line. */
export const uploadSalesRfqSupplierFiles = async (req: any, res: Response, next: NextFunction) => {
    try {
        const rfq: any = await loadSalesRfq(req.params.id);
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        if (isRfqLocked(rfq)) return lockedResponse(res);
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
        if (isRfqLocked(rfq)) return lockedResponse(res);
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

/**
 * How far each enquiry's products are settled across its live RFQs. Enquiries without RFQs are absent
 * (raising RFQs is optional). A product is settled once one supplier won it or every supplier marked it unavailable.
 */
export const getEnquiryAwardCoverage = async (enquiryIds: string[]) => {
    const ids = enquiryIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const coverage: Record<string, { total: number; awarded: number; unavailable: number; open: number }> = {};
    if (!ids.length) return coverage;
    const rfqs: any[] = await Rfq.find(
        { rfqType: RfqType.Sales, isDeleted: false, enquiryId: { $in: ids }, status: { $ne: RfqStatus.Cancelled } },
        { enquiryId: 1, requestedLines: 1 }
    ).sort({ createdAt: 1 }).lean();
    const byEnquiry = new Map<string, any[]>();
    rfqs.forEach((rfq) => {
        const key = String(rfq.enquiryId);
        byEnquiry.set(key, [...(byEnquiry.get(key) || []), rfq]);
    });
    byEnquiry.forEach((list, key) => {
        const c = { total: 0, awarded: 0, unavailable: 0, open: 0 };
        groupEnquiryLines(list).forEach((row) => {
            c.total++;
            if (row.members.some((m) => m.line.lineStatus === RfqLineStatus.Confirmed)) c.awarded++;
            else if (row.members.every((m) => m.line.lineStatus === RfqLineStatus.Unavailable)) c.unavailable++;
            else c.open++;
        });
        coverage[key] = c;
    });
    return coverage;
};

const quoteFor = (rfq: any, line: any) => (rfq.quotes || [])
    .filter((q: any) => q.itemDetailKey === line.itemDetailKey)
    .sort((a: any, b: any) => Number(b.selected) - Number(a.selected) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

/** One row per product, one column per supplier RFQ, with each supplier's price in its cell. */
const buildRfqComparison = async (rfqs: any[]) => {
    const { rates } = await getQarRates();

    const grouped = groupEnquiryLines(rfqs);
    const productIds = [...new Set(grouped.map((r) => r.members[0].line.partNo).filter((id: any) => id && ObjectId.isValid(String(id))).map(String))];
    const products: any[] = productIds.length ? await Product.find({ _id: { $in: productIds } }).select('itemCode partNo').lean() : [];
    const productById = new Map(products.map((p) => [String(p._id), p]));

    // What we last paid for each product on a purchase order, any supplier, so a dearer price can be flagged.
    const lastPaid: any[] = productIds.length ? await PurchaseOrder.aggregate([
        { $match: { poStatus: { $ne: 'Rejected' }, 'items.partNo': { $in: productIds.map((id) => new ObjectId(id)) } } },
        { $unwind: '$items' },
        { $match: { 'items.partNo': { $in: productIds.map((id) => new ObjectId(id)) } } },
        { $sort: { poDate: -1 } },
        {
            $group: {
                _id: '$items.partNo',
                unitCost: { $first: '$items.unitCost' },
                currency: { $first: '$currency' },
                poNo: { $first: '$poNo' },
                poDate: { $first: '$poDate' },
                supplierId: { $first: '$supplierId' },
            },
        },
        { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' } },
    ]) : [];
    const lastPaidByProduct = new Map(lastPaid.map((p) => {
        const priceQar = p.unitCost != null ? toQar(Number(p.unitCost), p, rates) : null;
        return [String(p._id), { priceQar, poNo: p.poNo, poDate: p.poDate, supplierName: p.supplier?.[0]?.supplierName || '' }];
    }));

    const rows = grouped.map((row) => {
        const first = row.members[0].line;
        const rowQty = Number(first.quantity) || 0;
        const product = productById.get(String(first.partNo));
        const cells = row.members.map(({ rfq, line }) => {
            const quote = quoteFor(rfq, line);
            const unit = quote && quote.availability !== RfqAvailability.Unavailable ? unitLandedCost(quote) : null;
            return {
                rfqId: rfq._id,
                lineKey: line.itemDetailKey,
                lineStatus: line.lineStatus || RfqLineStatus.Pending,
                awardReason: line.awardReason,
                // What this supplier won of the line: all of it, unless the line was split.
                awardedQty: line.lineStatus === RfqLineStatus.Confirmed ? (quote?.awardedQty ?? rowQty) : 0,
                quote: quote ? {
                    _id: quote._id,
                    unitPrice: quote.unitPrice,
                    unitPriceQar: quote.unitPrice != null ? toQar(Number(quote.unitPrice), quote, rates) : null,
                    unitLanded: unit,
                    unitLandedQar: unit != null ? toQar(unit, quote, rates) : null,
                    currency: quote.currency || 'QAR',
                    leadTimeDays: quote.leadTimeDays,
                    availability: quote.availability,
                    quantity: quote.quantity,
                    remarks: quote.remarks,
                    validityDate: quote.validityDate,
                    selected: !!quote.selected,
                } : null,
            };
        });
        const priced = cells.filter((c) => c.quote?.unitLandedQar != null);
        const lowest = priced.sort((a, b) => a.quote!.unitLandedQar! - b.quote!.unitLandedQar!)[0];
        const won = cells.find((c) => c.lineStatus === RfqLineStatus.Confirmed);
        const allocatedQty = cells.reduce((sum, c) => sum + (c.awardedQty || 0), 0);
        const status = won ? (allocatedQty + 0.0001 >= rowQty ? 'awarded' : 'partial')
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
            allocatedQty,
            lowestRfqId: lowest?.rfqId ?? null,
            lastPaid: lastPaidByProduct.get(String(first.partNo)) ?? null,
            cells,
        };
    });

    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return {
        rfqs: rfqs.map((rfq) => ({
            _id: rfq._id,
            rfqNo: rfq.rfqNo,
            status: rfq.status,
            supplierName: rfqSupplierName(rfq),
            supplierId: rfq.suppliers?.[0]?.supplierId ? String(rfq.suppliers[0].supplierId) : undefined,
            supplierStatus: rfq.suppliers?.[0]?.status,
            deadline: rfq.deadline,
            quotationId: rfq.quotationId,
            lineCount: (rfq.requestedLines || []).length,
            wonCount: (rfq.requestedLines || []).filter((l: any) => l.lineStatus === RfqLineStatus.Confirmed).length,
        })),
        rows,
        coverage: { total: rows.length, awarded: count('awarded'), unavailable: count('unavailable'), open: count('open') + count('waiting') + count('partial') },
    };
};

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
        const comparison = await buildRfqComparison(rfqs);
        return res.status(200).json({
            success: true,
            data: {
                enquiry: { _id: enquiry._id, enquiryId: enquiry.enquiryId, title: enquiry.title, status: enquiry.status, client: enquiry.client },
                ...comparison,
                quotationId: rfqs.find((rfq) => rfq.quotationId)?.quotationId ?? null,
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * After a split award or a take-back: once the shares add up to the line's quantity the suppliers still
 * without a share are Lost; while some quantity is left they stay open (Pending) so they can take it.
 */
const settleSplitRow = (row: { members: { rfq: any; line: any }[] }, rowQty: number, changed: Set<any>) => {
    const allocated = row.members.reduce((sum, { rfq, line }) => {
        if (line.lineStatus !== RfqLineStatus.Confirmed) return sum;
        const quote = quoteFor(rfq, line);
        return sum + (Number(quote?.awardedQty) || rowQty);
    }, 0);
    const covered = allocated + 0.0001 >= rowQty;
    row.members.forEach(({ rfq, line }) => {
        if (covered && line.lineStatus === RfqLineStatus.Pending) { line.lineStatus = RfqLineStatus.Lost; changed.add(rfq); }
        else if (!covered && line.lineStatus === RfqLineStatus.Lost) { line.lineStatus = RfqLineStatus.Pending; changed.add(rfq); }
    });
};

/**
 * Awards products across sibling RFQs: the chosen line is Confirmed and the same product on the other
 * RFQs becomes Lost; a null quoteId reopens the product everywhere. Returns the RFQs it touched, or the
 * error to send back. The caller saves.
 */
const applyCrossRfqAwards = async (rfqs: any[], awards: any[]): Promise<{ error?: { status: number; body: any }; changed: Set<any> }> => {
    const rows = groupEnquiryLines(rfqs);
    const { rates } = await getQarRates();
    const changed = new Set<any>();

    for (const award of awards) {
        const row = rows.find((r) => r.members.some((m) => String(m.rfq._id) === String(award?.rfqId) && m.line.itemDetailKey === award?.lineKey));
        if (!row) return { error: { status: 404, body: { success: false, message: "That product is not on this enquiry's RFQs." } }, changed };
        const member = row.members.find((m) => String(m.rfq._id) === String(award.rfqId))!;
        const rowQty = Number(row.members[0].line.quantity) || 0;

        // Split award: `qty: 0` takes back only this supplier's share and leaves the others' shares alone.
        if (!award.quoteId && award.qty === 0) {
            (member.rfq.quotes || []).filter((q: any) => q.itemDetailKey === member.line.itemDetailKey).forEach((q: any) => { q.selected = false; q.awardedQty = undefined; });
            member.line.lineStatus = RfqLineStatus.Pending;
            member.line.awardReason = undefined;
            changed.add(member.rfq);
            settleSplitRow(row, rowQty, changed);
            continue;
        }

        if (!award.quoteId) {
            row.members.forEach(({ rfq, line }) => {
                if (line.lineStatus === RfqLineStatus.Unavailable) return;
                (rfq.quotes || []).filter((q: any) => q.itemDetailKey === line.itemDetailKey).forEach((q: any) => { q.selected = false; q.awardedQty = undefined; });
                line.lineStatus = RfqLineStatus.Pending;
                line.awardReason = undefined;
                changed.add(rfq);
            });
            continue;
        }

        const chosen = (member.rfq.quotes || []).find((q: any) => String(q._id) === String(award.quoteId) && q.itemDetailKey === member.line.itemDetailKey);
        if (!chosen) return { error: { status: 404, body: { success: false, message: `Price not found for "${member.line.detail}".` } }, changed };
        if (chosen.availability === RfqAvailability.Unavailable) {
            return { error: { status: 400, body: { success: false, message: `${chosen.supplierName || rfqSupplierName(member.rfq)} marked "${member.line.detail}" unavailable.` } }, changed };
        }
        // Part of the line: this supplier takes `qty` and the rest is awarded to others. No "why not the lowest"
        // is asked, since splitting is how a short or dearer supplier gets used.
        const partQty = Number(award.qty);
        if (partQty > 0 && rowQty > 0 && partQty < rowQty) {
            const taken = row.members.reduce((sum, { rfq, line }) => {
                if (rfq === member.rfq || line.lineStatus !== RfqLineStatus.Confirmed) return sum;
                const quote = quoteFor(rfq, line);
                return sum + (Number(quote?.awardedQty) || rowQty);
            }, 0);
            if (partQty + taken > rowQty + 0.0001) {
                return { error: { status: 400, body: { success: false, message: `Only ${Math.max(0, rowQty - taken)} of "${member.line.detail}" is left to award.` } }, changed };
            }
            const offered = Number(chosen.quantity) || 0;
            if (offered > 0 && partQty > offered) {
                return { error: { status: 400, body: { success: false, message: `${chosen.supplierName || rfqSupplierName(member.rfq)} quoted only ${offered} of "${member.line.detail}".` } }, changed };
            }
            (member.rfq.quotes || []).filter((q: any) => q.itemDetailKey === member.line.itemDetailKey).forEach((q: any) => {
                q.selected = String(q._id) === String(chosen._id);
                q.awardedQty = q.selected ? partQty : undefined;
            });
            member.line.lineStatus = RfqLineStatus.Confirmed;
            member.line.awardReason = undefined;
            changed.add(member.rfq);
            settleSplitRow(row, rowQty, changed);
            continue;
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
            return { error: { status: 400, body: { success: false, reasonRequired: true, message: `"${member.line.detail}" is not going to the lowest price. Say why.` } }, changed };
        }

        row.members.forEach(({ rfq, line }) => {
            const lineQuotes = (rfq.quotes || []).filter((q: any) => q.itemDetailKey === line.itemDetailKey);
            if (rfq === member.rfq) {
                lineQuotes.forEach((q: any) => { q.selected = String(q._id) === String(chosen._id); q.awardedQty = undefined; });
                line.lineStatus = RfqLineStatus.Confirmed;
                line.awardReason = aboveLowest ? reason : undefined;
            } else {
                lineQuotes.forEach((q: any) => { q.selected = false; q.awardedQty = undefined; });
                if (line.lineStatus !== RfqLineStatus.Unavailable) line.lineStatus = RfqLineStatus.Lost;
                line.awardReason = undefined;
            }
            changed.add(rfq);
        });
    }

    return { changed };
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
        const applied = await applyCrossRfqAwards(rfqs, awards);
        if (applied.error) return res.status(applied.error.status).json(applied.error.body);
        const changed = applied.changed;

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
        if (isRfqLocked(rfq)) return lockedResponse(res);
        // A purchase request must not keep a price from an RFQ that no longer stands.
        (rfq.quotes || []).forEach((quote: any) => (quote.selected = false));
        (rfq.requestedLines || []).forEach((line: any) => { if (line.lineStatus === RfqLineStatus.Confirmed) line.lineStatus = RfqLineStatus.Pending; });
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

/** Suppliers that already hold a live (not cancelled) supplier RFQ for this enquiry, with that RFQ's number. */
const askedSuppliersOfEnquiry = async (enquiryId: any): Promise<Map<string, string>> => {
    const asked = new Map<string, string>();
    if (!enquiryId || !ObjectId.isValid(String(enquiryId))) return asked;
    const rfqs: any[] = await Rfq.find({
        rfqType: RfqType.Sales, isDeleted: false, enquiryId: new ObjectId(String(enquiryId)), status: { $ne: RfqStatus.Cancelled },
    }).select('rfqNo suppliers.supplierId').lean();
    rfqs.forEach((rfq) => (rfq.suppliers || []).forEach((invite: any) => {
        if (invite.supplierId && !asked.has(String(invite.supplierId))) asked.set(String(invite.supplierId), rfq.rfqNo);
    }));
    return asked;
};

/** Supplier picker for RFQs: approved, unblocked suppliers whose name matches. */
export const searchSalesRfqSuppliers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const search = String((req.query as any)?.search || '').trim();
        const match: any = { isDeleted: { $ne: true }, isBlocked: { $ne: true }, status: supplierStatus.approved };
        const id = String((req.query as any)?.id || '').trim();
        if (search) match.supplierName = { $regex: escapeRegex(search), $options: 'i' };
        // One supplier by id (edit mode: its details for the banner), even if it has since been blocked.
        if (id && /^[a-f\d]{24}$/i.test(id)) {
            delete match.isBlocked;
            delete match.status;
            match._id = id;
        }
        const suppliers: any[] = await Supplier.find(match, {
            supplierName: 1, supplierId: 1, status: 1, contactDetails: 1, companyEmail: 1, companyPhone: 1, address: 1, creditDays: 1, creditValue: 1,
        })
            .collation({ locale: 'en', strength: 2 })
            .sort({ supplierName: 1 })
            .limit(search ? 20 : 200)
            .lean();
        const asked = await askedSuppliersOfEnquiry((req.query as any)?.enquiryId);
        const data = suppliers.map((s) => ({
            alreadyAsked: asked.has(String(s._id)),
            askedRfqNo: asked.get(String(s._id)) || '',
            supplierId: String(s._id),
            supplierName: s.supplierName,
            contactEmail: s.contactDetails?.email || '',
            isSupplierApproved: s.status === supplierStatus.approved,
            code: s.supplierId || '',
            contactName: s.contactDetails?.name || '',
            contactPhone: s.contactDetails?.phoneNumber || s.companyPhone || '',
            companyEmail: s.companyEmail || '',
            address: [s.address?.buildingNo, s.address?.streetNo, s.address?.zoneNo, s.address?.city, s.address?.location].filter(Boolean).join(', '),
            creditDays: s.creditDays ?? null,
            creditLimit: s.creditValue ?? null,
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
        if (isRfqLocked(rfq)) return lockedResponse(res);

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
        if (isRfqLocked(rfq)) return lockedResponse(res);
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

        // Quotes from any employee's RFQs count, sales and purchase-request ones alike.
        const quoted: any[] = await Rfq.aggregate([
            { $match: { isDeleted: false, status: { $ne: RfqStatus.Cancelled } } },
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
                    validityDate: { $first: '$quotes.validityDate' },
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
                    lastQuotedAt: 1, validityDate: 1, lastRfqNo: 1, lowestPrice: 1, timesQuoted: 1, timesSelected: 1,
                    partNo: { $arrayElemAt: ['$product.partNo', 0] },
                    productName: { $arrayElemAt: ['$product.productDescription', 0] },
                },
            },
            { $sort: { timesSelected: -1, lastQuotedAt: -1 } },
            { $limit: 200 },
        ]);

        // What we last paid each supplier for the product, from the purchase orders.
        const poMatch: any = { poStatus: { $ne: 'Rejected' }, supplierId: { $ne: null }, 'items.partNo': { $ne: null } };
        if (productId && ObjectId.isValid(productId)) poMatch['items.partNo'] = new ObjectId(productId);
        if (supplierId && ObjectId.isValid(supplierId)) poMatch.supplierId = new ObjectId(supplierId);
        const ordered: any[] = await PurchaseOrder.aggregate([
            { $match: poMatch },
            { $unwind: '$items' },
            { $match: { 'items.partNo': poMatch['items.partNo'] } },
            { $sort: { poDate: -1 } },
            {
                $group: {
                    _id: { supplierId: '$supplierId', productId: '$items.partNo' },
                    lastPoPrice: { $first: '$items.unitCost' },
                    lastPoQty: { $first: '$items.quantity' },
                    lastPoNo: { $first: '$poNo' },
                    lastPoDate: { $first: '$poDate' },
                    poCurrency: { $first: '$currency' },
                },
            },
            { $lookup: { from: 'suppliers', localField: '_id.supplierId', foreignField: '_id', as: 'supplier' } },
            { $lookup: { from: 'products', localField: '_id.productId', foreignField: '_id', as: 'product' } },
        ]);

        const keyOf = (s: any, p: any) => `${s}|${p}`;
        const byKey = new Map<string, any>(quoted.map((q) => [keyOf(q.supplierId, q.productId), q]));
        ordered.forEach((o) => {
            const key = keyOf(o._id.supplierId, o._id.productId);
            const po = { lastPoPrice: o.lastPoPrice, lastPoQty: o.lastPoQty, lastPoNo: o.lastPoNo, lastPoDate: o.lastPoDate };
            const row = byKey.get(key);
            if (row) Object.assign(row, po);
            else byKey.set(key, {
                supplierId: o._id.supplierId, productId: o._id.productId,
                supplierName: o.supplier?.[0]?.supplierName || '', detail: o.product?.[0]?.productDescription || '',
                currency: o.poCurrency, partNo: o.product?.[0]?.partNo, productName: o.product?.[0]?.productDescription,
                timesQuoted: 0, timesSelected: 0, ...po,
            });
        });

        // The pill's headline price is the newest of the last quote and the last PO.
        const data = [...byKey.values()].map((row) => {
            const poNewer = row.lastPoPrice != null && (!row.lastQuotedAt || new Date(row.lastPoDate) >= new Date(row.lastQuotedAt));
            return {
                ...row,
                referencePrice: poNewer ? row.lastPoPrice : row.lastPrice,
                referenceSource: poNewer ? 'PO' : 'Quote',
                referenceDate: poNewer ? row.lastPoDate : row.lastQuotedAt,
                // A quote past its valid-until date is still shown, as a warning.
                expired: !poNewer && !!row.validityDate && new Date(row.validityDate).getTime() < Date.now(),
            };
        }).sort((a, b) => (b.timesSelected - a.timesSelected) || (new Date(b.referenceDate).getTime() - new Date(a.referenceDate).getTime())).slice(0, 200);
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
        const availability = await getAvailability(productIds);
        // What the stock on hand cost us: the unit cost of the latest receipt.
        const stockCostByProduct = await getLastReceiptCosts(productIds);
        // Suppliers we have received each product from, with their last cost and date.
        const receipts: any[] = productIds.length
            ? await StockMovement.aggregate([
                { $match: { isDeleted: { $ne: true }, product: { $in: productIds }, movementType: 'Receipt', stockStatus: { $ne: 'Quarantine' }, supplier: { $exists: true }, reversalOf: { $exists: false } } },
                { $sort: { movementDate: -1 } },
                { $group: { _id: { product: '$product', supplier: '$supplier' }, unitCost: { $first: '$unitCost' }, dateOfPurchase: { $first: '$movementDate' } } },
            ])
            : [];
        const entries: any[] = receipts.map((r) => ({ partNo: r._id.product, supplierName: r._id.supplier, unitCost: r.unitCost, dateOfPurchase: r.dateOfPurchase }));

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
            const available = availability.get(pid)?.available || 0;
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

// --- supplier RFQs raised from a purchase request ------------------------------------
// A purchase request asks suppliers for prices before it goes for approval: any number of RFQs (one
// per supplier), each priced by that supplier, and one winner per product. The awarded price becomes
// the line's cost on the request, which stays read-only there.

/** The live supplier RFQs of a purchase request, oldest first so columns keep their order. */
const loadPurchaseRfqs = (purchaseId: any) =>
    Rfq.find({
        rfqType: RfqType.Procurement,
        isDeleted: false,
        purchaseRequestId: new ObjectId(String(purchaseId)),
        'suppliers.0': { $exists: true },
        status: { $ne: RfqStatus.Cancelled },
    }).sort({ createdAt: 1 });

/**
 * Once a request's RFQ changes (new prices, another supplier, a decline), the products it covers lose their award
 * and the buyer has to award them again. Products nobody touched keep theirs, including those brought over from sales.
 */
const reopenPurchaseAwards = async (purchaseId: any, lineKeys: string[]) => {
    const keys = new Set(lineKeys);
    if (!keys.size) return;
    const rfqs: any[] = await loadPurchaseRfqs(purchaseId);
    for (const rfq of rfqs) {
        let touched = false;
        (rfq.quotes || []).forEach((q: any) => { if (keys.has(q.itemDetailKey) && q.selected) { q.selected = false; touched = true; } });
        (rfq.requestedLines || []).forEach((line: any) => {
            if (keys.has(line.itemDetailKey) && line.lineStatus && line.lineStatus !== RfqLineStatus.Pending && line.lineStatus !== RfqLineStatus.Unavailable) {
                line.lineStatus = RfqLineStatus.Pending;
                line.awardReason = undefined;
                touched = true;
            }
        });
        if (!touched) continue;
        if (rfq.status === RfqStatus.Awarded || rfq.status === RfqStatus.Closed) { rfq.status = RfqStatus.Quoted; rfq.awardedAt = undefined; rfq.awardedBy = undefined; }
        await rfq.save();
    }
};

/** The request's lines as RFQ lines; the key is the saved line's id, which is how the request finds its prices again. */
const purchaseLines = (purchase: any) => {
    const lines: any[] = [];
    (purchase.items || []).forEach((item: any) => (item.itemDetails || []).forEach((detail: any) => {
        const winner = (detail.comparisons || []).find((c: any) => c.selected);
        lines.push({
            itemDetailKey: String(detail._id),
            itemName: item.itemName,
            detail: detail.detail,
            quantity: toNumber(detail.quantity),
            itemCode: detail.itemCode,
            estimatedUnitCost: toNumber(detail.unitCost) || undefined,
            partNo: detail.partNo,
            uom: detail.uom,
            awardedSupplier: winner?.supplierName,
            // Suppliers already tied to the line (offers on file), so the RFQ editor can open one tab per supplier.
            suppliers: (detail.comparisons || [])
                .filter((c: any) => c.supplierId)
                .map((c: any) => ({ supplierId: String(c.supplierId), supplierName: c.supplierName })),
            supplierName: detail.supplierName || undefined,
        });
    }));
    return lines;
};

/** A quote's per-unit landed cost in the request's currency (copied unconverted when no rate is known). */
const costInCurrency = (quote: any, currency: string, rates: Record<string, number>): number => {
    const unit = unitLandedCost(quote);
    const from = String(quote.currency || 'QAR').toUpperCase();
    if (from === currency) return unit;
    const qar = toQar(unit, quote, rates);
    const target = currency === 'QAR' ? 1 : rates[currency];
    if (qar == null || !target) return unit;
    return Number((qar / target).toFixed(2));
};

/**
 * Writes the request's supplier offers and awards from its RFQs: every price a supplier gave becomes a
 * comparison on the line, the awarded one is selected, and the line's cost follows the awarded price.
 * Lines no RFQ asked about are left as they are. Does nothing once the request is with the approvers,
 * unless `force` is set (the request's own save, which must not leave a stale price behind).
 */
export const syncPurchaseFromRfqs = async (purchaseId: any, force = false) => {
    if (!purchaseId || !ObjectId.isValid(String(purchaseId))) return null;
    const purchase: any = await PurchaseRequest.findOne({ _id: purchaseId, isDeleted: false });
    if (!purchase || (!force && !PR_EDITABLE_STATUSES.includes(purchase.status))) return purchase;
    const rfqs: any[] = await loadPurchaseRfqs(purchaseId).lean();
    if (!rfqs.length) return purchase;

    const { rates } = await getQarRates();
    const currency = String(purchase.currency || 'QAR').toUpperCase();
    let total = 0;

    (purchase.items || []).forEach((item: any) => (item.itemDetails || []).forEach((detail: any) => {
        const key = String(detail._id);
        const asked = rfqs.filter((rfq) => (rfq.requestedLines || []).some((line: any) => line.itemDetailKey === key));
        if (asked.length) {
            const offers: { rfq: any; quote: any }[] = [];
            asked.forEach((rfq) => (rfq.quotes || [])
                .filter((quote: any) => quote.itemDetailKey === key && quote.availability !== RfqAvailability.Unavailable)
                .forEach((quote: any) => offers.push({ rfq, quote })));
            const hadAward = (detail.comparisons || []).some((c: any) => c.selected);
            detail.comparisons = offers.map(({ rfq, quote }) => {
                const invite = (rfq.suppliers || []).find((s: any) => String(s._id) === String(quote.inviteId || ''));
                return {
                    _id: quote._id,
                    supplierId: quote.supplierId,
                    supplierName: quote.supplierName,
                    // A split line orders only the share this supplier won.
                    quantity: quote.selected && quote.awardedQty ? quote.awardedQty : quote.quantity,
                    awardedQty: quote.selected && quote.awardedQty ? quote.awardedQty : undefined,
                    unitPrice: toNumber(quote.unitPrice),
                    discountType: quote.discountType || 'amount',
                    discountValue: toNumber(quote.discountValue),
                    taxPercent: toNumber(quote.taxPercent),
                    freightCost: toNumber(quote.freightCost),
                    totalCost: toNumber(quote.totalCost),
                    netAmount: toNumber(quote.netAmount),
                    landedCost: toNumber(quote.landedCost),
                    etaTerms: quote.etaTerms || (quote.leadTimeDays != null ? `${quote.leadTimeDays} days` : undefined),
                    paymentTerms: quote.paymentTerms || invite?.replyTerms?.paymentTerms || 'Not specified',
                    validityDate: quote.validityDate,
                    warrantyTerms: quote.warrantyTerms,
                    remarks: quote.remarks,
                    selected: !!quote.selected,
                    createdBy: quote.createdBy || purchase.updatedBy || purchase.createdBy,
                    createdAt: quote.createdAt || new Date(),
                };
            });
            const winners = offers.filter((offer) => offer.quote.selected);
            const won = winners[0];
            if (won) {
                // A split line costs the average of its suppliers' prices, weighted by the share each one supplies.
                const shares = winners.map((offer) => Number(offer.quote.awardedQty) || 0);
                const split = winners.length > 1 || shares[0] > 0;
                const totalShare = shares.reduce((sum, share) => sum + share, 0);
                detail.unitCost = split && totalShare > 0
                    ? Number((winners.reduce((sum, offer, n) => sum + costInCurrency(offer.quote, currency, rates) * shares[n], 0) / totalShare).toFixed(4))
                    : costInCurrency(won.quote, currency, rates);
                const slowest = winners.map((offer) => offer.quote.leadTimeDays).filter((d: any) => d != null);
                detail.availability = slowest.length ? `${Math.max(...slowest)} days` : (won.quote.etaTerms || detail.availability);
            } else if (hadAward) {
                detail.unitCost = 0;
            }
        }
        total += toNumber(detail.quantity) * toNumber(detail.unitCost);
    }));

    purchase.totalLpo = total;
    // A general purchase has no job to name its supplier: it is whoever won, when one supplier won every line.
    if (purchase.sourceType === 'manual') {
        const winners = new Set<string>();
        (purchase.items || []).forEach((item: any) => (item.itemDetails || []).forEach((detail: any) => {
            (detail.comparisons || []).filter((c: any) => c.selected).forEach((won: any) => {
                if (won.supplierId) winners.add(String(won.supplierId));
            });
        }));
        if (winners.size === 1) purchase.supplierId = new ObjectId(Array.from(winners)[0]);
    }
    purchase.markModified('items');
    await purchase.save({ validateModifiedOnly: true });
    return purchase;
};

const loadPurchase = async (purchaseId: string, res: Response) => {
    if (!ObjectId.isValid(purchaseId)) { res.status(400).json({ success: false, message: "Invalid purchase request" }); return null; }
    const purchase: any = await PurchaseRequest.findOne({ _id: purchaseId, isDeleted: false });
    if (!purchase) { res.status(404).json({ success: false, message: "Purchase request not found" }); return null; }
    return purchase;
};

/** The request's lines with every supplier RFQ raised for them: what the RFQ drawer works from. */
export const getPurchaseRfqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const purchase = await loadPurchase(req.params.purchaseId, res);
        if (!purchase) return;
        const rfqs: any[] = await loadPurchaseRfqs(purchase._id).lean();
        return res.status(200).json({
            success: true,
            data: {
                purchase: { _id: purchase._id, purchaseNo: purchase.purchaseNo, status: purchase.status, editable: PR_EDITABLE_STATUSES.includes(purchase.status), currency: purchase.currency || 'QAR', hasJob: !!purchase.jobId },
                lines: purchaseLines(purchase.toObject()),
                rfqs,
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Raises one RFQ per supplier for the lines picked. A supplier that already has a live RFQ on the request
 * gets the new lines added to it rather than a second RFQ.
 */
export const createPurchaseRfqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: "Employee not found" });
        const purchase = await loadPurchase(req.params.purchaseId, res);
        if (!purchase) return;
        if (!PR_EDITABLE_STATUSES.includes(purchase.status)) {
            return res.status(409).json({ success: false, message: "This request is with the approvers, so suppliers can no longer be asked for prices." });
        }

        const allLines = purchaseLines(purchase.toObject());
        const validKeys = new Set<string>(allLines.map((line) => line.itemDetailKey));
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
        if (!req.body?.deadline) return res.status(400).json({ success: false, message: 'Say when the supplier prices are needed by.' });

        const live: any[] = await loadPurchaseRfqs(purchase._id);
        const sourceRfqId = await resolveSourceSalesRfqId(purchase);
        const result: any[] = [];
        // The drawer may ask for less than the request needs (the rest is in stock); only the quantity can differ.
        const askedQty = new Map<string, number>();
        (Array.isArray(req.body?.lines) ? req.body.lines : []).forEach((line: any) => {
            const qty = toNumber(line?.quantity);
            if (line?.itemDetailKey && qty > 0) askedQty.set(String(line.itemDetailKey), qty);
        });
        for (const invite of invites) {
            const wanted = allLines.filter((line) => invite.lineKeys.includes(line.itemDetailKey))
                .map((line) => buildLine({ ...line, quantity: askedQty.get(line.itemDetailKey) ?? line.quantity }));
            const existing = live.find((rfq) => (rfq.suppliers || []).some((s: any) => sameSupplier(s, invite)));
            if (existing) {
                const have = new Set<string>((existing.requestedLines || []).map((line: any) => line.itemDetailKey));
                wanted.filter((line: any) => !have.has(line.itemDetailKey)).forEach((line: any) => existing.requestedLines.push(line));
                const exInvite = existing.suppliers[0];
                exInvite.lineKeys = Array.from(new Set<string>([...(exInvite.lineKeys || []), ...invite.lineKeys]));
                if (invite.contactEmail) exInvite.contactEmail = invite.contactEmail;
                if (existing.status === RfqStatus.Closed) existing.status = RfqStatus.Open;
                if (req.body?.deadline) existing.deadline = req.body.deadline;
                touch(existing, employee);
                await existing.save();
                result.push({ _id: existing._id, rfqNo: existing.rfqNo, supplierName: exInvite.supplierName, supplierId: String(exInvite.supplierId), inviteId: String(exInvite._id), merged: true });
                continue;
            }
            const rfq = await Rfq.create({
                rfqNo: await nextRfqNo(),
                rfqType: RfqType.Procurement,
                sourceRfqId,
                purchaseRequestId: purchase._id,
                purchaseNo: purchase.purchaseNo,
                jobId: purchase.jobId,
                customerId: purchase.customerId,
                ownerId: employee._id,
                status: RfqStatus.Open,
                requestedLines: wanted,
                quotes: [],
                suppliers: [invite],
                requestedTerms: buildTerms(req.body?.requestedTerms),
                deadline: req.body.deadline,
                requiredBy: req.body?.requiredBy || undefined,
                notes: req.body?.notes || undefined,
                createdBy: employee._id,
            });
            result.push({ _id: rfq._id, rfqNo: rfq.rfqNo, supplierName: invite.supplierName, supplierId: String(invite.supplierId), inviteId: String(rfq.suppliers?.[0]?._id || ''), merged: false });
        }
        // Asking another supplier about a product reopens it: the buyer awards it again once the new price is in.
        await reopenPurchaseAwards(purchase._id, invites.flatMap((invite) => invite.lineKeys));
        await syncPurchaseFromRfqs(purchase._id);
        return res.status(201).json({ success: true, message: `${result.length} RFQ(s) saved`, data: result });
    } catch (error) {
        next(error);
    }
};

/** The comparison grid of a purchase request: one row per product, one column per supplier RFQ. */
export const getPurchaseRfqComparison = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const purchase = await loadPurchase(req.params.purchaseId, res);
        if (!purchase) return;
        const rfqs: any[] = await loadPurchaseRfqs(purchase._id).lean();
        const comparison = await buildRfqComparison(rfqs);
        // Products no supplier has been asked about never appear in the grid, so list them: they still need a supplier.
        const asked = new Set<string>();
        rfqs.forEach((rfq) => (rfq.requestedLines || []).forEach((line: any) => asked.add(String(line.itemDetailKey))));
        const lines = purchaseLines(purchase.toObject());
        // The supplier already chosen on the job sheet for a line, shown beside it as the current supplier.
        const currentSupplier = new Map<string, string>();
        lines.forEach((line) => { if (line.supplierName) currentSupplier.set(line.itemDetailKey, line.supplierName); });
        (comparison.rows as any[]).forEach((row) => { row.currentSupplier = currentSupplier.get(String(row.key)); });
        const unasked = lines
            .filter((line) => line.quantity > 0 && !asked.has(line.itemDetailKey))
            .map(({ itemDetailKey, itemName, detail, quantity, uom, itemCode, supplierName }) => ({ itemDetailKey, itemName, detail, quantity, uom, itemCode, currentSupplier: supplierName }));
        // Suppliers asked about the same product on other requests, offered as pills on lines with no RFQ here yet.
        const partIds = [...new Set(lines.map((l) => l.partNo).filter((id: any) => id && ObjectId.isValid(String(id))).map(String))];
        const past: any[] = partIds.length ? await Rfq.find({
            rfqType: RfqType.Procurement, isDeleted: false, status: { $ne: RfqStatus.Cancelled },
            purchaseRequestId: { $ne: purchase._id }, 'suppliers.0': { $exists: true },
            'requestedLines.partNo': { $in: partIds.map((id) => new ObjectId(id)) },
        }).select('suppliers requestedLines.partNo').sort({ createdAt: -1 }).limit(300).lean() : [];
        const byPart = new Map<string, Map<string, { supplierId?: string; supplierName: string }>>();
        past.forEach((rfq: any) => {
            const supplierId = rfq.suppliers?.[0]?.supplierId ? String(rfq.suppliers[0].supplierId) : undefined;
            const supplierName = rfqSupplierName(rfq);
            if (!supplierName) return;
            (rfq.requestedLines || []).forEach((l: any) => {
                const key = String(l.partNo);
                const m = byPart.get(key) ?? new Map();
                m.set(supplierId || supplierName, { supplierId, supplierName });
                byPart.set(key, m);
            });
        });
        const previousSuppliers: Record<string, { supplierId?: string; supplierName: string }[]> = {};
        lines.forEach((l) => {
            const m = byPart.get(String(l.partNo));
            if (m) previousSuppliers[l.itemDetailKey] = [...m.values()];
        });
        return res.status(200).json({
            success: true,
            data: {
                enquiry: { _id: purchase._id, enquiryId: purchase.purchaseNo, status: purchase.status },
                previousSuppliers,
                ...comparison,
                coverage: { ...comparison.coverage, total: comparison.coverage.total + unasked.length, open: comparison.coverage.open + unasked.length },
                unasked,
                quotationId: null,
            }
        });
    } catch (error) {
        next(error);
    }
};

/** Awards products across the request's RFQs, like the enquiry award; the request's lines follow the new prices. */
export const awardPurchaseRfqLines = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const purchase = await loadPurchase(req.params.purchaseId, res);
        if (!purchase) return;
        if (!PR_EDITABLE_STATUSES.includes(purchase.status)) {
            return res.status(409).json({ success: false, message: "This request is with the approvers, so awards can no longer change." });
        }
        const awards: any[] = Array.isArray(req.body?.awards) ? req.body.awards : [];
        if (!awards.length) return res.status(400).json({ success: false, message: "Nothing to award." });

        const rfqs: any[] = await loadPurchaseRfqs(purchase._id);
        const applied = await applyCrossRfqAwards(rfqs, awards);
        if (applied.error) return res.status(applied.error.status).json(applied.error.body);

        for (const rfq of applied.changed) {
            // An RFQ closed because it lost everything comes back when one of its products reopens.
            if (rfq.status === RfqStatus.Closed) rfq.status = RfqStatus.Quoted;
            touch(rfq, employee);
            if (rfq.status !== RfqStatus.Awarded) { rfq.awardedAt = undefined; rfq.awardedBy = undefined; }
            await rfq.save();
        }
        await syncPurchaseFromRfqs(purchase._id);
        return res.status(200).json({ success: true, message: "Award saved", data: { changed: applied.changed.size } });
    } catch (error) {
        next(error);
    }
};

const sameText = (a: any, b: any) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Brings the supplier prices gathered on the enquiry's sales RFQs into a job's purchase request: one supplier RFQ
 * per sales supplier, its quotes (and any award made at sales time) re-keyed to the request's own lines. Lines are
 * matched by part number, then by description. A supplier that already has an RFQ on the request is left alone.
 */
export const importSalesRfqsIntoPurchase = async (purchase: any, employee: any) => {
    const result = { created: 0, skipped: 0, unmatched: 0 };
    const sourceId = await resolveSourceSalesRfqId(purchase);
    if (!sourceId) return result;
    const source: any = await Rfq.findOne({ _id: sourceId, isDeleted: false }).lean();
    if (!source) return result;

    const sales: any[] = await Rfq.find({
        rfqType: RfqType.Sales,
        isDeleted: false,
        status: { $ne: RfqStatus.Cancelled },
        $or: [{ _id: source._id }, ...(source.enquiryId ? [{ enquiryId: source.enquiryId }] : [])],
    }).lean();
    if (!sales.length) return result;

    const prLines = purchaseLines(purchase.toObject());
    const live: any[] = await loadPurchaseRfqs(purchase._id).lean();

    for (const sale of sales) {
        // Sales line key -> the request line it stands for.
        const keyMap = new Map<string, any>();
        (sale.requestedLines || []).forEach((line: any) => {
            const match = prLines.find((p) => line.partNo && p.partNo && String(line.partNo) === String(p.partNo))
                || prLines.find((p) => sameText(p.detail, line.detail));
            if (match) keyMap.set(line.itemDetailKey, { sale: line, pr: match });
            else result.unmatched++;
        });

        for (const invite of (sale.suppliers || [])) {
            const quotes = (sale.quotes || []).filter((q: any) =>
                keyMap.has(q.itemDetailKey) && (String(q.inviteId || '') === String(invite._id) || (!q.inviteId && (sale.suppliers || []).length === 1)));
            if (!quotes.length) continue;
            if (live.some((rfq) => (rfq.suppliers || []).some((s: any) => sameSupplier(s, invite)))) { result.skipped++; continue; }

            const inviteId = new ObjectId();
            const keys = Array.from(new Set<string>(quotes.map((q: any) => keyMap.get(q.itemDetailKey).pr.itemDetailKey)));
            const lines = keys.map((prKey) => {
                const pair = Array.from(keyMap.values()).find((p: any) => p.pr.itemDetailKey === prKey && quotes.some((q: any) => keyMap.get(q.itemDetailKey).pr.itemDetailKey === prKey));
                const line = buildLine({ ...pair.pr, lineStatus: pair.sale.lineStatus });
                line.itemDetailKey = prKey;
                (line as any).awardReason = pair.sale.awardReason || undefined;
                return line;
            });
            const rfq = new Rfq({
                rfqNo: await nextRfqNo(),
                rfqType: RfqType.Procurement,
                sourceRfqId: sale._id,
                purchaseRequestId: purchase._id,
                purchaseNo: purchase.purchaseNo,
                jobId: purchase.jobId,
                customerId: purchase.customerId,
                ownerId: employee?._id,
                status: RfqStatus.Open,
                requestedLines: lines,
                quotes: quotes.map((q: any) => ({ ...q, _id: new ObjectId(), inviteId, itemDetailKey: keyMap.get(q.itemDetailKey).pr.itemDetailKey })),
                suppliers: [{
                    _id: inviteId,
                    supplierId: invite.supplierId,
                    supplierName: invite.supplierName,
                    contactEmail: invite.contactEmail,
                    isSupplierApproved: invite.isSupplierApproved,
                    lineKeys: keys,
                    status: invite.status,
                    sentAt: invite.sentAt,
                    sentVia: invite.sentVia,
                    repliedAt: invite.repliedAt,
                    replyTerms: invite.replyTerms,
                    remarks: invite.remarks,
                    declineReason: invite.declineReason,
                }],
                requestedTerms: sale.requestedTerms,
                deadline: sale.deadline,
                notes: `Imported from sales RFQ ${sale.rfqNo}`,
                createdBy: employee?._id || purchase.createdBy,
            });
            recomputeStatus(rfq);
            await rfq.save();
            live.push(rfq.toObject());
            result.created++;
        }
    }
    if (result.created) await syncPurchaseFromRfqs(purchase._id, true);
    return result;
};

/** Pulls the enquiry's sales RFQ prices into this request's RFQs. */
export const importPurchaseSalesRfqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const purchase = await loadPurchase(req.params.purchaseId, res);
        if (!purchase) return;
        if (!PR_EDITABLE_STATUSES.includes(purchase.status)) {
            return res.status(409).json({ success: false, message: "This request is with the approvers, so RFQs can no longer change." });
        }
        const result = await importSalesRfqsIntoPurchase(purchase, employee);
        const message = result.created
            ? `${result.created} supplier RFQ(s) brought in from the enquiry`
            : 'No new supplier prices to bring in from the enquiry';
        return res.status(200).json({ success: true, message, data: result });
    } catch (error) {
        next(error);
    }
};
