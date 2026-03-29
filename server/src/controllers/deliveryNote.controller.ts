import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DeliveryNote from '../models/deliveryNote.model';
import StockEntry from '../models/stockEntry.model';
import Product from '../models/products.model';
import Job from '../models/job.model';
import Quotation from '../models/quotation.model';
import PurchaseRequest from '../models/purchaseRequest.model';
import PurchaseOrder from '../models/purchaseOrder.model';
import InventoryDeduction from '../models/inventoryDeduction.model';
import GRN from '../models/grn.model';
import { Invoice } from '../models/invoice.model';
import { checkAndUpdateJobCompletionStatus } from './job.controller';

/**
 * Deduct inventory (StockEntry) for each inventory item in a posted DN.
 * Creates InventoryDeduction records for audit trail.
 */
const deductInventoryForDn = async (dn: any, userId?: string): Promise<void> => {
    if (!dn || !dn.items || !Array.isArray(dn.items)) return;

    for (const item of dn.items) {
        if (!item.isInventoryItem) continue;

        const qty = item.currentDeliveryQty || 0;
        if (qty <= 0) continue;

        // Look up Product by partNo string
        const product = await Product.findOne({ partNo: item.partNo, isDeleted: { $ne: true } });
        if (!product) {
            console.warn(`deductInventoryForDn: Product not found for partNo "${item.partNo}", skipping.`);
            continue;
        }

        // Find a StockEntry for this product – prefer one matching the same jobId, FIFO (oldest first)
        let stockEntry = await StockEntry.findOne({
            partNo: product._id,
            jobId: dn.jobId,
            quantity: { $gt: 0 },
            isDeleted: { $ne: true }
        }).sort({ createdDate: 1 });

        // Fallback: any stock entry for this product with available quantity
        if (!stockEntry) {
            stockEntry = await StockEntry.findOne({
                partNo: product._id,
                quantity: { $gt: 0 },
                isDeleted: { $ne: true }
            }).sort({ createdDate: 1 });
        }

        if (!stockEntry) {
            console.warn(`deductInventoryForDn: No StockEntry with available qty for product "${item.partNo}", skipping.`);
            continue;
        }

        const stockBefore = stockEntry.quantity;
        const deductQty = Math.min(qty, stockBefore); // Never deduct more than available
        const stockAfter = stockBefore - deductQty;

        // Reduce stock entry quantity
        stockEntry.quantity = stockAfter;
        stockEntry.updatedDate = new Date();
        await stockEntry.save();

        // Create deduction record
        await InventoryDeduction.create({
            dnId: dn._id,
            dnNo: dn.dnNo,
            dnDate: dn.dnDate,
            jobId: dn.jobId,
            customerName: dn.clientName || '',
            stockEntryId: stockEntry._id,
            productId: product._id,
            partNo: item.partNo,
            description: item.description || '',
            uom: stockEntry.uom || '',
            quantityDeducted: deductQty,
            stockBefore,
            stockAfter,
            deductedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
            deductedDate: new Date(),
            isReversed: false,
        });
    }
};

/**
 * Reverse all inventory deductions for a DN (used when cancelling).
 * Restores StockEntry quantities and marks deduction records as reversed.
 */
const reverseInventoryDeductions = async (dnId: string): Promise<void> => {
    const deductions = await InventoryDeduction.find({
        dnId: new mongoose.Types.ObjectId(dnId),
        isReversed: false,
    });

    for (const deduction of deductions) {
        // Restore stock entry quantity
        await StockEntry.findByIdAndUpdate(deduction.stockEntryId, {
            $inc: { quantity: deduction.quantityDeducted },
            $set: { updatedDate: new Date() }
        });

        // Mark deduction as reversed
        deduction.isReversed = true;
        deduction.reversedDate = new Date();
        await deduction.save();
    }
};

export const generateDnNumber = async (req: Request, res: Response) => {
    try {
        const lastDn = await DeliveryNote.findOne().sort({ createdDate: -1 });
        let nextNum = 1;
        if (lastDn && lastDn.dnNo) {
            const matches = lastDn.dnNo.match(/DN-(\d+)/);
            if (matches && matches[1]) {
                nextNum = parseInt(matches[1], 10) + 1;
            }
        }
        const dnNumber = `DN-${String(nextNum).padStart(4, '0')}`;
        res.status(200).json({ dnNumber });
    } catch (error) {
        res.status(500).json({ message: 'Error generating DN Number', error });
    }
};

