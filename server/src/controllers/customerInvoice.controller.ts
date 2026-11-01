import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { issueDocNo, peekDocNo } from '../services/docNumber.service';
import PurchaseOrder from '../models/purchaseOrder.model';
import DeliveryNote from '../models/deliveryNote.model';
import { CustomerInvoice, CUSTOMER_INVOICE_STATUSES, CUSTOMER_PAYMENT_METHODS, PDC_STATUSES } from '../models/customerInvoice.model';
import { buildPrivilegeAccessFilter, getEmployeeData } from '../common/utils/util';
import { logAudit } from '../services/audit.service';

const clean = (v: any) => String(v ?? '').trim();
const scope = async (req: Request, forPo = false) => {
    const employee = await getEmployeeData(req.user);
    if (!employee) return null;
    const elevated = /^(superadmin|admin)$/i.test(employee.category?.role || '');
    const privileges = employee.category?.privileges;
    const poView = privileges?.purchaseOrder?.viewReport;
    const view = forPo && poView && poView !== 'none' ? poView : privileges?.invoice?.viewReport;
    const filter = elevated ? {} : !view || view === 'none' ? { _id: { $in: [] } } : await buildPrivilegeAccessFilter(employee._id, view, 'createdBy');
    return { employee, filter };
};

export const customerInvoicePo = async (req: Request, res: Response) => {
    try {
        const access = await scope(req, true);
        if (!access) return res.status(401).json({ message: 'Unauthorized' });
        if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid purchase order' });
        const quotePopulate = { path: 'quoteId', select: 'client attention subject customerAcceptance paymentTerms dealData.paymentTerms', populate: { path: 'client', select: 'companyName contactDetails' } };
        const po: any = await PurchaseOrder.findOne({ _id: req.params.id, ...access.filter })
            .populate('supplierId', 'supplierName').populate(quotePopulate)
            .populate({ path: 'jobId', select: 'jobId quoteId', populate: quotePopulate })
            .populate({ path: 'purchaseId', select: 'jobId', populate: { path: 'jobId', select: 'jobId quoteId', populate: quotePopulate } }).lean();
        if (!po) return res.status(404).json({ message: 'Purchase order not found' });
        if (!['Approved', 'Placed', 'Closed'].includes(po.poStatus)) return res.status(400).json({ message: 'Only approved purchase orders can be invoiced' });
        po.quoteId = po.jobId?.quoteId || po.purchaseId?.jobId?.quoteId || po.quoteId;
        const quote = po.quoteId;
        if (quote) quote.attention = quote.client?.contactDetails?.find((contact: any) => String(contact._id) === String(quote.attention));
        if (po.jobId?.quoteId) po.jobId.quoteId = quote;
        if (po.purchaseId?.jobId?.quoteId) po.purchaseId.jobId.quoteId = quote;
        po.nextInvoiceNo = await peekDocNo('INV');
        return res.json({ success: true, data: po });
    } catch (error) {
        console.error('Prepare customer invoice:', error);
        return res.status(500).json({ message: 'Failed to load purchase order' });
    }
};

const jobTotalsOf = (quote: any) => {
    const deal = quote?.dealData ?? {};
    let price = 0;
    for (const item of deal.updatedItems ?? []) {
        for (const d of item?.itemDetails ?? []) {
            if (d?.dealSelected) price += (Number(d.unitSellingPrice) || 0) * (Number(d.quantity) || 0);
        }
    }
    const discount = (Number(deal.totalDiscount) || 0) + (deal.additionalCosts ?? [])
        .filter((cost: any) => cost?.type === 'Customer Discount')
        .reduce((sum: number, cost: any) => sum + (Number(cost?.value) || 0), 0);
    return { price, discount };
};

const DN_INVOICEABLE =['Ready to Deliver', 'Dispatched', 'Delivered', 'Partially Rejected'];

export const customerInvoiceDn = async (req: Request, res: Response) => {
    try {
        const access = await scope(req);
        if (!access) return res.status(401).json({ message: 'Unauthorized' });
        if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid delivery note' });
        const dn: any = await DeliveryNote.findById(req.params.id)
            .populate({ path: 'jobId', select: 'jobId quoteId', populate: { path: 'quoteId', select: 'client attention subject customerAcceptance paymentTerms dealData.paymentTerms dealData.updatedItems dealData.additionalCosts dealData.totalDiscount', populate: { path: 'client', select: 'companyName contactDetails' } } }).lean();
        if (!dn) return res.status(404).json({ message: 'Delivery note not found' });
        if (!DN_INVOICEABLE.includes(dn.status)) return res.status(400).json({ message: 'Only a delivery note that is ready to deliver can be invoiced' });
        const quote = dn.jobId?.quoteId;
        if (quote) quote.attention = quote.client?.contactDetails?.find((contact: any) => String(contact._id) === String(quote.attention));
        // Job totals come from the approved deal: selected lines' selling price, and the customer discount (line discount + "Customer Discount" costs).
        dn.jobTotals = jobTotalsOf(quote);
        if (quote?.dealData) {
            delete quote.dealData.updatedItems;
            delete quote.dealData.additionalCosts;
            delete quote.dealData.totalDiscount;
        }
        dn.nextInvoiceNo = await peekDocNo('INV');
        return res.json({ success: true, data: dn });
    } catch (error) {
        console.error('Prepare customer invoice from DN:', error);
        return res.status(500).json({ message: 'Failed to load delivery note' });
    }
};

