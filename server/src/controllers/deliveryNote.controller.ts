import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DeliveryNote from '../models/deliveryNote.model';
import StockMovement from '../models/stockMovement.model';
import Product from '../models/products.model';
import Job from '../models/job.model';
import Quotation from '../models/quotation.model';
import PurchaseRequest from '../models/purchaseRequest.model';
import PurchaseOrder from '../models/purchaseOrder.model';
import { StockError, findDeliveryShortages, postDelivery, post as postStock, reverseByReference } from '../services/stock.service';
import { getNextSequence } from '../models/counter.model';
import GRN from '../models/grn.model';
import { Invoice } from '../models/invoice.model';
import { checkAndUpdateJobCompletionStatus } from './job.controller';
import { createNotificationWithPrivileges } from './notification.controller';
import { getEmployeeData } from '../common/utils/util';
import { Server } from 'socket.io';
import { uploadFileToAws } from '../common/aws-connect';

/**
 * The stock lines a delivery note takes out of the warehouse: its inventory items with a positive
 * delivery quantity, resolved to catalogue products. Throws when an inventory item is not a catalogue product.
 */
const buildDeliveryLines = async (items: any[] | undefined): Promise<{ product: any; quantity: number; partNo: string }[]> => {
    const lines: { product: any; quantity: number; partNo: string }[] = [];
    for (const item of items || []) {
        if (!item.isInventoryItem) continue;
        const quantity = Number(item.currentDeliveryQty) || 0;
        if (quantity <= 0) continue;
        // The PO line GRN linked to this job line is the most reliable product link (generic products have no part no).
        // A blank part no must never be looked up: it would match any product that also has none.
        let product: any = null;
        if (item.itemId) {
            const po: any = await PurchaseOrder.findOne({ 'items.prLineKey': String(item.itemId), 'items.partNo': { $ne: null } }).select('items').lean();
            const linked = po?.items?.find((l: any) => String(l.prLineKey) === String(item.itemId) && l.partNo);
            if (linked) product = await Product.findOne({ _id: linked.partNo, isDeleted: { $ne: true } }).select('_id partNo');
        }
        if (!product && String(item.partNo || '').trim()) product = await Product.findOne({ partNo: item.partNo, isDeleted: { $ne: true } }).select('_id partNo');
        if (!product) throw new StockError(`"${item.description || item.partNo}" is marked as a stock item but has no product in the catalogue yet; receive it through a GRN or link a product first`, 400);
        lines.push({ product: product._id, quantity, partNo: item.partNo || item.description || String(product._id) });
    }
    return lines;
};

/** Refuses a delivery the warehouse cannot cover, before the delivery note is saved. */
const assertDeliverable = async (items: any[] | undefined, jobId?: any): Promise<void> => {
    const lines = await buildDeliveryLines(items);
    const shortages = await findDeliveryShortages(lines, jobId);
    if (!shortages.length) return;
    const partNoOf = new Map(lines.map((l) => [String(l.product), l.partNo]));
    throw new StockError(
        `Not enough stock to deliver: ${shortages.map((s) => `${partNoOf.get(s.product) || s.product} (need ${s.requested}, free ${s.available})`).join('; ')}`,
        409,
        shortages
    );
};

/** Takes a posted delivery note's items out of stock (one Delivery row per warehouse used) and consumes the job's reservation. */
const deductInventoryForDn = async (dn: any, userId?: string): Promise<void> => {
    const lines = await buildDeliveryLines(dn?.items);
    await postDelivery({
        lines,
        jobId: dn.jobId,
        referenceType: 'DeliveryNote',
        referenceId: dn._id,
        referenceNo: dn.dnNo,
        createdBy: userId,
    });
};

/** Cancelling a posted delivery note puts its stock back by posting the opposite of every Delivery row. */
const reverseInventoryDeductions = async (dn: any, userId?: string): Promise<void> => {
    await reverseByReference('DeliveryNote', dn._id, userId, `Delivery note ${dn.dnNo} cancelled`);
};

const hasInventoryDeduction = async (dnId: any): Promise<boolean> => !!(await StockMovement.exists({
    referenceType: 'DeliveryNote',
    referenceId: dnId,
    movementType: 'Delivery',
    reversalOf: { $exists: false },
    isDeleted: { $ne: true }
}));

const seedDnSequence = async (): Promise<number> => {
    const lastDn = await DeliveryNote.findOne().sort({ createdDate: -1 });
    if (lastDn && lastDn.dnNo) {
        const matches = lastDn.dnNo.match(/DN-(\d+)/);
        if (matches && matches[1]) {
            return parseInt(matches[1], 10);
        }
    }
    return 0;
};

export const generateDnNumber = async (req: Request, res: Response) => {
    try {
        const nextNum = await getNextSequence('dnNo', seedDnSequence);
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
        return 'Ready for Dispatch';
    }

    return 'Draft';
};