const calculateDnStatus = async (jobId: string, currentDnItems: any[], excludeDnId?: string): Promise<string> => {
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId) || !currentDnItems || currentDnItems.length === 0) {
        return 'Draft';
    }

    const query: any = {
        jobId: new mongoose.Types.ObjectId(jobId),
        status: { $nin: ['Cancelled', 'Draft'] }
    };

    if (excludeDnId && mongoose.Types.ObjectId.isValid(excludeDnId)) {
        query._id = { $ne: new mongoose.Types.ObjectId(excludeDnId) };
    }

    const allDns = await DeliveryNote.find(query);

    let allItemsFullyDelivered = true;
    let anyItemDelivered = false;

    for (const currentItem of currentDnItems) {
        const itemId = currentItem.itemId;
        const orderedQty = currentItem.orderedQty || 0;
        const currentDeliveryQty = currentItem.currentDeliveryQty || 0;

        let totalDelivered = 0;

        for (const dn of allDns) {
            if (dn.items && Array.isArray(dn.items)) {
                const matchingItem = dn.items.find((i: any) => i.itemId === itemId);
                if (matchingItem) {
                    totalDelivered += matchingItem.currentDeliveryQty || 0;
                }
            }
        }

        totalDelivered += currentDeliveryQty;

        if (totalDelivered >= orderedQty) {
            anyItemDelivered = true;
        } else if (totalDelivered > 0) {
            allItemsFullyDelivered = false;
            anyItemDelivered = true;
        } else {
            allItemsFullyDelivered = false;
        }
    }

    if (anyItemDelivered) {
        return 'Delivered';
    }

    return 'Draft';
};

export const createDn = async (req: Request, res: Response) => {
    try {
        const { dnNo, dnDate, jobId, items, status } = req.body;

        if (items && Array.isArray(items)) {
            items.forEach((item: any, index: number) => {
                if (item.serialNos) {
                    if (typeof item.serialNos === 'string') {
                        item.serialNos = item.serialNos.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean);
                    } else if (!Array.isArray(item.serialNos)) {
                        item.serialNos = [];
                    }
                } else {
                    item.serialNos = [];
                }
            });
        }

        console.log('Creating DN with items:', JSON.stringify(items, null, 2));

        let finalStatus = status || 'Draft';

        if (status !== 'Draft' && jobId && items && items.length > 0) {
            finalStatus = await calculateDnStatus(jobId, items);
        }

        const newDn = new DeliveryNote({
            ...req.body,
            status: finalStatus,
            createdBy: (req as any).user?._id
        });
        const savedDn = await newDn.save();

        console.log('DN Created Successfully. Serial Numbers:', savedDn.items.map((item: any) => ({
            partNo: item.partNo,
            serialNos: item.serialNos
        })));

        // Deduct from inventory if DN is posted (not Draft)
        if (finalStatus !== 'Draft') {
            await deductInventoryForDn(savedDn, (req as any).user?._id);
        }

        if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
            await checkAndUpdateJobCompletionStatus(jobId);
        }

        res.status(201).json({ success: true, data: savedDn });
    } catch (error) {
        console.error("Create DN Error:", error);
        res.status(500).json({ message: 'Error creating Delivery Note', error });
    }
};

export const getDnsByJobId = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const dns = await DeliveryNote.find({ jobId }).sort({ dnDate: -1 });
        res.status(200).json(dns);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching DNs', error });
    }
};

