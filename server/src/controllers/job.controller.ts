import { NextFunction, Request, Response } from "express"
import jobModel, { allocateStatus, allocateType, jobStatus } from "../models/job.model"
import Employee from '../models/employee.model';
import { buildGridFilterMatch, buildGridSort, GridFieldMap } from "../common/utils/grid-query";
import { newTrash } from '../controllers/trash.controller';
import { calculateDiscountPrice, calculateDiscountPricePipe, getAllReportedEmployees, getUSDRated, getEmployeeData, escapeRegex } from "../common/utils/util";
import technicalModel from '../models/technical.model';
import PurchaseRequest, { PurchaseRequestStatus } from '../models/purchaseRequest.model';
import quotationModel, { quoteStatus } from '../models/quotation.model';
import enquiryModel from '../models/enquiry.model';
import { Invoice } from '../models/invoice.model';
import { releaseQuoteStockHolds } from './quoteStockHold.controller';
import { cancelOpenFollowUp } from '../services/enquiryFollowUp.service';
import { logEnquiryAudit } from '../services/enquiryAudit.service';
import Rfq, { RfqStage, RfqStatus } from '../models/rfq.model';
import PurchaseOrder from '../models/purchaseOrder.model';
import DeliveryNote from '../models/deliveryNote.model';
import GRN from '../models/grn.model';
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";
import { logAudit } from "../services/audit.service";
import { findPurchaseBuyer } from '../services/purchaseBuyer.service';
import { release as releaseStock, reverseByReference } from '../services/stock.service';

const employeeLabel = async (id: unknown): Promise<string> => {
    if (!id) return '—';
    const e: any = await Employee.findById(id).select('firstName lastName').lean();
    return e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() || '—' : '—';
};


const { ObjectId } = require('mongodb')

/** Grid column key -> field on the joined job document (after the lookups in `jobBasePipeline`). */
const JOB_GRID_FIELDS: Record<string, string> = {
    updatedDate: 'updatedDate',
    jobId: 'jobId',
    customerName: 'clientDetails.companyName',
    description: 'quotation.subject',
    salesPerson: 'salesPersonName',
    department: 'departmentName',
    quoteId: 'quotation.quoteId',
    dealId: 'quotation.dealData.dealId',
    procurementPerson: 'procurementName',
    lpoValue: 'lpoValue',
    allocateStatus: 'allocateStatus',
};

const JOB_ALLOCATE_STATUSES = Object.values(allocateStatus) as string[];

/** Search box + grid column filters + sort for the job list. Everything runs after the lookups. */
const buildJobGridQuery = (search: unknown, filters: unknown, sortKey: unknown, sortDir: unknown) => {
    const clauses: Record<string, any>[] = [];
    const text = String(search ?? '').trim();
    if (text) {
        const re = { $regex: escapeRegex(text), $options: 'i' };
        clauses.push({
            $or: [
                { jobId: re },
                { 'clientDetails.companyName': re },
                { 'quotation.subject': re },
                { 'quotation.quoteId': re },
                { 'quotation.dealData.dealId': re },
                { salesPersonName: re },
                { procurementName: re },
            ],
        });
    }

    for (const f of Array.isArray(filters) ? filters : []) {
        const key = String(f?.key ?? '');
        const op = String(f?.op ?? 'contains');
        const raw = f?.value;
        const field = JOB_GRID_FIELDS[key];
        if (!field) continue;
        if (op === 'empty') {
            clauses.push({ [field]: { $in: [null, ''] } });
            continue;
        }
        if (raw === undefined || raw === null || raw === '') continue;
        if (key === 'updatedDate') {
            const day = new Date(String(raw));
            if (isNaN(day.getTime())) continue;
            const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
            if (op === 'on') clauses.push({ [field]: { $gte: day, $lt: next } });
            else if (op === 'before') clauses.push({ [field]: { $lt: day } });
            else if (op === 'after') clauses.push({ [field]: { $gte: next } });
            continue;
        }
        if (key === 'lpoValue') {
            const n = Number(raw);
            if (isNaN(n)) continue;
            if (op === 'gt') clauses.push({ [field]: { $gt: n } });
            else if (op === 'lt') clauses.push({ [field]: { $lt: n } });
            else clauses.push({ [field]: n });
            continue;
        }
        const value = escapeRegex(String(raw).trim());
        const exact = op === 'is' || op === 'eq' || op === 'isNot';
        const negate = op === 'isNot' || op === 'notContains';
        const re = { $regex: exact ? `^${value}$` : value, $options: 'i' };
        clauses.push(negate ? { [field]: { $not: re } } : { [field]: re });
    }

    const sortField = JOB_GRID_FIELDS[String(sortKey ?? '')];
    // Default: newest activity first, which is the date the grid shows in its first column.
    const sort: Record<string, 1 | -1> = sortField
        ? { [sortField]: sortDir === 'desc' ? -1 : 1, _id: -1 }
        : { updatedDate: -1, _id: -1 };
    return { filter: clauses.length ? { $and: clauses } : {}, sort };
};