export const listCustomerInvoices = async (req: Request, res: Response) => {
    try {
        const access = await scope(req);
        if (!access) return res.status(401).json({ message: 'Unauthorized' });
        const page = Math.max(1, parseInt(String(req.query.page)) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 15));
        const base: any = { ...access.filter };
        const dnFilter = clean(req.query.deliveryNote);
        if (dnFilter) {
            if (!Types.ObjectId.isValid(dnFilter)) return res.status(400).json({ message: 'Invalid delivery note' });
            base.deliveryNote = new Types.ObjectId(dnFilter);
        }
        const search = clean(req.query.search);
        if (search) {
            const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
            base.$and = [{ $or: ['invoiceNo', 'poNo', 'supplierName', 'client.name', 'jobNo'].map(key => ({ [key]: rx })) }];
        }
        const status = clean(req.query.status);
        if (status && !(CUSTOMER_INVOICE_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ message: 'Invalid status' });
        const query = status ? { ...base, status } : base;
        const [data, total, groups] = await Promise.all([
            CustomerInvoice.find(query).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            CustomerInvoice.countDocuments(query),
            CustomerInvoice.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        ]);
        return res.json({ success: true, data, total, viewCounts: Object.fromEntries(groups.map(g => [g._id, g.count])) });
    } catch (error) {
        console.error('List customer invoices:', error);
        return res.status(500).json({ message: 'Failed to load customer invoices' });
    }
};

export const createCustomerInvoice = async (req: Request, res: Response) => {
    try {
        const access = await scope(req, true);
        if (!access) return res.status(401).json({ message: 'Unauthorized' });
        const clientName = clean(req.body.client?.name);
        const invoiceDate = new Date(req.body.invoiceDate);
        const paymentMethod = clean(req.body.paymentMethod);
        if (!clientName || !req.body.invoiceDate || isNaN(invoiceDate.getTime())) return res.status(400).json({ message: 'Client and a valid invoice date are required' });
        if (!(CUSTOMER_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) return res.status(400).json({ message: 'Select a valid payment method' });

        let source: Record<string, any>;
        let label: string;
        if (req.body.deliveryNote) {
            if (!Types.ObjectId.isValid(req.body.deliveryNote)) return res.status(400).json({ message: 'Select a delivery note' });
            const dn: any = await DeliveryNote.findById(req.body.deliveryNote)
                .populate({ path: 'jobId', select: 'jobId quoteId', populate: { path: 'quoteId', select: 'dealData.updatedItems dealData.additionalCosts dealData.totalDiscount' } }).lean();
            if (!dn) return res.status(404).json({ message: 'Delivery note not found' });
            if (!DN_INVOICEABLE.includes(dn.status)) return res.status(400).json({ message: 'Only a delivery note that is ready to deliver can be invoiced' });
            if (await CustomerInvoice.exists({ deliveryNote: dn._id })) return res.status(409).json({ message: 'An invoice has already been created for this delivery note' });
            const items = (dn.items || [])
                .map((item: any) => {
                    const quantity = Math.max(0, Number(item.currentDeliveryQty || 0) - Number(item.rejectedQty || 0));
                    const unitCost = Number(item.unitSellingPrice || 0);
                    return { description: item.description, quantity, unitCost, totalCost: Math.round(quantity * unitCost * 100) / 100 };
                })
                .filter((item: any) => item.quantity > 0);
            const amount = Math.round(items.reduce((sum: number, item: any) => sum + item.totalCost, 0) * 100) / 100;
            // The DN carries its share of the job discount, in proportion to its share of the job price.
            const job = jobTotalsOf(dn.jobId?.quoteId);
            const discount = job.price > 0 && job.discount > 0 ? Math.round(Math.min(job.discount * amount / job.price, job.discount, amount) * 100) / 100 : 0;
            source = { deliveryNote: dn._id, dnNo: dn.dnNo, job: dn.jobId?._id, jobNo: dn.jobId?.jobId || '', items, amount, discount };
            label = dn.dnNo;
        } else {
            if (!Types.ObjectId.isValid(req.body.purchaseOrder)) return res.status(400).json({ message: 'Select a purchase order' });
            const po: any = await PurchaseOrder.findOne({ _id: req.body.purchaseOrder, ...access.filter }).populate('supplierId', 'supplierName').populate('jobId', 'jobId')
                .populate({ path: 'purchaseId', select: 'jobId', populate: { path: 'jobId', select: 'jobId' } }).lean();
            if (!po) return res.status(404).json({ message: 'Purchase order not found' });
            if (!['Approved', 'Placed', 'Closed'].includes(po.poStatus)) return res.status(400).json({ message: 'Only approved purchase orders can be invoiced' });
            const items = po.items.map((item: any) => ({ description: item.detail, quantity: item.quantity, unitCost: item.unitCost, totalCost: item.totalCost }));
            const job = po.jobId || po.purchaseId?.jobId;
            const amount = Math.round((items.reduce((sum: number, item: any) => sum + Number(item.totalCost || 0), 0) - Number(po.discount || 0)) * 100) / 100;
            source = {
                purchaseOrder: po._id, poNo: po.poNo, supplier: po.supplierId._id, supplierName: po.supplierId.supplierName,
                dnNo: clean(req.body.dnNo), job: job?._id, jobNo: job?.jobId || '', currency: po.currency || 'QAR', amount, items,
            };
            label = po.poNo;
        }

        const invoiceNo = await issueDocNo('INV');
        const invoice = await CustomerInvoice.create({
            ...source,
            client: { name: clientName, customerId: Types.ObjectId.isValid(req.body.client?.customerId) ? req.body.client.customerId : undefined },
            invoiceNo, invoiceDate, paymentMethod,
            ...(paymentMethod === 'PDC' ? { pdcStatus: 'Pending', pdcHistory: [{ status: 'Pending', changedBy: access.employee._id, changedAt: new Date() }] } : {}),
            ...Object.fromEntries(['attention', 'lpoRef', 'subject', 'paymentTerms'].map(key => [key, clean(req.body[key])])),
            status: 'Pending', createdBy: access.employee._id,
        });
        await logAudit(req, { entityType: 'customerInvoice', entityId: invoice._id, entityLabel: invoiceNo, action: 'created', summary: `Customer invoice ${invoiceNo} created against ${label}` });
        // Same event on the job's own history, which feeds the job sheet's workflow tab.
        if (source.job) await logAudit(req, { entityType: 'job', entityId: source.job, entityLabel: source.jobNo, action: 'invoiced', summary: `Customer invoice ${invoiceNo} created against ${label}` });
        return res.status(201).json({ success: true, data: invoice });
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ message: 'This invoice number already exists' });
        console.error('Create customer invoice:', error);
        return res.status(500).json({ message: 'Failed to create customer invoice' });
    }
};