export const getAllDeliveryNotes = async (req: Request, res: Response) => {
    try {
        let { page, search, row, jobId, customer, fromDate, toDate, status } = req.body;
        let skipNum: number = (page - 1) * row;

        let searchRegex = search ? search.split('').join('\\s*') : '';

        let isJob = jobId == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isStatus = status == null ? true : false;

        let matchFilters = {
            $and: [
                ...(status ? [{ status: status }] : []),
                ...(jobId ? [{ jobId: new mongoose.Types.ObjectId(jobId) }] : []),
                ...(customer ? [{ clientName: { $regex: customer, $options: 'i' } }] : []),
                { dnNo: { $regex: search || '', $options: 'i' } },
                {
                    $or: [
                        { $and: [{ dnDate: { $gte: new Date(fromDate) } }, { dnDate: { $lte: new Date(toDate) } }] },
                        { dnDate: { $exists: isDate } }
                    ]
                }
            ]
        };

        let total: number = 0;
        await DeliveryNote.aggregate([
            { $match: matchFilters },
            { $count: "total" }
        ]).exec().then((result: any) => {
            if (result && result.length > 0) {
                total = result[0].total;
            }
        });

        let dns = await DeliveryNote.aggregate([
            { $match: matchFilters },
            { $sort: { dnNo: -1 } },
            { $skip: skipNum },
            { $limit: row },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job'
                }
            },
            { $unwind: '$job' },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'job.quoteId',
                    foreignField: '_id',
                    as: 'quote'
                }
            },
            { $unwind: { path: '$quote', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    'job.client': '$quote.client'
                }
            },

            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } }
        ]);

        if (!dns || !total) return res.status(200).json({ total: 0, dns: [] });
        return res.status(200).json({ total: total, dns: dns });

    } catch (error) {
        console.error("Get All DNs Error:", error);
        res.status(500).json({ message: 'Error fetching DNs', error });
    }
};

export const getDnById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dn = await DeliveryNote.findById(id)
            .populate('jobId', 'jobId projectName')
            .populate('createdBy', 'firstName lastName');

        if (!dn) {
            return res.status(404).json({ message: 'Delivery Note not found' });
        }

        return res.status(200).json(dn);
    } catch (error) {
        console.error("Get DN by ID Error:", error);
        res.status(500).json({ message: 'Error fetching DN', error });
    }
};

export const getDraftDnByJobId = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        const draftDn = await DeliveryNote.findOne({
            jobId: new mongoose.Types.ObjectId(jobId),
            status: 'Draft'
        })
            .populate('jobId', 'jobId projectName')
            .populate('createdBy', 'firstName lastName');

        if (!draftDn) {
            return res.status(200).json(null);
        }

        return res.status(200).json(draftDn);
    } catch (error) {
        console.error("Get Draft DN Error:", error);
        res.status(500).json({ message: 'Error fetching draft DN', error });
    }
};

export const updateDn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { items, status } = req.body;

        const dn = await DeliveryNote.findById(id);

        if (!dn) {
            return res.status(404).json({ message: 'Delivery Note not found' });
        }

        if (dn.status !== 'Draft') {
            return res.status(400).json({ message: 'Only draft DNs can be updated' });
        }

        if (items && Array.isArray(items)) {
            items.forEach((item: any) => {
                if (item.serialNos) {
                    if (typeof item.serialNos === 'string') {
                        item.serialNos = item.serialNos.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean);
                    } else if (!Array.isArray(item.serialNos)) {
                        item.serialNos = [];
                    }
                } else {
                    item.serialNos = [];
                }
            });
        }

        let finalStatus = status || 'Draft';

        if (status !== 'Draft' && dn.jobId && items && items.length > 0) {
            finalStatus = await calculateDnStatus(dn.jobId.toString(), items, id);
        }

        const previousStatus = dn.status; // Capture before update

        Object.assign(dn, {
            ...req.body,
            status: finalStatus,
            updatedDate: new Date()
        });

        const updatedDn = await dn.save();

        // Deduct from inventory if transitioning from Draft to non-Draft
        if (previousStatus === 'Draft' && finalStatus !== 'Draft') {
            await deductInventoryForDn(updatedDn, (req as any).user?._id);
        }

        if (dn.jobId && mongoose.Types.ObjectId.isValid(dn.jobId.toString())) {
            await checkAndUpdateJobCompletionStatus(dn.jobId.toString());
        }

        return res.status(200).json({ success: true, data: updatedDn });
    } catch (error) {
        console.error("Update DN Error:", error);
        res.status(500).json({ message: 'Error updating Delivery Note', error });
    }
};

