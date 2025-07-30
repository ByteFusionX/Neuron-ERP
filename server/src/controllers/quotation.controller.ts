import { NextFunction, Response, Request } from "express";
import Quotation, { quoteStatus } from '../models/quotation.model';
import Job from '../models/job.model';
import Department from '../models/department.model';
import Employee from '../models/employee.model'
import Enquiry from "../models/enquiry.model";
import { Server } from "socket.io";
import { calculateDiscountPrice, getAllReportedEmployees, getUSDRated } from "../common/util";
const { ObjectId } = require('mongodb');
import { newTrash } from '../controllers/trash.controller'
import { removeFile } from '../common/util'
import { deleteFileFromAws, uploadFileToAws } from '../common/aws-connect';
import Event from '../models/events.model'

export const saveQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        let quoteId: string = await generateQuoteId(quoteData.department, quoteData.createdBy, quoteData.date);
        quoteData.quoteId = quoteId;

        const quote = new Quotation(quoteData)

        const saveQuote = await (await quote.save()).populate('department')

        if (quoteData.enqId) {
            const enquiry = await Enquiry.findById(quoteData.enqId);
            if (enquiry) {
                await Enquiry.findByIdAndUpdate(quoteData.enqId, { status: 'Quoted' });
                const event = await Event.findOneAndUpdate({ collectionId: quoteData.enqId }, { $set: { collectionId: quote._id } });
                if (event) {
                    await Quotation.findOneAndUpdate({ _id: saveQuote._id }, { $set: { eventId: event._id } });
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


export const getQuotations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, search, row, salesPerson, customer, fromDate, toDate, department, quoteStatus, dealStatus, access, userId } = req.body;
        let skipNum: number = (page - 1) * row;


        let searchRegex = search.split('').join('\\s*');
        let fullNameRegex = new RegExp(searchRegex, 'i');

        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isDepartment = department == null ? true : false;

        let matchFilters = {
            isDeleted: { $ne: true },
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
                $match: {
                    isDeleted: { $ne: true },
                    status: { $ne: 'revised' }
                }
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
                $sort: { _id: -1 }
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
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
                $match: {
                    isDeleted: { $ne: true },
                    status: { $ne: 'revised' }
                }
            }
        ]);

        if (!quoteData || !total) return res.status(204).json({ err: 'No Quoatation data found' })
        return res.status(200).json({ total: total, quotations: quoteData })

    } catch (error) {
        console.log(error)
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



const generateDealId = async () => {
    try {
        const lastQuote = await Quotation.aggregate([
            {
                $match: {
                    dealData: { $exists: true }
                }
            },
            {
                $addFields: {
                    lastNumber: {
                        $toInt: { $arrayElemAt: [{ $split: ["$dealData.dealId", "-"] }, -1] }
                    }
                }
            },
            {
                $sort: { lastNumber: -1 }
            },
            {
                $limit: 1
            }
        ])
        let dealId: string;


        const today = new Date();
        const currentYear = today.getFullYear();
        const year = currentYear.toString().slice(-2);

        if (lastQuote.length) {
            const lastNumber = lastQuote[0].lastNumber;
            const incrementedNum = parseInt(lastNumber) + 1;
            const formattedIncrementedNum = String(incrementedNum).padStart(3, '0');
            dealId = `DL-${year}-${formattedIncrementedNum}`
        } else {
            dealId = `DL-${year}-001`
        }
        return dealId;
    } catch (error) {
        console.log(error)
    }
}

const generateQuoteId = async (departmentId: string, employeeId: string, date: string) => {
    try {
        const lastQuote = await Quotation.aggregate([
            {
                $match: {
                    quoteId: { $exists: true }
                }
            },
            {
                $addFields: {
                    lastNumber: {
                        $toInt: { $arrayElemAt: [{ $split: ["$quoteId", "-"] }, -1] }
                    }
                }
            },
            {
                $sort: { lastNumber: -1 }
            },
            {
                $limit: 1
            }
        ])
        const department = await Department.findById(departmentId);
        const employee = await Employee.findById(employeeId);
        let quoteId: string;

        if (employee && department) {
            const salesId = `${employee.firstName[0]}${employee.lastName[0]}`;
            const departmentName = department.departmentName.split(' ')[0].replace(/\s/g, "").toUpperCase().slice(0, 4);

            const [year, month] = date.split('-');
            const formatedDate = `${month}/${year.substring(2)}`;

            if (lastQuote.length) {
                const lastNumber = lastQuote[0].lastNumber;
                const incrementedNum = parseInt(lastNumber) + 1;
                const formattedIncrementedNum = String(incrementedNum).padStart(3, '0');
                quoteId = `QN-NT/${salesId}/${departmentName}-${formatedDate}-${formattedIncrementedNum}`
            } else {
                quoteId = `QN-NT/${salesId}/${departmentName}-${formatedDate}-001`
            }
        }
        return quoteId;
    } catch (error) {
        console.log(error)
    }
}


export const updateQuoteStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const { quoteId } = req.params;

        const statusCheck = await Quotation.findOne({ _id: quoteId });

        type UpdateQuery = {
            $set?: { status: string; lpoFiles?: any[] };
            $unset?: { [key: string]: number };
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

        const quoteUpdated = await Quotation.findByIdAndUpdate(
            quoteId,
            updateObject,
            { new: true }
        );

        if (quoteUpdated) {
            return res.status(200).json(status);
        }
        return res.status(404).json({ message: "Quote not found" });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

export const updateQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        const { quoteId } = req.params;

        const quoteUpdated = await Quotation.findByIdAndUpdate(quoteId, quoteData)

        if (quoteUpdated) {
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
        socket.emit("notifications", 'dealSheet')

        const { quoteId } = req.params;
        const quoteUpdated = await Quotation.findByIdAndUpdate(quoteId, updateQuoteData, { new: true });

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
            const quoteUpdate = await Quotation.updateOne({ _id: jobData.quoteId }, { 'dealData.status': 'approved', 'dealData.seenedBySalsePerson': false, 'dealData.approvedBy': new ObjectId(req.body.userId) })
            if (quoteUpdate) {
                const socket = req.app.get('io') as Server;
                socket.emit("notifications", 'quotation')
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
        const savedDeal = await deal.save();

        const socket = req.app.get('io') as Server;
        socket.to(savedDeal.createdBy.toString()).emit("notifications", 'quotation')

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
        deal.dealData.status = 'pending';
        deal.dealData.seenByApprover = false;
        await deal.save();
        const jobDelete = await Job.deleteOne({ quoteId: quoteId })

        if (jobDelete.deletedCount) {
            const socket = req.app.get('io') as Server;
            socket.emit("notifications", 'dealSheet')
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
            await uploadFileToAws(file.filename, file.path);
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
                    $or: [{ department: new ObjectId(department) }, { department: { $exists: isDepartment } }]
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

        const filters = { $and: [matchFilters, accessFilter] }

        // Get all quotations
        const quotations = await Quotation.aggregate([
            { $match: filters }
        ]);

        // Calculate values
        const qatarUsdRates = await getUSDRated();
        
        const totalValues = quotations.reduce((acc: any, quote: any) => {
            // Calculate the discounted price for the current quote
            const discountPrice = calculateDiscountPrice(quote.optionalItems[0].totalDiscount, quote.optionalItems[0].items);
            
            // Track values for each status type
            if (!acc.statusValues[quote.status]) {
                acc.statusValues[quote.status] = {
                    qar: 0,
                    usd: 0,
                    combined: 0,
                    lpoValue: 0 // Add LPO value tracking
                };
            }

            // Add to the appropriate currency total
            if (quote.currency == 'USD') {
                acc.statusValues[quote.status].usd += discountPrice;
            } else if (quote.currency == 'QAR') {
                acc.statusValues[quote.status].qar += discountPrice;
            }
            
            // Calculate LPO value (example calculation - modify as needed)
            acc.statusValues[quote.status].lpoValue += discountPrice * 0.8; // Assuming LPO is 80% of quote value
            
            // Track counts for pie chart
            acc.statusCounts[quote.status] = (acc.statusCounts[quote.status] || 0) + 1;

            if (quote.currency == 'USD') {
                acc.totalUSDValue += discountPrice;
            } else if (quote.currency == 'QAR') {
                acc.totalQARValue += discountPrice;
            }
            
            return acc;
        }, {
            totalUSDValue: 0,
            totalQARValue: 0,
            statusCounts: {},
            statusValues: {}
        });

        // Calculate combined values and total value
        const totalValue = totalValues.totalQARValue + (totalValues.totalUSDValue * qatarUsdRates);
        
        // Create pie chart data with LPO values
        const pieChartData = Object.keys(totalValues.statusCounts).map(status => {
            const statusData = totalValues.statusValues[status];
            statusData.combined = statusData.qar + (statusData.usd * qatarUsdRates);
            
            return {
                name: status,
                value: totalValues.statusCounts[status],
                lpoValue: statusData.lpoValue // Add LPO value to pie chart data
            };
        });

        console.log(pieChartData)
        // Return only pie chart data and total value
        return res.status(200).json({
            totalValue,
            pieChartData
        });

    } catch (error) {
        console.error(error);
        return res.status(502).json({ error: "Failed to generate report" });
    }
};

const generateJobId = async () => {
    try {
        const lastJob = await Job.findOne({}, {}, { sort: { jobId: -1 } });
        let lastJobId: String;
        let jobId: string;

        if (lastJob) {
            lastJobId = lastJob.jobId
        }
        const today = new Date();

        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${year}/${month}`;

        if (lastJob && lastJobId) {
            const IdNumber = lastJobId.split('-')
            const incrementedNum = parseInt(IdNumber[1]) + 1;
            const formattedIncrementedNum = incrementedNum.toString().padStart(4, '0');
            jobId = `${formattedDate}-${formattedIncrementedNum}`
        } else {
            jobId = `${formattedDate}-0100`
        }
        return jobId;
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