/**
 * Ensure no DN item's currentDeliveryQty pushes the item's cumulative
 * delivered quantity (across all non-cancelled/draft DNs for the job) past
 * its orderedQty. Returns a list of human-readable violation messages
 * (empty if all items are within bounds).
 */
const validateDnItemQuantities = async (jobId: string, currentDnItems: any[], excludeDnId?: string): Promise<string[]> => {
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId) || !currentDnItems || currentDnItems.length === 0) {
        return [];
    }

    const query: any = {
        jobId: new mongoose.Types.ObjectId(jobId),
        status: { $nin: ['Cancelled', 'Draft'] }
    };

    if (excludeDnId && mongoose.Types.ObjectId.isValid(excludeDnId)) {
        query._id = { $ne: new mongoose.Types.ObjectId(excludeDnId) };
    }

    const allDns = await DeliveryNote.find(query);
    const violations: string[] = [];

    for (const currentItem of currentDnItems) {
        const itemId = currentItem.itemId;
        const orderedQty = currentItem.orderedQty || 0;
        const currentDeliveryQty = currentItem.currentDeliveryQty || 0;

        if (currentDeliveryQty <= 0) continue;

        let priorDelivered = 0;
        for (const dn of allDns) {
            if (dn.items && Array.isArray(dn.items)) {
                const matchingItem = dn.items.find((i: any) => i.itemId === itemId);
                if (matchingItem) {
                    priorDelivered += matchingItem.currentDeliveryQty || 0;
                }
            }
        }

        const balance = orderedQty - priorDelivered;
        if (currentDeliveryQty > balance) {
            violations.push(
                `${currentItem.description || currentItem.partNo || itemId}: current delivery qty ${currentDeliveryQty} exceeds remaining balance ${Math.max(0, balance)} (ordered ${orderedQty}, already delivered ${priorDelivered})`
            );
        }
    }

    return violations;
};