export const cancelDn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dn = await DeliveryNote.findById(id);

        if (!dn) {
            return res.status(404).json({ message: 'Delivery Note not found' });
        }

        if (dn.status === 'Cancelled') {
            return res.status(400).json({ message: 'Delivery Note is already cancelled' });
        }

        const wasDraft = dn.status === 'Draft';

        dn.status = 'Cancelled';
        dn.updatedDate = new Date();
        await dn.save();

        // Reverse inventory deductions if the DN was not a draft (i.e. stock was deducted)
        if (!wasDraft) {
            await reverseInventoryDeductions(id);
        }

        return res.status(200).json({ message: 'Delivery Note cancelled successfully', dn });
    } catch (error) {
        console.error("Cancel DN Error:", error);
        res.status(500).json({ message: 'Error cancelling DN', error });
    }
};

export const getInventoryDeductionReport = async (req: Request, res: Response) => {
    try {
        let { page, row, fromDate, toDate, customerName, jobId, dnNumber, partNo, status } = req.body;
        page = page || 1;
        row = row || 10;
        const skipNum: number = (page - 1) * row;

        // Build match filters on the InventoryDeduction collection
        const matchFilters: any = {};

        if (fromDate && toDate) {
            matchFilters.dnDate = { $gte: new Date(fromDate), $lte: new Date(toDate) };
        }
        if (customerName) {
            matchFilters.customerName = { $regex: customerName, $options: 'i' };
        }
        if (jobId) {
            matchFilters.jobId = new mongoose.Types.ObjectId(jobId);
        }
        if (dnNumber) {
            matchFilters.dnNo = { $regex: dnNumber, $options: 'i' };
        }
        if (partNo) {
            matchFilters.partNo = { $regex: partNo, $options: 'i' };
        }
        if (status && Array.isArray(status) && status.length > 0) {
            const hasDeducted = status.includes('Deducted');
            const hasReversed = status.includes('Reversed');
            if (hasDeducted && !hasReversed) {
                matchFilters.isReversed = { $ne: true };
            } else if (hasReversed && !hasDeducted) {
                matchFilters.isReversed = true;
            }
            // If both are selected, no filter needed (show all)
        }

        const pipeline: any[] = [
            { $match: matchFilters },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job'
                }
            },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            { $sort: { deductedDate: -1 } }
        ];

        // Count total
        const countResult = await InventoryDeduction.aggregate([...pipeline, { $count: 'total' }]);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // Fetch paginated data
        const deductions = await InventoryDeduction.aggregate([
            ...pipeline,
            { $skip: skipNum },
            { $limit: row },
            {
                $project: {
                    _id: 1,
                    dnId: 1,
                    dnNumber: '$dnNo',
                    date: '$dnDate',
                    jobId: '$job.jobId',
                    jobMongoId: '$jobId',
                    customerName: 1,
                    partNo: 1,
                    description: 1,
                    uom: 1,
                    quantityDeducted: 1,
                    stockBefore: 1,
                    stockAfter: 1,
                    deductedDate: 1,
                    status: {
                        $cond: {
                            if: '$isReversed',
                            then: 'Reversed',
                            else: 'Deducted'
                        }
                    }
                }
            }
        ]);

        res.status(200).json({
            data: {
                items: deductions,
                pagination: {
                    total,
                    page,
                    limit: row,
                    pages: Math.ceil(total / row)
                }
            }
        });

    } catch (error) {
        console.error("Inventory Deduction Report Error:", error);
        res.status(500).json({ message: 'Error generating report', error });
    }
};