/** Lookups + LPO value shared by the page query and the totals query, so "of N" always matches the rows. */
const jobBasePipeline = (salesPerson: unknown, qatarUsdRate: number): any[] => [
    { $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' } },
    { $unwind: '$quotation' },
    ...(salesPerson && ObjectId.isValid(String(salesPerson)) ? [{ $match: { 'quotation.createdBy': new ObjectId(String(salesPerson)) } }] : []),
    { $lookup: { from: 'customers', localField: 'quotation.client', foreignField: '_id', as: 'clientDetails' } },
    { $unwind: '$clientDetails' },
    { $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'departmentDetails' } },
    { $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPersonDetails' } },
    { $lookup: { from: 'employees', localField: 'procurementPerson', foreignField: '_id', as: 'procurementPerson' } },
    { $unwind: { path: '$procurementPerson', preserveNullAndEmptyArrays: true } },
    {
        $addFields: {
            departmentName: { $ifNull: [{ $arrayElemAt: ['$departmentDetails.departmentName', 0] }, ''] },
            salesPersonName: {
                $trim: { input: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$salesPersonDetails.firstName', 0] }, ''] }, ' ', { $ifNull: [{ $arrayElemAt: ['$salesPersonDetails.lastName', 0] }, ''] }] } },
            },
            procurementName: {
                $trim: { input: { $concat: [{ $ifNull: ['$procurementPerson.firstName', ''] }, ' ', { $ifNull: ['$procurementPerson.lastName', ''] }] } },
            },
            lpoValue: {
                $let: {
                    vars: {
                        baseLpoValue: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$quotation.currency', 'USD'] },
                                    { $multiply: [calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'), qatarUsdRate] },
                                    calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                ],
                            },
                        },
                    },
                    in: {
                        $reduce: {
                            input: { $ifNull: ['$quotation.dealData.additionalCosts', []] },
                            initialValue: '$$baseLpoValue',
                            in: { $cond: [{ $eq: ['$$this.type', 'Customer Discount'] }, { $subtract: ['$$value', '$$this.value'] }, '$$value'] },
                        },
                    },
                },
            },
        },
    },
];

export const jobList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, search, row, status, salesPerson, selectedMonth, selectedYear, access, userId, allocateStatus: allocateStatusFilter, filters: gridFilters, sortKey, sortDir, customer, department, fromDate, toDate } = req.body;

        page = Math.max(1, parseInt(page) || 1);
        row = Math.min(10000, Math.max(1, parseInt(row) || 15));
        const skipNum: number = (page - 1) * row;

        if (allocateStatusFilter && !JOB_ALLOCATE_STATUSES.includes(String(allocateStatusFilter))) {
            return res.status(400).json({ message: 'Invalid allocate status' });
        }

        const matchFilters: any = {
            isDeleted: { $ne: true },
            $and: [
                { $or: [{ 'quotation.dealData.dealId': { $exists: true } }, { 'quotation.dealData': { $exists: true } }] },
            ],
        };
        if (status != null) matchFilters.$and.push({ status });
        if (allocateStatusFilter) matchFilters.allocateStatus = allocateStatusFilter;
        if (customer && ObjectId.isValid(String(customer))) matchFilters['quotation.client'] = new ObjectId(String(customer));
        if (department && ObjectId.isValid(String(department))) matchFilters['quotation.department'] = new ObjectId(String(department));
        // Created-date window (the report's From / To); both ends inclusive.
        const from = fromDate ? new Date(String(fromDate)) : null;
        const to = toDate ? new Date(String(toDate)) : null;
        if (from && !isNaN(from.getTime())) matchFilters.$and.push({ createdDate: { $gte: from } });
        if (to && !isNaN(to.getTime())) matchFilters.$and.push({ createdDate: { $lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } });

        if (selectedMonth && selectedYear) {
            const startDate = new Date(selectedYear, selectedMonth - 1, 1);
            const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
            matchFilters.$and.push({ createdDate: { $gte: startDate, $lte: endDate } });
        } else if (selectedYear) {
            const startDate = new Date(selectedYear, 0, 1);
            const endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
            matchFilters.$and.push({ createdDate: { $gte: startDate, $lte: endDate } });
        }

        let accessFilter: any = {};
        const reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { 'salesPersonDetails._id': new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { 'salesPersonDetails._id': { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { 'salesPersonDetails._id': { $in: reportedToUserIds } };
                break;
            default:
                break;
        }

        // A job must always be visible to the employee it's currently allocated to
        // as procurement person, regardless of their broader viewReport scope.
        if (userId && Object.keys(accessFilter).length > 0) {
            accessFilter = { $or: [accessFilter, { 'procurementPerson._id': new ObjectId(userId) }] };
        }

        const qatarUsdRate = await getUSDRated();
        const gridQuery = buildJobGridQuery(search, gridFilters, sortKey, sortDir);
        const baseStages = [
            ...jobBasePipeline(salesPerson, qatarUsdRate),
            { $match: { ...accessFilter, ...matchFilters } },
            { $match: gridQuery.filter },
        ];

        // Tab badges: jobs per allocate status, scoped by access only.
        const { allocateStatus: _ignored, ...matchWithoutStatus } = matchFilters;
        const statusCounts = jobModel.aggregate([
            ...jobBasePipeline(salesPerson, qatarUsdRate),
            { $match: { ...accessFilter, ...matchWithoutStatus } },
            { $group: { _id: '$allocateStatus', count: { $sum: 1 } } },
        ]);

        const [jobData, jobTotal, statusRows] = await Promise.all([
            jobModel.aggregate([
                ...baseStages,
                { $sort: gridQuery.sort },
                { $skip: skipNum },
                { $limit: row },
                { $lookup: { from: 'suppliers', localField: 'quotation.dealData.additionalCosts.supplierId', foreignField: '_id', as: 'costSupplierDetails' } },
                {
                    $addFields: {
                        'quotation.dealData.additionalCosts': {
                            $map: {
                                input: { $ifNull: ['$quotation.dealData.additionalCosts', []] },
                                as: 'cost',
                                in: {
                                    $mergeObjects: [
                                        '$$cost',
                                        { supplierDetails: { $arrayElemAt: [{ $filter: { input: '$costSupplierDetails', as: 'supplier', cond: { $eq: ['$$supplier._id', '$$cost.supplierId'] } } }, 0] } },
                                    ],
                                },
                            },
                        },
                        attention: {
                            $arrayElemAt: [{ $filter: { input: '$clientDetails.contactDetails', as: 'contact', cond: { $eq: ['$$contact._id', '$quotation.attention'] } } }, 0],
                        },
                    },
                },
                { $lookup: { from: 'purchases', localField: '_id', foreignField: 'jobId', as: 'purchaseRequests' } },
                {
                    $addFields: {
                        hasPurchaseRequest: {
                            $gt: [{ $size: { $filter: { input: '$purchaseRequests', as: 'pr', cond: { $eq: ['$$pr.isDeleted', false] } } } }, 0],
                        },
                    },
                },
                { $project: { purchaseRequests: 0, costSupplierDetails: 0, salesPersonName: 0, departmentName: 0, procurementName: 0 } },
            ]),
            jobModel.aggregate([
                ...baseStages,
                { $group: { _id: null, total: { $sum: 1 }, totalLpo: { $sum: { $ifNull: ['$lpoValue', 0] } } } },
            ]),
            statusCounts,
        ]);

        const statusTotals: Record<string, number> = {};
        (statusRows as { _id: string; count: number }[]).forEach((r) => { statusTotals[r._id] = r.count; });
        const viewCounts = { all: Object.values(statusTotals).reduce((a, b) => a + b, 0), ...statusTotals };
        return res.status(200).json({ total: jobTotal[0]?.total ?? 0, totalLpo: jobTotal[0]?.totalLpo ?? 0, job: jobData, statusTotals, viewCounts });
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const totalJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId, allocateStatus } = req.query;

        let accessFilter = {};

        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { 'salesPersonDetails._id': new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { 'salesPersonDetails._id': { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { 'salesPersonDetails._id': { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        // A job must always be visible to the employee it's currently allocated to
        // as procurement person, regardless of their broader viewReport scope.
        if (userId && Object.keys(accessFilter).length > 0) {
            accessFilter = { $or: [accessFilter, { 'procurementPerson._id': new ObjectId(userId as string) }] };
        }

        const jobTotal: { total: number }[] = await jobModel.aggregate([
            {
                $match: { isDeleted: { $ne: true }, allocateStatus }
            },
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPersonDetails' }
            },
            {
                $lookup: { from: 'employees', localField: 'procurementPerson', foreignField: '_id', as: 'procurementPerson' }
            },
            { $unwind: { path: '$procurementPerson', preserveNullAndEmptyArrays: true } },
            {
                $match: accessFilter
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { total: 1, _id: 0 }
            }
        ]).exec();

        if (jobTotal.length === 0) {
            jobTotal.push({ total: 0 });
        }

        if (jobTotal) return res.status(200).json(jobTotal[0])

        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error);
    }
};




export const updateJobStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const { jobId } = req.params;
        if (!ObjectId.isValid(jobId)) return res.status(400).json({ success: false, message: 'Invalid job ID' });
        if (!Object.values(jobStatus).includes(status)) {
            return res.status(400).json({ success: false, message: `Status must be one of: ${Object.values(jobStatus).join(', ')}` });
        }
        const jobUpdated = await jobModel.findByIdAndUpdate(jobId, { status: status, updatedDate: Date.now() })

        if (jobUpdated) {
            if (jobUpdated.status !== status) {
                await logAudit(req, { entityType: 'job', entityId: jobUpdated._id, entityLabel: jobUpdated.jobId, action: 'status-changed', summary: `Status changed to ${status}`, changes: [{ label: 'Status', from: jobUpdated.status, to: String(status) }] });
            }
            return res.status(200).json(status)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}


export const getJobSalesPerson = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const customers = await jobModel.aggregate([
            {
                $match: { isDeleted: { $ne: true } }
            },
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotaion' }
            },
            {
                $unwind: "$quotaion"
            },
            {
                $group: {
                    _id: "$quotaion.createdBy",
                    count: { $sum: 1 }
                },
            },
            {
                $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'createdBy' }
            },
            {
                $unwind: "$createdBy"
            },
            {
                $project: {
                    _id: 0,
                    createdBy: 1
                }
            },
            {
                $project: {
                    _id: "$createdBy._id",
                    fullName: { $concat: ["$createdBy.firstName", " ", "$createdBy.lastName"] }
                }
            }
        ]);
        if (customers.length > 0) {
            return res.status(200).json(customers);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employeeId } = req.body

        // Check if job exists and isn't already deleted
        if (!dataId || !ObjectId.isValid(String(dataId))) {
            return res.status(400).json({ message: 'A valid job id is required' });
        }

        const job = await jobModel.findOne({
            _id: dataId,
            isDeleted: { $ne: true },
        });

        if (!job) {
            return res.status(404).json({
                message: 'Job not found or already deleted'
            });
        }

        // Purchase work hangs off the job; deleting it would orphan those records.
        const linkedPurchase = await PurchaseRequest.findOne({ jobId: job._id, isDeleted: false }).select('_id').lean();
        if (linkedPurchase) {
            return res.status(409).json({
                message: 'This job has purchase requests. Delete or cancel them first, then delete the job.'
            });
        }

        // Soft delete the job
        await jobModel.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Job', dataId, employeeId)
        await logAudit(req, { entityType: 'job', entityId: job._id, entityLabel: job.jobId, action: 'deleted', summary: `Job ${job.jobId} deleted` });

        return res.status(200).json({
            success: true,
            message: 'Job deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}

export const getPreviousJobItemsByClient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { clientId } = req.params;

        const jobs = await jobModel.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    status: { $in: ['Work In Progress', 'Completed'] }
                }
            },
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            { $unwind: '$quotation' },
            {
                $match: { 'quotation.client': new ObjectId(clientId) }
            },
            {
                $project: {
                    jobId: 1,
                    status: 1,
                    createdDate: 1,
                    items: { $ifNull: ['$quotation.dealData.updatedItems', []] }
                }
            },
            { $sort: { createdDate: -1 } }
        ]);

        return res.status(200).json({ jobs });
    } catch (error) {
        next(error);
    }
}

