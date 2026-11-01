import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ProformaInvoice, PI_STATUSES, PAYMENT_METHODS } from '../models/proformaInvoice.model';
import Job from '../models/job.model';
import { issueDocNo, peekDocNo } from '../services/docNumber.service';
import { getEmployeeData } from '../common/utils/util';
import { logAudit } from '../services/audit.service';
import { uploadFileToAws } from '../common/aws-connect';

const ENTITY = 'proformaInvoice';
const BILLABLE_JOB_STATUSES = ['Pending', 'On Hold'];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const fullName = (e: any) => (e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() : '');

const POPULATE = [
    { path: 'createdBy', select: 'firstName lastName' },
    { path: 'statusUpdatedBy', select: 'firstName lastName' },
];

/** Cleans the client payload into the stored shape, recomputing every amount so the totals can't be forged. */
const normalizeBody = (body: any) => {
    const items = (Array.isArray(body.items) ? body.items : [])
        .map((item: any) => {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            return { description: String(item.description || '').trim(), quantity, unitPrice, amount: money(quantity * unitPrice) };
        })
        .filter((item: any) => item.description && item.quantity > 0);
    return {
        items,
        amount: money(items.reduce((sum: number, item: any) => sum + item.amount, 0)),
        summary: Object.fromEntries(
            ['itemsCost', 'itemsPrice', 'supplierDiscount', 'customerDiscount', 'additionalCost', 'totalCost', 'totalPrice']
                .map((key) => [key, money(Number(body.summary?.[key]) || 0)]),
        ),
        expectedAmount: Math.max(0, money(Number(body.expectedAmount) || 0)),
        expectedDate: body.expectedDate && !isNaN(new Date(body.expectedDate).getTime()) ? new Date(body.expectedDate) : undefined,
        attention: String(body.attention || '').trim(),
        paymentTerms: String(body.paymentTerms || '').trim(),
        shipTo: String(body.shipTo || '').trim(),
        lpoNo: String(body.lpoNo || '').trim(),
        subject: String(body.subject || '').trim(),
        currency: String(body.currency || 'QAR').trim() || 'QAR',
        quoteCompany: String(body.quoteCompany || '').trim(),
    };
};


/** The number the next PI will get, shown in the create drawer. Nothing is reserved; the number is only issued on save. */
export const getNextProformaInvoiceNo = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json({ success: true, data: { piNo: await peekDocNo('PI') } });
    } catch (error) {
        console.error('Error previewing proforma invoice number:', error);
        return res.status(500).json({ success: false, message: 'Failed to get the next PI number' });
    }
};

export const getProformaInvoices = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 15));
        const status = req.query.status as string | undefined;
        const search = String(req.query.search || '').trim();

        const base: any = { isDeleted: false };
        if (req.query.job) {
            const job = String(req.query.job);
            if (!Types.ObjectId.isValid(job)) return res.status(400).json({ success: false, message: 'Invalid job' });
            base.job = new Types.ObjectId(job);
        }
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: 'i' };
            base.$or = [{ piNo: rx }, { jobId: rx }, { 'client.name': rx }, { lpoNo: rx }, { attention: rx }];
        }
        const query = status && (PI_STATUSES as readonly string[]).includes(status) ? { ...base, status } : base;

        const [data, total, grouped] = await Promise.all([
            ProformaInvoice.find(query).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            ProformaInvoice.countDocuments(query),
            ProformaInvoice.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        ]);
        const viewCounts: Record<string, number> = {};
        grouped.forEach((g: any) => { viewCounts[g._id] = g.count; });
        return res.status(200).json({ success: true, data, total, page, limit, viewCounts });
    } catch (error) {
        console.error('Error fetching proforma invoices:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch proforma invoices' });
    }
};

export const getProformaInvoiceById = async (req: Request, res: Response) => {
    try {
        if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
        const pi = await ProformaInvoice.findOne({ _id: req.params.id, isDeleted: false }).populate(POPULATE).lean();
        if (!pi) return res.status(404).json({ success: false, message: 'Proforma invoice not found' });
        return res.status(200).json({ success: true, data: pi });
    } catch (error) {
        console.error('Error fetching proforma invoice:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch proforma invoice' });
    }
};