export const getPendingDeliveriesSummary = async (req: Request, res: Response) => {
    try {
        let { page, row, customerName, jobId, supplierName, supplierLpoNo, status } = req.body;
        page = page || 1;
        row = row || 10;

        const pipeline: any[] = [
            { $match: { isDeleted: { $ne: true }, status: 'Approved' } },
            { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$items.itemDetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    pipeline: [
                        { $match: { isDeleted: { $ne: true } } },
                        { $project: { jobId: 1, quoteId: 1 } }
                    ],
                    as: 'job'
                }
            },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'job.quoteId',
                    foreignField: '_id',
                    pipeline: [{ $project: { client: 1 } }],
                    as: 'quotation'
                }
            },
            { $unwind: { path: '$quotation', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'quotation.client',
                    foreignField: '_id',
                    pipeline: [{ $project: { companyName: 1 } }],
                    as: 'customer'
                }
            },
            { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'deliverynotes',
                    let: {
                        jobObjId: '$job._id',
                        itemDetailId: { $convert: { input: '$items.itemDetails._id', to: 'string', onError: '', onNull: '' } }
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$jobId', '$$jobObjId'] },
                                status: { $nin: ['Cancelled', 'Draft'] }
                            }
                        },
                        { $unwind: '$items' },
                        { $match: { $expr: { $eq: ['$items.itemId', '$$itemDetailId'] } } },
                        { $group: { _id: null, total: { $sum: '$items.currentDeliveryQty' } } }
                    ],
                    as: 'dnData'
                }
            },
            {
                $addFields: {
                    _deliveredQty: { $ifNull: [{ $arrayElemAt: ['$dnData.total', 0] }, 0] },
                    _prQty: { $ifNull: ['$items.itemDetails.quantity', 0] }
                }
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            { $lte: ['$_prQty', 0] },
                            { $lt: ['$_deliveredQty', '$_prQty'] }
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: 'purchaseorders',
                    let: {
                        prId: '$_id',
                        itemPartNo: '$items.itemDetails.partNo',
                        itemDetail: { $toLower: { $trim: { input: { $ifNull: ['$items.itemDetails.detail', ''] } } } }
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$purchaseId', '$$prId'] },
                                        { $eq: ['$poStatus', 'Closed'] }
                                    ]
                                }
                            }
                        },
                        { $unwind: '$items' },
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        {
                                            $and: [
                                                { $ne: ['$$itemPartNo', null] },
                                                { $ne: ['$items.partNo', null] },
                                                { $eq: [
                                                    { $convert: { input: '$items.partNo', to: 'string', onError: '', onNull: '' } },
                                                    { $convert: { input: '$$itemPartNo', to: 'string', onError: '', onNull: '' } }
                                                ] }
                                            ]
                                        },
                                        {
                                            $and: [
                                                { $ne: ['$$itemDetail', ''] },
                                                { $ne: ['$items.detail', null] },
                                                { $eq: [{ $toLower: { $trim: { input: '$items.detail' } } }, '$$itemDetail'] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: 'suppliers',
                                localField: 'supplierId',
                                foreignField: '_id',
                                pipeline: [{ $project: { supplierName: 1 } }],
                                as: 'supplier'
                            }
                        },
                        { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: 'grns',
                                let: {
                                    poId: '$_id',
                                    poItemDetail: { $toLower: { $trim: { input: '$items.detail' } } }
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ['$purchaseOrderId', '$$poId'] },
                                            isDeleted: { $ne: true }
                                        }
                                    },
                                    { $unwind: '$items' },
                                    {
                                        $match: {
                                            $expr: {
                                                $eq: [
                                                    { $toLower: { $trim: { input: '$items.itemDescription' } } },
                                                    '$$poItemDetail'
                                                ]
                                            }
                                        }
                                    },
                                    { $group: { _id: null, total: { $sum: '$items.acceptedQty' } } }
                                ],
                                as: 'grnData'
                            }
                        },
                        {
                            $project: {
                                orderedQty: '$items.quantity',
                                receivedQty: { $ifNull: [{ $arrayElemAt: ['$grnData.total', 0] }, 0] },
                                supplierName: { $ifNull: ['$supplier.supplierName', ''] },
                                poNo: 1
                            }
                        }
                    ],
                    as: 'poData'
                }
            },
            {
                $addFields: {
                    _hasPO: { $gt: [{ $size: '$poData' }, 0] },
                    _firstPO: { $arrayElemAt: ['$poData', 0] }
                }
            },
            {
                $project: {
                    _id: 0,
                    customerName: { $ifNull: ['$customer.companyName', ''] },
                    jobId: '$job.jobId',
                    description: { $ifNull: ['$items.itemDetails.detail', ''] },
                    supplierName: {
                        $cond: {
                            if: '$_hasPO',
                            then: { $ifNull: ['$_firstPO.supplierName', ''] },
                            else: ''
                        }
                    },
                    supplierLpoNo: {
                        $cond: {
                            if: '$_hasPO',
                            then: { $ifNull: ['$_firstPO.poNo', ''] },
                            else: ''
                        }
                    },
                    orderedQty: {
                        $cond: { if: '$_hasPO', then: { $ifNull: ['$_firstPO.orderedQty', 0] }, else: null }
                    },
                    receivedQty: {
                        $cond: { if: '$_hasPO', then: { $ifNull: ['$_firstPO.receivedQty', 0] }, else: null }
                    },
                    deliveredQty: {
                        $cond: { if: '$_hasPO', then: '$_deliveredQty', else: null }
                    },
                    balanceQty: {
                        $cond: {
                            if: '$_hasPO',
                            then: { $max: [0, { $subtract: [{ $ifNull: ['$_firstPO.orderedQty', 0] }, { $ifNull: ['$_firstPO.receivedQty', 0] }] }] },
                            else: null
                        }
                    },
                    status: {
                        $cond: {
                            if: { $gt: ['$_deliveredQty', 0] },
                            then: 'Partially Delivered',
                            else: 'Not Delivered'
                        }
                    }
                }
            }
        ];

        pipeline.push({
            $match: {
                $expr: {
                    $not: {
                        $and: [
                            { $ne: ['$orderedQty', null] },
                            { $gt: ['$orderedQty', 0] },
                            { $gte: ['$deliveredQty', '$orderedQty'] }
                        ]
                    }
                }
            }
        });

        const filterMatch: any = {};
        if (customerName) filterMatch.customerName = { $regex: customerName, $options: 'i' };
        if (jobId) filterMatch.jobId = { $regex: jobId, $options: 'i' };
        if (supplierName) filterMatch.supplierName = { $regex: supplierName, $options: 'i' };
        if (supplierLpoNo) filterMatch.supplierLpoNo = { $regex: supplierLpoNo, $options: 'i' };
        if (status) {
            const statusArr = Array.isArray(status) ? status : [status];
            filterMatch.status = { $in: statusArr };
        }
        if (Object.keys(filterMatch).length > 0) {
            pipeline.push({ $match: filterMatch });
        }

        pipeline.push({
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [
                    { $skip: (page - 1) * row },
                    { $limit: row }
                ]
            }
        });

        const result = await PurchaseRequest.aggregate(pipeline).allowDiskUse(true);

        

        const total = result[0]?.metadata[0]?.total || 0;
        const items = (result[0]?.data || []).map((r: any, i: number) => ({
            ...r,
            slNo: (page - 1) * row + i + 1
        }));

        return res.status(200).json({ total, items });
    } catch (error) {
        console.error('Get Pending Deliveries Summary Error:', error);
        res.status(500).json({ message: 'Error fetching pending deliveries summary', error });
    }
};