export const jobSheets = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobs = await jobModel.find({
            status: { $nin: ["Purchase Requested"] }
        }).select("_id jobId").sort({ createdDate: -1 });
        return res.status(200).json({ jobs: jobs })
    } catch (error) {
        next(error)
        console.error(error)
    }
}

export const jobSheetsWithCompletedPO = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobs = await jobModel.find({
            status: { $nin: ["Purchase Requested"] },
            isDeleted: { $ne: true }
        }).select("_id jobId").sort({ createdDate: -1 });

        if (!jobs.length) {
            return res.status(200).json({ jobs: [] });
        }

        const jobIds = jobs.map(j => j._id);

        const purchaseOrders = await PurchaseOrder.find({
            jobId: { $in: jobIds }
        }).select('jobId poStatus supplierInvoices');
        console.log(purchaseOrders);
        const jobIdToOrders = new Map<string, any[]>();
        purchaseOrders.forEach((po: any) => {
            const key = po.jobId.toString();
            if (!jobIdToOrders.has(key)) {
                jobIdToOrders.set(key, []);
            }
            jobIdToOrders.get(key)!.push(po);
        });

        console.log(jobIdToOrders);
        console.log(jobs);

        const filteredJobs = jobs.filter(job => {
            const orders = jobIdToOrders.get(job._id.toString()) || [];
            if (!orders.length) return false;

            for (const po of orders) {
                if (po.poStatus !== 'Closed') {
                    return false;
                }
            }

            return true;
        });

        console.log(filteredJobs);

        return res.status(200).json({ jobs: filteredJobs });
    } catch (error) {
        next(error);
        console.error(error);
    }
}

export const jobSheetsWithApprovedPOAndNoGRN = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const approvedPOs = await PurchaseOrder.find({
            // Goods are received only once the order is placed with the supplier.
            poStatus: 'Placed'
        }).select('_id jobId');

        if (!approvedPOs.length) {
            return res.status(200).json({ jobs: [] });
        }

        const poIds = approvedPOs.map(po => po._id);

        const grnsForPOs = await GRN.find({
            purchaseOrderId: { $in: poIds }
        }).select('purchaseOrderId');

        const poIdsWithGRN = new Set(grnsForPOs.map(g => g.purchaseOrderId.toString()));

        const jobIdSet = new Set<string>();
        approvedPOs.forEach(po => {
            if (po.jobId && !poIdsWithGRN.has(po._id.toString())) {
                jobIdSet.add(po.jobId.toString());
            }
        });

        if (!jobIdSet.size) {
            return res.status(200).json({ jobs: [] });
        }

        const jobs = await jobModel.find({
            _id: { $in: Array.from(jobIdSet) },
            isDeleted: { $ne: true }
        }).select('_id jobId').sort({ createdDate: -1 });

        return res.status(200).json({ jobs });
    } catch (error) {
        next(error);
        console.error(error);
    }
}

export const jobSheetsWithApprovedPR = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const approvedPRs = await PurchaseRequest.find({
            status: 'Approved',
            isDeleted: { $ne: true }
        }).distinct('jobId');

        if (!approvedPRs.length) {
            return res.status(200).json({ jobs: [] });
        }

        const jobs = await jobModel.find({
            _id: { $in: approvedPRs },
            isDeleted: { $ne: true }
        }).select('_id jobId').sort({ createdDate: -1 });

        return res.status(200).json({ jobs });
    } catch (error) {
        next(error);
        console.error(error);
    }
}

