import { NextFunction, Request, Response } from "express";
import Rfq, { RfqLineStatus, RfqStatus, RfqType } from "../models/rfq.model";
import Job from "../models/job.model";
import Quotation from "../models/quotation.model";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

/** The sales RFQ a purchase request's job was quoted from, so a supplier RFQ can trace back to it. */
export const resolveSourceSalesRfqId = async (purchase: any) => {
    const jobId = purchase.jobId?._id || purchase.jobId;
    if (!jobId || !ObjectId.isValid(jobId)) return undefined;
    const job: any = await Job.findById(jobId, { quoteId: 1 }).lean();
    const quoteId = job?.quoteId?._id || job?.quoteId;
    if (!quoteId || !ObjectId.isValid(quoteId)) return undefined;
    const quotation: any = await Quotation.findById(quoteId, { sourceRfqId: 1 }).lean();
    return quotation?.sourceRfqId;
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

/** Shapes requested lines and supplier quotes into the grid the shared compare matrix draws: one column per supplier, one row per requested line. */
const buildComparison = (rfq: any, label: string) => {
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
    return {
        enquiry: { _id: "", enquiryId: label },
        rfqs: Array.from(columns.values()),
        rows,
        coverage: { total: rows.length, awarded: count("awarded"), unavailable: 0, open: count("open") + count("waiting") },
        quotationId: null,
    };
};

export const getRfqComparison = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rfq: any = await Rfq.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });
        return res.status(200).json({ success: true, data: buildComparison(rfq, rfq.purchaseNo) });
    } catch (error) {
        next(error);
    }
};
