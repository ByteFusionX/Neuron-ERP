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
            { $sort: { dnNo : -1 } },
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

        const prs = await PurchaseRequest.find({ isDeleted: { $ne: true } }).lean();
        if (!prs || prs.length === 0) {
            return res.status(200).json({ total: 0, items: [] });
        }

        const prJobIds = [...new Set(prs.map(pr => String(pr.jobId)))];
        const jobs = await Job.find({
            _id: { $in: prJobIds.map(id => new mongoose.Types.ObjectId(id)) },
            isDeleted: { $ne: true }
        }).lean();
        const jobMap = new Map<string, any>();
        jobs.forEach(j => jobMap.set(String(j._id), j));

        const quoteIds = [...new Set(jobs.map(j => j.quoteId).filter(Boolean).map((id: any) => String(id)))];
        const quotations = await Quotation.find({ _id: { $in: quoteIds } }).populate('client').lean();
        const quoteMap = new Map<string, any>();
        quotations.forEach(q => quoteMap.set(String(q._id), q));

        const prIds = prs.map(pr => pr._id);
        const pos = await PurchaseOrder.find({ purchaseId: { $in: prIds } }).populate('supplierId').lean();
        const posByPr = new Map<string, any[]>();
        pos.forEach(po => {
            const key = String(po.purchaseId);
            if (!posByPr.has(key)) posByPr.set(key, []);
            posByPr.get(key)!.push(po);
        });

        const poIds = pos.map(po => po._id);
        const grns = await GRN.find({
            purchaseOrderId: { $in: poIds },
            isDeleted: { $ne: true }
        }).lean();
        const grnsByPo = new Map<string, any[]>();
        grns.forEach(grn => {
            const key = String(grn.purchaseOrderId);
            if (!grnsByPo.has(key)) grnsByPo.set(key, []);
            grnsByPo.get(key)!.push(grn);
        });

        const jobIdsList = jobs.map(j => j._id);
        const dns = await DeliveryNote.find({
            jobId: { $in: jobIdsList },
            status: { $nin: ['Cancelled', 'Draft'] }
        }).lean();
        const dnsByJob = new Map<string, any[]>();
        dns.forEach(dn => {
            const key = String(dn.jobId);
            if (!dnsByJob.has(key)) dnsByJob.set(key, []);
            dnsByJob.get(key)!.push(dn);
        });

        const allRows: any[] = [];

        for (const pr of prs) {
            const job = jobMap.get(String(pr.jobId));
            if (!job) continue;

            const quotation = job.quoteId ? quoteMap.get(String(job.quoteId)) : null;
            const customer = quotation?.client as any;
            const customerNameVal = customer?.companyName || '';

            const prPOs = posByPr.get(String(pr._id)) || [];
            const jobDns = dnsByJob.get(String(job._id)) || [];

            if (!pr.items || !Array.isArray(pr.items)) continue;

            for (const item of pr.items) {
                if (!(item as any).itemDetails || !Array.isArray((item as any).itemDetails)) continue;

                for (const itemDetail of (item as any).itemDetails) {
                    const orderedQty = itemDetail.quantity || 0;
                    const itemDetailId = String(itemDetail._id);

                    let deliveredViaDn = 0;
                    for (const dn of jobDns) {
                        if (dn.items && Array.isArray(dn.items)) {
                            for (const dnItem of dn.items) {
                                if (dnItem.itemId === itemDetailId) {
                                    deliveredViaDn += dnItem.currentDeliveryQty || 0;
                                }
                            }
                        }
                    }

                    if (deliveredViaDn >= orderedQty && orderedQty > 0) continue;

                    let supplierNameVal = '';
                    let supplierLpoNoVal = '';
                    let receivedQty = 0;
                    let hasPO = false;

                    for (const po of prPOs) {
                        if (!po.items || !Array.isArray(po.items)) continue;

                        for (const poItem of po.items) {
                            const partNoMatch = itemDetail.partNo && poItem.partNo &&
                                String(itemDetail.partNo) === String(poItem.partNo);
                            const detailMatch = itemDetail.detail && poItem.detail &&
                                itemDetail.detail.trim().toLowerCase() === poItem.detail.trim().toLowerCase();

                            if (partNoMatch || detailMatch) {
                                hasPO = true;
                                supplierNameVal = (po.supplierId as any)?.supplierName || '';
                                supplierLpoNoVal = po.poNo || '';

                                const poGrns = grnsByPo.get(String(po._id)) || [];
                                for (const grn of poGrns) {
                                    if (!grn.items || !Array.isArray(grn.items)) continue;
                                    for (const grnItem of grn.items) {
                                        const grnDetailMatch = grnItem.itemDescription && poItem.detail &&
                                            grnItem.itemDescription.trim().toLowerCase() === poItem.detail.trim().toLowerCase();
                                        if (grnDetailMatch) {
                                            receivedQty += grnItem.acceptedQty || 0;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                        if (hasPO) break;
                    }

                    const balanceQty = Math.max(0, orderedQty - receivedQty);

                    let statusVal = 'Not Ordered';
                    if (hasPO) {
                        if (receivedQty >= orderedQty && orderedQty > 0) {
                            statusVal = 'Received';
                        } else if (receivedQty > 0) {
                            statusVal = 'Partially Received';
                        } else {
                            statusVal = 'Ordered';
                        }
                    }

                    allRows.push({
                        customerName: customerNameVal,
                        jobId: job.jobId,
                        supplierName: supplierNameVal,
                        supplierLpoNo: supplierLpoNoVal,
                        orderedQty,
                        receivedQty,
                        balanceQty,
                        status: statusVal,
                        description: itemDetail.detail || '',
                    });
                }
            }
        }

        let filteredRows = allRows;

        if (customerName) {
            const regex = new RegExp(customerName, 'i');
            filteredRows = filteredRows.filter(r => regex.test(r.customerName));
        }
        if (jobId) {
            const regex = new RegExp(jobId, 'i');
            filteredRows = filteredRows.filter(r => regex.test(r.jobId));
        }
        if (supplierName) {
            const regex = new RegExp(supplierName, 'i');
            filteredRows = filteredRows.filter(r => regex.test(r.supplierName));
        }
        if (supplierLpoNo) {
            const regex = new RegExp(supplierLpoNo, 'i');
            filteredRows = filteredRows.filter(r => regex.test(r.supplierLpoNo));
        }
        if (status) {
            const statusArr = Array.isArray(status) ? status : [status];
            filteredRows = filteredRows.filter(r => statusArr.includes(r.status));
        }

        filteredRows.forEach((r, i) => r.slNo = i + 1);

        const total = filteredRows.length;
        const start = (page - 1) * row;
        const paged = filteredRows.slice(start, start + row);

        return res.status(200).json({ total, items: paged });
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