export const createDn = async (req: Request, res: Response) => {
    try {
        const { dnNo, dnDate, jobId, items, status } = req.body;
        const employee = await getEmployeeData((req as any).user);

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

        if (status !== 'Draft' && jobId && items && items.length > 0) {
            const violations = await validateDnItemQuantities(jobId, items);
            if (violations.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Delivery quantity exceeds remaining balance',
                    details: violations
                });
            }
        }

        let finalStatus = status || 'Draft';

        if (status !== 'Draft' && jobId && items && items.length > 0) {
            finalStatus = await calculateDnStatus(jobId, items);
        }

        const newDn = new DeliveryNote({
            ...req.body,
            status: finalStatus,
            createdBy: employee?._id
        });
        const savedDn = await newDn.save();

        console.log('DN Created Successfully. Serial Numbers:', savedDn.items.map((item: any) => ({
            partNo: item.partNo,
            serialNos: item.serialNos
        })));

        if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
            await checkAndUpdateJobCompletionStatus(jobId);
        }

        res.status(201).json({ success: true, data: savedDn });
    } catch (error) {
        if (error instanceof StockError) return res.status(error.status).json({ success: false, message: error.message, details: error.details });
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
        let { page, search, row, jobId, customer, fromDate, toDate, status, deliveryScope } = req.body;
        let skipNum: number = (page - 1) * row;

        let searchRegex = search ? search.split('').join('\\s*') : '';

        let isJob = jobId == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        const statusFilter = Array.isArray(status) ? { $in: status } : status;
        let isStatus = status == null ? true : false;

        let matchFilters = {
            $and: [
                ...(status ? [{ status: statusFilter }] : []),
                // Delivered DNs split by whether every line on the DN reached its ordered qty.
                ...(deliveryScope === 'full' ? [{ $expr: { $allElementsTrue: [{ $map: { input: '$items', as: 'i', in: { $gte: [{ $add: [{ $ifNull: ['$$i.deliveredQty', 0] }, { $ifNull: ['$$i.currentDeliveryQty', 0] }] }, { $ifNull: ['$$i.orderedQty', 0] }] } } }] } }] : []),
                ...(deliveryScope === 'partial' ? [{ $expr: { $anyElementTrue: [{ $map: { input: '$items', as: 'i', in: { $lt: [{ $add: [{ $ifNull: ['$$i.deliveredQty', 0] }, { $ifNull: ['$$i.currentDeliveryQty', 0] }] }, { $ifNull: ['$$i.orderedQty', 0] }] } } }] } }] : []),
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

        // PO and GRN numbers for the job behind each DN
        const jobIds = [...new Set(dns.map((d: any) => String(d.jobId)))];
        const pos: any[] = await PurchaseOrder.find({ jobId: { $in: jobIds } }).select('poNo jobId').lean();
        const grns: any[] = pos.length
            ? await GRN.find({ purchaseOrderId: { $in: pos.map((p) => p._id) }, isDeleted: { $ne: true } }).select('grnNo purchaseOrderId').lean()
            : [];
        dns.forEach((d: any) => {
            const dnPos = pos.filter((p) => String(p.jobId) === String(d.jobId));
            const poIds = new Set(dnPos.map((p) => String(p._id)));
            d.poNumbers = dnPos.map((p) => p.poNo).filter(Boolean);
            d.grnNumbers = grns.filter((g) => poIds.has(String(g.purchaseOrderId))).map((g) => g.grnNo).filter(Boolean);
        });
        return res.status(200).json({ total: total, dns: dns });

    } catch (error) {
        console.error("Get All DNs Error:", error);
        res.status(500).json({ message: 'Error fetching DNs', error });
    }
};

/** Accepted GRN receipts that can start a delivery note, including partial receipts. */
export const getReadyForDnReceipts = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const row = Math.max(1, Number(req.query.row) || 10);
        const search = String(req.query.search || '').trim();

        const pipeline: any[] = [
            {
                $match: {
                    isDeleted: { $ne: true },
                    $expr: {
                        $and: [
                            {
                                $or: [
                                    { $eq: ['$outcomeStatus', 'Resolved'] },
                                    { $ne: ['$inspectionResult', 'Failed'] }
                                ]
                            },
                            {
                                $gt: [
                                    { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: { $ifNull: ['$$item.acceptedQty', 0] } } } },
                                    0
                                ]
                            },
                            {
                                $or: [
                                    { $eq: ['$outcomeStatus', 'Resolved'] },
                                    {
                                        $eq: [
                                            { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: { $ifNull: ['$$item.rejectedQty', 0] } } } },
                                            0
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
            { $lookup: { from: 'purchaseorders', localField: 'purchaseOrderId', foreignField: '_id', as: 'purchaseOrder' } },
            { $unwind: { path: '$purchaseOrder', preserveNullAndEmptyArrays: true } },
            // A GRN may carry no jobId of its own; fall back to the job on the PO's purchase request.
            { $lookup: { from: 'purchases', localField: 'purchaseOrder.purchaseId', foreignField: '_id', as: 'purchaseRequest' } },
            { $addFields: { resolvedJobId: { $ifNull: ['$jobId', { $ifNull: ['$purchaseOrder.jobId', { $arrayElemAt: ['$purchaseRequest.jobId', 0] }] }] } } },
            { $match: { resolvedJobId: { $ne: null } } },
            // The tab is job-based: one row per job, listing its products with deliverable (accepted) qty.
            { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
            { $match: { 'items.acceptedQty': { $gt: 0 } } },
            {
                $group: {
                    _id: { job: '$resolvedJobId', product: { $toLower: { $trim: { input: { $ifNull: ['$items.partNo', { $ifNull: ['$items.itemDescription', ''] }] } } } } },
                    name: { $first: { $ifNull: ['$items.itemDescription', '$items.partNo'] } },
                    acceptedQty: { $sum: '$items.acceptedQty' },
                    lastGrnDate: { $max: '$grnDate' }
                }
            },
            {
                $group: {
                    _id: '$_id.job',
                    products: { $push: { name: '$name', acceptedQty: '$acceptedQty' } },
                    acceptedQty: { $sum: '$acceptedQty' },
                    lastGrnDate: { $max: '$lastGrnDate' }
                }
            },
            { $lookup: { from: 'jobs', localField: '_id', foreignField: '_id', as: 'job' } },
            { $unwind: '$job' },
            { $addFields: { productNames: { $reduce: { input: '$products', initialValue: '', in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, { $ifNull: ['$$this.name', ''] }] } } }, productCount: { $size: '$products' } } },
            ...(search ? [{
                $match: {
                    $or: [
                        { 'job.jobId': { $regex: search, $options: 'i' } },
                        { productNames: { $regex: search, $options: 'i' } }
                    ]
                }
            }] : []),
            { $sort: { lastGrnDate: -1 } },
            {
                $facet: {
                    data: [{ $skip: (page - 1) * row }, { $limit: row }],
                    total: [{ $count: 'count' }]
                }
            }
        ];

        const [result] = await GRN.aggregate(pipeline);
        const grnRows: any[] = result?.data || [];

        // PO and GRN numbers for each job row
        const jobIds = grnRows.map((r) => r._id);
        const pos: any[] = jobIds.length ? await PurchaseOrder.find({ jobId: { $in: jobIds } }).select('poNo jobId').lean() : [];
        const jobGrns: any[] = pos.length
            ? await GRN.find({ purchaseOrderId: { $in: pos.map((p) => p._id) }, isDeleted: { $ne: true } }).select('grnNo purchaseOrderId').lean()
            : [];
        grnRows.forEach((r) => {
            const rowPos = pos.filter((p) => String(p.jobId) === String(r._id));
            const poIds = new Set(rowPos.map((p) => String(p._id)));
            r.poNumbers = rowPos.map((p) => p.poNo).filter(Boolean);
            r.grnNumbers = jobGrns.filter((g) => poIds.has(String(g.purchaseOrderId))).map((g) => g.grnNo).filter(Boolean);
        });

        return res.status(200).json({
            total: result?.total?.[0]?.count || 0,
            grns: grnRows
        });
    } catch (error) {
        console.error('Get ready for DN receipts error:', error);
        return res.status(500).json({ message: 'Error fetching GRNs ready for delivery', error });
    }
};

/** Latest live invoice for this DN, or a printable preview assembled from the DN and its sales terms. */
export const getDnInvoice = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Delivery Note ID' });
        }
        const dnObjId = new mongoose.Types.ObjectId(id);

        const dn: any = await DeliveryNote.findById(dnObjId)
            .populate({
                path: 'jobId',
                select: 'jobId quoteId',
                populate: {
                    path: 'quoteId',
                    select: 'client subject currency quoteCompany paymentTerms dealData.paymentTerms customerAcceptance.customerPoNumber',
                    populate: { path: 'client', select: 'companyName address contactDetails' }
                }
            })
            .lean();

        if (!dn) {
            return res.status(404).json({ success: false, message: 'Delivery Note not found' });
        }

        const invoice: any = await Invoice.findOne({
            isDeleted: { $ne: true },
            status: { $nin: ['Cancelled', 'Reissued'] },
            $or: [{ 'items.dnId': dnObjId }, { 'items.dnRefs.dnId': dnObjId }],
        })
            .sort({ createdAt: -1 })
            .populate('customer', 'companyName address contactDetails')
            .populate({ path: 'jobId', select: 'jobId quoteId', populate: { path: 'quoteId', select: 'currency subject' } })
            .lean();

        const job = dn.jobId;
        const quotation = job?.quoteId;
        const salesTerms = quotation?.dealData?.paymentTerms || quotation?.paymentTerms || '';
        const customerPo = dn.customerLpoNumber || quotation?.customerAcceptance?.customerPoNumber || '';

        if (!invoice) {
            const items = (dn.items || [])
                .map((item: any) => {
                    const quantity = Math.max(0, Number(item.currentDeliveryQty || 0) - Number(item.rejectedQty || 0));
                    const unitPrice = Number(item.unitSellingPrice || 0);
                    return {
                        dnId: dn._id,
                        dnRefs: [{ dnId: dn._id, quantity }],
                        itemId: item.itemId,
                        description: item.description || item.partNo || '',
                        quantity,
                        amount: quantity * unitPrice
                    };
                })
                .filter((item: any) => item.quantity > 0);
            const amount = items.reduce((total: number, item: any) => total + item.amount, 0);

            return res.status(200).json({
                success: true,
                data: {
                    invoiceNo: 'DRAFT',
                    date: new Date(),
                    customer: quotation?.client || { companyName: dn.clientName },
                    jobId: job,
                    amount,
                    subTotal: amount,
                    taxAmount: 0,
                    paymentTerms: salesTerms,
                    items,
                    dnNumbers: dn.dnNo,
                    lpoRef: customerPo,
                    subject: dn.subject || quotation?.subject || '',
                    currency: quotation?.currency || 'QAR',
                    quoteCompany: quotation?.quoteCompany || '',
                    isPreview: true
                }
            });
        }

        const dnIds = new Set<string>();
        (invoice.items || []).forEach((item: any) => {
            if (Array.isArray(item.dnRefs) && item.dnRefs.length) item.dnRefs.forEach((r: any) => r.dnId && dnIds.add(String(r.dnId)));
            else if (item.dnId) dnIds.add(String(item.dnId));
        });
        const dns = await DeliveryNote.find({ _id: { $in: [...dnIds] } }).select('dnNo').lean();
        invoice.dnNumbers = dns.map((d: any) => d.dnNo).filter(Boolean).join(', ');
        invoice.lpoRef = customerPo;
        invoice.subject = dn.subject || quotation?.subject || '';
        invoice.currency = quotation?.currency || 'QAR';
        invoice.quoteCompany = quotation?.quoteCompany || '';
        invoice.paymentTerms = invoice.paymentTerms || salesTerms;

        return res.status(200).json({ success: true, data: invoice });
    } catch (error) {
        console.error('Get DN Invoice Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching invoice for Delivery Note' });
    }
};