export const getPendingDeliveryDetails = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
            return res.status(400).json({ message: 'Invalid Job ID' });
        }

        const job = await Job.findById(jobId).lean();
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        const quotation = job.quoteId ? await Quotation.findById(job.quoteId).lean() : null;
        if (!quotation || !quotation.optionalItems || quotation.optionalItems.length === 0) {
            return res.status(200).json({
                job: {
                    _id: job._id,
                    jobId: job.jobId,
                    customer: (job as any).clientDetails?.companyName || (job as any).client?.companyName || '',
                    projectName: (job as any).projectName || ''
                },
                items: []
            });
        }

        let allItems: any[] = [];
        quotation.optionalItems.forEach((opt: any) => {
            if (opt.items) {
                opt.items.forEach((item: any) => {
                    if (item.itemDetails) {
                        allItems.push(...item.itemDetails.map((detail: any) => ({
                            ...detail,
                            itemName: item.itemName
                        })));
                    }
                });
            }
        });

        const dns = await DeliveryNote.find({
            jobId: new mongoose.Types.ObjectId(jobId),
            status: { $nin: ['Cancelled', 'Draft'] }
        }).lean();

        const itemsResult: any[] = [];

        allItems.forEach((item: any, index: number) => {
            const orderedQty = item.quantity || 0;
            let deliveredQty = 0;
            const deliveryNotes: any[] = [];

            dns.forEach(dn => {
                if (dn.items && Array.isArray(dn.items)) {
                    dn.items.forEach((dnItem: any) => {
                        if (dnItem.itemId === String(item._id)) {
                            const qty = dnItem.currentDeliveryQty || 0;
                            if (qty > 0) {
                                deliveredQty += qty;
                                deliveryNotes.push({
                                    dnId: dn._id,
                                    dnNo: dn.dnNo,
                                    dnDate: dn.dnDate,
                                    currentDeliveryQty: qty
                                });
                            }
                        }
                    });
                }
            });

            const balanceQty = Math.max(0, orderedQty - deliveredQty);

            itemsResult.push({
                slNo: index + 1,
                itemId: item._id,
                partNo: item.partNo || item.itemName || '',
                description: item.detail || item.itemDescription || '',
                orderedQty,
                deliveredQty,
                balanceQty,
                deliveryNotes
            });
        });

        const customerName = (job as any).clientDetails?.companyName || (job as any).client?.companyName || '';

        return res.status(200).json({
            job: {
                _id: job._id,
                jobId: job.jobId,
                customer: customerName,
                projectName: (job as any).projectName || ''
            },
            items: itemsResult
        });
    } catch (error) {
        console.error('Get Pending Delivery Details Error:', error);
        res.status(500).json({ message: 'Error fetching pending delivery details', error });
    }
};