export const oneJobSheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const qatarUsdRate = await getUSDRated();
        const jobData = await jobModel.aggregate([
            {
                $match: { _id: new ObjectId(id), isDeleted: { $ne: true } }
            },
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $unwind: "$quotation"
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'quotation.dealData.additionalCosts.supplierId',
                    foreignField: '_id',
                    as: 'costSupplierDetails'
                }
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'quotation.dealData.updatedItems.itemDetails.supplierId',
                    foreignField: '_id',
                    as: 'itemSupplierDetails'
                }
            },
            {
                $addFields: {
                    'quotation.dealData.additionalCosts': {
                        $map: {
                            input: '$quotation.dealData.additionalCosts',
                            as: 'cost',
                            in: {
                                $mergeObjects: [
                                    '$$cost',
                                    {
                                        supplierDetails: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$costSupplierDetails',
                                                        as: 'supplier',
                                                        cond: { $eq: ['$$supplier._id', '$$cost.supplierId'] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    'quotation.dealData.updatedItems': {
                        $map: {
                            input: '$quotation.dealData.updatedItems',
                            as: 'item',
                            in: {
                                $mergeObjects: [
                                    '$$item',
                                    {
                                        itemDetails: {
                                            $map: {
                                                input: '$$item.itemDetails',
                                                as: 'detail',
                                                in: {
                                                    $mergeObjects: [
                                                        '$$detail',
                                                        {
                                                            supplierDetails: {
                                                                $arrayElemAt: [
                                                                    {
                                                                        $filter: {
                                                                            input: '$itemSupplierDetails',
                                                                            as: 'supplier',
                                                                            cond: { $eq: ['$$supplier._id', '$$detail.supplierId'] }
                                                                        }
                                                                    },
                                                                    0
                                                                ]
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $lookup: { from: 'customers', localField: 'quotation.client', foreignField: '_id', as: 'clientDetails' }
            },
            {
                $unwind: "$clientDetails"
            },
            {
                $sort: { createdDate: -1 }
            },
            {
                $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'departmentDetails' }
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPersonDetails' }
            },
            {
                $addFields: {
                    attention: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$clientDetails.contactDetails',
                                    as: 'contact',
                                    cond: { $eq: ['$$contact._id', '$quotation.attention'] }
                                }
                            },
                            0
                        ]
                    },
                    lpoValue: {
                        $let: {
                            vars: {
                                baseLpoValue: {
                                    $sum: {
                                        $cond: [
                                            { $eq: ['$quotation.currency', 'USD'] },
                                            {
                                                $multiply: [
                                                    calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                                    qatarUsdRate
                                                ]
                                            },
                                            calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                                        ]
                                    }
                                }
                            },
                            in: {
                                $reduce: {
                                    input: '$quotation.dealData.additionalCosts',
                                    initialValue: '$$baseLpoValue',
                                    in: {
                                        $cond: [
                                            { $eq: ['$$this.type', 'Customer Discount'] },
                                            { $subtract: ['$$value', '$$this.value'] },
                                            '$$value'
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }

            }
        ]);
        return res.status(200).json(jobData)
    } catch (error) {
        next(error)
    }
}

export const updateAllocateType = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.body;
        const productDistribution = req.body.productDistribution === true;
        const projectInstallation = req.body.projectInstallation === true;
        const amc = req.body.amc === true;

        if (!id) {
            return res.status(400).json({ success: false, message: 'Job id is required' });
        }
        if (!productDistribution && !projectInstallation && !amc) {
            return res.status(400).json({ success: false, message: 'Select at least one of Product distribution, Project installation or AMC' });
        }
        if (!ObjectId.isValid(String(id))) {
            return res.status(400).json({ success: false, message: 'Invalid job id' });
        }

        // Product distribution hands the purchase work to one buyer, picked at allocation.
        let buyer: any = null;
        if (productDistribution) {
            const buyerId = String(req.body.procurementPersonId ?? '');
            if (!buyerId || !ObjectId.isValid(buyerId)) {
                return res.status(400).json({ success: false, message: 'Select the person who will handle the purchase' });
            }
            buyer = await findPurchaseBuyer(buyerId);
            if (!buyer) {
                return res.status(400).json({ success: false, message: 'Selected person cannot be assigned purchases' });
            }
        }

        const currentJob = await jobModel.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!currentJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Allocation moves a job forward (Pending -> Open To Work); it must never pull a started or finished job back.
        if (currentJob.allocateStatus !== allocateStatus.Pending && currentJob.allocateStatus !== allocateStatus.OpenToWork) {
            return res.status(409).json({
                success: false,
                message: `Job is already ${currentJob.allocateStatus}; it can no longer be allocated`
            });
        }

        // Downstream screens still key on the legacy type, so derive it from the two scopes.
        // AMC on its own keeps the AMC type; combined with the others, the supply/installation mix decides.
        const derivedType = productDistribution && projectInstallation ? allocateType.ProjectWithSupply
            : productDistribution ? allocateType.SupplyOnly
            : projectInstallation ? allocateType.ProjectsWithOutSupply
            : allocateType.AMC;
        const scopeLabel = [productDistribution && 'Product distribution', projectInstallation && 'Project installation', amc && 'AMC'].filter(Boolean).join(' + ');

        const allocator = await getEmployeeData(req.user);
        const updateJob = await jobModel.findByIdAndUpdate(
            { _id: id },
            {
                ...(allocator ? { allocatedBy: allocator._id } : {}), allocatedAt: new Date(),
                allocateType: derivedType, productDistribution, projectInstallation, amc, allocateStatus: allocateStatus.OpenToWork, updatedDate: new Date(),
                ...(buyer ? { procurementPerson: buyer._id } : {}),
            },
            { new: true }
        );
        if (!updateJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        await logAudit(req, {
            entityType: 'job', entityId: updateJob._id, entityLabel: updateJob.jobId, action: 'allocated',
            summary: `Allocated: ${scopeLabel}`,
            changes: [
                { label: 'Scope', from: currentJob.allocateType || '—', to: scopeLabel },
                { label: 'Allocation status', from: String(currentJob.allocateStatus), to: allocateStatus.OpenToWork },
            ],
        });

        // Hand off to purchase: the job waits on the buyer's New tab until they create its PR.
        if (buyer) {
            const actor = allocator;
            const buyerId = buyer._id.toString();
            void createNotificationWithPrivileges(
                {
                    type: 'PurchaseRequestAllocated',
                    referenceModel: 'Job',
                    title: 'Job allocated to you for purchase',
                    message: `Job ${updateJob.jobId} has been allocated to you. Create its purchase request.`,
                    sentBy: actor?._id?.toString(),
                    referenceId: updateJob._id,
                },
                {
                    privilegeKey: 'purchase',
                    checkFunction: (_privileges, employeeId) => employeeId === buyerId,
                },
                req.app.get('io') as Server
            ).catch((err) => console.error('Job allocation notification failed:', err));
        }

        res.status(200).json({ success: true, message: 'Job allocated successfully', data: updateJob });
    } catch (error) {
        next(error);
    }
};

export const markJobLost = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.body;
        const reason = String(req.body.reason ?? '').trim();
        if (!id || !ObjectId.isValid(String(id))) {
            return res.status(400).json({ success: false, message: 'Invalid job id' });
        }
        if (!reason) {
            return res.status(400).json({ success: false, message: 'A reason is required to mark a job lost' });
        }
        const job = await jobModel.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (job.allocateStatus === allocateStatus.Lost) {
            return res.status(409).json({ success: false, message: 'Job is already marked lost' });
        }
        if (job.allocateStatus === allocateStatus.Completed) {
            return res.status(409).json({ success: false, message: 'A completed job cannot be marked lost' });
        }

        const actor = await getEmployeeData(req.user);
        const now = new Date();
        const previous = String(job.allocateStatus);
        const updated = await jobModel.findByIdAndUpdate(id, {
            $set: { allocateStatus: allocateStatus.Lost, status: jobStatus.Cancelled, lostReason: reason, lostAt: now, lostBy: actor?._id, updatedDate: now },
        }, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: 'Job not found' });

        // Up the chain: quotation, then the enquiry it came from.
        const quote = await quotationModel.findById(job.quoteId);
        let enquiryLabel = '';
        if (quote) {
            await quotationModel.updateOne({ _id: quote._id }, {
                $set: {
                    status: quoteStatus.Lost, lostReason: reason, lostAt: now, lostBy: actor?._id,
                    customerDecision: { decision: 'rejected', decidedAt: now, decidedBy: actor?._id, reason },
                },
                $push: { editHistory: { editedBy: actor?._id, editedAt: now, action: 'StatusChanged', fromStatus: quote.status, toStatus: quoteStatus.Lost, reason: `Job ${job.jobId} marked lost — ${reason}` } },
            });
            await releaseQuoteStockHolds(quote._id, `Job ${job.jobId} marked lost`, actor?._id);
            if (quote.enqId) {
                const enquiry = await enquiryModel.findByIdAndUpdate(quote.enqId, { $set: { status: 'lost', lostReason: reason } }, { new: true });
                if (enquiry) {
                    enquiryLabel = String(enquiry.enquiryId);
                    await cancelOpenFollowUp(enquiry._id, 'Job lost');
                    await logEnquiryAudit(req, enquiry._id, 'status-changed', `Marked lost — job ${job.jobId} was lost`, [{ label: 'Status', from: String(enquiry.status), to: 'lost' }, { label: 'Lost reason', to: reason }]);
                }
            }
        }

        // The job's stock goes back: its reservation is released, and a delivery note posted but not yet
        // completed (Ready for Dispatch) returns what it took out.
        await releaseStock({ job: job._id }, `Job ${job.jobId} marked lost`, actor?._id);
        const postedDns = await DeliveryNote.find({ jobId: job._id, status: 'Ready for Dispatch' }).select('_id dnNo').lean();
        for (const dn of postedDns) {
            await reverseByReference('DeliveryNote', dn._id, actor?._id, `Job ${job.jobId} marked lost`);
        }

        // Down the chain: only documents that are still open.
        // A cancelled PR's RFQs stop too, so suppliers aren't chased for a purchase that won't happen.
        const openPrIds = (await PurchaseRequest.find({ jobId: job._id, status: { $in: [PurchaseRequestStatus.New, PurchaseRequestStatus.InProgress, PurchaseRequestStatus.Pending, PurchaseRequestStatus.Approved] } }).select('_id').lean()).map((p) => p._id);
        const rfqs = openPrIds.length
            ? await Rfq.updateMany(
                { purchaseRequestId: { $in: openPrIds }, status: { $in: [RfqStatus.Draft, RfqStatus.Open, RfqStatus.Quoted] }, isDeleted: { $ne: true } },
                { $set: { status: RfqStatus.Cancelled, stage: RfqStage.Cancelled, cancelReason: `Job ${job.jobId} marked lost` } })
            : { modifiedCount: 0 };
        const [prs, pos, dns, invoices] = await Promise.all([
            PurchaseRequest.updateMany({ jobId: job._id, status: { $in: [PurchaseRequestStatus.New, PurchaseRequestStatus.InProgress, PurchaseRequestStatus.Pending, PurchaseRequestStatus.Approved] } }, { $set: { status: PurchaseRequestStatus.OnHoldCancelled } }),
            PurchaseOrder.updateMany({ jobId: job._id, poStatus: { $in: ['Draft', 'Pending for Approval', 'Approved'] } }, { $set: { poStatus: 'Rejected' } }),
            DeliveryNote.updateMany({ jobId: job._id, status: { $in: ['Draft', 'Ready for Dispatch'] } }, { $set: { status: 'Cancelled' } }),
            Invoice.updateMany({ jobId: job._id, status: { $in: ['Pending to submit', 'PI Submitted', 'Partial invoicing', 'Hold'] } }, { $set: { status: 'Cancelled' } }),
        ]);
        const cascade = [
            { label: 'Purchase requests cancelled', count: prs.modifiedCount },
            { label: 'RFQs cancelled', count: rfqs.modifiedCount },
            { label: 'Purchase orders rejected', count: pos.modifiedCount },
            { label: 'Delivery notes cancelled', count: dns.modifiedCount },
            { label: 'Invoices cancelled', count: invoices.modifiedCount },
        ].filter((c) => c.count > 0).map((c) => ({ label: c.label, to: String(c.count) }));

        await logAudit(req, {
            entityType: 'job', entityId: updated._id, entityLabel: updated.jobId, action: 'lost', summary: 'Job marked lost',
            changes: [{ label: 'Allocation status', from: previous, to: allocateStatus.Lost }, { label: 'Lost reason', to: reason }, ...cascade],
        });
        res.status(200).json({ success: true, message: `Job marked lost${enquiryLabel ? ` — enquiry ${enquiryLabel} updated` : ''}`, data: updated });
    } catch (error) {
        next(error);
    }
};

export const transferProcurementPerson = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId, procurementPersonId } = req.body;

        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
            });
        }

        const privileges = employee.category?.privileges;
        if (!privileges?.jobSheet?.transferProcurementPerson) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to transfer procurement person",
            });
        }

        // Validate required fields
        if (!jobId || !procurementPersonId) {
            return res.status(400).json({
                success: false,
                message: 'Job ID and procurement person ID are required'
            });
        }

        const existingJob = await jobModel.findById(jobId);
        if (!existingJob) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (!ObjectId.isValid(String(procurementPersonId))) {
            return res.status(400).json({ success: false, message: 'Invalid employee id' });
        }
        if (existingJob.isDeleted) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        // Saving the first PR moves the job to Work In Progress; the PR status below decides if reassignment is still allowed.
        if (existingJob.allocateStatus !== allocateStatus.OpenToWork && existingJob.allocateStatus !== allocateStatus.WorkInProgress) {
            return res.status(409).json({ success: false, message: 'Procurement can only be transferred while the job is Open To Work or Work In Progress' });
        }
        if (existingJob.procurementPerson?.toString() === String(procurementPersonId)) {
            return res.status(400).json({ success: false, message: 'That employee is already the procurement person for this job' });
        }
        const newPerson = await findPurchaseBuyer(String(procurementPersonId));
        if (!newPerson) {
            return res.status(400).json({ success: false, message: 'Selected employee cannot be assigned purchase work' });
        }

        // Reassignment is allowed only while the job's PRs are New or In Progress, before anything goes for approval.
        const lockedPurchaseRequest = await PurchaseRequest.findOne({
            jobId: existingJob._id,
            isDeleted: false,
            status: { $nin: [PurchaseRequestStatus.New, PurchaseRequestStatus.InProgress] }
        });
        if (lockedPurchaseRequest) {
            return res.status(400).json({
                success: false,
                message: `Cannot reassign procurement person: purchase request ${lockedPurchaseRequest.purchaseNo} is already ${lockedPurchaseRequest.status}`
            });
        }

        const updateJob = await jobModel.findByIdAndUpdate(
            { _id: jobId },
            {
                procurementPerson: procurementPersonId,
                allocatedBy: employee._id, allocatedAt: new Date(),
                updatedDate: new Date()
            },
            {
                new: true,
            }
        );

        if (!updateJob) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Open PRs follow the job to the new assignee.
        await PurchaseRequest.updateMany(
            { jobId: existingJob._id, isDeleted: false, status: { $in: [PurchaseRequestStatus.New, PurchaseRequestStatus.InProgress] } },
            { $set: { procurementPerson: procurementPersonId, allocatedBy: employee._id, allocatedAt: new Date() } }
        );

        const newProcurementId = procurementPersonId.toString();
        const previousProcurementId = existingJob.procurementPerson?.toString();
        await logAudit(req, { entityType: 'job', entityId: updateJob._id, entityLabel: updateJob.jobId, action: 'procurement-transferred', summary: 'Procurement person transferred', changes: [{ label: 'Procurement person', from: await employeeLabel(previousProcurementId), to: await employeeLabel(newProcurementId) }] });
        if (newProcurementId !== previousProcurementId) {
            const socket = req.app.get('io') as Server;
            void createNotificationWithPrivileges(
                {
                    type: 'ProcurementTransferred',
                    referenceModel: 'Job',
                    title: 'Purchase / procurement transferred to you',
                    message: `Job ${updateJob.jobId}: procurement and related purchase work has been transferred to you.`,
                    sentBy: employee._id?.toString(),
                    referenceId: updateJob._id,
                    additionalData: { jobId: updateJob._id.toString() },
                },
                {
                    privilegeKey: 'purchase',
                    checkFunction: (privileges, employeeId) => {
                        return (
                            employeeId === newProcurementId &&
                            privileges.purchase?.viewReport !== 'none'
                        );
                    },
                },
                socket
            ).catch((err) => console.error("Procurement transfer notification failed:", err));
        }

        res.status(200).json({
            success: true,
            message: 'Procurement person transferred successfully',
            data: updateJob
        });

    } catch (error) {
        next(error);
    }
};


export const getDropdownListForTechnical = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const availableJobs = await jobModel.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    allocateType: { $ne: allocateType.SupplyOnly }
                }
            },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'quoteId',
                    foreignField: '_id',
                    as: 'quotation'
                }
            },
            {
                $unwind: "$quotation"
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'quotation.createdBy',
                    foreignField: '_id',
                    as: 'salesPerson'
                }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $lookup: {
                    from: 'technicals',
                    localField: '_id',
                    foreignField: 'jobId',
                    as: 'technicalEntry'
                }
            },
            {
                $match: {
                    technicalEntry: { $size: 0 }
                }
            },
            {
                $project: {
                    _id: 1,
                    jobId: 1,
                    salesPersonName: {
                        $concat: ["$salesPerson.firstName", " ", "$salesPerson.lastName"]
                    }
                }
            },
            {
                $sort: { jobId: 1 }
            }
        ]);

        if (availableJobs.length > 0) {
            return res.status(200).json({
                success: true,
                data: availableJobs
            });
        } else {
            return res.status(204).json({
                success: true,
                message: 'No available jobs found for technical project creation',
                data: []
            });
        }
    } catch (error) {
        console.log(error);
        next(error);
    }
}