export const getDnById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dn = await DeliveryNote.findById(id)
            .populate('jobId', 'jobId projectName')
            .populate('createdBy', 'firstName lastName')
            .populate('pod.deliveredBy', 'firstName lastName')
            .lean();

        if (!dn) {
            return res.status(404).json({ message: 'Delivery Note not found' });
        }

        const jobId = (dn.jobId as any)?._id || dn.jobId;
        const purchaseOrders = jobId
            ? await PurchaseOrder.find({ jobId })
                .select('poNo poStatus poDate supplierId')
                .populate('supplierId', 'supplierName')
                .sort({ poDate: -1 })
                .lean()
            : [];
        const purchaseOrderIds = purchaseOrders.map((po: any) => po._id);
        const grns = purchaseOrderIds.length
            ? await GRN.find({ purchaseOrderId: { $in: purchaseOrderIds }, isDeleted: { $ne: true } })
                .select('grnNo grnDate inspectionResult outcomeStatus purchaseOrderId')
                .sort({ grnDate: -1 })
                .lean()
            : [];

        return res.status(200).json({
            ...dn,
            linkedRecords: { purchaseOrders, grns }
        });
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

        if (status !== 'Draft' && dn.jobId && items && items.length > 0) {
            const violations = await validateDnItemQuantities(dn.jobId.toString(), items, id);
            if (violations.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Delivery quantity exceeds remaining balance',
                    details: violations
                });
            }
        }

        let finalStatus = status || 'Draft';

        if (status !== 'Draft' && dn.jobId && items && items.length > 0) {
            finalStatus = await calculateDnStatus(dn.jobId.toString(), items, id);
        }

        Object.assign(dn, {
            ...req.body,
            status: finalStatus,
            updatedDate: new Date()
        });

        const updatedDn = await dn.save();

        if (dn.jobId && mongoose.Types.ObjectId.isValid(dn.jobId.toString())) {
            await checkAndUpdateJobCompletionStatus(dn.jobId.toString());
        }

        return res.status(200).json({ success: true, data: updatedDn });
    } catch (error) {
        if (error instanceof StockError) return res.status(error.status).json({ success: false, message: error.message, details: error.details });
        console.error("Update DN Error:", error);
        res.status(500).json({ message: 'Error updating Delivery Note', error });
    }
};

