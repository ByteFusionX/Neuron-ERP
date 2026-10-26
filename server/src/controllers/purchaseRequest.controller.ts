import { NextFunction, Request, Response } from "express";
import { PurchaseRequestStatus } from "../models/purchaseRequest.model";
import PurchaseRequest from '../models/purchaseRequest.model'
import jobModel, { allocateStatus } from "../models/job.model";
import supplierModel from "../models/supplier.model";
import Quotation from "../models/quotation.model";
import { getEmployeeData, calculateDiscountPricePipe, calculateCostPricePipe, getUSDRated, buildPrivilegeAccessFilter, escapeRegex } from "../common/utils/util";
import { getWorkflowSteps, updateApprovalStatus, rebuildPendingRoute } from "../services/workflow.service";
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";
import { getNextSequence } from "../models/counter.model";
import technicalModel from "../models/technical.model";
import Employee from "../models/employee.model";
import { recordPrices, findPrices } from "../services/supplierPrice.service";
import { SupplierPriceSource } from "../models/supplierPrice.model";
import { applyLineAward, LineAward } from "../services/purchaseAward.service";
import { logAudit } from "../services/audit.service";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

/** Records a PR event; a general (manual) PR is kept under its own entity type so the audit page can tell them apart. */
const logPrAudit = (req: Request, pr: any, action: string, summary: string, changes?: { label: string; from?: string; to?: string }[]) =>
    logAudit(req, {
        entityType: pr.sourceType === 'manual' ? 'generalPurchaseRequest' : 'purchaseRequest',
        entityId: pr._id, entityLabel: pr.purchaseNo, action, summary, changes,
    });

const prLines = (items: any[]) => (items || []).flatMap((item: any) => item.itemDetails || []);

/**
 * Lines that cannot go for approval: not fully allocated to chosen suppliers, or a chosen supplier without a price.
 * A line marked short (with a reason) goes as it is; a line nobody chose goes with its default supplier at its own cost.
 */
const unallocatedLines = (lines: any[]) => lines.filter((detail: any) => {
    if (detail.short && String(detail.shortReason || '').trim()) return false;
    const won = (detail.comparisons || []).filter((c: any) => c.selected);
    if (!won.length) return !detail.supplierId || !(Number(detail.unitCost) > 0);
    if (won.some((c: any) => !c.supplierId || !(Number(c.unitPrice) > 0))) return true;
    if (!won.some((c: any) => c.awardedQty)) return false;
    return won.reduce((sum: number, c: any) => sum + (Number(c.awardedQty) || Number(detail.quantity) || 0), 0) + 0.0001 < Number(detail.quantity);
});

const SUBMIT_GATE_MESSAGE = (open: number) =>
    `${open} product(s) are not fully allocated. Choose suppliers for the full quantity, each with a price, or mark the product short with a reason.`;

/** Every supplier price taken for comparison on the request, kept as that supplier's last PR price for the product. */
const recordComparisonPrices = (purchase: any, employeeId: any) => recordPrices(
    prLines(purchase.items).flatMap((detail: any) => (detail.comparisons || []).map((c: any) => ({
        supplierId: c.supplierId, productId: detail.partNo, price: Number(c.unitPrice),
    }))),
    SupplierPriceSource.PR,
    { currency: purchase.currency, sourceNo: purchase.purchaseNo, sourceId: purchase._id, employeeId }
);

const normalizePartNumberValue = (value: any) => {
    if (!value) return undefined;
    const candidate = typeof value === 'object' && value !== null ? value._id || value.id || value.value : value;
    if (!candidate || !ObjectId.isValid(candidate)) return undefined;
    return new ObjectId(candidate);
};


// Columns the PR grid can sort by, mapped to the field they sort on in the list pipeline.
const PURCHASE_SORT_FIELDS: Record<string, string> = {
    date: 'sortDate',
    customerName: 'customerId.companyName',
    purchaseNo: 'purchaseNo',
    jobId: 'jobId.jobId',
    totalLpo: 'totalLpo',
    selectedPrQuantity: 'selectedPrQuantity',
    issuedPoQuantity: 'issuedPoQuantity',
    remainingPoQuantity: 'remainingPoQuantity',
    createdBy: 'createdBy.firstName',
    supplier: 'supplierId.supplierName',
    procurementPerson: 'procurementPerson.firstName',
    status: 'overallStatus',
};
const buildPurchaseSort = (sortKey: any, sortDir: any, fallbackField: string): Record<string, 1 | -1> => {
    const field = typeof sortKey === 'string' ? PURCHASE_SORT_FIELDS[sortKey] : undefined;
    if (!field) return { [fallbackField]: -1, _id: -1 };
    return { [field]: sortDir === 'asc' ? 1 : -1, _id: -1 };
};

const numericValue = (value: any): number | null => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

const purchaseApprovalContext = (purchaseRequest: any) => ({
    amount: numericValue(purchaseRequest?.totalLpo ?? purchaseRequest?.mrRequest?.totalPurchase),
    discountPercent: numericValue(purchaseRequest?.supplierDiscounts?.totalDiscount),
});

/**
 * The New tab: jobs allocated to the signed-in buyer for product distribution that have no purchase request yet.
 * No purchase exists until the buyer creates it, so these are jobs shaped like PR rows for the grid.
 */
const getNewTabJobs = async (employeeId: any, isSuperAdmin: boolean, searchText: string, pageNumber: number, pageSize: number) => {
    const withPr: any[] = await PurchaseRequest.distinct('jobId', { isDeleted: false, jobId: { $exists: true, $ne: null } });
    const jobs: any[] = await jobModel.find({
        isDeleted: { $ne: true },
        productDistribution: true,
        allocateStatus: allocateStatus.OpenToWork,
        // A super admin oversees every buyer's allocated jobs; everyone else sees only their own.
        ...(isSuperAdmin ? { procurementPerson: { $exists: true, $ne: null } } : { procurementPerson: new ObjectId(String(employeeId)) }),
        _id: { $nin: withPr },
    }).populate({ path: 'quoteId', select: 'client currency dealData.updatedItems', populate: { path: 'client', select: 'companyName' } })
        .populate('procurementPerson', 'firstName lastName')
        .populate('allocatedBy', 'firstName lastName')
        .sort({ updatedDate: -1, _id: -1 })
        .lean();

    const needle = searchText.toLowerCase();
    const rows = jobs
        .map((job) => ({
            _id: job._id,
            status: 'New',
            overallStatus: 'new',
            items: [],
            // No PR lines exist yet, so the details panel shows the deal sheet's lines the buyer will work from.
            dealItems: (job.quoteId?.dealData?.updatedItems ?? []).map((item: any) => ({
                itemName: item.itemName,
                itemDetails: (item.itemDetails ?? []).map((d: any) => ({ detail: d.detail, quantity: d.quantity, unitCost: d.unitCost })),
            })),
            jobId: job,
            customerId: job.quoteId?.client,
            currency: job.quoteId?.currency,
            procurementPerson: job.procurementPerson,
            allocatedBy: job.allocatedBy,
            allocatedAt: job.allocatedAt,
            createdAt: job.updatedDate ?? job.createdDate,
            sourceType: 'job',
        }))
        .filter((row) => !needle || String(row.jobId?.jobId ?? '').toLowerCase().includes(needle) || String(row.customerId?.companyName ?? '').toLowerCase().includes(needle));
    return { data: rows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: rows.length };
};

