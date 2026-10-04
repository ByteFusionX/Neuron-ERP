import { NextFunction, Request, Response } from "express";
import Rfq, { RfqStatus } from "../models/rfq.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
import { getNextSequence } from "../models/counter.model";
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

const seedRfqNoSequence = async (): Promise<number> => {
    const latest = await Rfq.findOne().sort({ rfqNo: -1 });
    if (!latest) return 0;
    const lastCounter = parseInt(String(latest.rfqNo).split('-').pop() || '', 10);
    return Number.isNaN(lastCounter) ? 0 : lastCounter;
};

const nextRfqNo = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const nextNumber = await getNextSequence('rfqNo', seedRfqNoSequence);
    return `NRN/RFQ-${year}-${month}-${nextNumber.toString().padStart(4, '0')}`;
};

export const syncRfqFromPurchase = async (purchase: any, employeeId: any) => {
    const requestedLines = buildRequestedLines(purchase);
    const quotes = buildQuotesFromPurchase(purchase, employeeId);
    const status = statusFromQuotes(quotes);
    const existing = await Rfq.findOne({ purchaseRequestId: purchase._id, isDeleted: false });

    if (existing) {
        existing.purchaseNo = purchase.purchaseNo;
        existing.jobId = purchase.jobId;
        existing.customerId = purchase.customerId;
        existing.requestedLines = requestedLines;
        existing.quotes = quotes;
        existing.status = status;
        existing.awardedAt = status === RfqStatus.Awarded && !existing.awardedAt ? new Date() : existing.awardedAt;
        existing.awardedBy = status === RfqStatus.Awarded && !existing.awardedBy ? employeeId : existing.awardedBy;
        existing.updatedBy = employeeId;
        existing.updatedAt = new Date();
        return existing.save();
    }

    return Rfq.create({
        rfqNo: await nextRfqNo(),
        purchaseRequestId: purchase._id,
        purchaseNo: purchase.purchaseNo,
        jobId: purchase.jobId,
        customerId: purchase.customerId,
        requestedLines,
        quotes,
        status,
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

        const matchStage: any = { isDeleted: false, ...accessFilter };
        if (Array.isArray(status) && status.length) matchStage.status = { $in: status };
        else if (status) matchStage.status = status;
        if (search) {
            matchStage.$or = [
                { rfqNo: { $regex: search, $options: 'i' } },
                { purchaseNo: { $regex: search, $options: 'i' } },
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