export const dispatchDn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const dn = await DeliveryNote.findById(id);

        if (!dn) {
            return res.status(404).json({ success: false, message: 'Delivery Note not found' });
        }

        if (dn.status !== 'Ready for Dispatch') {
            return res.status(400).json({ success: false, message: 'Only ready delivery notes can be dispatched' });
        }

        const employee = await getEmployeeData((req as any).user);
        const stockAlreadyDeducted = await hasInventoryDeduction(dn._id);

        if (dn.deliveryType !== 'Drop Ship' && !stockAlreadyDeducted) {
            await assertDeliverable(dn.items, dn.jobId);
            await deductInventoryForDn(dn, employee?._id);
        }

        try {
            dn.status = 'Dispatched';
            dn.updatedDate = new Date();
            const updatedDn = await dn.save();
            await checkAndUpdateJobCompletionStatus(dn.jobId.toString());
            return res.status(200).json({ success: true, data: updatedDn });
        } catch (saveError) {
            if (dn.deliveryType !== 'Drop Ship' && !stockAlreadyDeducted) {
                await reverseInventoryDeductions(dn, employee?._id);
            }
            throw saveError;
        }
    } catch (error) {
        if (error instanceof StockError) return res.status(error.status).json({ success: false, message: error.message, details: error.details });
        console.error('Dispatch DN Error:', error);
        return res.status(500).json({ success: false, message: 'Error dispatching Delivery Note', error });
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

        const referencingInvoice = await Invoice.findOne({
            isDeleted: { $ne: true },
            $or: [
                { 'items.dnId': dn._id },
                { 'items.dnRefs.dnId': dn._id }
            ]
        });

        if (referencingInvoice) {
            return res.status(400).json({ message: `Cannot cancel: this Delivery Note is referenced by Invoice ${referencingInvoice.invoiceNo}` });
        }

        const stockWasDeducted = await hasInventoryDeduction(dn._id);

        if (stockWasDeducted) {
            const hasRejections = (dn.items as any[]).some((item: any) => (item.rejectedQty || 0) > 0);
            const hasReturns = await StockMovement.exists({ referenceType: { $in: ['DN Return', 'DnRejection'] }, referenceId: dn._id, isDeleted: { $ne: true } });
            if (hasRejections || hasReturns) {
                return res.status(400).json({ message: 'Cannot cancel: items on this Delivery Note were rejected or returned by the customer' });
            }
        }

        dn.status = 'Cancelled';
        dn.updatedDate = new Date();
        await dn.save();

        if (stockWasDeducted) {
            const employee = await getEmployeeData((req as any).user);
            await reverseInventoryDeductions(dn, employee?._id);
        }

        return res.status(200).json({ message: 'Delivery Note cancelled successfully', dn });
    } catch (error) {
        if (error instanceof StockError) return res.status(error.status).json({ success: false, message: error.message, details: error.details });
        console.error("Cancel DN Error:", error);
        res.status(500).json({ message: 'Error cancelling DN', error });
    }
};

