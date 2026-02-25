import { Request, Response } from 'express';
import { Invoice } from '../models/invoice.model';
import { InvoiceAudit } from '../models/invoiceAudit.model';
import mongoose from 'mongoose';
import { getEmployeeData } from '../common/utils/util';

export const getInvoices = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const query: any = { isDeleted: false };

        if (req.query.search) {
            query['$or'] = [
                { invoiceNo: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.customer) {
            query.customer = req.query.customer;
        }

        if (req.query.jobId) {
            query.jobId = req.query.jobId;
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        if (req.query.salesperson) {
            query.salesperson = req.query.salesperson;
        }

        if (req.query.fromDate && req.query.toDate) {
            query.date = {
                $gte: new Date(req.query.fromDate as string),
                $lte: new Date(req.query.toDate as string)
            };
        }

        const invoices = await Invoice.find(query)
            .populate('customer', 'companyName') // Assuming Customer has companyName
            .populate('jobId', 'jobId') // Assuming Job has jobId
            .populate('salesperson', 'firstName lastName')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Invoice.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                invoices,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
};

export const createInvoice = async (req: Request, res: Response) => {
    try {
        const { invoiceNo, date, customer, jobId, salesperson, amount, status, items } = req.body;

        // Verify if Invoice Number already exists
        const existingInvoice = await Invoice.findOne({ invoiceNo, isDeleted: false });
        if (existingInvoice) {
            return res.status(400).json({ success: false, message: 'Invoice Number already exists' });
        }

        const token = req.user;
        const employee = await getEmployeeData(token);

        if (!employee) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const newInvoice = new Invoice({
            invoiceNo,
            date,
            customer,
            jobId,
            salesperson,
            amount,
            status,
            items,
            createdBy: employee._id
        });

        await newInvoice.save();

        res.status(201).json({
            success: true,
            message: 'Invoice created successfully',
            data: newInvoice
        });

    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ success: false, message: 'Failed to create invoice' });
    }
};

export const getInvoiceById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
        }

        const invoice = await Invoice.findById(id)
            .populate('customer', 'companyName address contactDetails')
            .populate('jobId', 'jobId')
            .populate('salesperson', 'firstName lastName')
            .populate('createdBy', 'firstName lastName')
            .lean();

        if (!invoice || invoice.isDeleted) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        res.status(200).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error('Error fetching invoice by ID:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoice' });
    }
};

export const updateInvoice = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
        }

        const token = req.user;
        const employee = await getEmployeeData(token);

        if (!employee) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const existingInvoice = await Invoice.findById(id);

        if (!existingInvoice || existingInvoice.isDeleted) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        // Logic for Invoice Audit on adjustment (if amount changed)
        if (updateData.amount !== undefined && updateData.amount !== existingInvoice.amount) {
            const auditEntry = new InvoiceAudit({
                invoiceId: existingInvoice._id,
                invoiceNo: existingInvoice.invoiceNo,
                invoiceDate: existingInvoice.date,
                customer: existingInvoice.customer,
                jobId: existingInvoice.jobId,
                originalAmount: existingInvoice.amount,
                adjustedAmount: updateData.amount,
                reason: updateData.reason || 'Manual Adjustment', // Fallback if no reason provided
                actionBy: employee._id,
                status: 'Adjusted'
            });
            await auditEntry.save();
        }

        // Only allow certain fields to be updated securely or update all provided fields from the frontend
        const updatedInvoice = await Invoice.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('customer', 'companyName')
            .populate('jobId', 'jobId')
            .populate('salesperson', 'firstName lastName');

        res.status(200).json({
            success: true,
            message: 'Invoice updated successfully',
            data: updatedInvoice
        });
    } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({ success: false, message: 'Failed to update invoice' });
    }
};

export const generateInvoiceNumber = async (req: Request, res: Response) => {
    try {
        const lastInvoice = await Invoice.findOne({}).sort({ createdAt: -1 });
        let nextNumber = 1;
        if (lastInvoice && lastInvoice.invoiceNo) {
            // Assuming format INV-0001
            const parts = lastInvoice.invoiceNo.split('-');
            if (parts.length > 1) {
                const numInfo = parseInt(parts[1]);
                if (!isNaN(numInfo)) {
                    nextNumber = numInfo + 1;
                }
            }
        }

        const invoiceNo = `INV-${nextNumber.toString().padStart(4, '0')}`;
        res.status(200).json({ success: true, invoiceNo });
    } catch (error) {
        console.error('Error generating invoice number:', error);
        res.status(500).json({ success: false, message: 'Failed to generate invoice number' });
    }
};

