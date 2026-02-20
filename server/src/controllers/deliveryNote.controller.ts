import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DeliveryNote from '../models/deliveryNote.model';
import StockEntry from '../models/stockEntry.model';
import Product from '../models/products.model';
import Job from '../models/job.model';
import Quotation from '../models/quotation.model';
import { checkAndUpdateJobCompletionStatus } from './job.controller';

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

        dn.status = 'Cancelled';
        dn.updatedDate = new Date();
        await dn.save();

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
        let skipNum: number = (page - 1) * row;

        let dnMatchFilters: any = {};

        // DN Level Filters
        if (fromDate && toDate) {
            dnMatchFilters.dnDate = { $gte: new Date(fromDate), $lte: new Date(toDate) };
        }
        if (customerName) {
            dnMatchFilters.clientName = { $regex: customerName, $options: 'i' };
        }
        if (jobId) {
            dnMatchFilters.jobId = new mongoose.Types.ObjectId(jobId);
        }
        if (dnNumber) {
            dnMatchFilters.dnNo = { $regex: dnNumber, $options: 'i' };
        }

        // Item Level Filters (Applied after unwind)
        let itemMatchFilters: any = {
            'item.isInventoryItem': true // Only inventory items
        };
        if (partNo) {
            itemMatchFilters['item.partNo'] = { $regex: partNo, $options: 'i' };
        }
        if (status && status.length > 0) {
            itemMatchFilters['item.status'] = { $in: status };
        }

        // 1. Aggregate DNs to get flattened item list matching filters
        const pipeline = [
            { $match: dnMatchFilters },
            { $unwind: '$items' },
            { $addFields: { item: '$items' } }, // Move items to item field for easier access
            { $match: itemMatchFilters },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job'
                }
            },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            { $sort: { dnDate: -1 } as any } // Sort by Date
        ];

        // Count total items for pagination
        const countResult = await DeliveryNote.aggregate([...pipeline, { $count: 'total' }]);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // Fetch paginated data
        const deductionItems = await DeliveryNote.aggregate([
            ...pipeline,
            { $skip: skipNum },
            { $limit: row }
        ]);

        // 2. Calculate Stock Before and After for each item (This is the heavy part)
        // We will do this in parallel for the current page items
        const reportItems = await Promise.all(deductionItems.map(async (record) => {
            const dnDate = record.createdDate || record.dnDate; // Use creation time as cutoff
            const partNoStr = record.item.partNo;
            const currentDeduction = record.item.currentDeliveryQty || 0;

            let stockBefore = 0;
            let uom = record.item.uom;
            let description = record.item.description;
            let productId: any = null;

            // Calculate Total In (Stock Entries) before DN Date
            // We resolve the product by looking up the product using the part no string within the aggregation
            const totalInResult = await StockEntry.aggregate([
                {
                    $lookup: {
                        from: 'products',
                        localField: 'partNo',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $match: {
                        'product.partNo': partNoStr, // Match the string part number from DN
                        createdDate: { $lt: dnDate }, // Strictly before this DN
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: '$product._id', // Group by Product ID to capture it
                        totalQty: { $sum: '$quantity' },
                        uom: { $first: '$uom' },
                        description: { $first: '$productDescription' },
                        productDesc: { $first: '$product.productDescription' }
                    }
                }
            ]);

            const totalIn = totalInResult.length > 0 ? totalInResult[0].totalQty : 0;

            if (totalInResult.length > 0) {
                const result = totalInResult[0];
                productId = result._id;

                // Fallback for UOM and Description if missing in DN
                if (!uom) uom = result.uom;
                if (!description) description = result.description || result.productDesc;

                stockBefore = totalIn;

                // Calculate Total Out (Other DNs) before DN Date ONLY if we found the product (and thus have the ID if needed, 
                // though for DNs we use the string partNo usually?)
                // Actually DNs use string PartNo, so we can calculate TotalOut even if StockEntry lookup failed? 
                // BUT the previous logic subtracted TotalOut from TotalIn. 
                // So now we do the same.

                const totalOutResult = await DeliveryNote.aggregate([
                    {
                        $match: {
                            _id: { $ne: record._id }, // Exclude current DN
                            createdDate: { $lte: dnDate }, // Before or same time
                        }
                    },
                    { $unwind: '$items' },
                    {
                        $match: {
                            'items.partNo': partNoStr, // Match by String Part No
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalQty: { $sum: '$items.currentDeliveryQty' }
                        }
                    }
                ]);
                const totalOut = totalOutResult.length > 0 ? totalOutResult[0].totalQty : 0;

                stockBefore = totalIn - totalOut;
            } else {
                // If no stock entries found for this partNo, assuming 0 stock.
                stockBefore = 0;
            }

            const stockAfter = stockBefore - currentDeduction;

            return {
                dnId: record._id,
                dnNumber: record.dnNo,
                date: record.dnDate,
                jobId: record.job?.jobId,
                lpoNo: record.customerLpoNumber, // Or from Job
                customerName: record.clientName,
                item: {
                    ...record.item,
                    uom: uom, // Ensure UOM is populated
                    description: description,
                    quantityDeducted: currentDeduction
                },
                stockBefore,
                stockAfter,
                status: record.item.status // Or record.status if item status is missing
            };
        }));

        res.status(200).json({
            data: {
                items: reportItems,
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
        let { page, row } = req.body;
        page = page || 1;
        row = row || 10;

        const jobs = await Job.find({ isDeleted: { $ne: true } }).lean();
        if (!jobs || jobs.length === 0) {
            return res.status(200).json({ total: 0, jobs: [] });
        }

        const jobIds = jobs.map(j => j._id);
        const dns = await DeliveryNote.find({
            jobId: { $in: jobIds },
            status: { $nin: ['Cancelled', 'Draft'] }
        }).lean();

        const dnsByJob = new Map<string, any[]>();
        dns.forEach(dn => {
            const key = String(dn.jobId);
            if (!dnsByJob.has(key)) {
                dnsByJob.set(key, []);
            }
            dnsByJob.get(key)!.push(dn);
        });

        const quoteIds = Array.from(new Set(jobs.map(j => j.quoteId).filter(Boolean).map((id: any) => String(id))));
        const quotations = await Quotation.find({ _id: { $in: quoteIds } }).lean();
        const quoteMap = new Map<string, any>();
        quotations.forEach(q => {
            quoteMap.set(String(q._id), q);
        });

        const pendingJobs: any[] = [];

        for (const job of jobs) {
            const quoteId = job.quoteId ? String(job.quoteId) : null;
            const quotation = quoteId ? quoteMap.get(quoteId) : null;
            if (!quotation || !quotation.optionalItems || quotation.optionalItems.length === 0) {
                continue;
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

            if (allItems.length === 0) {
                continue;
            }

            const jobDns = dnsByJob.get(String(job._id)) || [];

            let hasPendingItem = false;
            let hasDeliveredItem = false;

            for (const item of allItems) {
                const orderedQty = item.quantity || 0;
                let deliveredQty = 0;

                for (const dn of jobDns) {
                    if (dn.items && Array.isArray(dn.items)) {
                        dn.items.forEach((dnItem: any) => {
                            if (dnItem.itemId === String(item._id)) {
                                deliveredQty += dnItem.currentDeliveryQty || 0;
                            }
                        });
                    }
                }

                if (deliveredQty > 0) {
                    hasDeliveredItem = true;
                }

                if (orderedQty > deliveredQty) {
                    hasPendingItem = true;
                }
            }

            if (!hasPendingItem) {
                continue;
            }

            const status = hasDeliveredItem ? 'Partially Delivered' : 'To be Delivered';
            const customerName = (job as any).clientDetails?.companyName || (job as any).client?.companyName || '';

            pendingJobs.push({
                jobMongoId: job._id,
                jobId: job.jobId,
                customer: customerName,
                status
            });
        }

        const total = pendingJobs.length;
        const start = (page - 1) * row;
        const paged = pendingJobs.slice(start, start + row);

        return res.status(200).json({ total, jobs: paged });
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
