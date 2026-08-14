import { NextFunction, Request, Response } from "express";
import { PurchaseRequestStatus } from "../models/purchaseRequest.model";
import PurchaseRequest from '../models/purchaseRequest.model'
import jobModel, { allocateStatus } from "../models/job.model";
import supplierModel from "../models/supplier.model";
import Quotation from "../models/quotation.model";
import { getEmployeeData, calculateDiscountPricePipe, calculateCostPricePipe, getUSDRated, buildPrivilegeAccessFilter } from "../common/utils/util";
import { getWorkflowSteps, updateApprovalStatus } from "../services/workflow.service";
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";
import technicalModel from "../models/technical.model";
import Employee from "../models/employee.model";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const normalizePartNumberValue = (value: any) => {
    if (!value) return undefined;
    const candidate = typeof value === 'object' && value !== null ? value._id || value.id || value.value : value;
    if (!candidate || !ObjectId.isValid(candidate)) return undefined;
    return new ObjectId(candidate);
};

// Create a new Purchase Request
export const createPurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
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
        if (!privileges?.purchase?.create) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to convert jobs to purchase",
                status: 403
            });
        }

        const {
            jobId,
            purchaseNo,
            dealSheetId,
            status,
        } = req.body;

        if (!jobId || !purchaseNo || !dealSheetId || !status) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
                status: 400
            });
        }

        const job = await jobModel.findById(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
                status: 404
            });
        }

        let currency;
        if (job.quoteId) {
            const quotation = await Quotation.findById(job.quoteId);
            if (quotation && quotation.currency) {
                currency = quotation.currency;
            }
        }

        const requestData = {...req.body, createdBy: employee._id};
        if (currency) {
            requestData.currency = currency;
        }
        
        if (!requestData.procurementPerson && job.procurementPerson) {
            requestData.procurementPerson = job.procurementPerson;
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

        if (status && status !== PurchaseRequestStatus.Drafted) {
            try {
                const approvalStatus = await getWorkflowSteps('purchaseApproval', employee._id.toString());
                requestData.approvalStatus = approvalStatus;
            } catch (error) {
                console.error('Error initializing workflow steps:', error);
            }
        }

        const newPurchaseRequest = new PurchaseRequest(requestData);
        const savedPurchaseRequest = await newPurchaseRequest.save();
        await jobModel.updateOne({ _id: jobId }, { $set: { status: `Purchase ${savedPurchaseRequest.status !== 'Drafted' ? 'Requested' : savedPurchaseRequest.status}` } })

        await jobModel.findByIdAndUpdate(jobId, {
            $set: {
                allocateStatus: allocateStatus.WorkInProgress,
                updatedDate: new Date()
            }
        });

        console.log(savedPurchaseRequest.status);

        if (savedPurchaseRequest.status && savedPurchaseRequest.status !== PurchaseRequestStatus.Drafted) {
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

export const getPurchaseRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, status, fromDate, toDate, companyName, purchaseNo, jobId, firstName } = req.body;
        const pageNumber = Number(page) || 1;
        const pageSize = Number(row) || 10;

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
            matchStage.purchaseNo = { $regex: purchaseNo, $options: 'i' }
        }

        if (firstName) {
            matchStage['createdBy.firstName'] = { $regex: firstName, $options: 'i' }
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
                    as: 'createdBy'
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
                            if: { $eq: ["$status", "Drafted"] },
                            then: "drafted",
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
            // Match for nested fields (requires the earlier $lookup/$unwind of customerId/jobId)
            {
                $match: {
                    ...(companyName && { "customerId.companyName": { $regex: companyName, $options: 'i' } }),
                    ...(jobId && { "jobId.jobId": { $regex: jobId, $options: 'i' } })
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
            { $sort: { [sortField]: -1 } },
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
                    as: 'createdBy'
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

        if (purchaseRequest.status === 'Drafted' || !purchaseRequest.status) {
            updateData.status = 'Drafted';
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

export const updatePurchaseComparisons = async (req: Request, res: Response, next: NextFunction) => {
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

        if (purchaseRequest.status === 'Drafted' || !purchaseRequest.status) {
            updateData.status = 'Drafted';
        }

        const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Purchase comparisons updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

export const updatePurchaseSupplierDiscounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tokenData = req.user;
        const employee = await getEmployeeData(tokenData);
        const { supplierDiscounts } = req.body;

        if (!supplierDiscounts) {
            return res.status(400).json({
                success: false,
                message: "Supplier discounts are required",
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

        let totalDiscount = 0;
        if (supplierDiscounts.suppliers && Array.isArray(supplierDiscounts.suppliers)) {
            supplierDiscounts.suppliers.forEach((supplier: any) => {
                totalDiscount += supplier.discount || 0;
            });
        }

        const updateData: any = {
            supplierDiscounts: {
                ...supplierDiscounts,
                totalDiscount
            },
            updatedBy: employee._id,
            updatedAt: new Date()
        };

        if (purchaseRequest.status === 'Drafted' || !purchaseRequest.status) {
            updateData.status = 'Drafted';
        }

        const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Supplier discounts updated successfully",
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

        if (purchaseRequest.status === 'Drafted' || !purchaseRequest.status) {
            updateData.status = 'Drafted';
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
                    as: 'createdBy'
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
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

        for (const item of populatedPurchaseRequest.items) {
            for (const itemDetail of item.itemDetails) {
                for (const comparison of itemDetail.comparisons) {
                    const supplier = await supplierModel.findById(comparison.supplierId);
                    if (supplier) {
                        comparison.supplierName = supplier.supplierName;
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

// Generate a new purchase number
export const generatePurchaseNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        const latestPR = await PurchaseRequest.findOne().sort({ purchaseNo: -1 });
        let nextNumber = 1;

        if (latestPR) {
            const parts = latestPR.purchaseNo.split('-');
            const lastCounter = parseInt(parts[3]);
            nextNumber = lastCounter + 1;
        }

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
        if (status === 'approved' && !privileges?.purchase?.canApprovePR) {
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

        const purchaseRequest = await PurchaseRequest.findById(id).populate('approvalStatus.role').populate('createdBy');
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

        const updatedApprovalStatus = await updateApprovalStatus(status, purchaseRequest.approvalStatus, comment || '', employee);
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

        const updatedPurchaseRequest = await PurchaseRequest.findById(id)
            .populate('createdBy')
            .populate('approvalStatus.role')
            .populate('approvalStatus.updatedBy');

        const socket = req.app.get('io') as Server;

        if (!isAllApproved && !hasRejected && hasPending && status === 'approved') {
            const pendingStatuses = updatedApprovalStatus
                .filter((approval: any) => approval.status === 'pending')
                .sort((a: any, b: any) => a.step - b.step);

            const nextApproval = pendingStatuses[0];

            if (nextApproval) {
                const nextApproverIds = new Set<string>();
                const isManagerStep = !!nextApproval.managerApproval;

                if (isManagerStep) {
                    const requester = await Employee.findById(purchaseRequest.createdBy)
                        .populate('reportingTo')
                        .lean();
                    const manager: any = (requester as any)?.reportingTo;
                    if (manager?._id) {
                        nextApproverIds.add(manager._id.toString());
                    }
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

                                if (isManagerStep) {
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
            (await jobModel.findById(purchaseRequest.jobId).select('procurementPerson').lean())?.procurementPerson?.toString?.();

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
                    status: { $ne: PurchaseRequestStatus.Drafted }
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

        const isStatusChangingFromDraft = existingPurchaseRequest.status === PurchaseRequestStatus.Drafted && 
                                          updateData.status && 
                                          updateData.status !== PurchaseRequestStatus.Drafted;


        const isStatusChangingFromRejected = existingPurchaseRequest.status === PurchaseRequestStatus.Rejected && 
                                            updateData.status && 
                                            updateData.status === PurchaseRequestStatus.Pending;

        if (isStatusChangingFromDraft) {
            try {
                const approvalStatus = await getWorkflowSteps('purchaseApproval', existingPurchaseRequest.createdBy.toString());
                updateData.approvalStatus = approvalStatus;
            } catch (error) {
                console.error('Error initializing workflow steps:', error);
            }
        }

        if (isStatusChangingFromRejected) {
            const rejectedIndex = existingPurchaseRequest.approvalStatus.findIndex((status: any) => status.status === 'rejected');
            if (rejectedIndex !== -1) {
                try {
                    const newApprovalStatus = await getWorkflowSteps('purchaseApproval', existingPurchaseRequest.createdBy.toString());
                    updateData.approvalStatus = [...existingPurchaseRequest.approvalStatus, ...newApprovalStatus];
                } catch (error) {
                    console.error('Error initializing workflow steps for resubmission:', error);
                }
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

        if (updateData.status === PurchaseRequestStatus.Pending) {
            await jobModel.findByIdAndUpdate(existingPurchaseRequest.jobId, {
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

// // Update comparison summary
// export const updateComparisonSummary = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;
//         const { comparisonSummary } = req.body;

//         if (!comparisonSummary) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Comparison summary is required",
//                 status: 400
//             });
//         }

//         const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             {
//                 // comparisonSummary,
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
//             message: "Comparison summary updated successfully",
//             data: updatedPurchaseRequest,
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
                    as: 'createdBy'
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
        const jobs = await jobModel.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    allocateStatus: allocateStatus.OpenToWork
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