export const completeDnPod = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { receivedBy, receivedContactNo, receivedDate, remarks, signatureName, deliveredBy } = req.body;

        // Confirm Delivery sends the delivering employee; the older POD form sends the receiver name.
        if (!receivedBy && !deliveredBy) {
            return res.status(400).json({ success: false, message: 'Delivered by is required' });
        }
        if (deliveredBy && !mongoose.Types.ObjectId.isValid(deliveredBy)) {
            return res.status(400).json({ success: false, message: 'Invalid delivered by employee' });
        }
        if (receivedDate && isNaN(new Date(receivedDate).getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid delivery date' });
        }

        const dn = await DeliveryNote.findById(id);
        if (!dn) {
            return res.status(404).json({ success: false, message: 'Delivery Note not found' });
        }

        if (dn.status !== 'Dispatched') {
            return res.status(400).json({ success: false, message: 'Only dispatched delivery notes can receive POD' });
        }

        const attachments = await Promise.all(((req as any).files || []).map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
        }));

        (dn as any).pod = {
            receivedBy,
            receivedContactNo,
            receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
            remarks,
            signatureName,
            deliveredBy: deliveredBy || undefined,
            attachments
        };
        dn.status = 'Delivered';
        dn.updatedDate = new Date();
        const updatedDn = await dn.save();

        return res.status(200).json({ success: true, data: updatedDn });
    } catch (error) {
        console.error("Complete DN POD Error:", error);
        res.status(500).json({ success: false, message: 'Error completing Delivery Note POD', error });
    }
};

/**
 * A rejected quantity comes back into quarantine (pending QC), not into sellable stock. It returns to the
 * warehouse(s) the note delivered it from, at the cost of that delivery.
 */
const restoreRejectedItemToQuarantine = async (dn: any, item: any, rejectedQty: number, reason: string, userId?: string): Promise<string | null> => {
    if (!item.isInventoryItem || rejectedQty <= 0) return null;

    const product = await Product.findOne({ partNo: item.partNo, isDeleted: { $ne: true } });
    if (!product) {
        return `Item "${item.description || item.partNo}": Product not found for part number "${item.partNo}" — rejection recorded, but stock was not restored to quarantine`;
    }

    const delivered: any[] = await StockMovement.find({
        referenceType: 'DeliveryNote', referenceId: dn._id, product: product._id, movementType: 'Delivery', reversalOf: { $exists: false }, isDeleted: { $ne: true },
    }).sort({ quantityOut: -1 }).lean();
    if (!delivered.length) {
        return `Item "${item.description || item.partNo}": no stock delivery found for this note — rejection recorded, but stock was not restored to quarantine`;
    }

    let remaining = rejectedQty;
    for (const row of delivered) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, row.quantityOut);
        await postStock({
            product: product._id,
            warehouse: row.warehouse,
            type: 'Return',
            direction: 'in',
            quantity: take,
            bucket: 'Quarantine',
            unitCost: row.unitCost,
            referenceType: 'DnRejection',
            referenceId: dn._id,
            referenceNo: dn.dnNo,
            reason,
            createdBy: userId,
        });
        remaining -= take;
    }
    return null;
};

export interface RejectDnItemInput {
    itemId: string;
    rejectedQty: number;
    reason?: string;
}

/**
 * Core DN item-rejection logic, shared by the direct dispatch-side reject endpoint
 * and the invoice rejection cascade (rejectInvoiceByCustomer).
 * Throws an Error with a user-facing message on validation failure.
 */
