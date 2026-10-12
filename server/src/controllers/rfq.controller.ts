import { NextFunction, Request, Response } from "express";
import Rfq, { RfqLineStatus, RfqStage, RfqStatus, RfqType } from "../models/rfq.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import Job from "../models/job.model";
import Quotation from "../models/quotation.model";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
import { nextRfqNo } from "../services/rfqNumber.service";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const detailKey = (itemIndex: number, detailIndex: number, detail: any) =>
    detail?._id?.toString?.() || `${itemIndex}:${detailIndex}:${detail?.detail || ''}`;

const buildRequestedLines = (purchase: any) => {
    const lines: any[] = [];
    (purchase.items || []).forEach((item: any, itemIndex: number) => {
        (item.itemDetails || []).forEach((detail: any, detailIndex: number) => {
            lines.push({
                itemDetailKey: detailKey(itemIndex, detailIndex, detail),
                itemName: item.itemName,
                detail: detail.detail,
                quantity: Number(detail.quantity) || 0,
                estimatedUnitCost: Number(detail.unitCost) || 0,
                partNo: detail.partNo
            });
        });
    });
    return lines;
};

const buildQuotesFromPurchase = (purchase: any, employeeId: any) => {
    const quotes: any[] = [];
    (purchase.items || []).forEach((item: any, itemIndex: number) => {
        (item.itemDetails || []).forEach((detail: any, detailIndex: number) => {
            const key = detailKey(itemIndex, detailIndex, detail);
            (detail.comparisons || []).forEach((comparison: any) => {
                const quantity = Number(comparison.quantity ?? detail.quantity) || 0;
                const unitPrice = Number(comparison.unitPrice) || 0;
                const gross = Number(comparison.totalCost) || quantity * unitPrice;
                const discountType = comparison.discountType === 'percent' ? 'percent' : 'amount';
                const discountValue = Number(comparison.discountValue) || 0;
                const discountAmount = discountType === 'percent' ? gross * (discountValue / 100) : discountValue;
                const netAmount = Number(comparison.netAmount) || Math.max(gross - discountAmount, 0);
                const taxPercent = Number(comparison.taxPercent) || 0;
                const freightCost = Number(comparison.freightCost) || 0;
                const landedCost = Number(comparison.landedCost) || netAmount + (netAmount * (taxPercent / 100)) + freightCost;
                quotes.push({
                    supplierId: comparison.supplierId,
                    supplierName: comparison.supplierName,
                    itemDetailKey: key,
                    itemName: item.itemName,
                    detail: detail.detail,
                    quantity,
                    unitPrice,
                    discountType,
                    discountValue,
                    taxPercent,
                    freightCost,
                    totalCost: gross,
                    netAmount,
                    landedCost,
                    etaTerms: comparison.etaTerms,
                    paymentTerms: comparison.paymentTerms,
                    validityDate: comparison.validityDate,
                    warrantyTerms: comparison.warrantyTerms,
                    remarks: comparison.remarks,
                    selected: comparison.selected === true,
                    createdBy: comparison.createdBy || employeeId,
                    createdAt: comparison.createdAt || new Date()
                });
            });
        });
    });
    return quotes;
};

const statusFromQuotes = (quotes: any[]) => {
    if (quotes.some((quote) => quote.selected)) return RfqStatus.Awarded;
    if (quotes.length > 0) return RfqStatus.Quoted;
    return RfqStatus.Open;
};

const stageFromQuotes = (quotes: any[]) => {
    if (quotes.some((quote) => quote.selected)) return RfqStage.FinalizedForPo;
    if (quotes.length > 0) return RfqStage.ProcurementReview;
    return RfqStage.ProcurementReview;
};

const quoteIdentity = (quote: any) =>
    [quote.itemDetailKey, quote.supplierId?.toString?.() || quote.supplierName || ''].join('|');

