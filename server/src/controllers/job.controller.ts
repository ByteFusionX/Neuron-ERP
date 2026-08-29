import { NextFunction, Request, Response } from "express"
import jobModel, { allocateStatus, allocateType } from "../models/job.model"
import Employee from '../models/employee.model';
import { newTrash } from '../controllers/trash.controller';
import { calculateDiscountPrice, calculateDiscountPricePipe, getAllReportedEmployees, getUSDRated, getEmployeeData } from "../common/utils/util";
import technicalModel from '../models/technical.model';
import PurchaseRequest from '../models/purchaseRequest.model';
import PurchaseOrder from '../models/purchaseOrder.model';
import DeliveryNote from '../models/deliveryNote.model';
import GRN from '../models/grn.model';
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";


const { ObjectId } = require('mongodb')

export const jobList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, search, row, status, salesPerson, selectedMonth, selectedYear, access, userId, allocateStatus } = req.body;
        let isStatus = status == null ? true : false;
        let isSalesPerson = salesPerson == null ? true : false;
        let skipNum: number = (page - 1) * row;

        let matchFilters: any = {
            isDeleted: { $ne: true },
            allocateStatus,
            $and: [
                {
                    $or: [
                        { jobId: { $regex: search, $options: 'i' } },
                        { 'clientDetails.companyName': { $regex: search, $options: 'i' } }
                    ]
                },
                { $or: [{ status: status }, { status: { $exists: isStatus } }] },
                { $or: [{ 'quotation.dealData.dealId': { $exists: true } }, { 'quotation.dealData': { $exists: true } }] }
            ]
        };

        let sortAggregate = {}
        

        if (allocateStatus == "OpenToWork") {
            sortAggregate = { updatedDate : -1 }
        }else {
            sortAggregate = { createdDate : -1 }
        }

        console.log(sortAggregate)

        if (selectedMonth && selectedYear) {
            let startDate = new Date(selectedYear, selectedMonth - 1, 1);
            let endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
            matchFilters.$and.push({ createdDate: { $gte: startDate, $lte: endDate } });
        } else if (selectedYear) {
            let startDate = new Date(selectedYear, 0, 1);
            let endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
            matchFilters.$and.push({ createdDate: { $gte: startDate, $lte: endDate } });
        }

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
            accessFilter = { $or: [accessFilter, { 'procurementPerson._id': new ObjectId(userId) }] };
        }

        const qatarUsdRate = await getUSDRated();

        const jobData = await jobModel.aggregate([
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $unwind: "$quotation"
            },
            {
                $match: { $or: [{ 'quotation.createdBy': new ObjectId(salesPerson) }, { 'quotation.createdBy': { $exists: isSalesPerson } }] }
            },
            {
                $lookup: { from: 'customers', localField: 'quotation.client', foreignField: '_id', as: 'clientDetails' }
            },
            {
                $unwind: "$clientDetails"
            },
            {
                $sort: sortAggregate
            },
            {
                $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'departmentDetails' }
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPersonDetails' }
            },
            {
                $lookup: { from: 'employees', localField: 'procurementPerson', foreignField: '_id', as: 'procurementPerson' }
            },
            { $unwind: { path: '$procurementPerson', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'quotation.dealData.additionalCosts.supplierId',
                    foreignField: '_id',
                    as: 'costSupplierDetails'
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
                $project: {
                    purchaseRequests: 0
                }
            },
            {
                $match: { ...accessFilter, ...matchFilters }
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
        ]);


        const jobTotal = await jobModel.aggregate([

            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $unwind: "$quotation"
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPersonDetails' }
            },
            {
                $lookup: { from: 'employees', localField: 'procurementPerson', foreignField: '_id', as: 'procurementPerson' }
            },
            { $unwind: { path: '$procurementPerson', preserveNullAndEmptyArrays: true } },
            {
                $match: { $or: [{ 'quotation.createdBy': new ObjectId(salesPerson) }, { 'quotation.createdBy': { $exists: isSalesPerson } }] }
            },
            {
                $lookup: { from: 'customers', localField: 'quotation.client', foreignField: '_id', as: 'clientDetails' }
            },
            {
                $unwind: "$clientDetails"
            },
            {
                $match: { ...accessFilter, ...matchFilters }
            },
            {
                $addFields: {
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

            },
        ]).exec();

        const totalValues = jobTotal.reduce((acc, job) => {
            acc += job?.lpoValue;
            return acc;
        }, 0);


        return res.status(200).json({ total: jobTotal.length, totalLpo: totalValues, job: jobData });
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
        const jobUpdated = await jobModel.findByIdAndUpdate(jobId, { status: status, updatedDate: Date.now() })

        if (jobUpdated) {
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
        const job = await jobModel.findOne({
            _id: dataId,
        });

        if (!job) {
            return res.status(404).json({
                message: 'Job not found or already deleted'
            });
        }

        // Soft delete the job
        await jobModel.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Job', dataId, employeeId)

        return res.status(200).json({
            success: true,
            message: 'Job deleted successfully'
        });
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
        const { id, allocationType, procurementPerson } = req.body;

        // Validate required fields
        if (!id || !allocationType) {
            return res.status(400).json({
                success: false,
                message: 'ID and allocation type are required'
            });
        }

        // Validate if allocationType is a valid enum value
        if (!Object.values(allocateType).includes(allocationType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid allocation type'
            });
        }

        const updateData: any = {
            allocateType: allocationType,
            allocateStatus: allocateStatus.OpenToWork,
            updatedDate: new Date()
        };

        if (procurementPerson) {
            updateData.procurementPerson = procurementPerson;
        }

        // Update the job with new allocationType and set allocateStatus to OpenToWork
        const updateJob = await jobModel.findByIdAndUpdate(
            { _id: id },
            updateData,
            {
                new: true, // Return the updated document
            }
        );

        if (!updateJob) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (procurementPerson) {
            const socket = req.app.get('io') as Server;
            const userData = await getEmployeeData(req.user);
            await createNotificationWithPrivileges(
                {
                    type: 'JobAllocated',
                    referenceModel: 'Job',
                    title: 'New Job Allocated',
                    message: `Job ${req.body.jobId || updateJob._id} has been allocated to you for procurement`,
                    sentBy: userData?._id?.toString(),
                    referenceId: updateJob._id,
                    additionalData: { jobId: updateJob._id.toString() }
                },
                {
                    privilegeKey: 'purchase',
                    checkFunction: (privileges, employeeId) => {
                        return employeeId === procurementPerson.toString() &&
                               privileges.purchase?.viewReport !== 'none';
                    }
                },
                socket
            );
        }

        res.status(200).json({
            success: true,
            message: 'Allocation type updated successfully',
            data: updateJob
        });

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

        const existingPurchaseRequest = await PurchaseRequest.findOne({
            jobId: existingJob._id,
            isDeleted: false
        });
        if (existingPurchaseRequest) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reassign procurement person: a purchase requisition has already been started for this job'
            });
        }

        const updateJob = await jobModel.findByIdAndUpdate(
            { _id: jobId },
            {
                procurementPerson: procurementPersonId,
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

        const newProcurementId = procurementPersonId.toString();
        const previousProcurementId = existingJob.procurementPerson?.toString();
        if (newProcurementId !== previousProcurementId) {
            const socket = req.app.get('io') as Server;
            await createNotificationWithPrivileges(
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
            );
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

export const getUnassignedProjectAndAMCJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId, companyName, subject, salesPersonDetails, departmentDetails, quoteId, dealId, page = 1, row = 10 } = req.body;
        const allocateTypeFilter = req.body.allocateType
        
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
                $match: {
                    ...matchFilters,
                    ...(companyName && { 'clientDetails.companyName': { $regex: companyName, $options: 'i' } }),
                    ...(subject && { 'quotation.subject': { $regex: subject, $options: 'i' } }),
                    ...(salesPersonDetails && { 'salesPersonDetails._id': new ObjectId(salesPersonDetails) }),
                    ...(departmentDetails && { 'departmentDetails._id': new ObjectId(departmentDetails) }),
                    ...(quoteId && { 'quotation.quoteId': { $regex: quoteId, $options: 'i' } }),
                    ...(dealId && { 'quotation.dealData.dealId': { $regex: dealId, $options: 'i' } })
                }
            },
            {
                $sort: { updatedDate: -1 }
            }
        ];

        const countPipeline = [...pipeline];
        countPipeline.push({ $count: "total" });

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

        await jobModel.findByIdAndUpdate(jobId, {
            $set: {
                allocateStatus: allocateStatus.Completed,
                updatedDate: new Date()
            }
        });
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
                eventType: pr.status === 'Drafted' ? 'drafted' : 'created',
                title: `Purchase Request ${pr.purchaseNo} ${pr.status === 'Drafted' ? 'Drafted' : 'Created'}`,
                description: `Purchase Request ${pr.purchaseNo} was ${pr.status === 'Drafted' ? 'drafted' : 'created'}`,
                performedBy: pr.createdBy ? {
                    _id: (pr.createdBy as any)._id,
                    firstName: (pr.createdBy as any).firstName,
                    lastName: (pr.createdBy as any).lastName
                } : null,
                metadata: {
                    prNo: pr.purchaseNo,
                    status: pr.status
                },
                status: pr.status === 'Drafted' ? 'info' : 'info'
            });

            if (pr.status !== 'Drafted' && pr.approvalStatus && pr.approvalStatus.length > 0) {
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

            const purchaseOrders = await PurchaseOrder.find({
                purchaseId: pr._id
            })
            .populate('createdBy', 'firstName lastName')
            .populate('approvedHistory.approvedBy', 'firstName lastName')
            .populate('rejectedHistory.rejectedBy', 'firstName lastName')
            .populate('supplierId', 'supplierName')
            .sort({ createdAt: 1 });

            summary.totalPOs += purchaseOrders.length;

            for (const po of purchaseOrders) {
                if (po.poStatus === 'Approved') summary.approvedPOs++;
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

                const grns = await GRN.find({
                    purchaseOrderId: po._id,
                    isDeleted: { $ne: true }
                })
                .populate('createdBy', 'firstName lastName')
                .sort({ createdAt: 1 });

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

        const technical = await technicalModel.findOne({
            jobId: new ObjectId(jobId)
        })
        .populate('assignedBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName')
        .populate('materialRequest.statusHistory.changedBy', 'firstName lastName')
        .populate('materialRequestAttachements.statusHistory.changedBy', 'firstName lastName')
        .populate('issues.closedBy', 'firstName lastName');

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

        const deliveryNotes = await DeliveryNote.find({
            jobId: new ObjectId(jobId)
        })
        .populate('createdBy', 'firstName lastName')
        .sort({ createdDate: 1 });

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