export const applyDnItemRejections = async (dn: any, items: RejectDnItemInput[], fallbackReason: string | undefined, userId?: string, socket?: Server): Promise<string[]> => {
    if (dn.status === 'Cancelled') {
        throw new Error('Cannot reject items on a cancelled Delivery Note');
    }

    const warnings: string[] = [];

    for (const rejectInput of items) {
        const { itemId, rejectedQty, reason: itemReason } = rejectInput;
        const qty = Number(rejectedQty);

        if (!itemId || isNaN(qty) || qty <= 0) {
            throw new Error('Each item requires a valid itemId and a positive rejectedQty');
        }

        const dnItem: any = (dn.items as any[]).find((it: any) => it._id?.toString() === itemId || it.itemId === itemId);
        if (!dnItem) {
            throw new Error(`Item "${itemId}" not found on this Delivery Note`);
        }

        const alreadyRejected = dnItem.rejectedQty || 0;
        const deliveredQty = dnItem.currentDeliveryQty || dnItem.deliveredQty || 0;

        if (alreadyRejected + qty > deliveredQty) {
            throw new Error(`Item "${dnItem.description || dnItem.partNo}": rejected qty (${alreadyRejected + qty}) cannot exceed delivered qty (${deliveredQty})`);
        }

        const effectiveReason = itemReason || fallbackReason;
        if (!effectiveReason) {
            throw new Error(`A rejection reason is required for item "${dnItem.description || dnItem.partNo}"`);
        }

        dnItem.rejectedQty = alreadyRejected + qty;
        dnItem.rejectionReason = effectiveReason;

        const warning = await restoreRejectedItemToQuarantine(dn, dnItem, qty, effectiveReason, userId);
        if (warning) {
            warnings.push(warning);
        }
    }

    const totalDelivered = (dn.items as any[]).reduce((sum: number, it: any) => sum + (it.currentDeliveryQty || it.deliveredQty || 0), 0);
    const totalRejected = (dn.items as any[]).reduce((sum: number, it: any) => sum + (it.rejectedQty || 0), 0);

    dn.status = totalRejected > 0 && totalRejected >= totalDelivered ? 'Rejected' : 'Partially Rejected';

    (dn.rejectedHistory as any[]).push({
        rejectedBy: userId,
        reason: fallbackReason,
        date: new Date()
    });

    dn.updatedDate = new Date();
    await dn.save();

    await createNotificationWithPrivileges(
        {
            type: 'DnItemsRejected',
            referenceModel: 'DeliveryNote',
            title: 'Delivery Note items rejected',
            message: `Delivery Note ${dn.dnNo || dn._id} has rejected items and requires quarantine review`,
            sentBy: userId,
            referenceId: dn._id,
            additionalData: { dnId: dn._id.toString() }
        },
        {
            privilegeKey: 'dispatch',
            checkFunction: (p: any) => p.dispatch?.viewReport && p.dispatch.viewReport !== 'none'
        },
        socket
    );

    return warnings;
};

export const rejectDnItems = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { items, reason } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'items array is required' });
        }

        const dn = await DeliveryNote.findById(id);
        if (!dn) {
            return res.status(404).json({ success: false, message: 'Delivery Note not found' });
        }

        const socket = req.app.get('io') as Server;
        const employee = await getEmployeeData((req as any).user);
        const warnings = await applyDnItemRejections(dn, items, reason, employee?._id, socket);

        return res.status(200).json({ success: true, data: dn, warnings });
    } catch (error: any) {
        console.error("Reject DN Items Error:", error);
        res.status(400).json({ success: false, message: error.message || 'Error rejecting Delivery Note items' });
    }
};

