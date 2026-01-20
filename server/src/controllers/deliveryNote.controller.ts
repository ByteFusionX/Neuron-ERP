import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DeliveryNote from '../models/deliveryNote.model';
import StockEntry from '../models/stockEntry.model';
import Product from '../models/products.model';

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

export const createDn = async (req: Request, res: Response) => {
    try {
        const { dnNo, dnDate, jobId, items } = req.body;

        // 1. Create DN
        const newDn = new DeliveryNote({
            ...req.body,
            createdBy: (req as any).user?._id
        });
        const savedDn = await newDn.save();

        // 2. Update Job Status if needed (logic: check if all items delivered)?

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
            { $sort: { dnDate: -1 } },
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

        if (dn.status === 'Delivered') {
            return res.status(400).json({ message: 'Cannot cancel a delivered DN' });
        }

        dn.status = 'Cancelled';
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