// Create a new Purchase Request
export const createPurchaseRequest =async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
                status: 401
            });
        }

        const privileges = employee.category?.privileges;
        const canCreate = !!privileges?.purchase?.create || /^superadmin$/i.test(employee.category?.role ?? '');

        const {
            jobId,
            purchaseNo,
            dealSheetId,
            status,
            sourceType,
        } = req.body;

        const isManual = sourceType === 'manual';
        // New and In Progress are the unsubmitted states: New is the allocated job, In Progress a saved PR.
        const isDraft = status === PurchaseRequestStatus.New || status === PurchaseRequestStatus.InProgress;

        if (!purchaseNo || !status || (!isManual && (!jobId || !dealSheetId))) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
                status: 400
            });
        }

        // A request that goes for approval must actually ask for something (drafts may still be incomplete).
        if (!isDraft) {
            const details = (Array.isArray(req.body.items) ? req.body.items : []).flatMap((item: any) => Array.isArray(item?.itemDetails) ? item.itemDetails : []);
            const valid = details.filter((d: any) => String(d?.detail ?? '').trim() && Number(d?.quantity) > 0 && Number(d?.unitCost) >= 0);
            if (!valid.length) {
                return res.status(400).json({ success: false, message: "Add at least one item with a description and a quantity before submitting", status: 400 });
            }
            if (details.some((d: any) => Number(d?.quantity) < 0 || Number(d?.unitCost) < 0)) {
                return res.status(400).json({ success: false, message: "Quantities and costs cannot be negative", status: 400 });
            }
        }

        let job;
        if (!isManual) {
            job = await jobModel.findById(jobId);
            if (!job) {
                return res.status(404).json({
                    success: false,
                    message: "Job not found",
                    status: 404
                });
            }
        }

        // The person a job is allocated to may convert it even without the create privilege.
        const isAllocatedToMe = !!job?.procurementPerson && String(job.procurementPerson) === String(employee._id);
        if (!canCreate && !isAllocatedToMe) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to convert jobs to purchase",
                status: 403
            });
        }

        let currency;
        if (job && job.quoteId) {
            const quotation = await Quotation.findById(job.quoteId);
            if (quotation && quotation.currency) {
                currency = quotation.currency;
            }
        }

        const requestData: any = {...req.body, createdBy: employee._id};
        // The first save of an allocated job starts the work; status is never picked by hand.
        if (isDraft) requestData.status = PurchaseRequestStatus.InProgress;

        if (currency) {
            requestData.currency = currency;
        }

        if (job && !requestData.procurementPerson && job.procurementPerson) {
            requestData.procurementPerson = job.procurementPerson;
        }
        if (job && job.allocatedBy) {
            requestData.allocatedBy = job.allocatedBy;
            requestData.allocatedAt = job.allocatedAt;
        }

        if (requestData.items && Array.isArray(requestData.items)) {
            requestData.items = requestData.items.map((item: any) => {
                if (item.itemDetails && Array.isArray(item.itemDetails)) {
                    item.itemDetails = item.itemDetails.map((detail: any) => {
                        const normalizedDetail = {
                            ...detail,
                            partNo: normalizePartNumberValue(detail.partNo)
                        };

                        // Ensure unitSellingPrice is preserved from job if available
                        if (detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null && detail.unitSellingPrice !== '') {
                            const sellingPrice = parseFloat(detail.unitSellingPrice);
                            if (!isNaN(sellingPrice)) {
                                normalizedDetail.unitSellingPrice = sellingPrice;
                            }
                        } else if (detail.unitCost !== undefined && detail.unitCost !== null) {
                            // If unitSellingPrice is not provided, use unitCost as fallback
                            normalizedDetail.unitSellingPrice = parseFloat(detail.unitCost) || 0;
                        }

                        if (detail.comparisons && Array.isArray(detail.comparisons)) {
                            normalizedDetail.comparisons = detail.comparisons.map((comparison: any) => {
                                if (!comparison.createdBy) {
                                    comparison.createdBy = employee._id;
                                }
                                return comparison;
                            });
                        }

                        return normalizedDetail;
                    });
                }
                return item;
            });
        }

        if (status && !isDraft) {
            const lines = prLines(requestData.items).filter((detail: any) => Number(detail.quantity) > 0);
            const open = unallocatedLines(lines);
            if (!lines.length || open.length) {
                return res.status(400).json({
                    success: false,
                    message: !lines.length ? "Add at least one product before sending for approval" : SUBMIT_GATE_MESSAGE(open.length),
                    status: 400
                });
            }
            try {
                const approvalStatus = await getWorkflowSteps('purchaseApproval', employee._id.toString(), purchaseApprovalContext(requestData));
                requestData.approvalStatus = approvalStatus;
                // Workflow conditions don't match this request, so no approval is required.
                if (approvalStatus.length === 0) requestData.status = PurchaseRequestStatus.Approved;
            } catch (error) {
                console.error('Error initializing workflow steps:', error);
            }
        }

        const newPurchaseRequest = new PurchaseRequest(requestData);
        const savedPurchaseRequest = await newPurchaseRequest.save();

        if (status && !isDraft) await recordComparisonPrices(savedPurchaseRequest, employee._id);

        await logPrAudit(req, savedPurchaseRequest, 'created', `${isManual ? 'General purchase request' : 'Purchase request'} ${savedPurchaseRequest.purchaseNo} created`);
        if (!isDraft) await logPrAudit(req, savedPurchaseRequest, 'submitted', `Sent for approval${savedPurchaseRequest.status === PurchaseRequestStatus.Approved ? ' (no approval needed)' : ''}`);

        if (!isManual) {
            // A job a user put On Hold stays there until they resume it.
            await jobModel.updateOne({ _id: jobId, allocateStatus: { $ne: allocateStatus.OnHold } }, {
                $set: {
                    allocateStatus: allocateStatus.WorkInProgress,
                    updatedDate: new Date()
                }
            });
        }

        console.log(savedPurchaseRequest.status);

        if (savedPurchaseRequest.status && !isDraft) {
            const socket = req.app.get('io') as Server;
            await createNotificationWithPrivileges(
                {
                    type: 'PurchaseApprovalRequest',
                    referenceModel: 'Purchase',
                    title: 'Purchase submitted for approval',
                    message: `Purchase ${savedPurchaseRequest.purchaseNo} has been submitted for approval`,
                    sentBy: employee._id?.toString(),
                    referenceId: savedPurchaseRequest._id,
                    additionalData: { purchaseId: savedPurchaseRequest._id.toString() }
                },
                {
                    privilegeKey: 'purchase',
                    checkFunction: (privileges) => {
                        return privileges.purchase?.canApprovePR === true;
                    }
                },
                socket
            );
        }

        return res.status(201).json({
            success: true,
            data: savedPurchaseRequest,
        });
    } catch (error) {
        next(error);
    }
};