export const getInventoryDeductionReport = async (req: Request, res: Response) => {
    try {
        let { page, row, fromDate, toDate, customerName, jobId, dnNumber, partNo, status } = req.body;
        page = page || 1;
        row = row || 10;
        const skipNum: number = (page - 1) * row;

        // One line per Delivery row posted for a delivery note; a cancel shows as Reversed.
        const matchFilters: any = { referenceType: 'DeliveryNote', movementType: 'Delivery', reversalOf: { $exists: false }, isDeleted: { $ne: true } };
        if (fromDate && toDate) {
            matchFilters.movementDate = { $gte: new Date(fromDate), $lte: new Date(toDate) };
        }
        if (dnNumber) {
            matchFilters.referenceNo = { $regex: dnNumber, $options: 'i' };
        }

        const pipeline: any[] = [
            { $match: matchFilters },
            { $lookup: { from: 'deliverynotes', localField: 'referenceId', foreignField: '_id', as: 'dn' } },
            { $unwind: { path: '$dn', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'prod' } },
            { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'jobs', localField: 'dn.jobId', foreignField: '_id', as: 'job' } },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'stockmovements', localField: '_id', foreignField: 'reversalOf', as: 'reversals' } },
            { $addFields: { isReversed: { $gt: [{ $size: '$reversals' }, 0] } } },
        ];
        const afterLookup: any = {};
        if (customerName) afterLookup['dn.clientName'] = { $regex: customerName, $options: 'i' };
        if (jobId) afterLookup['dn.jobId'] = new mongoose.Types.ObjectId(jobId);
        if (partNo) afterLookup['prod.partNo'] = { $regex: partNo, $options: 'i' };
        if (status && Array.isArray(status) && status.length === 1) {
            afterLookup.isReversed = status[0] === 'Reversed';
        }
        if (Object.keys(afterLookup).length) pipeline.push({ $match: afterLookup });
        pipeline.push({ $sort: { movementDate: -1 } });

        const countResult = await StockMovement.aggregate([...pipeline, { $count: 'total' }]);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        const deductions = await StockMovement.aggregate([
            ...pipeline,
            { $skip: skipNum },
            { $limit: row },
            {
                $project: {
                    _id: 1,
                    dnId: '$referenceId',
                    dnNumber: '$referenceNo',
                    date: '$dn.dnDate',
                    jobId: '$job.jobId',
                    jobMongoId: '$dn.jobId',
                    customerName: '$dn.clientName',
                    partNo: '$prod.partNo',
                    description: '$prod.productDescription',
                    uom: '$prod.unitOfMeasure',
                    quantityDeducted: '$quantityOut',
                    requestedQty: '$quantityOut',
                    hasShortfall: { $literal: false },
                    deductedDate: '$movementDate',
                    status: { $cond: { if: '$isReversed', then: 'Reversed', else: 'Deducted' } }
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
                        { $group: { _id: null, totalClosedQty: { $sum: '$items.quantity' }, purchaseOrderIds: { $addToSet: '$_id' } } }
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
                        { $group: { _id: null, purchaseOrderIds: { $addToSet: '$_id' } } }
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
                    purchaseOrderIds: {
                        $ifNull: [{ $arrayElemAt: ['$closedPoInfo.purchaseOrderIds', 0] }, []]
                    },
                    hasAnyPO: { $gt: [{ $size: '$anyPoInfo' }, 0] },
                    allPurchaseOrderIds: { $ifNull: [{ $arrayElemAt: ['$anyPoInfo.purchaseOrderIds', 0] }, []] },
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
                    purchaseOrderIds: 1,
                    allPurchaseOrderIds: 1,
                    hasAnyPO: 1,
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

        const purchaseOrderIds = [...new Set(
            pipeline.flatMap((item: any) => [...(item.purchaseOrderIds || []), ...(item.allPurchaseOrderIds || [])]).map((id: any) => id.toString())
        )];
        const grns = purchaseOrderIds.length
            ? await GRN.find({ purchaseOrderId: { $in: purchaseOrderIds }, isDeleted: { $ne: true } })
                .select('grnNo purchaseOrderId items outcomeStatus inspectionResult').lean()
            : [];
        const normalize = (value: any) => String(value || '').trim().toLowerCase();

        const items = pipeline.map((item: any, index: number) => {
            const linkedPoIds = new Set([...(item.purchaseOrderIds || []), ...(item.allPurchaseOrderIds || [])].map((id: any) => id.toString()));
            const partNo = normalize(item.partNo?.partNo);
            const detail = normalize(item.detail);
            const sameItem = (grnItem: any) => (partNo && normalize(grnItem.partNo) === partNo)
                || (detail && normalize(grnItem.itemDescription) === detail);

            let deliverableQty = 0;
            let heldQty = 0;
            let rejectedOnly = false;
            let failedInspection = false;
            const heldGrns = new Set<string>();
            const receivedSerialNos: string[] = [];
            let grnCount = 0;

            grns.forEach((grn: any) => {
                if (!linkedPoIds.has(grn.purchaseOrderId?.toString())) return;
                const lines = (grn.items || []).filter(sameItem);
                if (!lines.length) return;
                grnCount++;
                const accepted = lines.reduce((t: number, l: any) => t + (l.acceptedQty || 0), 0);
                const rejected = lines.reduce((t: number, l: any) => t + (l.rejectedQty || 0), 0);
                const resolved = grn.outcomeStatus === 'Resolved';
                // Same rule as the Ready for DN list: unresolved rejections or a failed inspection hold the whole GRN back.
                const eligible = resolved || (grn.inspectionResult !== 'Failed' && rejected === 0);
                if (eligible) {
                    deliverableQty += accepted;
                    lines.forEach((l: any) => receivedSerialNos.push(...(l.serialNos || [])));
                    if (accepted === 0 && rejected > 0) rejectedOnly = true;
                } else {
                    heldQty += accepted;
                    if (grn.inspectionResult === 'Failed') failedInspection = true;
                    heldGrns.add(grn.grnNo);
                }
            });

            // Closed POs with no GRN on record (older data) keep counting as deliverable.
            const legacyClosed = grnCount === 0 && item.orderedQty > 0;
            const orderedQty = legacyClosed ? item.orderedQty : deliverableQty;
            const isAvailable = orderedQty > 0;

            let unavailableReason = '';
            if (!isAvailable) {
                if (!item.hasAnyPO) unavailableReason = 'No purchase order placed for this item yet';
                else if (grnCount === 0) unavailableReason = 'Not received yet - no GRN for this item';
                else if (heldGrns.size) unavailableReason = failedInspection
                    ? `Inspection failed on ${[...heldGrns].join(', ')} - resolve the GRN first`
                    : `Rejected qty on ${[...heldGrns].join(', ')} is not resolved yet - resolve the return first`;
                else if (rejectedOnly) unavailableReason = 'All received qty was rejected - nothing accepted to deliver';
                else unavailableReason = 'Nothing accepted in stock yet';
            }

            const { purchaseOrderIds: _purchaseOrderIds, allPurchaseOrderIds: _allPoIds, hasAnyPO: _hasAnyPO, ...publicItem } = item;

            return {
                ...publicItem,
                _id: item._id ? item._id.toString() : `${item.detail}-${index + 1}`,
                orderedQty,
                isAvailable,
                unavailableReason,
                heldQty,
                receivedSerialNos: [...new Set(receivedSerialNos.map((serial: any) => String(serial).trim()).filter(Boolean))],
                slNo: index + 1
            };
        });

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