export const getInvoiceDnLinkingReport = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const matchStage: any = { isDeleted: false, status: { $ne: 'Cancelled' } };

        // Filters matching Invoice fields directly
        if (req.query.search) {
            matchStage['$or'] = [
                { invoiceNo: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        if (req.query.invoiceNo) matchStage.invoiceNo = { $regex: req.query.invoiceNo, $options: 'i' };

        if (req.query.fromDate && req.query.toDate) {
            matchStage.date = {
                $gte: new Date(req.query.fromDate as string),
                $lte: new Date(req.query.toDate as string)
            };
        }

        const pipeline: any[] = [
            { $match: matchStage },
            // Lookup corresponding Job for Job ID
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job'
                }
            },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            // Lookup Customer
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerDoc'
                }
            },
            { $unwind: { path: '$customerDoc', preserveNullAndEmptyArrays: true } },
            // If Job ID filter is given, apply it
            ...(req.query.jobId ? [{
                $match: {
                    $or: [
                        { 'job.jobId': { $regex: req.query.jobId, $options: 'i' } }
                    ]
                }
            }] : []),
            ...(req.query.customer ? [{
                $match: { 'customerDoc.companyName': { $regex: req.query.customer, $options: 'i' } }
            }] : []),
            // Unwind items to join with Delivery Notes
            { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
            // Lookup corresponding Delivery Notes
            {
                $lookup: {
                    from: 'deliverynotes',
                    localField: 'items.dnId',
                    foreignField: '_id',
                    as: 'dn'
                }
            },
            { $unwind: { path: '$dn', preserveNullAndEmptyArrays: true } },
            // Apply DN filter if present
            ...(req.query.dnNo ? [{
                $match: { 'dn.dnNo': { $regex: req.query.dnNo, $options: 'i' } }
            }] : []),
            // Group by Invoice + DN mapping
            {
                $group: {
                    _id: { invoiceId: '$_id', dnId: '$dn._id' },
                    invoiceId: { $first: '$_id' },
                    invoiceNos: { $first: '$invoiceNo' },
                    invoiceDates: { $first: '$date' },
                    job: { $first: '$job' },
                    clientName: { $first: '$customerDoc.companyName' },
                    totalInvoicedQty: { $sum: { $ifNull: ['$items.quantity', 0] } },
                    dnId: { $first: '$dn._id' },
                    dnNo: { $first: '$dn.dnNo' },
                    dnDate: { $first: '$dn.dnDate' },
                    dnItems: { $first: '$dn.items' }
                }
            },
            // Re-shape the properties
            {
                $project: {
                    _id: '$invoiceId',
                    invoiceNos: 1,
                    invoiceDates: 1,
                    job: 1,
                    clientName: 1,
                    dnNo: 1,
                    dnDate: 1,
                    totalDeliveredQty: { $sum: '$dnItems.currentDeliveryQty' },
                    totalInvoicedQty: { $ifNull: ['$totalInvoicedQty', 0] }
                }
            },
            // Calculate Balance Qty and Linking Status
            {
                $addFields: {
                    balanceQty: { $subtract: ['$totalDeliveredQty', '$totalInvoicedQty'] }
                }
            },
            {
                $addFields: {
                    linkingStatus: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$totalInvoicedQty', 0] }, then: 'Pending Invoice' },
                                { case: { $gte: ['$totalInvoicedQty', '$totalDeliveredQty'] }, then: 'Fully Invoiced' }
                            ],
                            default: 'Partially Invoiced'
                        }
                    }
                }
            },
            // Process Status Filter from frontend after all logic
            ...(req.query.status ? [{
                $match: { 'linkingStatus': { $in: Array.isArray(req.query.status) ? req.query.status : [req.query.status] } }
            }] : [])
        ];

        // Ensure we load paginated results plus totally counted data
        // We use $facet to run data and count query in one request
        pipeline.push({ $sort: { invoiceDate: -1 } });

        const facetPipeline = [
            ...pipeline,
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const mongoose = require('mongoose');
        const Invoice = mongoose.model('Invoice');

        const result = await Invoice.aggregate(facetPipeline);
        const data = result[0].data;
        const total = result[0].metadata[0]?.total || 0;

        res.status(200).json({
            success: true,
            data: {
                report: data,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching Invoice DN linking report:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tracking report' });
    }
};

export const getCancelledAdjustedInvoices = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const matchStage: any = { isDeleted: false };

        if (req.query.search) {
            matchStage['$or'] = [
                { invoiceNo: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.invoiceNo) {
            matchStage.invoiceNo = { $regex: req.query.invoiceNo, $options: 'i' };
        }

        if (req.query.status) {
            matchStage.status = { $in: Array.isArray(req.query.status) ? req.query.status : [req.query.status] };
        }

        if (req.query.fromDate && req.query.toDate) {
            matchStage.actionDate = {
                $gte: new Date(req.query.fromDate as string),
                $lte: new Date(req.query.toDate as string)
            };
        }

        const pipeline: any[] = [
            { $match: matchStage },
            // Lookup Customer
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerDoc'
                }
            },
            { $unwind: { path: '$customerDoc', preserveNullAndEmptyArrays: true } },
            // Lookup Job
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobDoc'
                }
            },
            { $unwind: { path: '$jobDoc', preserveNullAndEmptyArrays: true } },
            // Lookup Employee (action by)
            {
                $lookup: {
                    from: 'employees',
                    localField: 'actionBy',
                    foreignField: '_id',
                    as: 'employeeDoc'
                }
            },
            { $unwind: { path: '$employeeDoc', preserveNullAndEmptyArrays: true } },

            // Apply customer filter if present
            ...(req.query.customer ? [{
                $match: { 'customerDoc.companyName': { $regex: req.query.customer, $options: 'i' } }
            }] : []),
            // Apply Job ID filter if present
            ...(req.query.jobId ? [{
                $match: { 'jobDoc.jobId': { $regex: req.query.jobId, $options: 'i' } }
            }] : []),

            // Re-shape the properties
            {
                $project: {
                    _id: 1,
                    invoiceNo: 1,
                    invoiceDate: 1,
                    customerName: '$customerDoc.companyName',
                    jobId: '$jobDoc.jobId',
                    originalAmount: 1,
                    adjustedAmount: 1,
                    reason: 1,
                    actionBy: { $concat: ['$employeeDoc.firstName', ' ', '$employeeDoc.lastName'] },
                    actionById: '$employeeDoc.employeeId',
                    actionDate: 1,
                    status: 1
                }
            }
        ];

        pipeline.push({ $sort: { actionDate: -1 } });

        const facetPipeline = [
            ...pipeline,
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const mongoose = require('mongoose');
        const InvoiceAudit = mongoose.model('InvoiceAudit');

        // const result = await InvoiceAudit.aggregate(facetPipeline);
        // const data = result[0].data;
        // const total = result[0].metadata[0]?.total || 0;

        res.status(200).json({
            success: true,
            data: {
                // report: data,
                pagination: {
                    // total,
                    page,
                    limit,
                    // pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching cancelled/adjusted invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch report' });
    }
};

export const getCancelledAndReissuedInvoices = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const matchStage: any = { isDeleted: false, status: { $in: ['Cancelled', 'Reissued'] } };

        if (req.query.status) {
            matchStage.status = req.query.status;
        }

        if (req.query.search) {
            matchStage.invoiceNo = { $regex: req.query.search, $options: 'i' };
        }

        if (req.query.fromDate && req.query.toDate) {
            matchStage.cancelledAt = {
                $gte: new Date(req.query.fromDate as string),
                $lte: new Date(req.query.toDate as string)
            };
        }

        const pipeline: any[] = [
            { $match: matchStage },
            // Lookup Customer
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerDoc'
                }
            },
            { $unwind: { path: '$customerDoc', preserveNullAndEmptyArrays: true } },
            // Lookup Job
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobDoc'
                }
            },
            { $unwind: { path: '$jobDoc', preserveNullAndEmptyArrays: true } },
            // Lookup Cancelled By Employee
            {
                $lookup: {
                    from: 'employees',
                    localField: 'cancelledBy',
                    foreignField: '_id',
                    as: 'cancelledByDoc'
                }
            },
            { $unwind: { path: '$cancelledByDoc', preserveNullAndEmptyArrays: true } },
            // Lookup Reissued Invoice
            {
                $lookup: {
                    from: 'invoices',
                    localField: 'reissuedInvoiceId',
                    foreignField: '_id',
                    as: 'reissuedInvoiceDoc'
                }
            },
            { $unwind: { path: '$reissuedInvoiceDoc', preserveNullAndEmptyArrays: true } },

            // External filters on populated fields
            ...(req.query.customer ? [{
                $match: { 'customerDoc.companyName': { $regex: req.query.customer, $options: 'i' } }
            }] : []),
            ...(req.query.jobId ? [{
                $match: {
                    $or: [
                        { 'jobDoc.jobId': { $regex: req.query.jobId, $options: 'i' } }
                    ]
                }
            }] : []),

            {
                $project: {
                    _id: 1,
                    oldInvoiceNo: '$invoiceNo',
                    oldInvoiceDate: '$date',
                    customerName: '$customerDoc.companyName',
                    jobId: '$jobDoc.jobId',
                    originalAmount: '$amount',
                    cancellationReason: 1,
                    cancelledBy: { $concat: ['$cancelledByDoc.firstName', ' ', '$cancelledByDoc.lastName'] },
                    cancelledByRole: '$cancelledByDoc.role', // Assuming role field exists
                    cancelledAt: 1,
                    newInvoiceNo: { $ifNull: ['$reissuedInvoiceDoc.invoiceNo', '—'] },
                    newInvoiceDate: { $ifNull: ['$reissuedInvoiceDoc.date', '—'] },
                    reissuedAmount: { $ifNull: ['$reissuedInvoiceDoc.amount', '—'] },
                    status: 1,
                    reissuedInvoiceId: 1
                }
            }
        ];

        // Apply sort, default to cancelledAtdescending
        const sortStage: any = { $sort: { cancelledAt: -1 } };
        // We can dynamically sort by Date, Customer, Status if needed, but going with default for now as table handles logic
        pipeline.push(sortStage);

        const facetPipeline = [
            ...pipeline,
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const mongoose = require('mongoose');
        const Invoice = mongoose.model('Invoice');

        const result = await Invoice.aggregate(facetPipeline);
        const data = result[0].data;
        const total = result[0].metadata[0]?.total || 0;

        res.status(200).json({
            success: true,
            data: {
                invoices: data,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching cancelled/reissued invoices report:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch report data' });
    }
};