// Shared by the list and the tab counts so both agree on what a PO progress bucket means.
const PO_QUANTITY_STAGES: any[] = [
    {
        $lookup: {
            from: 'purchaseorders',
            let: { purchaseRequestId: '$_id' },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $and: [
                                { $eq: ['$purchaseId', '$$purchaseRequestId'] },
                                { $not: [{ $in: ['$poStatus', ['Draft', 'Rejected', 'Cancelled']] }] }
                            ]
                        }
                    }
                },
                { $project: { items: 1, poStatus: 1, supplierId: 1 } }
            ],
            as: 'linkedPurchaseOrders'
        }
    },
    {
        $addFields: {
            selectedPrQuantity: {
                $reduce: {
                    input: { $ifNull: ['$items', []] },
                    initialValue: 0,
                    in: {
                        $add: [
                            '$$value',
                            {
                                $reduce: {
                                    input: { $ifNull: ['$$this.itemDetails', []] },
                                    initialValue: 0,
                                    in: {
                                        $add: [
                                            '$$value',
                                            {
                                                $let: {
                                                    vars: {
                                                        selectedComparisons: {
                                                            $filter: {
                                                                input: { $ifNull: ['$$this.comparisons', []] },
                                                                as: 'comparison',
                                                                cond: { $eq: ['$$comparison.selected', true] }
                                                            }
                                                        },
                                                        detailQuantity: { $ifNull: ['$$this.quantity', 0] }
                                                    },
                                                    in: {
                                                        $cond: [
                                                            { $gt: [{ $size: '$$selectedComparisons' }, 0] },
                                                            {
                                                                $reduce: {
                                                                    input: '$$selectedComparisons',
                                                                    initialValue: 0,
                                                                    in: { $add: ['$$value', { $ifNull: ['$$this.quantity', '$$detailQuantity'] }] }
                                                                }
                                                            },
                                                            // A line given its supplier directly (no comparison) counts in full.
                                                            { $cond: [{ $ifNull: ['$$this.supplierId', false] }, '$$detailQuantity', 0] }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            issuedPoQuantity: {
                $reduce: {
                    input: { $ifNull: ['$linkedPurchaseOrders', []] },
                    initialValue: 0,
                    in: {
                        $add: [
                            '$$value',
                            {
                                $reduce: {
                                    input: { $ifNull: ['$$this.items', []] },
                                    initialValue: 0,
                                    in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] }
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
            remainingPoQuantity: { $max: [{ $subtract: ['$selectedPrQuantity', '$issuedPoQuantity'] }, 0] },
            hasRemainingPo: { $gt: [{ $subtract: ['$selectedPrQuantity', '$issuedPoQuantity'] }, 0] },
            // PO progress column: placed (or closed) LPOs, LPOs still before Placed, awarded suppliers with no LPO yet.
            placedPoCount: {
                $size: { $filter: { input: { $ifNull: ['$linkedPurchaseOrders', []] }, as: 'po', cond: { $in: ['$$po.poStatus', ['Placed', 'Closed']] } } }
            },
            pendingPoCount: {
                $size: { $filter: { input: { $ifNull: ['$linkedPurchaseOrders', []] }, as: 'po', cond: { $not: [{ $in: ['$$po.poStatus', ['Placed', 'Closed']] }] } } }
            },
            notCreatedPoCount: {
                $size: {
                    $setDifference: [
                        {
                            $reduce: {
                                input: { $ifNull: ['$items', []] },
                                initialValue: [],
                                in: {
                                    $setUnion: [
                                        '$$value',
                                        {
                                            $reduce: {
                                                input: { $ifNull: ['$$this.itemDetails', []] },
                                                initialValue: [],
                                                in: {
                                                    $setUnion: [
                                                        '$$value',
                                                        {
                                                            $map: {
                                                                input: {
                                                                    $filter: {
                                                                        input: { $ifNull: ['$$this.comparisons', []] },
                                                                        as: 'comparison',
                                                                        cond: { $and: [{ $eq: ['$$comparison.selected', true] }, { $ne: [{ $ifNull: ['$$comparison.supplierId', null] }, null] }] }
                                                                    }
                                                                },
                                                                as: 'comparison',
                                                                in: '$$comparison.supplierId'
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        { $map: { input: { $ifNull: ['$linkedPurchaseOrders', []] }, as: 'po', in: '$$po.supplierId' } }
                    ]
                }
            },
            quoteLineCount: {
                $reduce: {
                    input: { $ifNull: ['$items', []] },
                    initialValue: 0,
                    in: {
                        $add: [
                            '$$value',
                            {
                                $reduce: {
                                    input: { $ifNull: ['$$this.itemDetails', []] },
                                    initialValue: 0,
                                    in: { $add: ['$$value', { $size: { $ifNull: ['$$this.comparisons', []] } }] }
                                }
                            }
                        ]
                    }
                }
            },
            awardedLineCount: {
                $reduce: {
                    input: { $ifNull: ['$items', []] },
                    initialValue: 0,
                    in: {
                        $add: [
                            '$$value',
                            {
                                $reduce: {
                                    input: { $ifNull: ['$$this.itemDetails', []] },
                                    initialValue: 0,
                                    in: {
                                        $add: [
                                            '$$value',
                                            {
                                                $size: {
                                                    $filter: {
                                                        input: { $ifNull: ['$$this.comparisons', []] },
                                                        as: 'comparison',
                                                        cond: { $eq: ['$$comparison.selected', true] }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
    },
];

const poProgressStages = (poProgress?: string): any[] => [
    ...(poProgress === 'ready' ? [{
        $match: {
            status: PurchaseRequestStatus.Approved,
            issuedPoQuantity: { $lte: 0 }
        }
    }] : []),
    ...(poProgress === 'remaining' ? [{
        $match: {
            status: PurchaseRequestStatus.Approved,
            issuedPoQuantity: { $gt: 0 },
            hasRemainingPo: true
        }
    }] : []),
    ...(poProgress === 'completed' ? [{
        $match: {
            status: PurchaseRequestStatus.Approved,
            selectedPrQuantity: { $gt: 0 },
            hasRemainingPo: false
        }
    }] : []),
];

export const getPurchaseRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, status, fromDate, toDate, companyName, purchaseNo, jobId, firstName, sourceType, poProgress, rfqStatus, allocation, search, sortKey, sortDir } = req.body;
        const pageNumber = Math.max(1, Math.floor(Number(page)) || 1);
        const pageSize = Math.min(10000, Math.max(1, Math.floor(Number(row)) || 10));
        // The grid's search box sends `search`: it matches the PR number, supplier, customer or job id.
        const searchText = typeof search === 'string' ? search.trim() : '';

        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
                status: 401
            });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.purchase?.viewReport 
            ? await buildPrivilegeAccessFilter(employee._id, privileges.purchase.viewReport, 'createdBy')
            : {};

        // The New tab lists the buyer's allocated jobs that have no PR yet, not purchase requests.
        if (allocation === 'new') {
            return res.status(200).json({
                success: true,
                purchase: await getNewTabJobs(employee._id, String(employee.category?.role).toLowerCase() === 'superadmin', searchText, pageNumber, pageSize),
                status: 200
            });
        }

        const matchStage: any = {
            isDeleted: false,
            ...accessFilter
        };

        if (Array.isArray(status)) {
            matchStage.status = { $in: status }
        } else {
            matchStage.status = status
        }

        if (purchaseNo) {
            matchStage.purchaseNo = { $regex: escapeRegex(String(purchaseNo)), $options: 'i' }
        }

        if (firstName) {
            matchStage['createdBy.firstName'] = { $regex: firstName, $options: 'i' }
        }

        if (sourceType === 'manual') {
            matchStage.sourceType = 'manual';
        } else if (sourceType === 'job') {
            matchStage.sourceType = { $ne: 'manual' };
        }

        const statusArray = Array.isArray(status) ? status : (status ? [status] : []);
        const shouldSortByApprovedDate = statusArray.includes('Approved');
        const sortField = shouldSortByApprovedDate ? 'approvedDate' : 'createdAt';
        
        // For approved purchases, date filtering will be done after approvedDate is calculated
        // For other statuses, filter by createdAt
        if (fromDate && toDate && !shouldSortByApprovedDate) {
            matchStage.createdAt = {
                $gte: new Date(fromDate),
                $lte: new Date(toDate)
            };
        }

        const purchases = await PurchaseRequest.aggregate([
            // Match on raw fields (isDeleted, createdBy access scoping, status) before any
            // $lookup/$unwind below overwrites 'createdBy' with the joined employee object.
            { $match: matchStage },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'supplierId',
                    foreignField: '_id',
                    as: 'supplierId'
                }
            },
            { $unwind: { path: '$supplierId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'jobId.quoteId',
                    foreignField: '_id',
                    as: 'jobId.quoteId'
                }
            },
            { $unwind: { path: '$jobId.quoteId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                    pipeline: [{ $project: { password: 0 } }]
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'procurementPerson',
                    foreignField: '_id',
                    as: 'procurementPerson'
                }
            },
            { $unwind: { path: '$procurementPerson', preserveNullAndEmptyArrays: true } },
            // Names for the detail panel's assignment history.
            {
                $lookup: {
                    from: 'employees',
                    localField: 'allocatedBy',
                    foreignField: '_id',
                    as: 'allocatedBy',
                    pipeline: [{ $project: { firstName: 1, lastName: 1 } }]
                }
            },
            { $unwind: { path: '$allocatedBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                totalPurchase: "$mrRequest.totalPurchase",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE"
                        ]
                    }
                }
            },
            {
                $addFields: {
                    approvalStatus: { $ifNull: ["$approvalStatus", []] }
                }
            },
            {
                $lookup: {
                    from: "categories",
                    let: { approvalRoles: "$approvalStatus.role" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$_id", "$$approvalRoles"] }
                            }
                        }
                    ],
                    as: "approvalRoles"
                }
            },
            {
                $lookup: {
                    from: "employees",
                    let: { approvalEmployees: "$approvalStatus.updatedBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$_id", "$$approvalEmployees"] }
                            }
                        }
                    ],
                    as: "approvalEmployees"
                }
            },
            {
                $addFields: {
                    approvalStatus: {
                        $map: {
                            input: "$approvalStatus",
                            as: "approval",
                            in: {
                                $mergeObjects: [
                                    "$$approval",
                                    {
                                        role: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$approvalRoles",
                                                        cond: { $eq: ["$$this._id", "$$approval.role"] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        updatedBy: {
                                            $cond: {
                                                if: { $ne: ["$$approval.updatedBy", null] },
                                                then: {
                                                    $arrayElemAt: [
                                                        {
                                                            $filter: {
                                                                input: "$approvalEmployees",
                                                                cond: { $eq: ["$$this._id", "$$approval.updatedBy"] }
                                                            }
                                                        },
                                                        0
                                                    ]
                                                },
                                                else: null
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
                $addFields: {
                    overallStatus: {
                        $cond: {
                            if: { $in: ["$status", ["New"]] },
                            then: { $toLower: "$status" },
                            else: {
                                $let: {
                                    vars: {
                                        lastApproval: { $arrayElemAt: ["$approvalStatus", -1] }
                                    },
                                    in: {
                                        $cond: {
                                            if: { $ifNull: ["$$lastApproval", false] },
                                            then: "$$lastApproval.status",
                                            else: "pending"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    approvedDate: {
                        $let: {
                            vars: {
                                approvedStatuses: {
                                    $filter: {
                                        input: { $ifNull: ["$approvalStatus", []] },
                                        as: "approval",
                                        cond: { $eq: ["$$approval.status", "approved"] }
                                    }
                                },
                                sortedApprovedStatuses: {
                                    $sortArray: {
                                        input: {
                                            $filter: {
                                                input: { $ifNull: ["$approvalStatus", []] },
                                                as: "approval",
                                                cond: { $eq: ["$$approval.status", "approved"] }
                                            }
                                        },
                                        sortBy: { updatedDate: -1 }
                                    }
                                }
                            },
                            in: {
                                $cond: {
                                    if: { $gt: [{ $size: "$$approvedStatuses" }, 0] },
                                    then: {
                                        $let: {
                                            vars: {
                                                mostRecentApproved: { $arrayElemAt: ["$$sortedApprovedStatuses", 0] }
                                            },
                                            in: "$$mostRecentApproved.updatedDate"
                                        }
                                    },
                                    else: null
                                }
                            }
                        }
                    }
                }
            },
            ...PO_QUANTITY_STAGES,
            {
                $addFields: {
                    rfqStatus: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$quoteLineCount', 0] }, then: 'not-started' },
                                { case: { $gt: ['$awardedLineCount', 0] }, then: 'awarded' }
                            ],
                            default: 'quoted'
                        }
                    }
                }
            },
            ...poProgressStages(poProgress),
            ...(rfqStatus ? [{
                $match: {
                    ...(rfqStatus === 'quoted' && { quoteLineCount: { $gt: 0 } }),
                    ...(rfqStatus === 'awarded' && { awardedLineCount: { $gt: 0 } }),
                    ...(rfqStatus === 'not-started' && { quoteLineCount: 0 })
                }
            }] : []),
            // Match for nested fields (requires the earlier $lookup/$unwind of customerId/jobId)
            {
                $match: {
                    ...(companyName && { "customerId.companyName": { $regex: escapeRegex(String(companyName)), $options: 'i' } }),
                    ...(jobId && { "jobId.jobId": { $regex: escapeRegex(String(jobId)), $options: 'i' } }),
                    ...(searchText && {
                        $or: ['purchaseNo', 'supplierId.supplierName', 'customerId.companyName', 'jobId.jobId']
                            .map((field) => ({ [field]: { $regex: escapeRegex(searchText), $options: 'i' } }))
                    })
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'rejectedReason.rejectedBy',
                    foreignField: '_id',
                    as: 'rejectedByDetails'
                }
            },
            {
                $addFields: {
                    rejectedReason: {
                        $map: {
                            input: '$rejectedReason',
                            as: 'reason',
                            in: {
                                $mergeObjects: [
                                    '$$reason',
                                    {
                                        rejectedBy: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$rejectedByDetails',
                                                        cond: { $eq: ['$$this._id', '$$reason.rejectedBy'] }
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
                $project: {
                    mrEngineer: 0,
                    hasMr: 0,
                    rejectedByDetails: 0
                }
            },
            { $unwind: { path: '$mrEngineer', preserveNullAndEmptyArrays: true } },
            // Filter by approvedDate for approved purchases when dates are provided
            ...(shouldSortByApprovedDate && fromDate && toDate ? [{
                $match: {
                    approvedDate: {
                        $gte: new Date(fromDate),
                        $lte: new Date(toDate)
                    }
                }
            }] : []),
            // Rows without an approved date (new / pending PRs) fall back to their created date so they sort with
            // the rest instead of sinking to the last page; the grid's Date column shows the same value.
            { $addFields: { sortDate: { $ifNull: ['$approvedDate', '$createdAt'] } } },
            { $sort: buildPurchaseSort(sortKey, sortDir, shouldSortByApprovedDate ? 'sortDate' : 'createdAt') },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
                        { $skip: (pageNumber - 1) * pageSize },
                        { $limit: pageSize }
                    ]
                }
            },
            {
                $project: {
                    data: 1,
                    total: { $arrayElemAt: ['$metadata.total', 0] }
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            purchase: purchases[0],
            status: 200
        });
    } catch (error) {
        next(error)
    }
}

// Get list of PRs by status
/**
 * Tab counts for the PR list in one call. Each view only needs a total, so this filters and counts
 * and joins only what that view's filter reads, instead of running the list's full pipeline per tab.
 */
export const getPurchaseRequestCounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { views, search } = req.body;
        const searchText = typeof search === 'string' ? search.trim() : '';

        const employee = await getEmployeeData(req.user);
        if (!employee) {
            return res.status(401).json({ success: false, message: "Employee not found", status: 401 });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.purchase?.viewReport
            ? await buildPrivilegeAccessFilter(employee._id, privileges.purchase.viewReport, 'createdBy')
            : {};
        const isSuperAdmin = String(employee.category?.role).toLowerCase() === 'superadmin';

        const countView = async (view: any): Promise<number> => {
            if (view.allocation === 'new') {
                return (await getNewTabJobs(employee._id, isSuperAdmin, searchText, 1, 1)).total;
            }

            const matchStage: any = { isDeleted: false, ...accessFilter };
            matchStage.status = Array.isArray(view.status) ? { $in: view.status } : view.status;
            if (view.sourceType === 'manual') matchStage.sourceType = 'manual';
            else if (view.sourceType === 'job') matchStage.sourceType = { $ne: 'manual' };

            const pipeline: any[] = [{ $match: matchStage }];

            // Search reads the supplier, customer and job joins, so only a searched count pays for them.
            if (searchText) {
                const joinOne = (from: string, field: string) => [
                    { $lookup: { from, localField: field, foreignField: '_id', as: field, pipeline: [{ $project: { supplierName: 1, companyName: 1, jobId: 1 } }] } },
                    { $unwind: { path: `${field}`, preserveNullAndEmptyArrays: true } },
                ];
                pipeline.push(
                    ...joinOne('customers', 'customerId'),
                    ...joinOne('suppliers', 'supplierId'),
                    ...joinOne('jobs', 'jobId'),
                    {
                        $match: {
                            $or: ['purchaseNo', 'supplierId.supplierName', 'customerId.companyName', 'jobId.jobId']
                                .map((field) => ({ [field]: { $regex: escapeRegex(searchText), $options: 'i' } }))
                        }
                    }
                );
            }

            // Only the PO progress tabs need the purchase order quantities.
            if (view.poProgress) {
                pipeline.push(...PO_QUANTITY_STAGES, ...poProgressStages(view.poProgress));
            }

            pipeline.push({ $count: 'total' });
            const result = await PurchaseRequest.aggregate(pipeline);
            return result[0]?.total ?? 0;
        };

        const requested: any[] = Array.isArray(views) ? views : [];
        const totals = await Promise.all(requested.map(countView));
        const counts: Record<string, number> = {};
        requested.forEach((view, i) => { counts[String(view.id)] = totals[i]; });

        return res.status(200).json({ success: true, counts, status: 200 });
    } catch (error) {
        next(error);
    }
};

export const getPurchaseRequestsByStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.params;

        if (!Object.values(PurchaseRequestStatus).includes(status as PurchaseRequestStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status",
                status: 400
            });
        }

        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
                status: 401
            });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.purchase?.viewReport 
            ? await buildPrivilegeAccessFilter(employee._id, privileges.purchase.viewReport, 'createdBy')
            : {};

        const purchaseRequests = await PurchaseRequest.aggregate([
            {
                $match: { 
                    status: status,
                    isDeleted: false,
                    ...accessFilter
                }
            },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'jobId.quoteId',
                    foreignField: '_id',
                    as: 'jobId.quoteId'
                }
            },
            { $unwind: { path: '$jobId.quoteId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                    pipeline: [{ $project: { password: 0 } }]
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE"
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'rejectedReason.rejectedBy',
                    foreignField: '_id',
                    as: 'rejectedByDetails'
                }
            },
            {
                $addFields: {
                    rejectedReason: {
                        $map: {
                            input: '$rejectedReason',
                            as: 'reason',
                            in: {
                                $mergeObjects: [
                                    '$$reason',
                                    {
                                        rejectedBy: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$rejectedByDetails',
                                                        cond: { $eq: ['$$this._id', '$$reason.rejectedBy'] }
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
                $project: {
                    mrEngineer: 0,
                    hasMr: 0,
                    rejectedByDetails: 0
                }
            },
            { $unwind: { path: '$mrEngineer', preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    detailPartNos: {
                        $reduce: {
                            input: '$items',
                            initialValue: [],
                            in: {
                                $setUnion: [
                                    '$$value',
                                    {
                                        $filter: {
                                            input: {
                                                $map: {
                                                    input: '$$this.itemDetails',
                                                    as: 'detail',
                                                    in: '$$detail.partNo'
                                                }
                                            },
                                            as: 'id',
                                            cond: {
                                                $and: [
                                                    { $ne: ['$$id', null] },
                                                    { $ne: ['$$id', ''] }
                                                ]
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
                $lookup: {
                    from: 'products',
                    let: { ids: '$detailPartNos' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ['$_id', { $ifNull: ['$$ids', []] }]
                                }
                            }
                        },
                        {
                            $project: {
                                partNo: 1,
                                productDescription: 1
                            }
                        }
                    ],
                    as: 'partNumberProducts'
                }
            },
            {
                $set: {
                    items: {
                        $map: {
                            input: '$items',
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
                                                            partNo: {
                                                                $let: {
                                                                    vars: {
                                                                        product: {
                                                                            $arrayElemAt: [
                                                                                {
                                                                                    $filter: {
                                                                                        input: '$partNumberProducts',
                                                                                        as: 'p',
                                                                                        cond: { $eq: ['$$p._id', '$$detail.partNo'] }
                                                                                    }
                                                                                },
                                                                                0
                                                                            ]
                                                                        }
                                                                    },
                                                                    in: {
                                                                        $cond: [
                                                                            { $ifNull: ['$$product', false] },
                                                                            {
                                                                                _id: '$$product._id',
                                                                                partNo: '$$product.partNo',
                                                                                productDescription: '$$product.productDescription'
                                                                            },
                                                                            '$$detail.partNo'
                                                                        ]
                                                                    }
                                                                }
                                                            },
                                                            comparisons: '$$detail.comparisons'
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
                $unset: ['detailPartNos', 'partNumberProducts']
            },
            { $sort: { createdAt: -1 } }
        ]);

        return res.status(200).json({
            success: true,
            data: purchaseRequests,
        });
    } catch (error) {
        next(error);
    }
};

export const updatePurchaseItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                message: "Items array is required",
                status: 400
            });
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        const normalizedItems = items.map((item: any) => {
            // Ensure itemName is set - use first detail if itemName is empty
            let itemName = item.itemName;
            if (!itemName || itemName.trim() === '') {
                itemName = item.itemDetails?.[0]?.detail || 'Item';
            }

            const normalizedItem: any = {
                itemName: itemName.trim()
            };

            if (item.itemDetails && Array.isArray(item.itemDetails)) {
                normalizedItem.itemDetails = item.itemDetails.map((detail: any) => {
                    // Remove temporary _id fields (those starting with 'temp-')
                    const { _id, ...detailWithoutId } = detail;
                    const normalizedDetail: any = {
                        ...detailWithoutId,
                        partNo: normalizePartNumberValue(detail.partNo)
                    };


                    // Ensure comparisons array exists (required by schema)
                    if (detail.comparisons && Array.isArray(detail.comparisons)) {
                        normalizedDetail.comparisons = detail.comparisons.map((comparison: any) => {
                            if (!comparison.createdBy) {
                                comparison.createdBy = employee._id;
                            }
                            return comparison;
                        });
                    } else {
                        normalizedDetail.comparisons = [];
                    }

                    // Remove unitSellingPrice if it's empty string or invalid
                    if (normalizedDetail.unitSellingPrice === '' || normalizedDetail.unitSellingPrice === null) {
                        delete normalizedDetail.unitSellingPrice;
                    } else if (normalizedDetail.unitSellingPrice !== undefined) {
                        const sellingPrice = parseFloat(normalizedDetail.unitSellingPrice);
                        if (isNaN(sellingPrice)) {
                            delete normalizedDetail.unitSellingPrice;
                        } else {
                            normalizedDetail.unitSellingPrice = sellingPrice;
                        }
                    }

                    return normalizedDetail;
                });
            } else {
                normalizedItem.itemDetails = [];
            }
            return normalizedItem;
        });

        let totalLpo = 0;
        normalizedItems.forEach((item: any) => {
            if (item.itemDetails && Array.isArray(item.itemDetails)) {
                item.itemDetails.forEach((detail: any) => {
                    const quantity = detail.quantity || 0;
                    const unitCost = detail.unitCost || 0;
                    totalLpo += quantity * unitCost;
                });
            }
        });

        const updateData: any = {
            items: normalizedItems,
            totalLpo,
            updatedBy: employee._id,
            updatedAt: new Date()
        };

        if (!purchaseRequest.status) {
            updateData.status = 'New';
        }

        const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Purchase items updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

export const updatePurchaseSupplierOffers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                message: "Items array is required",
                status: 400
            });
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        const normalizedItems = items.map((item: any) => {
            if (item.itemDetails && Array.isArray(item.itemDetails)) {
                item.itemDetails = item.itemDetails.map((detail: any) => {
                    const normalizedDetail = {
                        ...detail,
                        partNo: normalizePartNumberValue(detail.partNo)
                    };

                    if (detail.comparisons && Array.isArray(detail.comparisons)) {
                        normalizedDetail.comparisons = detail.comparisons.map((comparison: any) => {
                            if (!comparison.createdBy) {
                                comparison.createdBy = employee._id;
                            }
                            return comparison;
                        });
                    }

                    return normalizedDetail;
                });
            }
            return item;
        });

        const updateData: any = {
            items: normalizedItems,
            updatedBy: employee._id,
            updatedAt: new Date()
        };

        if (!purchaseRequest.status) {
            updateData.status = 'New';
        }

        const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Purchase supplier offers updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

export const mergeItemsToDealSheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);

        const purchaseRequest = await PurchaseRequest.findById(id);
        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }


        const job = await jobModel.findById(purchaseRequest.jobId);
        if (!job || !job.quoteId) {
            return res.status(404).json({
                success: false,
                message: "Job or quotation not found",
                status: 404
            });
        }

        const quotation = await Quotation.findById(job.quoteId);
        if (!quotation || !quotation.dealData) {
            return res.status(404).json({
                success: false,
                message: "Quotation or deal data not found",
                status: 404
            });
        }

        const newItems: any[] = [];
        const updatedPurchaseItems: any[] = [];

        purchaseRequest.items.forEach((item: any) => {
            const newItemDetails = item.itemDetails?.filter((detail: any) => detail.isNewlyAdded && !detail.merged) || [];
            
            if (newItemDetails.length > 0) {
                const updatedItemDetails = item.itemDetails.map((detail: any) => {
                    if (detail.isNewlyAdded && !detail.merged) {
                        return { ...detail, merged: true };
                    }
                    return detail;
                });

                updatedPurchaseItems.push({
                    ...item,
                    itemDetails: updatedItemDetails
                });

                const quoteItemDetails = newItemDetails.map((detail: any) => {
                    const selectedComparison = detail.comparisons?.find((c: any) => c.selected === true);
                    const supplierId = selectedComparison?.supplierId || detail.supplierId || undefined;
                    
                    return {
                        detail: detail.detail,
                        quantity: detail.quantity,
                        unitCost: detail.unitCost,
                        unitSellingPrice: detail.unitSellingPrice || detail.unitCost,
                        availability: detail.availability || '',
                        supplierId: supplierId,
                        dealSelected: true,
                        purchaseItemDetailId: detail._id ? new ObjectId(detail._id) : undefined
                    };
                });

                newItems.push({
                    itemName: item.itemName,
                    itemDetails: quoteItemDetails
                });
            } else {
                updatedPurchaseItems.push(item);
            }
        });

        if (newItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No new items to merge",
                status: 400
            });
        }

        const existingUpdatedItems = quotation.dealData.updatedItems || [];
        const mergedItems = [...existingUpdatedItems, ...newItems];

        quotation.dealData.updatedItems = mergedItems;
        await quotation.save();

        purchaseRequest.items = updatedPurchaseItems;
        purchaseRequest.updatedBy = employee._id;
        purchaseRequest.updatedAt = new Date();
        await purchaseRequest.save();

        return res.status(200).json({
            success: true,
            message: "Items merged to deal sheet successfully",
            status: 200,
            data: purchaseRequest
        });
    } catch (error) {
        next(error);
    }
};

export const revokeMergedItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);

        const purchaseRequest = await PurchaseRequest.findById(id);
        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        const job = await jobModel.findById(purchaseRequest.jobId);
        if (!job || !job.quoteId) {
            return res.status(404).json({
                success: false,
                message: "Job or quotation not found",
                status: 404
            });
        }

        const quotation = await Quotation.findById(job.quoteId);
        if (!quotation || !quotation.dealData) {
            return res.status(404).json({
                success: false,
                message: "Quotation or deal data not found",
                status: 404
            });
        }

        const mergedDetailIds: string[] = [];
        const updatedPurchaseItems: any[] = [];

        purchaseRequest.items.forEach((item: any) => {
            const mergedDetails = item.itemDetails?.filter((detail: any) => detail.merged) || [];
            
            if (mergedDetails.length > 0) {
                mergedDetails.forEach((detail: any) => {
                    if (detail._id) {
                        mergedDetailIds.push(detail._id.toString());
                    }
                });

                const updatedItemDetails = item.itemDetails.map((detail: any) => {
                    if (detail.merged) {
                        return { ...detail, merged: false };
                    }
                    return detail;
                });

                updatedPurchaseItems.push({
                    ...item,
                    itemDetails: updatedItemDetails
                });
            } else {
                updatedPurchaseItems.push(item);
            }
        });

        if (mergedDetailIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No merged items to revoke",
                status: 400
            });
        }

        const existingUpdatedItems = quotation.dealData.updatedItems || [];
        const filteredItems = existingUpdatedItems
            .map((quoteItem: any) => {
                const filteredDetails = quoteItem.itemDetails?.filter((detail: any) => {
                    const detailId = detail.purchaseItemDetailId?.toString() || detail._id?.toString();
                    return !mergedDetailIds.includes(detailId);
                }) || [];

                if (filteredDetails.length === 0) {
                    return null;
                }

                return {
                    ...quoteItem,
                    itemDetails: filteredDetails
                };
            })
            .filter(Boolean);

        quotation.dealData.updatedItems = filteredItems;
        await quotation.save();

        purchaseRequest.items = updatedPurchaseItems;
        purchaseRequest.updatedBy = employee._id;
        purchaseRequest.updatedAt = new Date();
        await purchaseRequest.save();

        return res.status(200).json({
            success: true,
            message: "Merged items revoked successfully",
            status: 200,
            data: purchaseRequest
        });
    } catch (error) {
        next(error);
    }
};

export const updatePurchaseMrRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        const { mrRequest } = req.body;

        if (!mrRequest) {
            return res.status(400).json({
                success: false,
                message: "MR request data is required",
                status: 400
            });
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        const updateData: any = {
            mrRequest: {
                engineer: mrRequest.engineer,
                message: mrRequest.message || '',
                totalPurchase: mrRequest.totalPurchase || 0,
                createdDate: mrRequest.createdDate || new Date()
            },
            updatedBy: employee._id,
            updatedAt: new Date()
        };

        if (!purchaseRequest.status) {
            updateData.status = 'New';
        }

        const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (mrRequest.engineer) {
            const technicalProject = await technicalModel.findOne({ jobId: purchaseRequest.jobId }).select('_id');
            const socket = req.app.get('io') as Server;
            await createNotificationWithPrivileges(
                {
                    type: 'MrRequest',
                    referenceModel: 'Purchase',
                    title: 'New MR Request',
                    message: `You have received a new material request for purchase ${updatedPurchaseRequest?.purchaseNo || id}`,
                    sentBy: employee._id?.toString(),
                    referenceId: updatedPurchaseRequest?._id || id,
                    additionalData: { 
                        purchaseId: id,
                        technicalId: technicalProject?._id?.toString() || null
                    }
                },
                {
                    privilegeKey: 'technical',
                    checkFunction: (privileges, employeeId) => {
                        return employeeId === mrRequest.engineer.toString() &&
                               privileges.technical?.viewReport !== 'none';
                    }
                },
                socket
            );
        }

        return res.status(200).json({
            success: true,
            message: "MR request updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Get PR details by ID
export const getPurchaseRequestById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const qatarUsdRate = await getUSDRated();

        const purchaseRequest = await PurchaseRequest.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'supplierId',
                    foreignField: '_id',
                    as: 'supplierId'
                }
            },
            { $unwind: { path: '$supplierId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'quotations',
                    localField: 'jobId.quoteId',
                    foreignField: '_id',
                    as: 'jobId.quoteId'
                }
            },
            { $unwind: { path: '$jobId.quoteId', preserveNullAndEmptyArrays: true } },
            // Enrich quotation with client, department, createdBy and resolved attention contact
            {
                $lookup: {
                    from: 'customers',
                    localField: 'jobId.quoteId.client',
                    foreignField: '_id',
                    as: 'quoteClient'
                }
            },
            { $unwind: { path: '$quoteClient', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'jobId.quoteId.department',
                    foreignField: '_id',
                    as: 'quoteDepartment'
                }
            },
            { $unwind: { path: '$quoteDepartment', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'jobId.quoteId.createdBy',
                    foreignField: '_id',
                    as: 'quoteCreatedBy'
                }
            },
            {
                $unwind: {
                    path: '$quoteCreatedBy',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    'jobId.quoteId': {
                        $cond: [
                            { $ifNull: ['$jobId.quoteId', false] },
                            {
                                $mergeObjects: [
                                    '$jobId.quoteId',
                                    {
                                        client: '$quoteClient',
                                        department: '$quoteDepartment',
                                        createdBy: {
                                            _id: '$quoteCreatedBy._id',
                                            firstName: '$quoteCreatedBy.firstName',
                                            lastName: '$quoteCreatedBy.lastName',
                                            contactNo: '$quoteCreatedBy.contactNo',
                                            email: '$quoteCreatedBy.email'
                                        },
                                        attention: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$quoteClient.contactDetails',
                                                        as: 'contact',
                                                        cond: { $eq: ['$$contact._id', '$jobId.quoteId.attention'] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    }
                                ]
                            },
                            null
                        ]
                    }
                }
            },
            {
                $addFields: {
                    totalPRCost: {
                        $sum: {
                            $map: {
                                input: '$items',
                                as: 'item',
                                in: {
                                    $sum: {
                                        $map: {
                                            input: '$$item.itemDetails',
                                            as: 'detail',
                                            in: {
                                                $let: {
                                                    vars: {
                                                        selectedComparison: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: { $ifNull: ['$$detail.comparisons', []] },
                                                                        as: 'comp',
                                                                        cond: { $eq: ['$$comp.selected', true] }
                                                                    }
                                                                },
                                                                0
                                                            ]
                                                        }
                                                    },
                                                    in: {
                                                        $cond: [
                                                            { $ifNull: ['$$selectedComparison', false] },
                                                            { $multiply: ['$$selectedComparison.unitPrice', '$$selectedComparison.quantity'] },
                                                            0
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    totalDiscountReceived: {
                        $ifNull: ['$supplierDiscounts.totalDiscount', 0]
                    }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'jobId.quoteId.createdBy',
                    foreignField: '_id',
                    as: 'jobId.createdBy'
                }
            },
            { $unwind: { path: '$jobId.createdBy', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                    pipeline: [{ $project: { password: 0 } }]
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'procurementPerson',
                    foreignField: '_id',
                    as: 'procurementPerson',
                    pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }]
                }
            },
            { $unwind: { path: '$procurementPerson', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'allocatedBy',
                    foreignField: '_id',
                    as: 'allocatedBy',
                    pipeline: [{ $project: { firstName: 1, lastName: 1 } }]
                }
            },
            { $unwind: { path: '$allocatedBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    lpoValue: {
                        $cond: [
                            {
                                $and: [
                                    { $ifNull: ['$jobId.quoteId', false] },
                                    { $ifNull: ['$jobId.quoteId.dealData', false] }
                                ]
                            },
                            {
                                $let: {
                                    vars: {
                                        baseLpoValue: {
                                            $sum: {
                                                $cond: [
                                                    { $eq: ['$jobId.quoteId.currency', 'USD'] },
                                                    {
                                                        $multiply: [
                                                            calculateDiscountPricePipe('$jobId.quoteId.dealData.updatedItems', '$jobId.quoteId.dealData.totalDiscount'),
                                                            qatarUsdRate
                                                        ]
                                                    },
                                                    calculateDiscountPricePipe('$jobId.quoteId.dealData.updatedItems', '$jobId.quoteId.dealData.totalDiscount')
                                                ]
                                            }
                                        }
                                    },
                                    in: {
                                        $reduce: {
                                            input: { $ifNull: ['$jobId.quoteId.dealData.additionalCosts', []] },
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
                            },
                            0
                        ]
                    },
                    totalDealCost: {
                        $cond: [
                            {
                                $and: [
                                    { $ifNull: ['$jobId.quoteId', false] },
                                    { $ifNull: ['$jobId.quoteId.dealData', false] },
                                    { $ifNull: ['$jobId.quoteId.dealData.updatedItems', false] }
                                ]
                            },
                            calculateCostPricePipe('$jobId.quoteId.dealData.updatedItems', '$jobId.quoteId.dealData.additionalCosts'),
                            0
                        ]
                    },
                    totalDealSellingPrice: {
                        $cond: [
                            {
                                $and: [
                                    { $ifNull: ['$jobId.quoteId', false] },
                                    { $ifNull: ['$jobId.quoteId.dealData', false] },
                                    { $ifNull: ['$jobId.quoteId.dealData.updatedItems', false] }
                                ]
                            },
                            {
                                $let: {
                                    vars: {
                                        baseSellingPrice: calculateDiscountPricePipe('$jobId.quoteId.dealData.updatedItems', '$jobId.quoteId.dealData.totalDiscount')
                                    },
                                    in: {
                                        $reduce: {
                                            input: { $ifNull: ['$jobId.quoteId.dealData.additionalCosts', []] },
                                            initialValue: '$$baseSellingPrice',
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
                            },
                            0
                        ]
                    }
                }
            },
            {
                $addFields: {
                    dealProfit: {
                        $subtract: ['$totalDealSellingPrice', '$totalDealCost']
                    }
                }
            },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                totalPurchase: "$mrRequest.totalPurchase",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE"
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'rejectedReason.rejectedBy',
                    foreignField: '_id',
                    as: 'rejectedByDetails'
                }
            },
            {
                $addFields: {
                    rejectedReason: {
                        $map: {
                            input: '$rejectedReason',
                            as: 'reason',
                            in: {
                                $mergeObjects: [
                                    '$$reason',
                                    {
                                        rejectedBy: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$rejectedByDetails',
                                                        cond: { $eq: ['$$this._id', '$$reason.rejectedBy'] }
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
                $project: {
                    mrEngineer: 0,
                    hasMr: 0,
                    rejectedByDetails: 0
                }
            },
            { $unwind: { path: '$mrEngineer', preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    detailPartNos: {
                        $reduce: {
                            input: '$items',
                            initialValue: [],
                            in: {
                                $setUnion: [
                                    '$$value',
                                    {
                                        $filter: {
                                            input: {
                                                $map: {
                                                    input: '$$this.itemDetails',
                                                    as: 'detail',
                                                    in: '$$detail.partNo'
                                                }
                                            },
                                            as: 'id',
                                            cond: {
                                                $and: [
                                                    { $ne: ['$$id', null] },
                                                    { $ne: ['$$id', ''] }
                                                ]
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
                $lookup: {
                    from: 'products',
                    let: { ids: '$detailPartNos' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ['$_id', { $ifNull: ['$$ids', []] }]
                                }
                            }
                        },
                        {
                            $project: {
                                partNo: 1,
                                productDescription: 1
                            }
                        }
                    ],
                    as: 'partNumberProducts'
                }
            },
            {
                $set: {
                    items: {
                        $map: {
                            input: '$items',
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
                                                            partNo: {
                                                                $let: {
                                                                    vars: {
                                                                        product: {
                                                                            $arrayElemAt: [
                                                                                {
                                                                                    $filter: {
                                                                                        input: '$partNumberProducts',
                                                                                        as: 'p',
                                                                                        cond: { $eq: ['$$p._id', '$$detail.partNo'] }
                                                                                    }
                                                                                },
                                                                                0
                                                                            ]
                                                                        }
                                                                    },
                                                                    in: {
                                                                        $cond: [
                                                                            { $ifNull: ['$$product', false] },
                                                                            {
                                                                                _id: '$$product._id',
                                                                                partNo: '$$product.partNo',
                                                                                productDescription: '$$product.productDescription'
                                                                            },
                                                                            '$$detail.partNo'
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
                                ]
                            }
                        }
                    }
                }
            },
            {
                $unset: ['detailPartNos', 'partNumberProducts']
            },
            { $sort: { createdAt: -1 } }
        ]);

        if (!purchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
            });
        }

        const populatedPurchaseRequest = purchaseRequest[0];

        // One batched lookup instead of a round trip per comparison.
        const comparisonSupplierIds = new Set<string>();
        for (const item of populatedPurchaseRequest.items) {
            for (const itemDetail of item.itemDetails) {
                for (const comparison of itemDetail.comparisons) {
                    if (comparison.supplierId) comparisonSupplierIds.add(String(comparison.supplierId));
                }
            }
        }
        const comparisonSuppliers = await supplierModel
            .find({ _id: { $in: [...comparisonSupplierIds] } })
            .select('supplierName')
            .lean();
        const supplierNameById = new Map(comparisonSuppliers.map((s: any) => [String(s._id), s.supplierName]));

        for (const item of populatedPurchaseRequest.items) {
            for (const itemDetail of item.itemDetails) {
                for (const comparison of itemDetail.comparisons) {
                    const supplierName = supplierNameById.get(String(comparison.supplierId));
                    if (supplierName) {
                        comparison.supplierName = supplierName;
                    }
                    comparison.totalCost = comparison.quantity * comparison.unitPrice;
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Purchase request fetched successfully",
            data: populatedPurchaseRequest,
        });
    } catch (error) {
        next(error);
    }
};

const seedPurchaseNoSequence = async (): Promise<number> => {
    const latestPR = await PurchaseRequest.findOne().sort({ purchaseNo: -1 });
    if (latestPR) {
        const parts = latestPR.purchaseNo.split('-');
        const lastCounter = parseInt(parts[3]);
        if (!isNaN(lastCounter)) {
            return lastCounter;
        }
    }
    return 0;
};

// Generate a new purchase number
export const generatePurchaseNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        const nextNumber = await getNextSequence('purchaseNo', seedPurchaseNoSequence);

        const newPurchaseNumber = `NRN/PR-${year}-${month}-${nextNumber
            .toString()
            .padStart(4, '0')}`;

        return res.status(200).json({
            success: true,
            message: "Purchase number generated successfully",
            data: { purchaseNo: newPurchaseNumber },
        });

    } catch (error) {
        console.log(error)
        next(error);
    }
};

// Change status of a PR
export const updatePurchaseRequestStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { status, comment } = req.body;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
                status: 401
            });
        }

        const privileges = employee.category?.privileges;
        const isSuperAdmin = /^superadmin$/i.test(employee.category?.role ?? '');
        if (status === 'approved' && !isSuperAdmin && !privileges?.purchase?.canApprovePR) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to approve purchase requisitions",
                status: 403
            });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be 'approved' or 'rejected'",
                status: 400
            });
        }

        const purchaseRequest = await PurchaseRequest.findById(id).populate('approvalStatus.role').populate('createdBy', '-password');
        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        if (!purchaseRequest.approvalStatus || purchaseRequest.approvalStatus.length === 0) {
                return res.status(400).json({
                    success: false,
                message: "No approval workflow found for this purchase request",
                    status: 400
                });
            }

        const createdById = (purchaseRequest.createdBy as any)?._id || purchaseRequest.createdBy;
        if (!/^superadmin$/i.test((employee as any).category?.role ?? '') && createdById?.toString() === employee._id?.toString()) {
            return res.status(403).json({
                success: false,
                message: "You cannot approve or reject a purchase request that you created",
                status: 403
            });
        }

        if (purchaseRequest.status !== PurchaseRequestStatus.Pending) {
            return res.status(409).json({
                success: false,
                message: `This request is already ${String(purchaseRequest.status).toLowerCase()}.`,
                status: 409
            });
        }

        let updatedApprovalStatus: any[];
        try {
            updatedApprovalStatus = await updateApprovalStatus(
                status,
                purchaseRequest.approvalStatus,
                comment || '',
                employee,
                purchaseApprovalContext(purchaseRequest)
            );
        } catch (error: any) {
            // Workflow refusals (not this approver's step, over the limit, nothing pending) are the caller's, not a server fault.
            return res.status(400).json({
                success: false,
                message: String(error?.message || error).replace(/^(Error: )+/, ''),
                status: 400
            });
        }
        purchaseRequest.approvalStatus = updatedApprovalStatus;

        const hasRejected = updatedApprovalStatus.some((approval: any) => approval.status === 'rejected');
        const hasPending = updatedApprovalStatus.some((approval: any) => approval.status === 'pending');
        const isAllApproved = !hasRejected && !hasPending && updatedApprovalStatus.length > 0;

        if (status === 'rejected') {
            purchaseRequest.rejectedReason.push({
                rejectedBy: employee._id,
                comment: comment || '',
                rejectedAt: new Date()
            });
        }

        if (hasRejected) {
            purchaseRequest.status = PurchaseRequestStatus.Rejected;
        } else if (isAllApproved) {
            purchaseRequest.status = PurchaseRequestStatus.Approved;
        } else {
            purchaseRequest.status = PurchaseRequestStatus.Pending;
        }

        purchaseRequest.updatedBy = employee._id;
        purchaseRequest.updatedAt = new Date();

        await purchaseRequest.save();

        await logPrAudit(req, purchaseRequest, status === 'rejected' ? 'rejected' : 'approved',
            `${status === 'rejected' ? 'Rejected' : isAllApproved ? 'Approved (final step)' : 'Approved (step)'}${comment ? ` — ${comment}` : ''}`,
            [{ label: 'Status', from: PurchaseRequestStatus.Pending, to: String(purchaseRequest.status) }]);

        const updatedPurchaseRequest = await PurchaseRequest.findById(id)
            .populate('createdBy', '-password')
            .populate('approvalStatus.role')
            .populate('approvalStatus.updatedBy', '-password');

        const socket = req.app.get('io') as Server;

        if (!isAllApproved && !hasRejected && hasPending && status === 'approved') {
            const pendingStatuses = updatedApprovalStatus
                .filter((approval: any) => approval.status === 'pending')
                .sort((a: any, b: any) => a.step - b.step);

            const nextStep = pendingStatuses[0]?.step;
            const nextApprovals = pendingStatuses.filter((approval: any) => approval.step === nextStep);

            if (nextApprovals.length) {
                const nextApproverIds = new Set<string>();
                const managerStepIds = new Set<string>();

                for (const nextApproval of nextApprovals) {
                    if (nextApproval.managerApproval && nextApproval.approver) {
                        nextApproverIds.add(nextApproval.approver.toString());
                        managerStepIds.add(nextApproval.approver.toString());
                    } else if (nextApproval.role) {
                        const nextRoleId =
                            (nextApproval.role as any)?._id?.toString() ||
                            nextApproval.role?.toString();

                        if (nextRoleId) {
                            const approverEmployees = await Employee.find({
                                category: nextRoleId,
                                isDeleted: { $ne: true },
                                isBlocked: { $ne: true },
                            }).lean();

                            for (const approver of approverEmployees) {
                                nextApproverIds.add(approver._id.toString());
                            }
                        }
                    }
                }

                if (nextApproverIds.size > 0) {
                    const purchaseId = purchaseRequest._id.toString();

                    await createNotificationWithPrivileges(
                        {
                            type: 'PurchaseApprovalRequest',
                            referenceModel: 'Purchase',
                            title: 'Purchase awaiting your approval',
                            message: `Purchase ${purchaseRequest.purchaseNo} is awaiting your approval.`,
                            sentBy: employee._id?.toString(),
                            referenceId: purchaseRequest._id,
                            additionalData: { purchaseId }
                        },
                        {
                            privilegeKey: 'purchase',
                            checkFunction: (privileges, employeeId) => {
                                if (!employeeId || !nextApproverIds.has(employeeId)) {
                                    return false;
                                }

                                if (managerStepIds.has(employeeId)) {
                                    return true;
                                }

                                return privileges.purchase?.canApprovePR === true;
                            }
                        },
                        socket
                    );
                }
            }
        }

        if (isAllApproved) {
            const purchaseId = purchaseRequest._id.toString();
            await createNotificationWithPrivileges(
                {
                    type: 'PurchaseApproved',
                    referenceModel: 'Purchase',
                    title: 'Purchase ready for PO',
                    message: `Purchase ${purchaseRequest.purchaseNo} has been approved and is ready for PO.`,
                    sentBy: employee._id?.toString(),
                    referenceId: purchaseRequest._id,
                    additionalData: { purchaseId }
                },
                {
                    privilegeKey: 'purchaseOrder',
                    checkFunction: (privileges) => {
                        return privileges.purchaseOrder?.canInitiateLPO === true;
                    }
                },
                socket
            );
        } else if (hasRejected) {
            const purchaseId = purchaseRequest._id.toString();
            await createNotificationWithPrivileges(
                {
                    type: 'PurchaseRejected',
                    referenceModel: 'Purchase',
                    title: 'Purchase rejected',
                    message: `Purchase ${purchaseRequest.purchaseNo} has been rejected.`,
                    sentBy: employee._id?.toString(),
                    referenceId: purchaseRequest._id,
                    additionalData: { purchaseId }
                },
                {
                    privilegeKey: 'purchase',
                    checkFunction: (privileges, employeeId) => {
                        const createdById = (purchaseRequest.createdBy as any)?._id?.toString() || purchaseRequest.createdBy.toString();
                        return employeeId === createdById && privileges.purchase?.viewReport !== 'none';
                    }
                },
                socket
            );
        }

        const procurementPersonId =
            (purchaseRequest as any).procurementPerson?.toString?.() ||
            (purchaseRequest.jobId
                ? (await jobModel.findById(purchaseRequest.jobId).select('procurementPerson').lean())?.procurementPerson?.toString?.()
                : undefined);

        if (procurementPersonId) {
            const purchaseId = purchaseRequest._id.toString();
            const purchaseNo = purchaseRequest.purchaseNo as string;
            const approverName =
                `${(employee as any).firstName || ''} ${(employee as any).lastName || ''}`.trim() || 'An approver';
            const pendingCount = updatedApprovalStatus.filter((a: any) => a.status === 'pending').length;

            let procTitle = '';
            let procMessage = '';

            if (hasRejected && status === 'rejected') {
                procTitle = 'Purchase rejected';
                procMessage = `Purchase ${purchaseNo} was rejected by ${approverName}.`;
            } else if (isAllApproved && status === 'approved') {
                procTitle = 'Purchase fully approved';
                procMessage = `Purchase ${purchaseNo} has been fully approved and is ready for PO.`;
            } else if (status === 'approved' && hasPending && !hasRejected) {
                procTitle = 'Purchase approval progress';
                const personLabel = pendingCount === 1 ? 'person' : 'people';
                const beVerb = pendingCount === 1 ? 'is' : 'are';
                procMessage = `Purchase ${purchaseNo}: ${approverName} approved. There ${beVerb} ${pendingCount} more ${personLabel} to approve.`;
            }

            if (procMessage) {
                await createNotificationWithPrivileges(
                    {
                        type: 'PurchaseProcurementNotice',
                        referenceModel: 'Purchase',
                        title: procTitle,
                        message: procMessage,
                        sentBy: employee._id?.toString(),
                        referenceId: purchaseRequest._id,
                        additionalData: { purchaseId }
                    },
                    {
                        privilegeKey: 'purchase',
                        checkFunction: (privileges, employeeId) =>
                            employeeId === procurementPersonId && privileges.purchase?.viewReport !== 'none'
                    },
                    socket,
                    { excludeSentByFromRecipients: false }
                );
            }
        }

        return res.status(200).json({
            success: true,
            message: `Purchase request ${status} successfully`,
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

export const getApprovalsByEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userToken = req.user;
        const { page = 1, row = 10 } = req.query;

        const pageNum = parseInt(page as string);
        const rowNum = parseInt(row as string);
        const skip = (pageNum - 1) * rowNum;

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        const pipeline: any[] = [
            {
                $match: {
                    isDeleted: false,
                    status: { $nin: [PurchaseRequestStatus.New, PurchaseRequestStatus.InProgress] }
                }
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "createdBy"
                }
            },
            {
                $unwind: "$createdBy"
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "createdBy.reportingTo",
                    foreignField: "_id",
                    as: "createdBy.reportingTo"
                }
            },
            {
                $unwind: {
                    path: "$createdBy.reportingTo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "approvalStatus.role",
                    foreignField: "_id",
                    as: "approvalRoles"
                }
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "approvalStatus.updatedBy",
                    foreignField: "_id",
                    as: "approvalEmployees"
                }
            },
            {
                $addFields: {
                    overallStatus: {
                        $let: {
                            vars: {
                                lastApproval: { $arrayElemAt: ["$approvalStatus", -1] }
                            },
                            in: "$$lastApproval.status"
                        }
                    }
                }
            },
            {
                $addFields: {
                    approvalStatus: {
                        $map: {
                            input: "$approvalStatus",
                            as: "approval",
                            in: {
                                $mergeObjects: [
                                    "$$approval",
                                    {
                                        role: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$approvalRoles",
                                                        cond: { $eq: ["$$this._id", "$$approval.role"] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        updatedBy: {
                                            $cond: {
                                                if: { $ne: ["$$approval.updatedBy", null] },
                                                then: {
                                                    $arrayElemAt: [
                                                        {
                                                            $filter: {
                                                                input: "$approvalEmployees",
                                                                cond: { $eq: ["$$this._id", "$$approval.updatedBy"] }
                                                            }
                                                        },
                                                        0
                                                    ]
                                                },
                                                else: null
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
                $addFields: {
                    nextPendingStep: {
                        $min: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$approvalStatus",
                                        cond: { $eq: ["$$this.status", "pending"] }
                                    }
                                },
                                as: "pending",
                                in: "$$pending.step"
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    isNextApprover: {
                        $anyElementTrue: {
                            $map: {
                                input: "$approvalStatus",
                                as: "approval",
                                in: {
                                    $and: [
                                        { $eq: ["$$approval.status", "pending"] },
                                        { $eq: ["$$approval.step", "$nextPendingStep"] },
                                        {
                                            $cond: {
                                                if: { $eq: ["$$approval.managerApproval", true] },
                                                then: { $eq: ["$createdBy.reportingTo._id", new ObjectId(employee._id)] },
                                                else: { $eq: ["$$approval.role._id", new ObjectId(employee.category._id)] }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            {
                $match: {
                    isNextApprover: true
                }
            },
            { $skip: skip },
            { $limit: rowNum }
        ];

        const purchaseRequests = await PurchaseRequest.aggregate(pipeline);
        const totalPipeline: any[] = [...pipeline.slice(0, -2)];
        totalPipeline.push({ $count: "total" });
        const totalResult = await PurchaseRequest.aggregate(totalPipeline);
        const total = totalResult.length > 0 ? totalResult[0].total : 0;

        if (purchaseRequests.length > 0) {
            return res.status(200).json({
                success: true,
                data: purchaseRequests,
                pagination: {
                    page: pageNum,
                    row: rowNum,
                    total: total,
                    totalPages: Math.ceil(total / rowNum)
                }
            });
        }

        return res.status(204).json({
            success: true,
            message: "No pending approvals found"
        });

    } catch (error) {
        console.error('Error fetching approvals:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch approvals",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

// Edit a PR
export const updatePurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        const updateData = req.body;

        // Remove fields that shouldn't be directly updated
        delete updateData.purchaseNo;
        delete updateData.createdAt;
        delete updateData.createdBy;
        delete updateData.isDeleted;

        for (const key of Object.keys(updateData)) {
            if (updateData[key] === '' && PurchaseRequest.schema.path(key)?.instance === 'ObjectId') {
                delete updateData[key];
            }
        }

        const existingPurchaseRequest = await PurchaseRequest.findById(id);
        if (!existingPurchaseRequest || existingPurchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        if (!updateData.currency && !existingPurchaseRequest.currency) {
            const job = await jobModel.findById(existingPurchaseRequest.jobId);
            if (job && job.quoteId) {
                const quotation = await Quotation.findById(job.quoteId);
                if (quotation && quotation.currency) {
                    updateData.currency = quotation.currency;
                }
            }
        }

        const wasUnsubmitted = existingPurchaseRequest.status === PurchaseRequestStatus.New || existingPurchaseRequest.status === PurchaseRequestStatus.InProgress;
        const isStatusChangingFromDraft = wasUnsubmitted &&
                                          updateData.status &&
                                          updateData.status !== PurchaseRequestStatus.New && updateData.status !== PurchaseRequestStatus.InProgress;
        // Saving an unsubmitted PR keeps it In Progress; it never drops back to New.
        if (wasUnsubmitted && !isStatusChangingFromDraft) updateData.status = PurchaseRequestStatus.InProgress;


        const isStatusChangingFromRejected = existingPurchaseRequest.status === PurchaseRequestStatus.Rejected && 
                                            updateData.status && 
                                            updateData.status === PurchaseRequestStatus.Pending;

        // Short marks are set from Compare & award, not the form, so a form save keeps them.
        if (Array.isArray(updateData.items)) {
            const shortById = new Map<string, any>();
            (existingPurchaseRequest.items || []).forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
                if (d.short) shortById.set(String(d._id), { short: true, shortReason: d.shortReason });
            }));
            updateData.items.forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
                const kept = d?._id && shortById.get(String(d._id));
                if (kept && d.short === undefined) Object.assign(d, kept);
            }));
        }

        // A request goes for approval only once every product is fully allocated, each chosen supplier priced, or marked short.
        if (isStatusChangingFromDraft || isStatusChangingFromRejected) {
            const lines: any[] = prLines(Array.isArray(updateData.items) ? updateData.items : existingPurchaseRequest.items)
                .filter((detail: any) => Number(detail.quantity) > 0);
            const open = unallocatedLines(lines);
            if (!lines.length || open.length) {
                return res.status(400).json({
                    success: false,
                    message: !lines.length ? "Add at least one product before sending for approval" : SUBMIT_GATE_MESSAGE(open.length),
                    status: 400
                });
            }
        }

        // Sending a PR for approval starts a fresh route on the Purchase Approval workflow, checked against the saved amount.
        if (isStatusChangingFromDraft || isStatusChangingFromRejected) {
            try {
                const approvalStatus = await getWorkflowSteps(
                    'purchaseApproval',
                    existingPurchaseRequest.createdBy.toString(),
                    purchaseApprovalContext({ ...existingPurchaseRequest.toObject(), ...updateData })
                );
                updateData.approvalStatus = approvalStatus;
                // Workflow conditions don't match this request, so no approval is required.
                if (approvalStatus.length === 0) updateData.status = PurchaseRequestStatus.Approved;
            } catch (error) {
                console.error('Error initializing workflow steps:', error);
            }
        }

        if (updateData.items && Array.isArray(updateData.items)) {
            updateData.items = updateData.items.map((item: any) => {
                if (item.itemDetails && Array.isArray(item.itemDetails)) {
                    item.itemDetails = item.itemDetails.map((detail: any) => {
                        const normalizedDetail = {
                            ...detail,
                            partNo: normalizePartNumberValue(detail.partNo)
                        };

                        // Ensure unitSellingPrice is preserved from job if available
                        if (detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null && detail.unitSellingPrice !== '') {
                            const sellingPrice = parseFloat(detail.unitSellingPrice);
                            if (!isNaN(sellingPrice)) {
                                normalizedDetail.unitSellingPrice = sellingPrice;
                            }
                        } else if (detail.unitCost !== undefined && detail.unitCost !== null) {
                            // If unitSellingPrice is not provided, use unitCost as fallback
                            normalizedDetail.unitSellingPrice = parseFloat(detail.unitCost) || 0;
                        }

                        if (detail.comparisons && Array.isArray(detail.comparisons)) {
                            normalizedDetail.comparisons = detail.comparisons.map((comparison: any) => {
                                if (!comparison.createdBy) {
                                    comparison.createdBy = employee._id;
                                }
                                return comparison;
                            });
                        }

                        return normalizedDetail;
                    });
                }
                return item;
            });
        }

        // Add updated metadata
        updateData.updatedBy = employee._id;
        updateData.updatedAt = new Date();

        const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedPurchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        if (isStatusChangingFromDraft || isStatusChangingFromRejected) {
            await recordComparisonPrices(updatedPurchaseRequest, employee._id);
            await logPrAudit(req, updatedPurchaseRequest, isStatusChangingFromRejected ? 'resubmitted' : 'submitted',
                `${isStatusChangingFromRejected ? 'Resubmitted' : 'Sent'} for approval${updatedPurchaseRequest.status === PurchaseRequestStatus.Approved ? ' (no approval needed)' : ''}`);
        }

        if (updateData.status === PurchaseRequestStatus.Pending) {
            await jobModel.updateOne({ _id: existingPurchaseRequest.jobId, allocateStatus: { $ne: allocateStatus.OnHold } }, {
                $set: {
                    allocateStatus: allocateStatus.WorkInProgress,
                    updatedDate: new Date()
                }
            });

            const socket = req.app.get('io') as Server;
            await createNotificationWithPrivileges(
                {
                    type: 'PurchaseApprovalRequest',
                    referenceModel: 'Purchase',
                    title: 'Purchase submitted for approval',
                    message: `Purchase ${updatedPurchaseRequest.purchaseNo} has been submitted for approval`,
                    sentBy: employee._id?.toString(),
                    referenceId: updatedPurchaseRequest._id,
                    additionalData: { purchaseId: updatedPurchaseRequest._id.toString() }
                },
                {
                    privilegeKey: 'purchase',
                    checkFunction: (privileges) => {
                        return privileges.purchase?.canApprovePR === true;
                    }
                },
                socket
            );
        }

        return res.status(200).json({
            success: true,
            message: "Purchase request updated successfully",
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// // Soft delete a PR
// export const deletePurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;

//         const purchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             {
//                 isDeleted: true,
//                 updatedBy: req.user?._id,
//                 updatedAt: new Date()
//             },
//             { new: true }
//         );

//         if (!purchaseRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Purchase request not found or already deleted",
//                 status: 404
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Purchase request deleted successfully",
//             status: 200
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// // Update supplier discount
// export const updateSupplierDiscount = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;
//         const { discounts } = req.body;

//         if (!discounts || !Array.isArray(discounts)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Valid discounts array is required",
//                 status: 400
//             });
//         }

//         const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             {
//                 discounts,
//                 updatedBy: req.user?._id,
//                 updatedAt: new Date()
//             },
//             { new: true }
//         );

//         if (!updatedPurchaseRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Purchase request not found",
//                 status: 404
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Supplier discounts updated successfully",
//             data: updatedPurchaseRequest,
//             status: 200
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// Get purchase requests by job ID
export const getPurchaseRequestsByJobId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: "Job ID is required",
                status: 400
            });
        }

        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
                status: 401
            });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.purchase?.viewReport 
            ? await buildPrivilegeAccessFilter(employee._id, privileges.purchase.viewReport, 'createdBy')
            : {};

        const purchaseRequests = await PurchaseRequest.aggregate([
            {
                $match: {
                    jobId: new ObjectId(jobId),
                    isDeleted: false,
                    ...accessFilter
                }
            },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                    pipeline: [{ $project: { password: 0 } }]
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                totalPurchase: "$mrRequest.totalPurchase",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE"
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'rejectedReason.rejectedBy',
                    foreignField: '_id',
                    as: 'rejectedByDetails'
                }
            },
            {
                $addFields: {
                    rejectedReason: {
                        $map: {
                            input: '$rejectedReason',
                            as: 'reason',
                            in: {
                                $mergeObjects: [
                                    '$$reason',
                                    {
                                        rejectedBy: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$rejectedByDetails',
                                                        cond: { $eq: ['$$this._id', '$$reason.rejectedBy'] }
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
                $project: {
                    mrEngineer: 0,
                    hasMr: 0,
                    rejectedByDetails: 0
                }
            },
            { $sort: { createdAt: -1 } }
        ]);

        return res.status(200).json({
            success: true,
            data: purchaseRequests,
        });
    } catch (error) {
        next(error);
    }
};

export const getConvertibleJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
            });
        }

        const jobs = await jobModel.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    allocateStatus: allocateStatus.OpenToWork
                    // procurementPerson filter removed for now
                }
            },
            {
                $lookup: {
                    from: 'purchases',
                    localField: '_id',
                    foreignField: 'jobId',
                    as: 'purchaseRequests'
                }
            },
            {
                $addFields: {
                    hasPurchaseRequest: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: '$purchaseRequests',
                                        as: 'pr',
                                        cond: { $eq: ['$$pr.isDeleted', false] }
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            },
            {
                $match: {
                    hasPurchaseRequest: false
                }
            },
            {
                $sort: { createdDate: -1 }
            },
            {
                $project: {
                    _id: 1,
                    jobId: 1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            jobs: jobs
        });
    } catch (error) {
        next(error);
    }
};


/** Super Admin gives a pending purchase request a fresh approval route. Unticked stages are skipped for this request only. */
export const resetPurchaseWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const me = await getEmployeeData(req.user);
        if (!/^superadmin$/i.test((me?.category as any)?.role || '')) {
            return res.status(403).json({ message: 'Only a Super Admin can reset the purchase approval workflow' });
        }
        const purchaseRequest = await PurchaseRequest.findById(req.params.id);
        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({ message: 'Purchase request not found' });
        }
        if (purchaseRequest.status !== PurchaseRequestStatus.Pending) {
            return res.status(400).json({ message: `Only a pending purchase request can be reset (this one is ${purchaseRequest.status})` });
        }
        const chosen: string[] | null = Array.isArray(req.body.stepRoleIds) ? req.body.stepRoleIds.map(String) : null;
        const route = await rebuildPendingRoute('purchaseApproval', String(purchaseRequest.createdBy), purchaseApprovalContext(purchaseRequest), purchaseRequest.approvalStatus as any[], chosen);
        purchaseRequest.approvalStatus = route as any;
        purchaseRequest.updatedBy = me._id;
        purchaseRequest.updatedAt = new Date();
        await purchaseRequest.save();
        await logPrAudit(req, purchaseRequest, 'workflow-reset', 'Approval workflow reset');
        return res.status(200).json({ success: true, message: 'Purchase approval workflow reset' });
    } catch (error) {
        next(error);
    }
};

const EDITABLE_PR_STATUSES = [PurchaseRequestStatus.New, PurchaseRequestStatus.InProgress, PurchaseRequestStatus.Rejected] as string[];

/**
 * Chooses suppliers for request lines, straight on the lines' comparisons.
 * Body: `{ awards: [{ lineKey, supplierId, qty?, unitPrice?, supplierName?, clear? }] }`.
 */
export const awardPurchaseLines = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData(req.user);
        const purchase: any = await PurchaseRequest.findOne({ _id: req.params.id, isDeleted: false });
        if (!purchase) return res.status(404).json({ success: false, message: "Purchase request not found" });
        if (!EDITABLE_PR_STATUSES.includes(purchase.status)) {
            return res.status(409).json({ success: false, message: "This request is with the approvers, so suppliers can no longer change." });
        }
        const awards: LineAward[] = Array.isArray(req.body?.awards) ? req.body.awards : [];
        if (!awards.length) return res.status(400).json({ success: false, message: "Nothing to award." });
        for (const award of awards) {
            if (!award?.supplierId || !ObjectId.isValid(String(award.supplierId))) {
                return res.status(400).json({ success: false, message: "Pick a supplier." });
            }
            if (!award.supplierName && !award.clear) {
                award.supplierName = (await supplierModel.findById(award.supplierId).select('supplierName').lean() as any)?.supplierName;
            }
            const error = applyLineAward(purchase, award, employee?._id);
            if (error) return res.status(400).json({ success: false, message: error });
        }
        purchase.totalLpo = prLines(purchase.items).reduce((sum: number, d: any) => sum + (Number(d.quantity) || 0) * (Number(d.unitCost) || 0), 0);
        if (employee) purchase.updatedBy = employee._id;
        purchase.updatedAt = new Date();
        purchase.markModified('items');
        await purchase.save({ validateModifiedOnly: true });
        return res.status(200).json({ success: true, message: "Award saved", data: purchase });
    } catch (error) {
        next(error);
    }
};

/** The last price of each supplier for these products (PO price first, else the last comparison price). Query: `productIds`, `supplierIds`, `currency` (comma lists). */
export const getSupplierPrices = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const list = (v: any) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
        const data = await findPrices(list(req.query.productIds), list(req.query.supplierIds), req.query.currency ? String(req.query.currency) : undefined);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