const changed = (previous: any, next: any) =>
    Number(previous?.unitPrice ?? 0) !== Number(next?.unitPrice ?? 0) ||
    String(previous?.currency || 'QAR') !== String(next?.currency || 'QAR') ||
    String(previous?.paymentTerms || '') !== String(next?.paymentTerms || '') ||
    String(previous?.etaTerms || '') !== String(next?.etaTerms || '') ||
    Number(previous?.leadTimeDays ?? 0) !== Number(next?.leadTimeDays ?? 0) ||
    Boolean(previous?.selected) !== Boolean(next?.selected) ||
    String(previous?.supplierId || previous?.supplierName || '') !== String(next?.supplierId || next?.supplierName || '');

const buildProcurementRevisions = (previousQuotes: any[] = [], nextQuotes: any[] = [], employeeId: any) => {
    const previousByIdentity = new Map(previousQuotes.map((quote) => [quoteIdentity(quote), quote]));
    return nextQuotes
        .map((quote) => {
            const previous = previousByIdentity.get(quoteIdentity(quote));
            if (!previous || !changed(previous, quote)) return null;
            const previousPrice = Number(previous.unitPrice ?? 0);
            const revisedPrice = Number(quote.unitPrice ?? 0);
            return {
                itemDetailKey: quote.itemDetailKey,
                itemName: quote.itemName,
                detail: quote.detail,
                supplierId: quote.supplierId,
                supplierName: quote.supplierName,
                previousSupplierId: previous.supplierId,
                previousSupplierName: previous.supplierName,
                previousUnitPrice: previous.unitPrice,
                revisedUnitPrice: quote.unitPrice,
                previousCurrency: previous.currency || 'QAR',
                revisedCurrency: quote.currency || 'QAR',
                previousPaymentTerms: previous.paymentTerms,
                revisedPaymentTerms: quote.paymentTerms,
                previousDeliveryTerms: previous.etaTerms,
                revisedDeliveryTerms: quote.etaTerms,
                previousLeadTimeDays: previous.leadTimeDays,
                revisedLeadTimeDays: quote.leadTimeDays,
                previousSelected: previous.selected,
                revisedSelected: quote.selected,
                savingsAmount: previousPrice - revisedPrice,
                reason: 'Procurement revision',
                revisedBy: employeeId,
                revisedAt: new Date()
            };
        })
        .filter(Boolean);
};

const resolveSourceSalesRfqId = async (purchase: any) => {
    const jobId = purchase.jobId?._id || purchase.jobId;
    if (!jobId || !ObjectId.isValid(jobId)) return undefined;
    const job: any = await Job.findById(jobId, { quoteId: 1 }).lean();
    const quoteId = job?.quoteId?._id || job?.quoteId;
    if (!quoteId || !ObjectId.isValid(quoteId)) return undefined;
    const quotation: any = await Quotation.findById(quoteId, { sourceRfqId: 1 }).lean();
    return quotation?.sourceRfqId;
};

