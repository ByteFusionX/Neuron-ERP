import { Request, Response } from 'express';
import { Invoice } from '../models/invoice.model';
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