export const getDnItemsForJob = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
            return res.status(400).json({ success: false, message: 'Invalid Job ID' });
        }

        const pipeline = await PurchaseRequest.aggregate([
            {
                $match: {
                    jobId: new mongoose.Types.ObjectId(jobId),
                    status: 'Approved',
                    isDeleted: { $ne: true }
                }
            },
            { $unwind: '$items' },
            { $unwind: '$items.itemDetails' },
            {
                $lookup: {
                    from: 'purchaseorders',
                    let: { prId: '$_id', itemDetail: '$items.itemDetails.detail' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$purchaseId', '$$prId'] },
                                poStatus: 'Closed'
                            }
                        },
                        { $unwind: '$items' },
                        { $match: { $expr: { $eq: ['$items.detail', '$$itemDetail'] } } },
                        { $group: { _id: null, totalClosedQty: { $sum: '$items.quantity' } } }
                    ],
                    as: 'closedPoInfo'
                }
            },
            {
                $lookup: {
                    from: 'purchaseorders',
                    let: { prId: '$_id', itemDetail: '$items.itemDetails.detail' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$purchaseId', '$$prId'] } } },
                        { $unwind: '$items' },
                        { $match: { $expr: { $eq: ['$items.detail', '$$itemDetail'] } } },
                        { $limit: 1 }
                    ],
                    as: 'anyPoInfo'
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.itemDetails.partNo',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            {
                $addFields: {
                    closedQty: {
                        $ifNull: [{ $arrayElemAt: ['$closedPoInfo.totalClosedQty', 0] }, 0]
                    },
                    hasAnyPO: { $gt: [{ $size: '$anyPoInfo' }, 0] },
                    product: { $arrayElemAt: ['$productInfo', 0] }
                }
            },
            {
                $project: {
                    _id: '$items.itemDetails._id',
                    purchaseRequestId: { $toString: '$_id' },
                    itemName: '$items.itemName',
                    detail: '$items.itemDetails.detail',
                    totalQuantity: '$items.itemDetails.quantity',
                    orderedQty: '$closedQty',
                    partNo: {
                        $cond: {
                            if: { $ifNull: ['$product', false] },
                            then: '$product',
                            else: null
                        }
                    },
                    unitCost: '$items.itemDetails.unitCost',
                    unitSellingPrice: '$items.itemDetails.unitSellingPrice',
                    isAvailable: { $gt: ['$closedQty', 0] },
                    poStatus: {
                        $cond: {
                            if: { $gt: ['$closedQty', 0] },
                            then: 'Closed',
                            else: {
                                $cond: {
                                    if: '$hasAnyPO',
                                    then: 'Not Closed',
                                    else: 'No PO'
                                }
                            }
                        }
                    }
                }
            }
        ]);

        const items = pipeline.map((item: any, index: number) => ({
            ...item,
            _id: item._id ? item._id.toString() : `${item.detail}-${index + 1}`,
            slNo: index + 1
        }));

        return res.status(200).json({ success: true, data: items });
    } catch (error) {
        console.error('Get DN Items For Job Error:', error);
        res.status(500).json({ success: false, message: 'Error fetching DN items', error });
    }
};

