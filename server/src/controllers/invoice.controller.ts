import { Request, Response } from 'express';
import { Invoice } from '../models/invoice.model';
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
            .populate('customer', 'clientName') // Assuming Customer has clientName
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