// PDC approval is independent of invoice approval.
export const listPdc = async (req: Request, res: Response) => {
    try {
        const access = await scope(req);
        if (!access) return res.status(401).json({ message: 'Unauthorized' });
        const page = Math.max(1, parseInt(String(req.query.page)) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 15));
        const base: any = { ...access.filter, paymentMethod: 'PDC' };
        const search = clean(req.query.search);
        if (search) {
            const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
            base.$and = [{ $or: ['invoiceNo', 'poNo', 'supplierName', 'client.name', 'jobNo'].map(key => ({ [key]: rx })) }];
        }
        const status = clean(req.query.status);
        if (status && !(PDC_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ message: 'Invalid PDC status' });
        // Existing PDC invoices without a dedicated status start as Pending.
        const effectiveStatus = { $ifNull: ['$pdcStatus', 'Pending'] };
        const query = status ? { ...base, $expr: { $eq: [effectiveStatus, status] } } : base;
        const [rows, total, groups] = await Promise.all([
            CustomerInvoice.find(query).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            CustomerInvoice.countDocuments(query),
            CustomerInvoice.aggregate([{ $match: base }, { $group: { _id: effectiveStatus, count: { $sum: 1 } } }]),
        ]);
        return res.json({ success: true, data: rows.map(row => ({ ...row, pdcStatus: row.pdcStatus || 'Pending' })), total, viewCounts: Object.fromEntries(groups.map(g => [g._id, g.count])) });
    } catch (error) {
        console.error('List PDC:', error);
        return res.status(500).json({ message: 'Failed to load PDC payments' });
    }
};

export const updatePdcStatus = async (req: Request, res: Response) => {
    try {
        const access = await scope(req);
        if (!access) return res.status(401).json({ message: 'Unauthorized' });
        if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid PDC payment' });
        const target = clean(req.body.status);
        const source = target === 'Approved' || target === 'Rejected' ? 'Pending' : target === 'Revoked' ? 'Approved' : null;
        if (!source) return res.status(400).json({ message: 'Invalid PDC transition' });
        const invoice = await CustomerInvoice.findOneAndUpdate({
            $and: [access.filter, { _id: req.params.id, paymentMethod: 'PDC' }],
            $expr: { $eq: [{ $ifNull: ['$pdcStatus', 'Pending'] }, source] },
        }, {
            $set: { pdcStatus: target },
            $push: { pdcHistory: { status: target, changedBy: access.employee._id, changedAt: new Date() } },
        }, { new: true, runValidators: true });
        if (!invoice) return res.status(409).json({ message: 'PDC payment is unavailable or its status has changed. Refresh and try again.' });
        await logAudit(req, { entityType: 'customerInvoice', entityId: invoice._id, entityLabel: invoice.invoiceNo, action: 'updated', summary: `PDC ${invoice.invoiceNo}: ${source} to ${target}` });
        return res.json({ success: true, data: invoice });
    } catch (error) {
        console.error('Update PDC:', error);
        return res.status(500).json({ message: 'Failed to update PDC status' });
    }
};
