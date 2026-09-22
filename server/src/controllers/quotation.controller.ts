import { NextFunction, Response, Request } from "express";
import Quotation, { quoteStatus } from '../models/quotation.model';
import { canTransitionQuoteStatus, isKnownQuoteStatus, quoteStatusRequiresReason } from '../common/quote-status-transitions';
import Job, { allocateStatus } from '../models/job.model';
import Department from '../models/department.model';
import Employee from '../models/employee.model'
import Customer from '../models/customer.model';
import Enquiry from "../models/enquiry.model";
import Product from "../models/products.model";
import ProductCategory from "../models/productCategory.model";
import { Server } from "socket.io";
import { calculateDiscountPrice, getAllReportedEmployees, getEmployeeData, getUSDRated } from "../common/utils/util";
const { ObjectId } = require('mongodb');
import { newTrash } from '../controllers/trash.controller'
import { removeFile } from '../common/utils/util'
import { deleteFileFromAws, uploadFileToAws } from '../common/aws-connect';
import Event from '../models/events.model'
import { createNotificationWithPrivileges } from "./notification.controller";
import { getNextSequence } from "../models/counter.model";

/**
 * Marks the source enquiry as Quoted the first time a quotation leaves Draft.
 * Creating a quote directly at a non-draft status handles this inline in `saveQuotation`;
 * this covers the draft-then-promote path, where the flip is deliberately deferred.
 */
const markEnquiryQuotedIfPromoted = async (quote: any, fromStatus?: string, toStatus?: string) => {
    if (!quote?.enqId) return;
    if (fromStatus !== quoteStatus.Draft || !toStatus || toStatus === quoteStatus.Draft) return;
    await Enquiry.findByIdAndUpdate(quote.enqId, { status: 'Quoted' });
}

// An enquiry still with presales has no finished estimation, so it can't be quoted yet.
const PRESALE_IN_PROGRESS_STATUSES = ['Assigned To Presale Manager', 'Assigned To Presale Engineer', 'Assigned To Presales', 'Rejected by Presale Engineer', 'Rejected by Presale Manager'];

export const saveQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        const userToken = req.user;

        if (quoteData.enqId) {
            const linkedEnquiry = await Enquiry.findById(quoteData.enqId, { status: 1 }).lean();
            if (linkedEnquiry && PRESALE_IN_PROGRESS_STATUSES.includes(linkedEnquiry.status)) {
                return res.status(409).json({ success: false, message: 'This enquiry is still with presales. Complete the presales workflow before creating a quote.' });
            }
        }

        
        const createdBy = await getEmployeeData(userToken)
        quoteData.createdBy = createdBy._id
        normalizeQuoteDepartments(quoteData)

        let quoteId: string | undefined = await generateQuoteId(quoteData.department, quoteData.createdBy, quoteData.date);
        if (!quoteId && quoteData.status === quoteStatus.Draft) {
            const draftIncrementedNum = await getNextSequence('quoteId', seedQuoteIdSequence);
            quoteId = `DRAFT-${draftIncrementedNum}`;
        }
        quoteData.quoteId = quoteId;
        quoteData.editHistory = [{
            editedBy: createdBy._id,
            editedAt: new Date(),
            action: 'Created',
            toStatus: quoteData.status,
        }];

        const quote = new Quotation(quoteData)

        const saveQuote = await (await quote.save()).populate('department')

        if (quoteData.enqId) {
            const enquiry = await Enquiry.findById(quoteData.enqId);
            if (enquiry) {
                // A draft is not a quotation the customer has seen, so the enquiry keeps its current
                // status until the quote leaves Draft (see `updateQuotationStatus`). Flipping it early
                // would drop the enquiry out of the pending lists, which filter on status != 'Quoted'.
                if (quoteData.status !== quoteStatus.Draft) {
                    await Enquiry.findByIdAndUpdate(quoteData.enqId, { status: 'Quoted' });
                }
            } else {
                console.log(`Enquiry with ID ${quoteData.enqId} not found.`);
            }
        } else {
            delete quoteData.enqId;
        }

        if (saveQuote) {
            return res.status(200).json(saveQuote)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}


// Joins shared by the quotation list and the single-quotation fetch so both return the same populated shape.
const quotationLookupStages = [
    {
        $lookup: {
            from: 'customers',
            localField: 'client',
            foreignField: '_id',
            as: 'client'
        }
    },
    {
        $unwind: '$client'
    },
    {
        $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'department'
        }
    },
    {
        $unwind: '$department',
    },
    {
        $lookup: {
            from: 'departments',
            localField: 'departments',
            foreignField: '_id',
            as: 'departments'
        }
    },
    {
        $lookup: {
            from: 'employees',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdBy'
        }
    },
    {
        $unwind: '$createdBy',
    },
    {
        $lookup: {
            from: 'enquiries',
            localField: 'enqId',
            foreignField: '_id',
            as: 'enqId'
        }
    },
    {
        $unwind: {
            path: '$enqId',
            preserveNullAndEmptyArrays: true
        }
    },
    {
        $lookup: {
            from: 'employees',
            localField: 'enqId.salesPerson',
            foreignField: '_id',
            pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
            as: 'enqSalesPerson'
        }
    },
    {
        $addFields: {
            enqId: {
                $cond: [
                    { $ifNull: ['$enqId', false] },
                    { $mergeObjects: ['$enqId', { salesPerson: { $arrayElemAt: ['$enqSalesPerson', 0] } }] },
                    '$$REMOVE'
                ]
            }
        }
    },
    { $unset: 'enqSalesPerson' },
    {
        $addFields: {
            attention: {
                $arrayElemAt: [
                    {
                        $filter: {
                            input: '$client.contactDetails',
                            as: 'contact',
                            cond: {
                                $eq: ['$$contact._id', '$attention']
                            }
                        }
                    },
                    0
                ]
            }
        }
    },
    {
        $lookup: {
            from: 'suppliers',
            localField: 'dealData.additionalCosts.supplierId',
            foreignField: '_id',
            as: 'costSupplierDetails'
        }
    },
    {
        $addFields: {
            'dealData.additionalCosts': {
                $map: {
                    input: '$dealData.additionalCosts',
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
    }
];

export const getQuotations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, search, row, salesPerson, customer, fromDate, toDate, department, quoteStatus, dealStatus, access, userId, sortKey, sortDir } = req.body;

        page = Math.max(1, parseInt(page) || 1);
        row = Math.min(100, Math.max(1, parseInt(row) || 10));
        let skipNum: number = (page - 1) * row;

        const sortableFields: Record<string, string> = { date: 'date', quoteId: 'quoteId', status: 'status' };
        const sortStage: Record<string, 1 | -1> = sortKey && sortableFields[sortKey]
            ? { [sortableFields[sortKey]]: sortDir === 'desc' ? -1 : 1 }
            : { _id: -1 };

        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isDepartment = department == null ? true : false;

        let matchFilters = {
            isDeleted: { $ne: true },
            status: { $ne: 'revised' },
            $and: [
                ...(quoteStatus ? [{ status: quoteStatus }] : []),
                ...(dealStatus ? [{ 'dealData.status': dealStatus }] : []),
                { quoteId: { $regex: search, $options: 'i' } },
                { $or: [{ createdBy: new ObjectId(salesPerson) }, { createdBy: { $exists: isSalesPerson } }] },
                { $or: [{ client: new ObjectId(customer) }, { client: { $exists: isCustomer } }] },
                {
                    $or: [
                        { $and: [{ date: { $gte: new Date(fromDate) } }, { date: { $lte: new Date(toDate) } }] },
                        { date: { $exists: isDate } }
                    ]
                },
                {
                    $or: [{ department: new ObjectId(department) }, { department: { $exists: isDepartment } }]
                }
            ]
        }

        let accessFilter = {};

        if (access === 'reported' || access === 'createdAndReported') {
            let reportedToUserIds = await getAllReportedEmployees(userId);
            if (access === 'createdAndReported') {
                reportedToUserIds.push(new ObjectId(userId));
            }
            accessFilter = { createdBy: { $in: reportedToUserIds } };
        } else if (access === 'created') {
            accessFilter = { createdBy: new ObjectId(userId) };
        }

        const filters = { $and: [matchFilters, accessFilter] }

        let total: number = 0;
        await Quotation.aggregate([
            {
                $match: filters
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { total: 1, _id: 0 }
            },
        ]).exec()
            .then((result: { total: number }[]) => {
                if (result && result.length > 0) {
                    total = result[0].total
                }
            })

        let quoteData = await Quotation.aggregate([
            {
                $match: filters,
            },
            {
                $sort: sortStage
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            ...quotationLookupStages
        ]);

        return res.status(200).json({ total: total, quotations: quoteData ?? [] })

    } catch (error) {
        console.log(error)
    }
}