const OPEN_TO_WORK_GRID_FIELDS: GridFieldMap = {
    jobId: { path: 'jobId' },
    customer: { path: 'clientDetails.companyName' },
    description: { path: 'quotation.subject' },
    salesPerson: { path: 'salesPersonName' },
    department: { path: 'departmentName' },
    quotation: { path: 'quotation.quoteId' },
    dealSheet: { path: 'quotation.dealData.dealId' },
    allocateType: { path: 'allocateType' },
};

export const getUnassignedProjectAndAMCJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId, companyName, subject, salesPersonDetails, departmentDetails, quoteId, dealId, search, filters, sortKey, sortDir, page = 1, row = 10 } = req.body;
        const allocateTypeFilter = req.body.allocateType
        const searchRegex = { $regex: String(search ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
            });
        }

        const privileges = employee.category?.privileges;
        if (!privileges?.technical?.canViewOpenToWorkAndAssign) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view open to work jobs",
            });
        }
        
        let matchFilters: any = {
            isDeleted: { $ne: true }
        };

        if (jobId) {
            matchFilters.jobId = { $regex: jobId, $options: 'i' };
        }

        if (allocateTypeFilter) {
            matchFilters.allocateType = allocateTypeFilter;
        }

        const technicalJobIds = await technicalModel.distinct('jobId');
        const pipeline: any[] = [
            {
                $match: {
                    isDeleted: { $ne: true },
                    allocateType: { $in: [allocateType.ProjectWithSupply, allocateType.AMC] },
                    _id: { $nin: technicalJobIds }
                }
            },
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            
            {
                $unwind: '$quotation'
            },
            {
                $lookup: { from: 'customers', localField: 'quotation.client', foreignField: '_id', as: 'clientDetails' }
            },
            {
                $unwind: '$clientDetails'
            },
            {
                $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'departmentDetails' }
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPersonDetails' }
            },
            {
                $addFields: {
                    attention: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$clientDetails.contactDetails',
                                    as: 'contact',
                                    cond: { $eq: ['$$contact._id', '$quotation.attention'] }
                                }
                            },
                            0
                        ]
                    }
                }
            },
            {
                $addFields: {
                    salesPersonName: {
                        $trim: { input: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$salesPersonDetails.firstName', 0] }, ''] }, ' ', { $ifNull: [{ $arrayElemAt: ['$salesPersonDetails.lastName', 0] }, ''] }] } }
                    },
                    departmentName: { $arrayElemAt: ['$departmentDetails.departmentName', 0] }
                }
            },
            {
                $match: {
                    ...matchFilters,
                    ...(companyName && { 'clientDetails.companyName': { $regex: companyName, $options: 'i' } }),
                    ...(subject && { 'quotation.subject': { $regex: subject, $options: 'i' } }),
                    ...(salesPersonDetails && { 'salesPersonDetails._id': new ObjectId(salesPersonDetails) }),
                    ...(departmentDetails && { 'departmentDetails._id': new ObjectId(departmentDetails) }),
                    ...(quoteId && { 'quotation.quoteId': { $regex: quoteId, $options: 'i' } }),
                    ...(dealId && { 'quotation.dealData.dealId': { $regex: dealId, $options: 'i' } }),
                    ...(typeof search === 'string' && search.trim() && {
                        $or: [
                            { jobId: searchRegex },
                            { 'clientDetails.companyName': searchRegex },
                            { 'quotation.subject': searchRegex },
                            { 'quotation.quoteId': searchRegex }
                        ]
                    })
                }
            }
        ];

        const gridMatch = buildGridFilterMatch(filters, OPEN_TO_WORK_GRID_FIELDS);
        if (gridMatch) pipeline.push({ $match: gridMatch });

        const countPipeline = [...pipeline];
        countPipeline.push({ $count: "total" });

        pipeline.push({ $sort: buildGridSort(sortKey, sortDir, OPEN_TO_WORK_GRID_FIELDS, { updatedDate: -1 }) });

        const totalResult = await jobModel.aggregate(countPipeline);
        const total = totalResult.length > 0 ? totalResult[0].total : 0;

        pipeline.push({
            $skip: (page - 1) * row
        });
        pipeline.push({
            $limit: row
        });

        const jobs = await jobModel.aggregate(pipeline);

        if (jobs.length > 0) {
            return res.status(200).json({ success: true, data: jobs, total: total, message: 'Jobs fetched successfully' });
        } else {
            return res.status(200).json({ success: true, message: 'No available jobs found', data: [], total: 0 });
        }
    } catch (error) {
        next(error);
    }
}