export const createProformaInvoice = async (req: Request, res: Response) => {
    try {
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { job: jobRef } = req.body;
        if (!Types.ObjectId.isValid(jobRef)) return res.status(400).json({ success: false, message: 'Select a job' });
        const job: any = await Job.findOne({ _id: jobRef, isDeleted: { $ne: true } }).lean();
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!BILLABLE_JOB_STATUSES.includes(job.allocateStatus)) {
            return res.status(400).json({ success: false, message: 'A proforma invoice can only be raised for a pending or on hold job' });
        }

        const clientName = String(req.body.client?.name || '').trim();
        if (!clientName) return res.status(400).json({ success: false, message: 'Client is required' });
        const body = normalizeBody(req.body);
        if (!body.items.length) return res.status(400).json({ success: false, message: 'Add at least one item with a quantity' });

        const piNo = await issueDocNo('PI');

        const pi = await ProformaInvoice.create({
            ...body,
            piNo,
            job: job._id,
            jobId: job.jobId,
            client: {
                customerId: Types.ObjectId.isValid(req.body.client?.customerId) ? req.body.client.customerId : undefined,
                name: clientName,
            },
            status: 'Pending',
            createdBy: employee._id,
        });
        await logAudit(req, {
            entityType: ENTITY, entityId: pi._id, entityLabel: piNo, action: 'created',
            summary: `Proforma invoice ${piNo} created for job ${job.jobId} and sent for approval`,
        });
        return res.status(201).json({ success: true, data: pi });
    } catch (error) {
        console.error('Error creating proforma invoice:', error);
        return res.status(500).json({ success: false, message: 'Failed to create proforma invoice' });
    }
};

/** Editing keeps the current status; only a received PI is locked. */
export const updateProformaInvoice = async (req: Request, res: Response) => {
    try {
        if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
        const pi = await ProformaInvoice.findOne({ _id: req.params.id, isDeleted: false });
        if (!pi) return res.status(404).json({ success: false, message: 'Proforma invoice not found' });
        if (pi.status === 'Received') return res.status(400).json({ success: false, message: 'A received proforma invoice can no longer be edited' });

        const clientName = String(req.body.client?.name || pi.client?.name || '').trim();
        const body = normalizeBody(req.body);
        if (!body.items.length) return res.status(400).json({ success: false, message: 'Add at least one item with a quantity' });

        pi.set({ ...body, client: { customerId: pi.client?.customerId, name: clientName } });
        await pi.save();
        await logAudit(req, {
            entityType: ENTITY, entityId: pi._id, entityLabel: pi.piNo, action: 'updated',
            summary: `Proforma invoice ${pi.piNo} updated`,
        });
        return res.status(200).json({ success: true, data: pi });
    } catch (error) {
        console.error('Error updating proforma invoice:', error);
        return res.status(500).json({ success: false, message: 'Failed to update proforma invoice' });
    }
};

const clean = (value: any) => String(value ?? '').trim();

/** Moves a PI to any other status with an optional note; Received also records how the money arrived. */
export const updateProformaInvoiceStatus = async (req: Request, res: Response) => {
    try {
        if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
        const employee = await getEmployeeData(req.user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const status = clean(req.body.status);
        if (!(PI_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ success: false, message: 'Select a valid status' });
        const note = clean(req.body.note);

        const pi = await ProformaInvoice.findOne({ _id: req.params.id, isDeleted: false });
        if (!pi) return res.status(404).json({ success: false, message: 'Proforma invoice not found' });
        if (pi.status === status) return res.status(400).json({ success: false, message: `The proforma invoice is already ${status}` });

        const previous = pi.status;
        let payment: any;
        if (status === 'Received') {
            const method = clean(req.body.paymentMethod);
            const otherMethod = clean(req.body.otherMethod);
            const referenceNo = clean(req.body.referenceNo);
            if (!(PAYMENT_METHODS as readonly string[]).includes(method) || method === 'PDF') return res.status(400).json({ success: false, message: 'Select the payment method' });
            if (method === 'Other' && !otherMethod) return res.status(400).json({ success: false, message: 'Enter the payment method' });
            if (!referenceNo) return res.status(400).json({ success: false, message: 'Reference number is required' });

            const file = ((req as any).files || [])[0];
            let document;
            if (file) {
                await uploadFileToAws(file.filename, file.path);
                document = { fileName: file.filename, originalname: file.originalname };
            }
            payment = { method, otherMethod: method === 'Other' ? otherMethod : undefined, referenceNo, document, receivedAt: new Date() };
        }

        pi.status = status as any;
        // Leaving Received discards the payment record, so it can't describe a payment that is no longer confirmed.
        (pi as any).payment = payment;
        pi.statusUpdatedBy = employee._id as any;
        pi.statusUpdatedAt = new Date();
        await pi.save();

        const paid = payment ? ` (${payment.method === 'Other' ? payment.otherMethod : payment.method}, ref ${payment.referenceNo}${payment.document ? ', document attached' : ''})` : '';
        await logAudit(req, {
            entityType: ENTITY, entityId: pi._id, entityLabel: pi.piNo, action: 'status-changed',
            summary: `Proforma invoice ${pi.piNo} moved from ${previous} to ${status} by ${fullName(employee)}${paid}${note ? `: ${note}` : ''}`,
        });
        return res.status(200).json({ success: true, data: pi });
    } catch (error) {
        console.error('Error updating proforma invoice status:', error);
        return res.status(500).json({ success: false, message: 'Failed to update the proforma invoice status' });
    }
};