export const getQuotationById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { access, userId } = req.body ?? {};

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid quotation id' });
        }

        // Same access scoping as the list, so a direct link can't reveal a quote the list would hide.
        let accessFilter = {};
        if (access === 'reported' || access === 'createdAndReported') {
            const reportedToUserIds = await getAllReportedEmployees(userId);
            if (access === 'createdAndReported') {
                reportedToUserIds.push(new ObjectId(userId));
            }
            accessFilter = { createdBy: { $in: reportedToUserIds } };
        } else if (access === 'created') {
            accessFilter = { createdBy: new ObjectId(userId) };
        }

        const [quotation] = await Quotation.aggregate([
            { $match: { $and: [{ _id: new ObjectId(id), isDeleted: { $ne: true } }, accessFilter] } },
            ...quotationLookupStages
        ]);

        if (!quotation) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        // Calendar events are keyed by collectionId (moved from the enquiry to the quote when it is created).
        const events = await Event.find({ collectionId: quotation._id })
            .sort({ date: -1 })
            .populate('employee createdBy', 'firstName lastName')
            .lean();
        quotation.events = events;

        // editHistory.editedBy is a bare ObjectId; resolve it so the History tab can show who made each edit.
        if (quotation.editHistory?.length) {
            const editorIds = [...new Set(quotation.editHistory.map((e: any) => e.editedBy?.toString()).filter(Boolean))];
            const editors = await Employee.find({ _id: { $in: editorIds } }, 'firstName lastName').lean();
            const editorById = new Map(editors.map((emp: any) => [emp._id.toString(), emp]));
            quotation.editHistory = quotation.editHistory.map((e: any) => ({
                ...e,
                editedBy: editorById.get(e.editedBy?.toString()) ?? e.editedBy,
            }));
        }

        if (quotation.dealData?.approvedBy) {
            quotation.dealData.approvedBy = await Employee.findById(quotation.dealData.approvedBy, 'firstName lastName').lean();
        }
        return res.status(200).json(quotation);
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getDealSheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, access, userId, searchQuery, searchCriteria } = req.body;

        let skipNum: number = (page - 1) * row;

        let matchFilters: any = {
            isDeleted: { $ne: true },
            dealData: { $exists: true },
            'dealData.status': { $nin: ['rejected', 'approved'] }
        };


        let accessFilter = {};
        let searchFilter = {};

        if (searchCriteria && searchQuery) {
            switch (searchCriteria) {
                case 'dealId':
                    searchFilter['dealData.dealId'] = { $regex: searchQuery, $options: 'i' }
                    break;
                case 'customer':
                    searchFilter['client.companyName'] = { $regex: searchQuery, $options: 'i' }
                    break;
                case 'salesperson':
                    searchFilter['$or'] = [
                        { 'createdBy.firstName': { $regex: searchQuery, $options: 'i' } },
                        { 'createdBy.lastName': { $regex: searchQuery, $options: 'i' } }
                    ];
                    break;
                default:
                    break;
            }
        }

        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const filters = { $and: [matchFilters, accessFilter] }

        let total: number = 0;
        await Quotation.aggregate([
            {
                $match: filters
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { total: 1, _id: 0 }
            }
        ]).exec()
            .then((result: { total: number }[]) => {
                if (result && result.length > 0) {
                    total = result[0].total
                }
            })

        let dealData = await Quotation.aggregate([
            {
                $match: filters,
            },
            {
                $sort: { 'dealData.savedDate': -1 }
            },

            {
                $lookup: {
                    from: 'customers',
                    localField: 'client',
                    foreignField: '_id',
                    as: 'client'
                }
            },
            {
                $unwind: '$client'
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'department',
                    foreignField: '_id',
                    as: 'department'
                }
            },
            {
                $unwind: '$department',
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'departments',
                    foreignField: '_id',
                    as: 'departments'
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            {
                $unwind: '$createdBy',
            },
            {
                $lookup: {
                    from: 'enquiries',
                    localField: 'enqId',
                    foreignField: '_id',
                    as: 'enqId'
                }
            },
            {
                $match: searchFilter,
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            {
                $unwind: {
                    path: '$enqId',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'dealData.updatedItems.itemDetails.supplierId',
                    foreignField: '_id',
                    as: 'supplierDetails'
                }
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'dealData.additionalCosts.supplierId',
                    foreignField: '_id',
                    as: 'costSupplierDetails'
                }
            },
            {
                $addFields: {
                    'dealData.updatedItems': {
                        $map: {
                            input: '$dealData.updatedItems',
                            as: 'item',
                            in: {
                                $mergeObjects: [
                                    '$$item',
                                    {
                                        itemDetails: {
                                            $map: {
                                                input: '$$item.itemDetails',
                                                as: 'itemDetail',
                                                in: {
                                                    $mergeObjects: [
                                                        '$$itemDetail',
                                                        {
                                                            supplierDetails: {
                                                                $arrayElemAt: [
                                                                    {
                                                                        $filter: {
                                                                            input: '$supplierDetails',
                                                                            as: 'supplier',
                                                                            cond: { $eq: ['$$supplier._id', '$$itemDetail.supplierId'] }
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
                    },
                    'dealData.additionalCosts': {
                        $map: {
                            input: '$dealData.additionalCosts',
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
                                    input: '$client.contactDetails',
                                    as: 'contact',
                                    cond: {
                                        $eq: ['$$contact._id', '$attention']
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            }
        ]);

        console.log(dealData)

        if (!dealData || !total) return res.status(204).json({ err: 'No Deal data found' })
        return res.status(200).json({ total: total, dealSheet: dealData })

    } catch (error) {
        console.log(error)
    }
}

export const getApprovedDealSheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, access, userId, role, searchQuery, searchCriteria } = req.body;
        let skipNum: number = (page - 1) * row;

        let accessFilter = {};
        let matchFilters = {};
        let searchFilter = {};

        let reportedToUserIds = await getAllReportedEmployees(userId);
        if (role == "superAdmin") {
            matchFilters = {
                dealData: { $exists: true },
                'dealData.status': 'approved'
            };
        } else {
            switch (access) {
                case 'created':
                    accessFilter = { createdBy: new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { createdBy: { $in: reportedToUserIds } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { createdBy: { $in: reportedToUserIds } };
                    break;

                default:
                    break;
            }

            matchFilters = {
                dealData: { $exists: true },
                'dealData.status': 'approved',
                'dealData.approvedBy': new ObjectId(userId)
            };
        }

        if (searchCriteria && searchQuery) {
            switch (searchCriteria) {
                case 'dealId':
                    searchFilter['dealData.dealId'] = { $regex: searchQuery, $options: 'i' }
                    break;
                case 'customer':
                    searchFilter['client.companyName'] = { $regex: searchQuery, $options: 'i' }
                    break;
                case 'salesperson':
                    searchFilter['$or'] = [
                        { 'createdBy.firstName': { $regex: searchQuery, $options: 'i' } },
                        { 'createdBy.lastName': { $regex: searchQuery, $options: 'i' } }
                    ];
                    break;
                default:
                    break;
            }
        }



        const filters = { $and: [matchFilters, accessFilter] }

        let total: number = 0;
        await Quotation.aggregate([
            {
                $match: filters
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { total: 1, _id: 0 }
            }
        ]).exec()
            .then((result: { total: number }[]) => {
                if (result && result.length > 0) {
                    total = result[0].total
                }
            })


        let dealData = await Quotation.aggregate([
            {
                $match: filters,
            },
            {
                $sort: { 'dealData.savedDate': -1 }
            },

            {
                $lookup: {
                    from: 'customers',
                    localField: 'client',
                    foreignField: '_id',
                    as: 'client'
                }
            },

            {
                $unwind: '$client'
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'department',
                    foreignField: '_id',
                    as: 'department'
                }
            },
            {
                $unwind: '$department',
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'departments',
                    foreignField: '_id',
                    as: 'departments'
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            {
                $unwind: '$createdBy',
            },
            {
                $lookup: {
                    from: 'jobs',
                    localField: '_id',
                    foreignField: 'quoteId',
                    as: 'job'
                }
            },
            {
                $unwind: {
                    path: '$job',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'enquiries',
                    localField: 'enqId',
                    foreignField: '_id',
                    as: 'enqId'
                }
            },
            {
                $match: searchFilter,
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            {
                $unwind: {
                    path: '$enqId',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'dealData.updatedItems.itemDetails.supplierId',
                    foreignField: '_id',
                    as: 'supplierDetails'
                }
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'dealData.additionalCosts.supplierId',
                    foreignField: '_id',
                    as: 'costSupplierDetails'
                }
            },
            {
                $addFields: {
                    'dealData.updatedItems': {
                        $map: {
                            input: '$dealData.updatedItems',
                            as: 'item',
                            in: {
                                $mergeObjects: [
                                    '$$item',
                                    {
                                        itemDetails: {
                                            $map: {
                                                input: '$$item.itemDetails',
                                                as: 'itemDetail',
                                                in: {
                                                    $mergeObjects: [
                                                        '$$itemDetail',
                                                        {
                                                            supplierDetails: {
                                                                $arrayElemAt: [
                                                                    {
                                                                        $filter: {
                                                                            input: '$supplierDetails',
                                                                            as: 'supplier',
                                                                            cond: { $eq: ['$$supplier._id', '$$itemDetail.supplierId'] }
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
                    },
                    'dealData.additionalCosts': {
                        $map: {
                            input: '$dealData.additionalCosts',
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
                                    input: '$client.contactDetails',
                                    as: 'contact',
                                    cond: {
                                        $eq: ['$$contact._id', '$attention']
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            }
        ]);

        console.log(dealData)

        if (!dealData || !total) return res.status(204).json({ err: 'No Deal data found' })
        return res.status(200).json({ total: total, dealSheet: dealData })

    } catch (error) {
        console.log(error)
    }
}


export const getNextQuoteId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        let quoteId: string = await generateQuoteId(quoteData.department, quoteData.createdBy, quoteData.date);

        if (!quoteId) return res.status(204).json({ err: 'Something went Wrong!' });
        return res.status(200).json({ quoteId });

    } catch (error) {
        console.log(error)
    }
}

export const markAsSeenDeal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteId: string = req.body.quoteIds;

        const result = await Quotation.findByIdAndUpdate(
            { _id: new ObjectId(quoteId) },
            { $set: { 'dealData.seenByApprover': true } },
        );

        res.status(200).json({ message: 'Deal marked as seen', result });
    } catch (error) {
        console.log(error)
        next(error);
    }
};



const seedDealIdSequence = async (): Promise<number> => {
    const lastQuote = await Quotation.aggregate([
        { $match: { dealData: { $exists: true } } },
        { $addFields: { lastNumber: { $toInt: { $arrayElemAt: [{ $split: ["$dealData.dealId", "-"] }, -1] } } } },
        { $sort: { lastNumber: -1 } },
        { $limit: 1 }
    ]);
    return lastQuote.length ? parseInt(lastQuote[0].lastNumber) : 0;
};

const generateDealId = async () => {
    try {
        const today = new Date();
        const year = today.getFullYear().toString().slice(-2);

        const incrementedNum = await getNextSequence('dealId', seedDealIdSequence);
        const formattedIncrementedNum = String(incrementedNum).padStart(3, '0');
        return `DL-${year}-${formattedIncrementedNum}`;
    } catch (error) {
        console.log(error)
    }
}

const seedQuoteIdSequence = async (): Promise<number> => {
    const lastQuote = await Quotation.aggregate([
        { $match: { quoteId: { $exists: true } } },
        { $addFields: { lastNumber: { $toInt: { $arrayElemAt: [{ $split: ["$quoteId", "-"] }, -1] } } } },
        { $sort: { lastNumber: -1 } },
        { $limit: 1 }
    ]);
    return lastQuote.length ? parseInt(lastQuote[0].lastNumber) : 0;
};

const generateQuoteId = async (departmentId: string, employeeId: string, date: string) => {
    try {
        if (!departmentId || !employeeId || !date) return undefined;
        const department = await Department.findById(departmentId);
        const employee = await Employee.findById(employeeId);
        let quoteId: string;

        if (employee && department) {
            const salesId = `${employee.firstName[0]}${employee.lastName[0]}`;
            const departmentName = department.departmentName.split(' ')[0].replace(/\s/g, "").toUpperCase().slice(0, 4);

            const [year, month] = date.split('-');
            const formatedDate = `${month}/${year.substring(2)}`;

            const incrementedNum = await getNextSequence('quoteId', seedQuoteIdSequence);
            const formattedIncrementedNum = String(incrementedNum).padStart(3, '0');
            quoteId = `QN-NT/${salesId}/${departmentName}-${formatedDate}-${formattedIncrementedNum}`
        }
        return quoteId;
    } catch (error) {
        console.log(error)
    }
}


export const updateQuoteStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, reason } = req.body;
        const { quoteId } = req.params;

        const statusCheck = await Quotation.findOne({ _id: quoteId });

        if (!statusCheck) {
            return res.status(404).json({ message: "Quote not found" });
        }
        if (!isKnownQuoteStatus(status) || status === quoteStatus.Expired) {
            return res.status(400).json({ message: "Invalid quote status" });
        }

        if (statusCheck?.status === 'Expired') {
            return res.status(400).json({ message: "Quote is expired (past its closing date) and can no longer change status" });
        }

        if (status === statusCheck.status) {
            return res.status(400).json({ message: `Quote is already ${status}` });
        }
        if (!canTransitionQuoteStatus(statusCheck.status, status)) {
            return res.status(400).json({ message: `A quote cannot move from "${statusCheck.status}" to "${status}"` });
        }
        if (quoteStatusRequiresReason(statusCheck.status, status) && !String(reason ?? '').trim()) {
            return res.status(400).json({ message: status === quoteStatus.Lost ? "A reason is required when marking a quote as Lost" : "A reason is required for this status change" });
        }
        // Once a deal sheet is raised (and not rejected) the order is in handover; it must not be silently undone from here.
        if (statusCheck.status === quoteStatus.Won && statusCheck.dealData?.status && statusCheck.dealData.status !== 'rejected') {
            return res.status(400).json({ message: "A deal sheet is in progress or approved, so this quote can no longer leave Won" });
        }

        type UpdateQuery = {
            $set?: { status: string; lpoFiles?: any[] };
            $unset?: { [key: string]: number };
            $push?: { editHistory: any };
        };

        let updateObject: UpdateQuery = {
            $set: { status }
        };

        if (statusCheck.status === 'Won') {
            updateObject = {
                $set: {
                    status,
                    lpoFiles: [] // Set to empty array
                },
                $unset: {
                    dealData: 1 // Remove dealData
                }
            };
        }

        // Leaving Won discards the deal sheet and LPO files, so the history records what was removed.
        const discarded = statusCheck.status === quoteStatus.Won
            ? [statusCheck.dealData?.dealId && `deal sheet ${statusCheck.dealData.dealId}`, statusCheck.lpoFiles?.length && `${statusCheck.lpoFiles.length} LPO file(s)`].filter(Boolean)
            : [];
        const historyReason = [String(reason ?? '').trim(), discarded.length ? `Removed: ${discarded.join(', ')}` : ''].filter(Boolean).join(' — ');

        const editorData = await getEmployeeData(req.user);
        updateObject.$push = {
            editHistory: {
                editedBy: editorData?._id,
                editedAt: new Date(),
                action: 'StatusChanged',
                fromStatus: statusCheck.status,
                toStatus: status,
                ...(historyReason ? { reason: historyReason } : {}),
            }
        };

        const quoteUpdated = await Quotation.findByIdAndUpdate(
            quoteId,
            updateObject,
            { new: true }
        );

        if (quoteUpdated) {
            await markEnquiryQuotedIfPromoted(quoteUpdated, statusCheck.status, status);
            return res.status(200).json(status);
        }
        return res.status(404).json({ message: "Quote not found" });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

/** Statuses before the quote has gone to the customer: edits there don't create revisions. */
const UNSENT_QUOTE_STATUSES: string[] = [quoteStatus.Draft, quoteStatus.WorkInProgress, quoteStatus.ReadyForSubmission];
const REVISION_FIELDS = ['optionalItems', 'customerNote', 'termsAndCondition', 'currency'];

export const updateQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        const { quoteId } = req.params;
        const { editReason } = req.body;
        delete quoteData.editReason;
        delete quoteData.editHistory;
        delete quoteData.revision;
        delete quoteData.revisions;
        normalizeQuoteDepartments(quoteData)

        const existingQuote = await Quotation.findById(quoteId).lean();
        if (existingQuote) {
            // Content is frozen once the quote expires or its deal sheet is approved (the order is in handover).
            if (existingQuote.status === quoteStatus.Expired) {
                return res.status(400).json({ message: "Quote is expired and can no longer be edited" });
            }
            if (existingQuote.dealData?.status === 'approved') {
                return res.status(400).json({ message: "The deal sheet is approved, so this quote can no longer be edited" });
            }
            // Status moves go through the same rules as the status endpoint, so an edit cannot skip them.
            if (quoteData.status && quoteData.status !== existingQuote.status) {
                if (!isKnownQuoteStatus(quoteData.status) || !canTransitionQuoteStatus(existingQuote.status, quoteData.status)) {
                    return res.status(400).json({ message: `A quote cannot move from "${existingQuote.status}" to "${quoteData.status}"` });
                }
                if (quoteData.status === quoteStatus.Won || existingQuote.status === quoteStatus.Won) {
                    return res.status(400).json({ message: "Use the status update to move a quote into or out of Won" });
                }
            }
        }
        const changes = await resolveHistoryNames(buildFieldChanges(existingQuote, quoteData));

        // A quote that already went to the customer keeps its old content as a revision snapshot when the commercial content changes.
        const createsRevision = !!existingQuote
            && !UNSENT_QUOTE_STATUSES.includes(existingQuote.status)
            && changes.some((c) => REVISION_FIELDS.includes(c.field));
        const nextRevision = (existingQuote?.revision ?? 0) + 1;

        const editorData = await getEmployeeData(req.user);
        const historyEntry: any = {
            editedBy: editorData?._id,
            editedAt: new Date(),
            action: 'Updated',
            toStatus: quoteData.status,
        };
        if (editReason) {
            historyEntry.reason = editReason;
        }
        if (changes.length) {
            historyEntry.changes = changes;
        }

        const push: any = { editHistory: historyEntry };
        const set: any = { ...quoteData };
        if (createsRevision && existingQuote) {
            historyEntry.revision = nextRevision;
            set.revision = nextRevision;
            push.revisions = {
                revision: nextRevision - 1,
                savedAt: new Date(),
                savedBy: editorData?._id,
                reason: editReason,
                snapshot: {
                    subject: existingQuote.subject,
                    currency: existingQuote.currency,
                    optionalItems: existingQuote.optionalItems,
                    customerNote: existingQuote.customerNote,
                    termsAndCondition: existingQuote.termsAndCondition,
                },
            };
        }

        const quoteUpdated = await Quotation.findByIdAndUpdate(
            quoteId,
            { $set: set, $push: push },
        )

        if (quoteUpdated) {
            await markEnquiryQuotedIfPromoted(quoteUpdated, existingQuote?.status, quoteData.status);
            return res.status(200).json(quoteUpdated)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const saveDealSheet = async (req: any, res: Response, next: NextFunction) => {
    try {
        const dealFiles = req.files;

        let files = [];
        if (dealFiles) {
            files = await Promise.all(dealFiles.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        const { paymentTerms, items, removedFiles, existingFiles, costs, totalDiscount } = JSON.parse(req.body.dealData);
        if (existingFiles && removedFiles) {
            files = [...files, ...existingFiles];
            removedFiles.map((file: any) => removeFile(file.fileName))
        } else {
            files = [...files]
        }

        let dealId: string = await generateDealId();

        const createdDate = new Date()
        let updateQuoteData = {
            dealData: {
                dealId: dealId,
                paymentTerms,
                additionalCosts: costs,
                savedDate: createdDate,
                status: 'pending',
                attachments: files,
                updatedItems: items,
                totalDiscount: totalDiscount
            },
        }

        const socket = req.app.get('io') as Server;
        const { quoteId } = req.params;
        const quoteUpdated = await Quotation.findByIdAndUpdate(quoteId, updateQuoteData, { new: true });
        const userData = await getEmployeeData(req.user);
        
        if (quoteUpdated) {
            await createNotificationWithPrivileges(
                {
                    type: 'DealSheet',
                    referenceModel: 'Quotation',
                    title: 'New Deal Sheet Pending Approval',
                    message: `A new deal sheet has been submitted for quotation ${quoteUpdated.quoteId}`,
                    sentBy: userData?._id?.toString() || quoteUpdated.createdBy.toString(),
                    referenceId: quoteUpdated._id,
                    additionalData: { quotationId: quoteUpdated._id.toString() }
                },
                {
                    privilegeKey: 'dealSheet',
                    checkFunction: (privileges) => {
                        return privileges.dealSheet === true;
                    }
                },
                socket
            );
        }

        if (quoteUpdated) {
            return res.status(200).json(quoteUpdated)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        console.log(error)
        next(error)
    }
}

export const approveDeal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = await generateJobId()
        const jobData = {
            quoteId: req.body.quoteId,
            jobId: jobId,
            comment: req.body.comment
        }

        const job = new Job(jobData);
        const saveJob = await job.save()
        if (saveJob) {
            const quoteUpdate = await Quotation.updateOne(
                { _id: jobData.quoteId },
                {
                    $set: { 'dealData.status': 'approved', 'dealData.seenedBySalsePerson': false, 'dealData.approvedBy': new ObjectId(req.body.userId) },
                    $push: { editHistory: { editedBy: req.body.userId, editedAt: new Date(), action: 'DealApproved' } }
                }
            )
            if (quoteUpdate) {
                const socket = req.app.get('io') as Server;
                const quotation = await Quotation.findById(jobData.quoteId);
                if (quotation) {
                    await createNotificationWithPrivileges(
                        {
                            type: 'DealSheetResponse',
                            referenceModel: 'Quotation',
                            title: 'Deal Sheet Approved',
                            message: `Deal sheet has been approved for quotation ${quotation.quoteId}`,
                            sentBy: req.body.userId,
                            referenceId: quotation._id,
                            additionalData: { quotationId: quotation._id.toString() }
                        },
                        {
                            privilegeKey: 'quotation',
                            checkFunction: (privileges, employeeId) => {
                                return employeeId === quotation.createdBy.toString() && 
                                       privileges.quotation?.viewReport !== 'none';
                            }
                        },
                        socket
                    );
                }
                return res.status(200).json({ success: true });
            }
        }

        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const rejectDeal = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const { quoteId, comment } = req.body;
        const deal = await Quotation.findById(quoteId);
        if (!deal) {
            return res.status(502).json({ message: 'Deal not found' });
        }
        deal.dealData.status = 'rejected';
        deal.dealData.seenedBySalsePerson = false
        deal.dealData.comments.push(comment);
        const userData = await getEmployeeData(req.user);
        deal.editHistory.push({
            editedBy: userData?._id,
            editedAt: new Date(),
            action: 'DealRejected',
            reason: comment,
        } as any);
        const savedDeal = await deal.save();

        const socket = req.app.get('io') as Server;
        await createNotificationWithPrivileges(
            {
                type: 'DealSheetResponse',
                referenceModel: 'Quotation',
                title: 'Deal Sheet Rejected',
                message: `Deal sheet has been rejected for quotation ${savedDeal.quoteId}`,
                sentBy: userData?._id?.toString() || savedDeal.createdBy.toString(),
                referenceId: savedDeal._id,
                additionalData: { quotationId: savedDeal._id.toString() }
            },
            {
                privilegeKey: 'quotation',
                checkFunction: (privileges, employeeId) => {
                    return employeeId === savedDeal.createdBy.toString() && 
                           privileges.quotation?.viewReport !== 'none';
                }
            },
            socket
        );

        return res.status(200).json({ success: true })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const revokeDeal = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const { quoteId } = req.body;
        const deal = await Quotation.findById(quoteId);
        if (!deal) {
            return res.status(502).json({ message: 'Deal not found' });
        }

        const job = await Job.findOne({ quoteId: quoteId });
        const allocateStatusOrder: string[] = Object.values(allocateStatus);
        if (job && allocateStatusOrder.indexOf(job.allocateStatus) >= allocateStatusOrder.indexOf(allocateStatus.OpenToWork)) {
            return res.status(409).json({ message: 'Deal cannot be revoked once the job has started allocation (Open to Work or later)' });
        }

        deal.dealData.status = 'pending';
        deal.dealData.seenByApprover = false;
        const revokerData = await getEmployeeData(req.user);
        deal.editHistory.push({
            editedBy: revokerData?._id,
            editedAt: new Date(),
            action: 'DealRevoked',
        } as any);
        await deal.save();
        const jobDelete = await Job.deleteOne({ quoteId: quoteId })

        if (jobDelete.deletedCount) {
            const socket = req.app.get('io') as Server;
            const userData = await getEmployeeData(req.user);
            await createNotificationWithPrivileges(
                {
                    type: 'DealSheet',
                    referenceModel: 'Quotation',
                    title: 'Deal Sheet Revoked',
                    message: `Deal sheet has been revoked for quotation ${deal.quoteId}`,
                    sentBy: userData?._id?.toString() || deal.createdBy.toString(),
                    referenceId: deal._id,
                    additionalData: { quotationId: deal._id.toString() }
                },
                {
                    privilegeKey: 'dealSheet',
                    checkFunction: (privileges) => {
                        return privileges.dealSheet === true;
                    }
                },
                socket
            );
        }

        return res.status(200).json({ success: true })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const uploadLpo = async (req: any, res: Response, next: NextFunction) => {
    try {
        console.log('reached here')
        if (!req.files) return res.status(204).json({ err: 'No data' });

        const lpoFiles = req.files;
        const newFiles = await Promise.all(lpoFiles.map(async (file: any) => {
            console.log('reached here -- promise')
            await uploadFileToAws(file.filename, file.path, file.mimetype);
            return { fileName: file.filename, originalname: file.originalname };
        }));

        // Use $push to append new files to existing array
        const quote = await Quotation.findByIdAndUpdate(
            req.body.quoteId,
            {
                lpoSubmitted: true,
                $push: { lpoFiles: { $each: newFiles } }
            },
            { new: true } // Return updated document
        );

        if (quote) {
            return res.status(200).json(quote);
        }

        return res.status(502).json();
    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const totalQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;

        let accessFilter = {};

        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const totalQuotes = await Quotation.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    'dealData.status': { $ne: 'approved' },
                    ...accessFilter
                }
            },
            {
                $group: {
                    _id: null, total: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    total: 1
                }
            }
        ])

        if (totalQuotes.length === 0) {
            totalQuotes.push({ total: 0 });
        }

        if (totalQuotes) return res.status(200).json(totalQuotes[0])

        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}
/** Statuses a quote can still move out of — everything that is not a final outcome. */
const OPEN_STATUSES = [
    quoteStatus.Draft,
    quoteStatus.WorkInProgress,
    quoteStatus.QuoteSubmitted,
    quoteStatus.UnderNegotiation,
    quoteStatus.UnderReview,
    quoteStatus.ReadyForSubmission,
] as string[];

/**
 * The pipeline the report draws: one stage per quote status, so a quote sits in exactly one
 * stage and the stages add up to the total. The client lets the user hide stages.
 */
const FUNNEL_STAGES: { key: string; label: string; statuses: string[] }[] = [
    quoteStatus.Draft,
    quoteStatus.WorkInProgress,
    quoteStatus.ReadyForSubmission,
    quoteStatus.QuoteSubmitted,
    quoteStatus.UnderReview,
    quoteStatus.UnderNegotiation,
    quoteStatus.Won,
    quoteStatus.Lost,
    quoteStatus.Expired,
].map((status) => ({ key: status, label: status, statuses: [status] }));

/** Approval state of a quote's deal sheet, in the order the report shows it. */
const DEAL_STATUSES = ['pending', 'approved', 'rejected'];

/** Quoted value of a quote's primary option, discount applied. Tolerates quotes with no items. */
const quoteGrossValue = (quote: any): number => {
    const option = quote?.optionalItems?.[0];
    if (!option?.items?.length) return 0;
    return calculateDiscountPrice(option.totalDiscount || 0, option.items);
};

/** The last time anything was recorded against the quote — used to spot quotes that have gone quiet. */
const lastActivityAt = (quote: any): Date => {
    const stamps = (quote?.editHistory || [])
        .map((e: any) => (e?.editedAt ? new Date(e.editedAt).getTime() : 0))
        .filter((t: number) => t > 0);
    const latest = stamps.length ? Math.max(...stamps) : 0;
    return new Date(Math.max(latest, quote?.date ? new Date(quote.date).getTime() : 0));
};

/** When the quote reached a final status, read off the audit log (null if it never did). */
const outcomeEntry = (quote: any, status: string): any =>
    [...(quote?.editHistory || [])].reverse().find((e: any) => e?.toStatus === status) || null;

const monthKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Accumulates count + value per key, so department / salesperson / customer share one code path. */
const tally = (map: Map<string, any>, id: string, name: string, value: number, won: boolean) => {
    let row = map.get(id);
    if (!row) {
        row = { id, name, count: 0, value: 0, wonCount: 0, wonValue: 0, winRate: 0 };
        map.set(id, row);
    }
    row.count += 1;
    row.value += value;
    if (won) { row.wonCount += 1; row.wonValue += value; }
};

export const getReportDetails = async (req: Request, res: Response) => {
    try {
        let { salesPerson, customer, fromDate, toDate, department, access, userId } = req.body;
        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isDepartment = department == null ? true : false;

        // Basic match filters
        let matchFilters = {
            $and: [
                { $or: [{ createdBy: new ObjectId(salesPerson) }, { createdBy: { $exists: isSalesPerson } }] },
                { $or: [{ client: new ObjectId(customer) }, { client: { $exists: isCustomer } }] },
                {
                    $or: [
                        { $and: [{ date: { $gte: new Date(fromDate) } }, { date: { $lte: new Date(toDate) } }] },
                        { date: { $exists: isDate } }
                    ]
                },
                {
                    // Quotes carry either the legacy single `department` or the newer `departments[]`,
                    // so a department filter has to look at both.
                    $or: isDepartment
                        ? [{ department: { $exists: true } }]
                        : [{ department: new ObjectId(department) }, { departments: new ObjectId(department) }]
                }
            ]
        }

        // Access filter logic
        let accessFilter = {};
        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;
            default:
                break;
        }

        const filters = { $and: [matchFilters, accessFilter, { isDeleted: { $ne: true } }] }

        const quotations = await Quotation.find(filters)
            .select('quoteId date closingDate status currency optionalItems editHistory client createdBy department departments dealData.status')
            .populate('client', 'companyName')
            .populate('createdBy', 'firstName lastName')
            .populate('department', 'departmentName')
            .populate('departments', 'departmentName')
            .lean();

        // Everything below is reported in QAR; USD quotes are converted once, here.
        const usdRate = await getUSDRated();

        const now = new Date();
        const DAY = 24 * 60 * 60 * 1000;
        const SOON_DAYS = 7;
        const IDLE_DAYS = 14;

        // One pass decorates each quote with the facts every section needs, so the
        // sections below are plain filters over the same array rather than repeated work.
        const enriched = quotations.map((quote: any) => {
            const gross = quoteGrossValue(quote);
            const won = quote.status === quoteStatus.Won;
            const lost = quote.status === quoteStatus.Lost;
            const outcome = won ? outcomeEntry(quote, quoteStatus.Won) : lost ? outcomeEntry(quote, quoteStatus.Lost) : null;
            return {
                quote,
                value: quote.currency === 'USD' ? gross * usdRate : gross,
                won,
                lost,
                open: OPEN_STATUSES.indexOf(quote.status) !== -1,
                closedAt: outcome?.editedAt ? new Date(outcome.editedAt) : null,
                lostReason: lost ? outcome?.reason || null : null,
                lastActivity: lastActivityAt(quote),
            };
        });

        const sum = (rows: any[]): number => rows.reduce((t, r) => t + r.value, 0);

        const wonRows = enriched.filter((r: any) => r.won);
        const lostRows = enriched.filter((r: any) => r.lost);
        const expiredRows = enriched.filter((r: any) => r.quote.status === quoteStatus.Expired);
        const openRows = enriched.filter((r: any) => r.open);
        const closedCount = wonRows.length + lostRows.length;
        const totalValue = sum(enriched);

        // Averaged only over quotes whose outcome was actually logged, so an unlogged
        // legacy quote lowers confidence rather than skewing the number to zero.
        const closedDurations = enriched
            .filter((r: any) => r.closedAt && r.quote.date)
            .map((r: any) => (r.closedAt.getTime() - new Date(r.quote.date).getTime()) / DAY)
            .filter((d: number) => d >= 0);

        const kpi = {
            totalValue,
            totalCount: enriched.length,
            wonValue: sum(wonRows),
            wonCount: wonRows.length,
            lostValue: sum(lostRows),
            lostCount: lostRows.length,
            closedCount,
            winRate: closedCount ? (wonRows.length / closedCount) * 100 : 0,
            openValue: sum(openRows),
            openCount: openRows.length,
            avgQuoteValue: enriched.length ? totalValue / enriched.length : 0,
            avgDaysToClose: closedDurations.length
                ? closedDurations.reduce((a: number, b: number) => a + b, 0) / closedDurations.length
                : null,
        };

        const funnel = FUNNEL_STAGES.map((stage) => {
            const rows = enriched.filter((r: any) => stage.statuses.indexOf(r.quote.status) !== -1);
            return {
                key: stage.key,
                label: stage.label,
                count: rows.length,
                value: sum(rows),
                pct: enriched.length ? (rows.length / enriched.length) * 100 : 0,
            };
        });

        // Status counts, kept under the old key and shape so the status colour map still applies.
        const statusMap = new Map<string, any>();
        enriched.forEach((r: any) => {
            const bucket = statusMap.get(r.quote.status) || { name: r.quote.status, value: 0, amount: 0 };
            bucket.value += 1;
            bucket.amount += r.value;
            statusMap.set(r.quote.status, bucket);
        });
        const pieChartData = [...statusMap.values()];

        // Only quotes that have a deal sheet count here; the rest have no deal status to report.
        const dealStatus = DEAL_STATUSES.map((key) => {
            const rows = enriched.filter((r: any) => r.quote.dealData?.status === key);
            return { key, label: key.charAt(0).toUpperCase() + key.slice(1), count: rows.length, value: sum(rows) };
        });

        // Trend covers the last 12 months including the current one, with empty months kept
        // so the chart shows a gap rather than silently compressing the timeline.
        const months: string[] = [];
        for (let i = 11; i >= 0; i--) {
            months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
        }
        const trendMap = new Map<string, any>(
            months.map((m) => [m, { month: m, createdCount: 0, createdValue: 0, wonCount: 0, wonValue: 0 }])
        );
        enriched.forEach((r: any) => {
            const created = trendMap.get(monthKey(new Date(r.quote.date)));
            if (created) { created.createdCount += 1; created.createdValue += r.value; }
            if (r.won) {
                const wonBucket = trendMap.get(monthKey(r.closedAt || new Date(r.quote.date)));
                if (wonBucket) { wonBucket.wonCount += 1; wonBucket.wonValue += r.value; }
            }
        });
        const trend = months.map((m) => trendMap.get(m));

        // A quote spanning several departments counts once under each, so the department
        // rows deliberately do not add up to the overall total.
        const byDepartment = new Map<string, any>();
        const bySalesPerson = new Map<string, any>();
        const byCustomer = new Map<string, any>();
        enriched.forEach((r: any) => {
            const q = r.quote;
            const depts: any[] = q.departments?.length ? q.departments : q.department ? [q.department] : [];
            depts.forEach((d) => tally(byDepartment, String(d?._id), d?.departmentName || 'Unassigned', r.value, r.won));
            tally(
                bySalesPerson,
                String(q.createdBy?._id),
                [q.createdBy?.firstName, q.createdBy?.lastName].filter(Boolean).join(' ') || 'Unknown',
                r.value,
                r.won
            );
            tally(byCustomer, String(q.client?._id), q.client?.companyName || 'Unknown', r.value, r.won);
        });
        const finish = (map: Map<string, any>) =>
            [...map.values()]
                .map((row) => ({ ...row, winRate: row.count ? (row.wonCount / row.count) * 100 : 0 }))
                .sort((a, b) => b.value - a.value);

        // Attention covers open quotes only — a Won or Lost quote has nothing left to chase.
        const daysUntil = (d: any): number => Math.round((new Date(d).getTime() - now.getTime()) / DAY);
        const brief = (r: any, days: number) => ({
            _id: String(r.quote._id),
            quoteId: r.quote.quoteId,
            customer: r.quote.client?.companyName || '',
            salesPerson: [r.quote.createdBy?.firstName, r.quote.createdBy?.lastName].filter(Boolean).join(' '),
            status: r.quote.status,
            value: r.value,
            closingDate: r.quote.closingDate || null,
            days,
        });
        const overdue = openRows
            .filter((r: any) => r.quote.closingDate && daysUntil(r.quote.closingDate) < 0)
            .map((r: any) => brief(r, -daysUntil(r.quote.closingDate)))
            .sort((a: any, b: any) => b.days - a.days);
        const closingSoon = openRows
            .filter((r: any) => r.quote.closingDate && daysUntil(r.quote.closingDate) >= 0 && daysUntil(r.quote.closingDate) <= SOON_DAYS)
            .map((r: any) => brief(r, daysUntil(r.quote.closingDate)))
            .sort((a: any, b: any) => a.days - b.days);
        const idle = openRows
            .filter((r: any) => (now.getTime() - r.lastActivity.getTime()) / DAY >= IDLE_DAYS)
            .map((r: any) => brief(r, Math.round((now.getTime() - r.lastActivity.getTime()) / DAY)))
            .sort((a: any, b: any) => b.days - a.days);

        // The status-change note is the only place a loss is explained, so that is what is grouped.
        const reasonMap = new Map<string, any>();
        lostRows.forEach((r: any) => {
            const reason = (r.lostReason || '').trim() || 'No reason recorded';
            const row = reasonMap.get(reason) || { reason, count: 0, value: 0 };
            row.count += 1;
            row.value += r.value;
            reasonMap.set(reason, row);
        });
        const lostReasons = [...reasonMap.values()].sort((a, b) => b.count - a.count);

        return res.status(200).json({
            currency: 'QAR',
            usdRate,
            generatedAt: now,
            totalValue,
            pieChartData,
            kpi,
            funnel,
            dealStatus,
            outcomes: {
                won: { count: wonRows.length, value: sum(wonRows) },
                lost: { count: lostRows.length, value: sum(lostRows) },
                expired: { count: expiredRows.length, value: sum(expiredRows) },
            },
            trend,
            breakdown: {
                department: finish(byDepartment),
                salesPerson: finish(bySalesPerson),
                customer: finish(byCustomer).slice(0, 25),
            },
            attention: { overdue, closingSoon, idle, idleDays: IDLE_DAYS, soonDays: SOON_DAYS },
            lostReasons,
        });

    } catch (error) {
        console.error(error);
        return res.status(502).json({ error: "Failed to generate report" });
    }
};

const seedJobIdSequence = async (): Promise<number> => {
    const lastJob = await Job.findOne({}, {}, { sort: { jobId: -1 } });
    if (lastJob && lastJob.jobId) {
        const parts = lastJob.jobId.split('-');
        const lastNum = parseInt(parts[1]);
        if (!isNaN(lastNum)) {
            return lastNum;
        }
    }
    // Legacy default: numbering historically started at 0100, not 0001.
    return 99;
};

const generateJobId = async () => {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const formattedDate = `${year}/${month}`;

        const incrementedNum = await getNextSequence('jobId', seedJobIdSequence);
        const formattedIncrementedNum = incrementedNum.toString().padStart(4, '0');
        return `${formattedDate}-${formattedIncrementedNum}`;
    } catch (error) {
        console.log(error)
    }
}



export const markAsQuotationSeened = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId, userId } = req.body;
        if (!quoteId || !userId) {
            return res.status(400).json({ message: "quoteId and userId are required." });
        }
        const updateResult = await Quotation.updateOne(
            {
                _id: new ObjectId(quoteId),
                createdBy: new ObjectId(userId),
            },
            {
                $set: {
                    "dealData.seenedBySalsePerson": true
                }
            }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: "No matching quotation found." });
        }

        if (updateResult.modifiedCount === 0) {
            return res.status(304).json({ message: "Quotation was already marked as seen." });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const deleteQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employeeId } = req.body;

        // Check if quote exists and isn't already deleted
        const quote = await Quotation.findOne({
            _id: dataId,
        });

        if (!quote) {
            return res.status(404).json({
                message: 'Quote not found or already deleted'
            });
        }

        // Soft delete the quote
        await Quotation.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Quotation', dataId, employeeId)

        return res.status(200).json({
            success: true,
            message: 'Quote deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}
export const getProductSuggestions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { search = '', departments = '', limit = '20', category = '' } = req.query;
        const filter: any = { isDeleted: { $ne: true } };

        const departmentIds = (typeof departments === 'string' && departments.trim())
            ? departments.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
        if (departmentIds.length) {
            filter.productSegment = { $in: departmentIds };
        }

        if (typeof category === 'string' && category.trim()) {
            const escapeRegexValue = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const categoryRegex = new RegExp(escapeRegexValue(category.trim()), 'i');
            const matchingItemNameCategories = await ProductCategory.find({ categoryName: categoryRegex, isDeleted: { $ne: true } }).select('_id');
            filter.productCategory = { $in: matchingItemNameCategories.map((c) => c._id) };
        }

        if (typeof search === 'string' && search.trim()) {
            const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tokens = search.trim().split(/\s+/).filter(Boolean);

            filter.$and = await Promise.all(tokens.map(async (token) => {
                const tokenRegex = new RegExp(escapeRegex(token), 'i');
                const matchingCategories = await ProductCategory.find({ categoryName: tokenRegex, isDeleted: { $ne: true } }).select('_id');
                return {
                    $or: [
                        { productDescription: tokenRegex },
                        { productCategory: { $in: matchingCategories.map((c) => c._id) } },
                    ],
                };
            }));
        }

        const limitValue = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 50);

        const suggestions = await Product.find(filter)
            .select('productCategory productDescription')
            .populate('productCategory', 'categoryName')
            .limit(limitValue);

        return res.status(200).json({
            success: true,
            message: 'Product suggestions fetched successfully',
            data: suggestions,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getQuoteNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const quote = await Quotation.findById(quoteId).select('saveNote createdBy');

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        return res.status(200).json({ saveNote: quote.saveNote || '', createdBy: quote.createdBy });
    } catch (error) {
        next(error);
    }
}

/**
 * The content of every past revision, newest first, plus the live content as the current one.
 * `revisions` is `select: false` on the schema, so it has to be asked for explicitly.
 */
export const getQuoteRevisions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const quote = await Quotation.findById(quoteId)
            .select('+revisions revision subject currency optionalItems customerNote termsAndCondition createdBy')
            .lean();

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        const past = (quote.revisions || []) as any[];

        // savedBy is a bare ObjectId; resolve the names so the client can show who saved each revision.
        const authorIds = [...new Set(past.map((r) => r.savedBy?.toString()).filter(Boolean))];
        const authors = await Employee.find({ _id: { $in: authorIds } }, 'firstName lastName').lean();
        const authorById = new Map(authors.map((emp: any) => [emp._id.toString(), emp]));

        const revisions = past
            .map((r) => ({
                revision: r.revision,
                savedAt: r.savedAt,
                savedBy: authorById.get(r.savedBy?.toString()) ?? null,
                reason: r.reason || '',
                current: false,
                snapshot: r.snapshot,
            }))
            .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));

        return res.status(200).json({
            revision: quote.revision ?? 0,
            revisions: [
                {
                    revision: quote.revision ?? 0,
                    savedAt: null,
                    savedBy: null,
                    reason: '',
                    current: true,
                    snapshot: {
                        subject: quote.subject,
                        currency: quote.currency,
                        optionalItems: quote.optionalItems,
                        customerNote: quote.customerNote,
                        termsAndCondition: quote.termsAndCondition,
                    },
                },
                ...revisions,
            ],
        });
    } catch (error) {
        next(error);
    }
}

export const removeLpo = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId, fileName } = req.params;
        const quote = await Quotation.findById(quoteId);
        if (quote) {
            quote.lpoFiles = quote.lpoFiles.filter((file: any) => file.fileName !== fileName) as [];
            await deleteFileFromAws(fileName);
            await quote.save();
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.log(error)
        next(error);
    }
}

/**
 * Keeps the legacy single `department` field and the new `departments` array in sync.
 * `department` stays the primary one (it drives quote id generation, list filters and
 * the existing aggregations), and is always the first entry of `departments`.
 */
export const normalizeQuoteDepartments = (quoteData: any) => {
    if (!quoteData) return quoteData;

    const departments: string[] = Array.isArray(quoteData.departments)
        ? quoteData.departments.filter((id: string) => !!id).map((id: any) => id?._id ?? id)
        : [];

    if (departments.length) {
        quoteData.departments = [...new Set(departments.map(String))];
        quoteData.department = quoteData.departments[0];
    } else if (quoteData.department) {
        quoteData.departments = [String(quoteData.department?._id ?? quoteData.department)];
    }

    return quoteData;
}

const EDIT_HISTORY_IGNORED_FIELDS = new Set(['_id', '__v', 'editHistory', 'createdBy', 'quoteId', 'updatedAt', 'createdAt']);
const EDIT_HISTORY_MAX_VALUE_LENGTH = 300;

const stringifyForHistory = (value: any): string => {
    if (value === undefined || value === null) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > EDIT_HISTORY_MAX_VALUE_LENGTH ? `${str.slice(0, EDIT_HISTORY_MAX_VALUE_LENGTH)}…` : str;
}

const HISTORY_ID_PATTERN = /^[a-f\d]{24}$/i;

/** Pulls a single id out of a stored history value: a bare id, or an object carrying `_id`. */
const historyValueId = (raw: string): string => {
    if (!raw) return '';
    try {
        const v = JSON.parse(raw);
        const id = typeof v === 'string' ? v : v?._id;
        return typeof id === 'string' && HISTORY_ID_PATTERN.test(id) ? id : '';
    } catch {
        return HISTORY_ID_PATTERN.test(raw) ? raw : '';
    }
}

/** Replaces client / attention / department ids in the change rows with their readable names, so History never shows an id. */
export const resolveHistoryNames = async (changes: { field: string, from: string, to: string }[]) => {
    const nameOf = async (field: string, raw: string): Promise<string> => {
        const id = historyValueId(raw);
        if (!id) return raw;
        if (field === 'client') {
            const customer: any = await Customer.findById(id).select('companyName').lean();
            return customer?.companyName ?? raw;
        }
        if (field === 'attention') {
            const customer: any = await Customer.findOne({ 'contactDetails._id': id }).select('contactDetails').lean();
            const contact = customer?.contactDetails?.find((c: any) => String(c._id) === id);
            return contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : raw;
        }
        if (field === 'department') {
            const department: any = await Department.findById(id).select('name').lean();
            return department?.name ?? raw;
        }
        return raw;
    };

    for (const change of changes) {
        change.from = await nameOf(change.field, change.from);
        change.to = await nameOf(change.field, change.to);
    }
    return changes;
}

/**
 * The quoted content of `optionalItems` and nothing else. The stored copy carries line `_id`s and
 * defaults the form never sends, and key order differs between the two, so comparing the raw JSON
 * would report an untouched quote as changed (and, on a sent quote, create a revision for it).
 */
const normalizeOptionalItems = (options: any): any[] => {
    const num = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));
    const str = (v: any) => (v === undefined || v === null ? '' : String(v));
    return (Array.isArray(options) ? options : []).map((option: any) => ({
        totalDiscount: Number(option?.totalDiscount) || 0,
        items: (option?.items || []).map((item: any) => ({
            itemName: str(item?.itemName),
            isOptional: !!item?.isOptional,
            includeInTotal: !!item?.includeInTotal,
            itemDetails: (item?.itemDetails || []).map((d: any) => ({
                itemCode: str(d?.itemCode),
                partNo: str(d?.partNo),
                detail: str(d?.detail),
                quantity: num(d?.quantity),
                unitCost: num(d?.unitCost),
                profit: num(d?.profit),
                unitSellingPrice: num(d?.unitSellingPrice),
                availability: str(d?.availability),
                supplierId: str(d?.supplierId?._id ?? d?.supplierId),
                uom: str(d?.uom),
            })),
        })),
    }));
}

export const buildFieldChanges =(existingDoc: any, updatedData: any): { field: string, from: string, to: string }[] => {
    if (!existingDoc || !updatedData) return [];

    const changes: { field: string, from: string, to: string }[] = [];
    for (const field of Object.keys(updatedData)) {
        if (EDIT_HISTORY_IGNORED_FIELDS.has(field)) continue;

        const oldValue = existingDoc[field];
        const newValue = updatedData[field];
        const same = field === 'optionalItems'
            ? JSON.stringify(normalizeOptionalItems(oldValue)) === JSON.stringify(normalizeOptionalItems(newValue))
            : JSON.stringify(oldValue) === JSON.stringify(newValue);
        if (same) continue;

        changes.push({
            field,
            from: stringifyForHistory(oldValue),
            to: stringifyForHistory(newValue),
        });
    }
    return changes;
}