export const checkAndUpdateJobCompletionStatus = async (jobId: string) => {
    try {
        if (!jobId || !ObjectId.isValid(jobId)) {
            return;
        }

        const job = await jobModel.findById(jobId);
        if (!job || job.isDeleted) {
            return;
        }

        const purchaseRequests = await PurchaseRequest.find({
            jobId: new ObjectId(jobId),
            isDeleted: { $ne: true }
        });

        if (purchaseRequests.length === 0) {
            return;
        }

        const purchaseRequestIds = purchaseRequests.map(pr => pr._id);
        const purchaseOrders = await PurchaseOrder.find({
            purchaseId: { $in: purchaseRequestIds }
        });

        if (purchaseOrders.length === 0) {
            return;
        }

        let allConditionsMet = true;

        for (const po of purchaseOrders) {
            if (po.poStatus !== 'Closed') {
                allConditionsMet = false;
                break;
            }

            if (!po.supplierInvoices || !Array.isArray(po.supplierInvoices) || po.supplierInvoices.length === 0) {
                allConditionsMet = false;
                break;
            }
        }

        if (!allConditionsMet) {
            return;
        }

        const deliveryNotes = await DeliveryNote.find({
            jobId: new ObjectId(jobId)
        });

        if (deliveryNotes.length === 0) {
            return;
        }

        if (job.allocateStatus === allocateStatus.Completed || job.allocateStatus === allocateStatus.Lost) {
            return;
        }

        await jobModel.findByIdAndUpdate(jobId, {
            $set: {
                allocateStatus: allocateStatus.Completed,
                updatedDate: new Date()
            }
        });
        // Anything still reserved for a finished job is free again.
        await releaseStock({ job: job._id }, `Job ${job.jobId} completed`);
        await logAudit(undefined, { entityType: 'job', entityId: job._id, entityLabel: job.jobId, action: 'completed', summary: 'Job completed automatically — all purchase orders closed, invoiced and delivered', changes: [{ label: 'Allocation status', from: String(job.allocateStatus), to: allocateStatus.Completed }] });
    } catch (error) {
        console.error('Error checking job completion status:', error);
    }
};