export const syncRfqFromPurchase = async (purchase: any, employeeId: any) => {
    const requestedLines = buildRequestedLines(purchase);
    const quotes = buildQuotesFromPurchase(purchase, employeeId);
    const status = statusFromQuotes(quotes);
    const stage = stageFromQuotes(quotes);
    const sourceRfqId = await resolveSourceSalesRfqId(purchase);
    const existing = await Rfq.findOne({ purchaseRequestId: purchase._id, rfqType: { $ne: RfqType.Sales }, isDeleted: false });

    if (existing) {
        const revisions = buildProcurementRevisions(existing.quotes || [], quotes, employeeId);
        if (sourceRfqId) existing.sourceRfqId = sourceRfqId;
        existing.purchaseNo = purchase.purchaseNo;
        existing.jobId = purchase.jobId;
        existing.customerId = purchase.customerId;
        existing.requestedLines = requestedLines;
        existing.quotes = quotes;
        existing.status = status;
        existing.stage = revisions.length ? RfqStage.ProcurementRevised : stage;
        existing.revisions = [...(existing.revisions || []), ...revisions] as any;
        existing.awardedAt = status === RfqStatus.Awarded && !existing.awardedAt ? new Date() : existing.awardedAt;
        existing.awardedBy = status === RfqStatus.Awarded && !existing.awardedBy ? employeeId : existing.awardedBy;
        existing.updatedBy = employeeId;
        existing.updatedAt = new Date();
        return existing.save();
    }

    return Rfq.create({
        rfqNo: await nextRfqNo(),
        rfqType: RfqType.Procurement,
        sourceRfqId,
        purchaseRequestId: purchase._id,
        purchaseNo: purchase.purchaseNo,
        jobId: purchase.jobId,
        customerId: purchase.customerId,
        requestedLines,
        quotes,
        status,
        stage,
        awardedAt: status === RfqStatus.Awarded ? new Date() : undefined,
        awardedBy: status === RfqStatus.Awarded ? employeeId : undefined,
        createdBy: employeeId
    });
};

export const createRfqFromPurchase = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: "Employee not found" });

        const purchase = await PurchaseRequest.findOne({ _id: req.params.purchaseId, isDeleted: false });
        if (!purchase) return res.status(404).json({ success: false, message: "Purchase request not found" });
        if (purchase.status !== 'Approved') {
            return res.status(400).json({ success: false, message: "Only approved PRs can be moved to RFQ" });
        }

        const rfq = await syncRfqFromPurchase(purchase, employee._id);
        return res.status(201).json({ success: true, message: "RFQ created successfully", data: rfq });
    } catch (error) {
        next(error);
    }
};

export const getRfqs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, row, status, search } = req.body;
        const pageNumber = Number(page) || 1;
        const pageSize = Number(row) || 10;
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: "Employee not found" });

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.purchase?.viewReport
            ? await buildPrivilegeAccessFilter(employee._id, privileges.purchase.viewReport, 'createdBy')
            : {};

        const matchStage: any = { isDeleted: false, rfqType: RfqType.Procurement, purchaseRequestId: { $exists: true, $ne: null }, ...accessFilter };
        if (Array.isArray(status) && status.length) matchStage.status = { $in: status };
        else if (status) matchStage.status = status;
        if (search) {
            matchStage.$or = [
                { rfqNo: { $regex: search, $options: 'i' } },
                { purchaseNo: { $regex: search, $options: 'i' } },
                { 'suppliers.supplierName': { $regex: search, $options: 'i' } },
            ];
        }

        const pipeline: any[] = [
            { $match: matchStage },
            { $lookup: { from: 'purchases', localField: 'purchaseRequestId', foreignField: '_id', as: 'purchaseRequest' } },
            { $unwind: { path: '$purchaseRequest', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customerId' } },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'jobId' } },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'createdBy', pipeline: [{ $project: { password: 0 } }] } },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    requestedLineCount: { $size: { $ifNull: ['$requestedLines', []] } },
                    quoteLineCount: { $size: { $ifNull: ['$quotes', []] } },
                    awardedLineCount: {
                        $size: {
                            $filter: { input: { $ifNull: ['$quotes', []] }, as: 'quote', cond: { $eq: ['$$quote.selected', true] } }
                        }
                    },
                    awardedSuppliers: {
                        $setUnion: [
                            {
                                $map: {
                                    input: { $filter: { input: { $ifNull: ['$quotes', []] }, as: 'quote', cond: { $eq: ['$$quote.selected', true] } } },
                                    as: 'quote',
                                    in: '$$quote.supplierName'
                                }
                            },
                            []
                        ]
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            { $facet: { data: [{ $skip: (pageNumber - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'count' }] } }
        ];

        const result = await Rfq.aggregate(pipeline);
        const data = result[0]?.data || [];
        const total = result[0]?.total?.[0]?.count || 0;
        return res.status(200).json({ success: true, rfqs: { data, total, page: pageNumber, row: pageSize } });
    } catch (error) {
        next(error);
    }
};

export const getRfqById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rfq = await Rfq.findOne({ _id: req.params.id, isDeleted: false })
            .populate('purchaseRequestId')
            .populate('jobId')
            .populate('customerId')
            .populate('createdBy', '-password');
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        return res.status(200).json({ success: true, data: rfq });
    } catch (error) {
        next(error);
    }
};