export const getInvoiceLinkingSummary = async (req: Request, res: Response) => {
    try {
        let { page, row, customerName, jobId, dnNo, invoiceNo, status } = req.body;
        page = page || 1;
        row = row || 10;

        const pipeline: any[] = [
            { $match: { status: 'Delivered' } },
            {
                $addFields: {
                    deliveredQty: { $sum: '$items.currentDeliveryQty' }
                }
            },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    pipeline: [
                        { $match: { isDeleted: { $ne: true } } },
                        { $project: { jobId: 1, quoteId: 1 } }
                    ],
                    as: 'job'
                }
            },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'job.quoteId',
                    foreignField: '_id',
                    pipeline: [{ $project: { client: 1 } }],
                    as: 'quotation'
                }
            },
            { $unwind: { path: '$quotation', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'quotation.client',
                    foreignField: '_id',
                    pipeline: [{ $project: { companyName: 1 } }],
                    as: 'customer'
                }
            },
            { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'invoices',
                    let: { dnObjId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                isDeleted: { $ne: true }
                            }
                        },
                        { $unwind: '$items' },
                        {
                            $addFields: {
                                hasDnRefs: {
                                    $gt: [
                                        { $size: { $ifNull: ['$items.dnRefs', []] } },
                                        0
                                    ]
                                }
                            }
                        },
                        {
                            $unwind: {
                                path: '$items.dnRefs',
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $match: {
                                $expr: {
                                    $cond: [
                                        '$hasDnRefs',
                                        { $eq: ['$items.dnRefs.dnId', '$$dnObjId'] },
                                        { $eq: ['$items.dnId', '$$dnObjId'] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalQty: {
                                    $sum: {
                                        $cond: [
                                            '$hasDnRefs',
                                            { $ifNull: ['$items.dnRefs.quantity', 0] },
                                            { $ifNull: ['$items.quantity', 0] }
                                        ]
                                    }
                                },
                                invoiceNo: { $first: '$invoiceNo' },
                                invoiceDate: { $first: '$date' }
                            }
                        }
                    ],
                    as: 'invoiceData'
                }
            },
            {
                $addFields: {
                    _invoiceInfo: { $arrayElemAt: ['$invoiceData', 0] },
                    invoicedQty: { $ifNull: [{ $arrayElemAt: ['$invoiceData.totalQty', 0] }, 0] }
                }
            },
            {
                $addFields: {
                    balanceQty: { $max: [0, { $subtract: ['$deliveredQty', '$invoicedQty'] }] }
                }
            },
            {
                $project: {
                    _id: 1,
                    dnNo: 1,
                    dnDate: 1,
                    customerName: { $ifNull: ['$customer.companyName', ''] },
                    jobId: '$job.jobId',
                    deliveredQty: 1,
                    invoicedQty: 1,
                    balanceQty: 1,
                    invoiceNo: { $ifNull: ['$_invoiceInfo.invoiceNo', ''] },
                    invoiceDate: { $ifNull: ['$_invoiceInfo.invoiceDate', null] },
                    status: {
                        $cond: {
                            if: { $lte: ['$invoicedQty', 0] },
                            then: 'Pending Invoice',
                            else: {
                                $cond: {
                                    if: { $gte: ['$invoicedQty', '$deliveredQty'] },
                                    then: 'Fully Invoiced',
                                    else: 'Partially Invoiced'
                                }
                            }
                        }
                    }
                }
            }
        ];

        const filterMatch: any = {};
        if (customerName) filterMatch.customerName = { $regex: customerName, $options: 'i' };
        if (jobId) filterMatch.jobId = { $regex: jobId, $options: 'i' };
        if (dnNo) filterMatch.dnNo = { $regex: dnNo, $options: 'i' };
        if (invoiceNo) filterMatch.invoiceNo = { $regex: invoiceNo, $options: 'i' };
        if (status) {
            const statusArr = Array.isArray(status) ? status : [status];
            filterMatch.status = { $in: statusArr };
        }
        if (Object.keys(filterMatch).length > 0) {
            pipeline.push({ $match: filterMatch });
        }

        pipeline.push({
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [
                    { $sort: { dnDate: -1 } },
                    { $skip: (page - 1) * row },
                    { $limit: row }
                ]
            }
        });

        const result = await DeliveryNote.aggregate(pipeline).allowDiskUse(true);

        const metadata = result[0]?.metadata[0];
        const total = metadata?.total || 0;
        const items = result[0]?.data || [];

        return res.status(200).json({ success: true, items, total, page, row });
    } catch (error) {
        console.error('Invoice Linking Summary Error:', error);
        res.status(500).json({ success: false, message: 'Error fetching invoice linking summary', error });
    }
};