export const getJobHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId } = req.params;

        if (!jobId || !ObjectId.isValid(jobId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid job ID",
                status: 400
            });
        }

        const job = await jobModel.findById(jobId);
        if (!job || job.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
                status: 404
            });
        }

        const timeline: any[] = [];
        let latestPRTimestamp: Date | null = null;
        let latestPOTimestamp: Date | null = null;
        const currentStatus: any = {
            purchaseRequest: null,
            purchaseOrder: null,
            technical: null,
            deliveryNote: 0
        };
        const summary: any = {
            totalPRs: 0,
            approvedPRs: 0,
            rejectedPRs: 0,
            totalPOs: 0,
            approvedPOs: 0,
            closedPOs: 0,
            totalGRNs: 0,
            totalDNs: 0,
            hasTechnical: false
        };

        // Technical and delivery notes don't depend on the PR chain, so they load alongside it
        // instead of after it (the history used to run ~15 sequential round trips to Atlas).
        const technicalPromise = technicalModel.findOne({
            jobId: new ObjectId(jobId)
        })
        .populate('assignedBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName')
        .populate('materialRequest.statusHistory.changedBy', 'firstName lastName')
        .populate('materialRequestAttachements.statusHistory.changedBy', 'firstName lastName')
        .populate('issues.closedBy', 'firstName lastName');
        const deliveryNotesPromise = DeliveryNote.find({
            jobId: new ObjectId(jobId)
        })
        .populate('createdBy', 'firstName lastName')
        .sort({ createdDate: 1 });

        const purchaseRequests = await PurchaseRequest.find({
            jobId: new ObjectId(jobId),
            isDeleted: { $ne: true }
        })
        .populate('createdBy', 'firstName lastName')
        .populate('approvalStatus.updatedBy', 'firstName lastName')
        .populate('approvalStatus.role', 'categoryName')
        .populate('rejectedReason.rejectedBy', 'firstName lastName')
        .populate('revokedHistory.revokedBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName')
        .sort({ createdAt: 1 });

        summary.totalPRs = purchaseRequests.length;

        // One query for every PR's orders and one for every order's GRNs, grouped in memory.
        const allPurchaseOrders = purchaseRequests.length ? await PurchaseOrder.find({
            purchaseId: { $in: purchaseRequests.map((p) => p._id) }
        })
        .populate('createdBy', 'firstName lastName')
        .populate('approvedHistory.approvedBy', 'firstName lastName')
        .populate('rejectedHistory.rejectedBy', 'firstName lastName')
        .populate('supplierId', 'supplierName')
        .sort({ createdAt: 1 }) : [];
        const allGrns = allPurchaseOrders.length ? await GRN.find({
            purchaseOrderId: { $in: allPurchaseOrders.map((p) => p._id) },
            isDeleted: { $ne: true }
        })
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: 1 }) : [];
        const posByPr = new Map<string, any[]>();
        for (const po of allPurchaseOrders) {
            const key = String(po.purchaseId);
            if (!posByPr.has(key)) posByPr.set(key, []);
            posByPr.get(key)!.push(po);
        }
        const grnsByPo = new Map<string, any[]>();
        for (const grn of allGrns) {
            const key = String(grn.purchaseOrderId);
            if (!grnsByPo.has(key)) grnsByPo.set(key, []);
            grnsByPo.get(key)!.push(grn);
        }

        for (const pr of purchaseRequests) {
            if (pr.status === 'Approved') summary.approvedPRs++;
            if (pr.status === 'Rejected') summary.rejectedPRs++;

            const prTimestamp = new Date(pr.updatedAt || pr.createdAt);
            if (!latestPRTimestamp || prTimestamp > latestPRTimestamp) {
                latestPRTimestamp = prTimestamp;
                currentStatus.purchaseRequest = pr.status;
            }

            timeline.push({
                id: `pr-created-${pr._id}`,
                timestamp: pr.createdAt,
                pipeline: 'purchaseRequest',
                eventType: 'created',
                title: `Purchase Request ${pr.purchaseNo} Created`,
                description: `Purchase Request ${pr.purchaseNo} was created`,
                performedBy: pr.createdBy ? {
                    _id: (pr.createdBy as any)._id,
                    firstName: (pr.createdBy as any).firstName,
                    lastName: (pr.createdBy as any).lastName
                } : null,
                metadata: {
                    prNo: pr.purchaseNo,
                    status: pr.status
                },
                status: 'info'
            });

            if (pr.status !== 'New' && pr.approvalStatus && pr.approvalStatus.length > 0) {
                timeline.push({
                    id: `pr-sent-approval-${pr._id}`,
                    timestamp: pr.createdAt,
                    pipeline: 'purchaseRequest',
                    eventType: 'sent_for_approval',
                    title: `Purchase Request ${pr.purchaseNo} Sent for Approval`,
                    description: `Purchase Request ${pr.purchaseNo} was sent for approval`,
                    performedBy: pr.createdBy ? {
                        _id: (pr.createdBy as any)._id,
                        firstName: (pr.createdBy as any).firstName,
                        lastName: (pr.createdBy as any).lastName
                    } : null,
                    metadata: {
                        prNo: pr.purchaseNo
                    },
                    status: 'warning'
                });
            }

            if (pr.approvalStatus && pr.approvalStatus.length > 0) {
                for (const approval of pr.approvalStatus) {
                    if (approval.status === 'approved' && approval.updatedDate) {
                        timeline.push({
                            id: `pr-approved-${pr._id}-${approval.step}`,
                            timestamp: approval.updatedDate,
                            pipeline: 'purchaseRequest',
                            eventType: 'approved',
                            title: `Purchase Request ${pr.purchaseNo} Approved at Step ${approval.step}`,
                            description: `Purchase Request ${pr.purchaseNo} was approved${approval.role ? ` by ${(approval.role as any).categoryName}` : ''}`,
                            performedBy: approval.updatedBy ? {
                                _id: (approval.updatedBy as any)._id,
                                firstName: (approval.updatedBy as any).firstName,
                                lastName: (approval.updatedBy as any).lastName
                            } : null,
                            metadata: {
                                prNo: pr.purchaseNo,
                                step: approval.step,
                                role: approval.role ? (approval.role as any).categoryName : null,
                                comment: approval.comment
                            },
                            status: 'success'
                        });
                    } else if (approval.status === 'rejected' && approval.updatedDate) {
                        timeline.push({
                            id: `pr-rejected-${pr._id}-${approval.step}`,
                            timestamp: approval.updatedDate,
                            pipeline: 'purchaseRequest',
                            eventType: 'rejected',
                            title: `Purchase Request ${pr.purchaseNo} Rejected at Step ${approval.step}`,
                            description: `Purchase Request ${pr.purchaseNo} was rejected${approval.role ? ` by ${(approval.role as any).categoryName}` : ''}`,
                            performedBy: approval.updatedBy ? {
                                _id: (approval.updatedBy as any)._id,
                                firstName: (approval.updatedBy as any).firstName,
                                lastName: (approval.updatedBy as any).lastName
                            } : null,
                            metadata: {
                                prNo: pr.purchaseNo,
                                step: approval.step,
                                role: approval.role ? (approval.role as any).categoryName : null,
                                comment: approval.comment
                            },
                            status: 'error'
                        });
                    }
                }
            }

            if (pr.rejectedReason && pr.rejectedReason.length > 0) {
                for (const rejection of pr.rejectedReason) {
                    timeline.push({
                        id: `pr-rejected-reason-${pr._id}-${rejection.rejectedAt}`,
                        timestamp: rejection.rejectedAt,
                        pipeline: 'purchaseRequest',
                        eventType: 'rejected',
                        title: `Purchase Request ${pr.purchaseNo} Rejected`,
                        description: `Purchase Request ${pr.purchaseNo} was rejected`,
                        performedBy: rejection.rejectedBy ? {
                            _id: (rejection.rejectedBy as any)._id,
                            firstName: (rejection.rejectedBy as any).firstName,
                            lastName: (rejection.rejectedBy as any).lastName
                        } : null,
                        metadata: {
                            prNo: pr.purchaseNo,
                            comment: rejection.comment
                        },
                        status: 'error'
                    });
                }
            }

            if (pr.status === 'Rejected' && pr.updatedAt && pr.updatedAt > pr.createdAt) {
                const hasResubmission = pr.approvalStatus && pr.approvalStatus.some((a: any, idx: number) => 
                    idx > 0 && a.status === 'pending' && pr.approvalStatus[idx - 1].status === 'rejected'
                );
                if (hasResubmission) {
                    timeline.push({
                        id: `pr-resubmitted-${pr._id}`,
                        timestamp: pr.updatedAt,
                        pipeline: 'purchaseRequest',
                        eventType: 'resubmitted',
                        title: `Purchase Request ${pr.purchaseNo} Resubmitted`,
                        description: `Purchase Request ${pr.purchaseNo} was resubmitted for approval`,
                        performedBy: pr.updatedBy ? {
                            _id: (pr.updatedBy as any)._id,
                            firstName: (pr.updatedBy as any).firstName,
                            lastName: (pr.updatedBy as any).lastName
                        } : null,
                        metadata: {
                            prNo: pr.purchaseNo
                        },
                        status: 'warning'
                    });
                }
            }

            if (pr.revokedHistory && pr.revokedHistory.length > 0) {
                for (const revoked of pr.revokedHistory) {
                    timeline.push({
                        id: `pr-revoked-${pr._id}-${revoked.date}`,
                        timestamp: revoked.date,
                        pipeline: 'purchaseRequest',
                        eventType: 'revoked',
                        title: `Purchase Request ${pr.purchaseNo} Revoked`,
                        description: `Purchase Request ${pr.purchaseNo} was revoked`,
                        performedBy: revoked.revokedBy ? {
                            _id: (revoked.revokedBy as any)._id,
                            firstName: (revoked.revokedBy as any).firstName,
                            lastName: (revoked.revokedBy as any).lastName
                        } : null,
                        metadata: {
                            prNo: pr.purchaseNo,
                            reason: revoked.reason
                        },
                        status: 'error'
                    });
                }
            }

            const purchaseOrders = posByPr.get(String(pr._id)) ?? [];

            summary.totalPOs += purchaseOrders.length;

            for (const po of purchaseOrders) {
                if (po.poStatus === 'Approved' || po.poStatus === 'Placed') summary.approvedPOs++;
                if (po.poStatus === 'Closed') summary.closedPOs++;

                const poTimestamp = new Date(po.updatedAt || po.createdAt);
                if (!latestPOTimestamp || poTimestamp > latestPOTimestamp) {
                    latestPOTimestamp = poTimestamp;
                    currentStatus.purchaseOrder = po.poStatus;
                }

                timeline.push({
                    id: `po-created-${po._id}`,
                    timestamp: po.createdAt,
                    pipeline: 'purchaseOrder',
                    eventType: po.poStatus === 'Draft' ? 'drafted' : 'created',
                    title: `Purchase Order ${po.poNo} ${po.poStatus === 'Draft' ? 'Drafted' : 'Created'}`,
                    description: `Purchase Order ${po.poNo} was ${po.poStatus === 'Draft' ? 'drafted' : 'created'}${po.supplierId ? ` for ${(po.supplierId as any).supplierName}` : ''}`,
                    performedBy: po.createdBy ? {
                        _id: (po.createdBy as any)._id,
                        firstName: (po.createdBy as any).firstName,
                        lastName: (po.createdBy as any).lastName
                    } : null,
                    metadata: {
                        poNo: po.poNo,
                        status: po.poStatus,
                        supplierName: po.supplierId ? (po.supplierId as any).supplierName : null
                    },
                    status: 'info'
                });

                if (po.poStatus === 'Pending for Approval') {
                    timeline.push({
                        id: `po-sent-approval-${po._id}`,
                        timestamp: po.createdAt,
                        pipeline: 'purchaseOrder',
                        eventType: 'sent_for_approval',
                        title: `Purchase Order ${po.poNo} Sent for Approval`,
                        description: `Purchase Order ${po.poNo} was sent for approval`,
                        performedBy: po.createdBy ? {
                            _id: (po.createdBy as any)._id,
                            firstName: (po.createdBy as any).firstName,
                            lastName: (po.createdBy as any).lastName
                        } : null,
                        metadata: {
                            poNo: po.poNo
                        },
                        status: 'warning'
                    });
                }

                if (po.approvedHistory && po.approvedHistory.length > 0) {
                    for (const approval of po.approvedHistory) {
                        timeline.push({
                            id: `po-approved-${po._id}-${approval.date}`,
                            timestamp: approval.date,
                            pipeline: 'purchaseOrder',
                            eventType: 'approved',
                            title: `Purchase Order ${po.poNo} Approved`,
                            description: `Purchase Order ${po.poNo} was approved`,
                            performedBy: approval.approvedBy ? {
                                _id: (approval.approvedBy as any)._id,
                                firstName: (approval.approvedBy as any).firstName,
                                lastName: (approval.approvedBy as any).lastName
                            } : null,
                            metadata: {
                                poNo: po.poNo,
                                reason: approval.reason
                            },
                            status: 'success'
                        });
                    }
                }

                if (po.rejectedHistory && po.rejectedHistory.length > 0) {
                    for (const rejection of po.rejectedHistory) {
                        timeline.push({
                            id: `po-rejected-${po._id}-${rejection.date}`,
                            timestamp: rejection.date,
                            pipeline: 'purchaseOrder',
                            eventType: 'rejected',
                            title: `Purchase Order ${po.poNo} Rejected`,
                            description: `Purchase Order ${po.poNo} was rejected`,
                            performedBy: rejection.rejectedBy ? {
                                _id: (rejection.rejectedBy as any)._id,
                                firstName: (rejection.rejectedBy as any).firstName,
                                lastName: (rejection.rejectedBy as any).lastName
                            } : null,
                            metadata: {
                                poNo: po.poNo,
                                reason: rejection.reason
                            },
                            status: 'error'
                        });
                    }
                }

                if (po.poStatus === 'Closed') {
                    timeline.push({
                        id: `po-closed-${po._id}`,
                        timestamp: po.updatedAt || po.createdAt,
                        pipeline: 'purchaseOrder',
                        eventType: 'closed',
                        title: `Purchase Order ${po.poNo} Closed`,
                        description: `Purchase Order ${po.poNo} was closed (all items received)`,
                        performedBy: null,
                        metadata: {
                            poNo: po.poNo
                        },
                        status: 'success'
                    });
                }

                const grns = grnsByPo.get(String(po._id)) ?? [];

                summary.totalGRNs += grns.length;

                for (const grn of grns) {
                    timeline.push({
                        id: `grn-created-${grn._id}`,
                        timestamp: grn.createdAt,
                        pipeline: 'grn',
                        eventType: 'created',
                        title: `GRN ${grn.grnNo} Created for PO ${po.poNo}`,
                        description: `GRN ${grn.grnNo} was created for Purchase Order ${po.poNo}`,
                        performedBy: grn.createdBy ? {
                            _id: (grn.createdBy as any)._id,
                            firstName: (grn.createdBy as any).firstName,
                            lastName: (grn.createdBy as any).lastName
                        } : null,
                        metadata: {
                            grnNo: grn.grnNo,
                            poNo: po.poNo,
                            itemsCount: grn.items ? grn.items.length : 0
                        },
                        status: 'success'
                    });
                }
            }
        }

        const technical = await technicalPromise;

        if (technical) {
            summary.hasTechnical = true;
            currentStatus.technical = technical.status;

            timeline.push({
                id: `technical-assigned-${technical._id}`,
                timestamp: technical.assignedAt,
                pipeline: 'technical',
                eventType: 'assigned',
                title: `Technical ${technical.projectType === 'project' ? 'Project' : 'AMC'} Assigned`,
                description: `Technical ${technical.projectType === 'project' ? 'Project' : 'AMC'} was assigned`,
                performedBy: technical.assignedBy ? {
                    _id: (technical.assignedBy as any)._id,
                    firstName: (technical.assignedBy as any).firstName,
                    lastName: (technical.assignedBy as any).lastName
                } : null,
                metadata: {
                    projectType: technical.projectType,
                    assignedTo: technical.assignedTo ? {
                        _id: (technical.assignedTo as any)._id,
                        firstName: (technical.assignedTo as any).firstName,
                        lastName: (technical.assignedTo as any).lastName
                    } : null
                },
                status: 'info'
            });

            if (technical.materialRequest && technical.materialRequest.length > 0) {
                for (const mr of technical.materialRequest) {
                    if (mr.statusHistory && mr.statusHistory.length > 0) {
                        for (const history of mr.statusHistory) {
                            timeline.push({
                                id: `mr-${history.status}-${technical._id}-${mr.itemName}`,
                                timestamp: history.changedDate,
                                pipeline: 'technical',
                                eventType: history.status === 'approved' ? 'approved' : 'rejected',
                                title: `Material Request "${mr.itemName}" ${history.status === 'approved' ? 'Approved' : 'Rejected'}`,
                                description: `Material Request "${mr.itemName}" was ${history.status}`,
                                performedBy: history.changedBy ? {
                                    _id: (history.changedBy as any)._id,
                                    firstName: (history.changedBy as any).firstName,
                                    lastName: (history.changedBy as any).lastName
                                } : null,
                                metadata: {
                                    itemName: mr.itemName,
                                    comment: history.comment
                                },
                                status: history.status === 'approved' ? 'success' : 'error'
                            });
                        }
                    }
                }
            }

            if (technical.tasks && technical.tasks.length > 0) {
                for (const task of technical.tasks) {
                    if (task.status && task.status !== 'Pending') {
                        timeline.push({
                            id: `task-${task.status}-${technical._id}-${task.taskName}`,
                            timestamp: (task as any).updatedAt || (task as any).createdAt || technical.assignedAt,
                            pipeline: 'technical',
                            eventType: task.status.toLowerCase().replace(' ', '_'),
                            title: `Task "${task.taskName}" ${task.status}`,
                            description: `Task "${task.taskName}" status changed to ${task.status}`,
                            performedBy: null,
                            metadata: {
                                taskName: task.taskName,
                                status: task.status
                            },
                            status: task.status === 'Completed' ? 'success' : task.status === 'Cancelled' ? 'error' : 'warning'
                        });
                    }
                }
            }

            if (technical.issues && technical.issues.length > 0) {
                for (const issue of technical.issues) {
                    if (issue.closedOn) {
                        timeline.push({
                            id: `issue-closed-${technical._id}-${issue.subject}`,
                            timestamp: issue.closedOn,
                            pipeline: 'technical',
                            eventType: 'closed',
                            title: `Issue "${issue.subject}" Closed`,
                            description: `Issue "${issue.subject}" was closed`,
                            performedBy: issue.closedBy ? {
                                _id: (issue.closedBy as any)._id,
                                firstName: (issue.closedBy as any).firstName,
                                lastName: (issue.closedBy as any).lastName
                            } : null,
                            metadata: {
                                subject: issue.subject,
                                comments: issue.comments
                            },
                            status: 'success'
                        });
                    }
                }
            }
        }

        const deliveryNotes = await deliveryNotesPromise;

        summary.totalDNs = deliveryNotes.length;
        currentStatus.deliveryNote = deliveryNotes.length;

        for (const dn of deliveryNotes) {
            timeline.push({
                id: `dn-created-${dn._id}`,
                timestamp: dn.createdDate,
                pipeline: 'deliveryNote',
                eventType: 'created',
                title: `Delivery Note ${dn.dnNo} Created`,
                description: `Delivery Note ${dn.dnNo} was created`,
                performedBy: dn.createdBy ? {
                    _id: (dn.createdBy as any)._id,
                    firstName: (dn.createdBy as any).firstName,
                    lastName: (dn.createdBy as any).lastName
                } : null,
                metadata: {
                    dnNo: dn.dnNo,
                    itemsCount: dn.items ? dn.items.length : 0
                },
                status: 'success'
            });
        }

        timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return res.status(200).json({
            success: true,
            data: {
                jobId: jobId,
                currentStatus: {
                    purchaseRequest: currentStatus.purchaseRequest,
                    purchaseOrder: currentStatus.purchaseOrder,
                    technical: currentStatus.technical,
                    deliveryNote: currentStatus.deliveryNote
                },
                timeline: timeline,
                summary: summary
            }
        });
    } catch (error) {
        console.error('Error fetching job history:', error);
        next(error);
    }
};