const quoteSupplierKey = (quote: any) => String(quote.supplierId || quote.supplierName || "");

/**
 * Read-only comparison of a procurement RFQ in the shape the shared compare matrix uses: one column per
 * supplier, one row per requested line. Awards are still made on the PR's supplier-offers page.
 */
export const getRfqComparison = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rfq: any = await Rfq.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });

        const quotes: any[] = rfq.quotes || [];
        const columns = new Map<string, any>();
        quotes.forEach((quote) => {
            const key = quoteSupplierKey(quote);
            if (!columns.has(key)) columns.set(key, { _id: key, rfqNo: rfq.rfqNo, status: rfq.status, supplierName: quote.supplierName || "Supplier", quotationId: null, lineCount: 0, wonCount: 0 });
        });

        const rows = (rfq.requestedLines || []).map((line: any) => {
            const lineQuotes = quotes.filter((quote) => quote.itemDetailKey === line.itemDetailKey);
            const anyWon = lineQuotes.some((quote) => quote.selected);
            const cells = Array.from(columns.values()).map((column) => {
                const quote = lineQuotes.find((q) => quoteSupplierKey(q) === column._id);
                if (!quote) return null;
                const quantity = Number(quote.quantity) || Number(line.quantity) || 1;
                const total = Number(quote.landedCost) || Number(quote.netAmount) || Number(quote.totalCost) || 0;
                const unitLanded = total ? total / quantity : Number(quote.unitPrice) || 0;
                const currency = quote.currency || "QAR";
                column.lineCount++;
                if (quote.selected) column.wonCount++;
                return {
                    rfqId: column._id,
                    lineKey: line.itemDetailKey,
                    lineStatus: quote.selected ? RfqLineStatus.Confirmed : anyWon ? RfqLineStatus.Lost : RfqLineStatus.Pending,
                    quote: {
                        _id: String(quote._id),
                        unitPrice: Number(quote.unitPrice) || 0,
                        unitLanded,
                        unitLandedQar: currency === "QAR" ? unitLanded : null,
                        currency,
                        leadTimeDays: quote.leadTimeDays,
                        availability: quote.availability,
                        quantity,
                        remarks: quote.remarks,
                        selected: !!quote.selected,
                    },
                };
            }).filter(Boolean) as any[];
            const lowest = cells.filter((c) => c.quote.unitLandedQar != null).sort((a, b) => a.quote.unitLandedQar - b.quote.unitLandedQar)[0];
            const won = cells.find((c) => c.lineStatus === RfqLineStatus.Confirmed);
            return {
                key: line.itemDetailKey,
                itemName: line.itemName || "Items",
                detail: line.detail,
                quantity: line.quantity,
                partNo: line.partNo,
                status: won ? "awarded" : cells.length ? "open" : "waiting",
                awardedRfqId: won?.rfqId ?? null,
                lowestRfqId: lowest?.rfqId ?? null,
                cells,
            };
        });

        const count = (status: string) => rows.filter((row: any) => row.status === status).length;
        return res.status(200).json({
            success: true,
            data: {
                enquiry: { _id: "", enquiryId: rfq.purchaseNo },
                rfqs: Array.from(columns.values()),
                rows,
                coverage: { total: rows.length, awarded: count("awarded"), unavailable: 0, open: count("open") + count("waiting") },
                quotationId: null,
            }
        });
    } catch (error) {
        next(error);
    }
};
