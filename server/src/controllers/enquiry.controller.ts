import { NextFunction, Request, Response } from "express"
import enquiryModel from "../models/enquiry.model";
import Employee from '../models/employee.model';
import Department from '../models/department.model';
import { Enquiry } from "../interface/enquiry.interface";
import { Server } from "socket.io";
import quotationModel from "../models/quotation.model";
import { uploadFileToAws } from "../common/aws-connect";
import { newTrash } from '../controllers/trash.controller'
import { getAllReportedEmployees } from "../common/utils/util";
const { ObjectId } = require('mongodb')

export const createEnquiry = async (req: any, res: Response, next: NextFunction) => {
    try {
        if (!req.files) return res.status(204).json({ err: 'No data' })

        const enquiryFiles = req.files?.attachments ? await Promise.all(req.files.attachments.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
        })) : [];

        const presaleFiles = req.files?.presaleFiles ? await Promise.all(req.files.presaleFiles.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
        })) : [];

        const enquiryData = <Enquiry>JSON.parse(req.body.enquiryData)

        let enqId: string = await generateEnquiryId(enquiryData.department, enquiryData.salesPerson, enquiryData.date as string);

        enquiryData.enquiryId = enqId;
        enquiryData.attachments = []
        if (enquiryFiles) {
            enquiryData.attachments = enquiryFiles
        }

        enquiryData.date = new Date(enquiryData.date)
        const newEnquiry = new enquiryModel(enquiryData)
        const saveEnquiryData = await newEnquiry.save()
        if (!saveEnquiryData) return res.status(504).json({ err: 'Internal Error' });

        const savedEnquiryData = await enquiryModel.aggregate([
            {
                $match: { "_id": saveEnquiryData._id }
            },
            {
                $lookup: { from: 'customers', localField: 'client', foreignField: '_id', as: 'client' }
            },
            {
                $unwind: '$client'
            },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: '$department'
            },
            {
                $lookup: { from: 'employees', localField: 'salesPerson', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $unwind: '$salesPerson'
            },
            {
                $addFields: {
                    contact: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$client.contactDetails',
                                    as: 'contact',
                                    cond: {
                                        $eq: ['$$contact._id', '$contact']
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            }
        ]);

        return res.status(200).json(savedEnquiryData[0]);
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const assignPresale = async (req: any, res: Response, next: NextFunction) => {
    try {
        // Parse the incoming presale data
        const presale = JSON.parse(req.body.presaleData || '{}'); // Default to an empty object to prevent crashes
        let presaleFiles = [];

        // Upload new files to AWS and build the `presaleFiles` array
        if (req.files?.newPresaleFile) {
            presaleFiles = await Promise.all(req.files.newPresaleFile.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        const enquiryId = req.params.enquiryId;

        // Append new files and existing files to presale.presaleFiles
        presale.presaleFiles = presale.presaleFiles || []; // Ensure presaleFiles exists
        if (presaleFiles.length) {
            presaleFiles.forEach((file) => presale.presaleFiles.push(file));
        }

        if (presale.existingPresaleFiles) {
            presale.existingPresaleFiles.forEach((file) => presale.presaleFiles.push(file));
        }

        presale.presaleFiles = presale.presaleFiles.filter(
            (file) => Object.keys(file).length > 0
        );

        // Fetch the enquiry to preserve rejectionHistory
        const enquiry = await enquiryModel.findOne({ _id: enquiryId });
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }

        // Update the enquiry with presale data
        const update = await enquiryModel.updateOne(
            { _id: enquiryId },
            {
                $set: {
                    preSale: {
                        ...presale,
                        rejectionHistory: enquiry.preSale?.rejectionHistory || [], // Default to an empty array
                        newFeedbackAccess: true,
                        createdDate: Date.now(),
                    },
                    status: 'Assigned To Presale Manager',
                },
            }
        );

        // Notify the presale person via socket.io
        if (presale.presalePerson) {
            const socket = req.app.get('io') as Server;
            socket.to(presale.presalePerson).emit('notifications', 'assignedJob');
        }

        // Respond based on update results
        if (update.modifiedCount) {
            return res.status(200).json({ success: true });
        }

        return res.status(502).json({ success: false, message: 'Failed to update enquiry' });
    } catch (error) {
        console.error('Error in assignPresale:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};


export const getEnquiries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, salesPerson, status, customer, fromDate, toDate, department, access, userId } = req.body;
        let skipNum: number = (page - 1) * row;

        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isStatus = status == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isDepartment = department == null ? true : false;

        let matchFilters = {
            isDeleted: { $ne: true },
            $and: [
                { $or: [{ salesPerson: new ObjectId(salesPerson) }, { salesPerson: { $exists: isSalesPerson } }] },
                { $or: [{ status: status }, { status: { $exists: isStatus } }] },
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
                accessFilter = { salesPerson: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { salesPerson: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { salesPerson: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const filters = { $and: [matchFilters, accessFilter] }

        const enquiryTotal: { total: number }[] = await enquiryModel.aggregate([
            { $match: filters },
            { $match: { status: { $ne: 'Quoted' } } },
            { $group: { _id: null, total: { $sum: 1 } } },
            { $project: { total: 1, _id: 0 } }
        ]).exec()

        const enquiryData = await enquiryModel.aggregate([
            { $match: filters },
            { $match: { status: { $ne: 'Quoted' } } },
            { $sort: { _id: -1 } },
            { $skip: skipNum },
            { $limit: row },
            {
                $lookup: { from: 'customers', localField: 'client', foreignField: '_id', as: 'client' }
            },
            { $unwind: '$client' },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            { $unwind: '$department' },
            {
                $lookup: { from: 'employees', localField: 'salesPerson', foreignField: '_id', as: 'salesPerson' }
            },
            { $unwind: '$salesPerson' },
            {
                $addFields: {
                    contact: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$client.contactDetails',
                                    as: 'contact',
                                    cond: {
                                        $eq: ['$$contact._id', '$contact']
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
                    from: 'employees',
                    localField: 'preSale.presalePerson',
                    foreignField: '_id',
                    as: 'preSale.presalePerson'
                }
            },
            { $unwind: { path: '$preSale.presalePerson', preserveNullAndEmptyArrays: true }  },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'reAssigned',
                    foreignField: '_id',
                    as: 'reAssigned'
                }
            },
            { $unwind: { path: '$reAssigned', preserveNullAndEmptyArrays: true }  },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'preSale.rejectionHistory.rejectedBy',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $addFields: {
                    "preSale": {
                        $cond: {
                            if: { $ifNull: ["$preSale", false] },
                            then: {
                                $mergeObjects: [
                                    "$preSale",
                                    {
                                        rejectionHistory: {
                                            $map: {
                                                input: "$preSale.rejectionHistory",
                                                as: "rejection",
                                                in: {
                                                    $mergeObjects: [
                                                        "$$rejection",
                                                        {
                                                            employeeId: {
                                                                $arrayElemAt: [
                                                                    {
                                                                        $filter: {
                                                                            input: "$employeeDetails",
                                                                            as: "emp",
                                                                            cond: { $eq: ["$$emp._id", "$$rejection.rejectedBy"] }
                                                                        }
                                                                    }, 0
                                                                ]
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                ]
                            },
                            else: "$$REMOVE"
                        }
                    }
                }
            }
        ]);

        if (enquiryTotal.length) return res.status(200).json({ total: enquiryTotal[0].total, enquiry: enquiryData })
        return res.status(504).json({ err: 'No enquiry data found' })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getPreSaleJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let page = Number(req.query.page)
        let row = Number(req.query.row)
        let skipNum: number = (page - 1) * row;
        let { filter, access, userId } = req.query;
        let accessFilter: any = {};
        switch (access) {
            case 'assigned':
                accessFilter['$or'] = [
                    { 'preSale.presalePerson': new ObjectId(userId) },
                    { reAssigned : new ObjectId(userId) }, 
                ];
                break;
            default:
                break;
        }

        if (filter == 'completed') {
            accessFilter.status = 'Work In Progress'
        }

        const totalPresale: { total: number }[] = await enquiryModel.aggregate([
            {
                $match: { status: { $ne: 'Quoted' } }
            },
            {
                $match: {
                    ...accessFilter,
                    isDeleted: { $ne: true }
                }
            },
            {
                $match: { "preSale.presalePerson": { $exists: true, $ne: null } }
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            { $project: { _id: 0, total: 1 } }
        ])

        const preSaleData = await enquiryModel.aggregate([
            {
                $match: {
                    ...accessFilter,
                    isDeleted: { $ne: true }
                }
            },
            {
                $match: { status: { $ne: 'Quoted' } }
            },
            {
                $match: { "preSale.presalePerson": { $exists: true, $ne: null } }
            },
            {
                $sort: { 'preSale.createdDate': -1 }
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            {
                $lookup: { from: 'customers', localField: 'client', foreignField: '_id', as: 'client' }
            },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            {
                $lookup: { from: 'employees', localField: 'salesPerson', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'preSale.feedback.employeeId',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $addFields: {
                    reAssignedForLookup: { $ifNull: ['$reAssigned', null] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'reAssignedForLookup',
                    foreignField: '_id',
                    as: 'reAssigned'
                }
            },
            {
                $addFields: {
                    "preSale.feedback": {
                        $map: {
                            input: "$preSale.feedback",
                            as: "feedback",
                            in: {
                                $mergeObjects: [
                                    "$$feedback",
                                    {
                                        employeeId: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$employeeDetails",
                                                        as: "emp",
                                                        cond: { $eq: ["$$emp._id", "$$feedback.employeeId"] }
                                                    }
                                                }, 0
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
                $lookup: { from: 'employees', localField: 'preSale.presalePerson', foreignField: '_id', as: 'preSale.presalePerson' }
            },
        ])

        if (totalPresale.length) return res.status(200).json({ total: totalPresale[0].total, enquiry: preSaleData })
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const updateEnquiryStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let data = req.body
        let quote = await quotationModel.findOne({ enqId: data.id })
        let status = data.status
        if (quote) {
            let updateQuote = await quotationModel.updateOne({ enqId: data.id }, { $set: { 'status': 'Work In Progress' } })
            status = 'Quoted';
        }
        const update = await enquiryModel.findOneAndUpdate({ _id: data.id }, { $set: { status: status, 'preSale.seenbySalesPerson': false, 'preSale.newFeedbackAccess': true } })
            .populate(['client', 'department', 'salesPerson'])
        if (update && !quote) {
            const socket = req.app.get('io') as Server;
            socket.to(update.salesPerson._id.toString()).emit("notifications", 'enquiry')
            return res.status(200).json({ update })
        } else if (update) {
            return res.status(200).json({ update, quoteId: quote.quoteId })
        }

        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const monthlyEnquiries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;

        let accessFilter = {};
        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { salesPerson: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { salesPerson: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { salesPerson: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }
        const result = await enquiryModel.aggregate([
            {
                $match: {
                    ...accessFilter,
                    isDeleted: { $ne: true }
                }
            },
            {
                $project: {
                    department: 1,
                    date: 1
                }
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
                $group: {
                    _id: {
                        department: '$department',
                        year: { $year: "$date" },
                        month: { $month: "$date" },
                        // day: { $dayOfMonth: '$date' }
                    },
                    total: { $sum: 1 },
                    enquiry: { $push: '$$ROOT' }
                }
            },
            {
                $project: {
                    _id: 0,
                    department: '$_id.department',
                    year: '$_id.year',
                    month: '$_id.month',
                    total: 1,
                    // enquiry: 1
                }
            }
        ])

        if (result) return res.status(200).json(result)
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const sendFeedbackRequest = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { employeeId, enquiryId, comment } = req.body;

        const newFeedback = {
            employeeId,
            comment,
            requestedDate: Date.now(),
            seenByFeedbackProvider: false,
            seenByFeedbackRequester: false,
        };

        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $push: { "preSale.feedback": newFeedback },
                $set: { 'preSale.newFeedbackAccess': false }
            },
            { new: true }
        ).populate('client')
            .populate('department')
            .populate('salesPerson')
            .populate({
                path: 'preSale.feedback.employeeId',
                model: 'Employee'
            });

        if (result) {
            const socket = req.app.get('io') as Server;
            socket.to(employeeId).emit("notifications", 'feedbackRequest');
            return res.status(200).json(result);
        }

        return res.status(502).json();
    } catch (error) {
        console.log(error)
        next(error);
    }
}


export const getFeedbackRequestsById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employeeId = req.params.employeeId;
        let page = Number(req.query.page);
        let row = Number(req.query.row);
        let skipNum: number = (page - 1) * row;

        const totalFeedbacks: { total: number }[] = await enquiryModel.aggregate([
            {
                $unwind: "$preSale.feedback"
            },
            {
                $match: {
                    "preSale.feedback.employeeId": new ObjectId(employeeId),
                    "preSale.feedback.feedback": { $exists: false }
                }
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            { $project: { _id: 0, total: 1 } }
        ]);

        const feedbacks = await enquiryModel.aggregate([
            { $unwind: "$preSale.feedback" },
            {
                $match: {
                    "preSale.feedback.employeeId": new ObjectId(employeeId),
                    "preSale.feedback.feedback": { $exists: false }
                }
            },
            {
                $sort: { "preSale.feedback.requestedDate": -1 }
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            {
                $lookup: { from: 'customers', localField: 'client', foreignField: '_id', as: 'client' }
            },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            {
                $lookup: { from: 'employees', localField: 'salesPerson', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'employees', localField: 'preSale.feedback.employeeId', foreignField: '_id', as: 'preSale.feedback.employeeId' }
            },
            {
                $lookup: { from: 'employees', localField: 'preSale.presalePerson', foreignField: '_id', as: 'preSale.presalePerson' }
            }
        ]);


        if (totalFeedbacks.length) return res.status(200).json({ total: totalFeedbacks[0].total, feedbacks: feedbacks });
        return res.status(502).json();
    } catch (error) {
        console.log(error)
        next(error);
    }
}



export const giveFeedback = async (req: any, res: Response, next: NextFunction) => {
    try {
        let { enquiryId, feedbackId, feedback } = req.body;

        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId, "preSale.feedback._id": feedbackId },
            {
                $set: {
                    "preSale.feedback.$.feedback": feedback,
                    "preSale.feedback.$.seenByFeedbackRequester": false,
                    'preSale.newFeedbackAccess': true,
                }
            },
            { new: true }
        );

        if (result) {
            const socket = req.app.get('io') as Server;
            const presalePerson = result.preSale.presalePerson.toString();
            socket.to(presalePerson).emit("notifications", 'assignedJob');
            return res.status(200).json({ success: true });
        }

        return res.status(502).json();
    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const giveRevision = async (req: any, res: Response, next: NextFunction) => {
    try {
        let { revisionComment } = req.body;
        let enquiryId = req.params.enquiryId;
        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $push: { 'preSale.revisionComment': revisionComment },
                status: 'Assigned To Presales',
                'preSale.seenbyEmployee': false,
                'preSale.newFeedbackAccess': true,
                'preSale.createdDate': Date.now()
            },
            { new: true }
        );

        const socket = req.app.get('io') as Server;
        socket.to(result.preSale.presalePerson.toString()).emit("notifications", 'assignedJob')

        if (!result) {
            return res.status(404).send('Enquiry not found or comment not added.');
        }

        return res.status(200).json({ success: true })
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const reviseQuoteEstimation = async (req: any, res: Response, next: NextFunction) => {
    try {
        let { revisionComment, quoteId } = req.body;
        let enquiryId = req.params.enquiryId;
        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $push: { 'preSale.revisionComment': revisionComment },
                status: 'Assigned To Presales Manager',
                'preSale.seenbyEmployee': false,
                'preSale.newFeedbackAccess': true,
                'preSale.createdDate': Date.now()
            },
            { new: true }
        );

        await quotationModel.updateOne({ _id: quoteId }, { $set: { status: "revised" } })

        const socket = req.app.get('io') as Server;
        socket.to(result.preSale.presalePerson.toString()).emit("notifications", 'assignedJob')

        if (!result) {
            return res.status(404).send('Enquiry not found or comment not added.');
        }

        return res.status(200).json({ success: true })
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const uploadEstimations = async (req: any, res: Response, next: NextFunction) => {
    try {
        let { optionalItems, enquiryId, currency, totalDiscount, preSaleNote, selectedOption } = req.body;

        const quote = await quotationModel.findOne({ enqId: enquiryId })
        if (quote) {
            let quoteData = await quotationModel.updateOne(
                { _id: quote._id },
                {
                    $set: {
                        'optionalItems': optionalItems,
                        'currency': currency,
                        'totalDiscount': totalDiscount,
                    }
                }
            );
        }

        let enquiryData = await enquiryModel.updateOne(
            { _id: new ObjectId(enquiryId) },
            {
                $set: {
                    'preSale.estimations.optionalItems': optionalItems,
                    'preSale.estimations.currency': currency,
                    'preSale.estimations.presaleNote': preSaleNote,
                }
            }
        );


        if (!enquiryData.modifiedCount) {
            return res.status(502).json();
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.log(error)
        next(error);
    }
}


const generateEnquiryId = async (departmentId: string, employeeId: string, date: string) => {
    try {
        const lastEnquiry = await enquiryModel.aggregate([
            {
                $match: {
                    enquiryId: { $exists: true }
                }
            },
            {
                $addFields: {
                    lastNumber: {
                        $toInt: { $arrayElemAt: [{ $split: ["$enquiryId", "-"] }, -1] }
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

            if (lastEnquiry.length) {
                const lastNumber = lastEnquiry[0].lastNumber;
                const incrementedNum = parseInt(lastNumber) + 1;
                const formattedIncrementedNum = String(incrementedNum).padStart(3, '0');
                quoteId = `ENQ-NT/${salesId}/${departmentName}-${formatedDate}-${formattedIncrementedNum}`
            } else {
                quoteId = `ENQ-NT/${salesId}/${departmentName}-${formatedDate}-001`
            }
        }
        return quoteId;
    } catch (error) {
        console.log(error)
    }
}



export const presalesCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;

        let accessFilter: any = { status: 'Assigned To Presales' };

        switch (access) {
            case 'assigned':
                accessFilter = { "preSale.presalePerson": userId };
                break;
            default:
                break;
        }

        const totalPendingJobs: { total: number }[] = await enquiryModel.aggregate([
            {
                $match: {
                    ...accessFilter,
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { _id: 0, total: 1 }
            }
        ])

        accessFilter.status = 'Work In Progress'

        const totalCompletedJobs: { total: number }[] = await enquiryModel.aggregate([
            {
                $match: {
                    ...accessFilter,
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { _id: 0, total: 1 }
            }
        ])

        let presaleCounts = {
            pending: totalPendingJobs[0]?.total || 0,
            completed: totalCompletedJobs[0]?.total || 0
        };


        if (presaleCounts) return res.status(200).json(presaleCounts)

        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const deleteEstimation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enquiryId = req.params.enqId;

        const deleteEstimations = await enquiryModel.updateOne(
            { _id: enquiryId },
            { $unset: { 'preSale.estimations': "" } }
        )

        if (deleteEstimations.modifiedCount) {
            res.status(200).json({ success: true });
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}


export const markAsSeenEstimation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enquiryId: string = req.body.enquiryId


        const result = await enquiryModel.updateOne(
            { _id: enquiryId },
            { $set: { 'preSale.seenbySalesPerson': true } }
        );

        console.log(result)

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'No enquiries found' });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const markAsSeenJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobIds: string = req.body.jobId


        const result = await enquiryModel.updateOne(
            { _id: jobIds },
            { $set: { 'preSale.seenbyEmployee': true } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'No enquiries found' });
        }

        res.status(200).json({ message: 'Enquiries marked as seen', result });
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const markAsSeenReAssingedJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobIds: string = req.body.jobId


        const result = await enquiryModel.updateOne(
            { _id: jobIds },
            { $set: { reAssignedSeen: true } }
        );
        console.log(result)

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'No enquiries found' });
        }

        res.status(200).json({ message: 'Enquiries marked as seen', result });
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const markAsSeenFeedback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId, feedbackId } = req.body;

        const result = await enquiryModel.updateOne(
            { _id: new ObjectId(enqId), "preSale.feedback._id": feedbackId },
            { $set: { "preSale.feedback.$.seenByFeedbackProvider": true } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'No matching feedback found' });
        }

        res.status(200).json({ message: 'Feedback marked as seen', result });
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const markFeedbackResponseAsViewed = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId, feedbackId } = req.body;

        const result = await enquiryModel.updateOne(
            { _id: enqId, "preSale.feedback._id": feedbackId },
            { $set: { "preSale.feedback.$.seenByFeedbackRequester": true } },
            { new: true } as any
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'No feedback found' });
        }

        res.status(200).json({ message: 'Feedback response marked as viewed', result });
    } catch (error) {
        console.log(error)
        next(error);
    }
};


export const RejectPresaleJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId, comment, role } = req.body;
        const enquiry = await enquiryModel.findOne({ _id: new ObjectId(enqId) });

        if (!enquiry) {
            throw new Error('Enquiry not found');
        }

        // Add a new rejection event to the history
        enquiry.preSale.rejectionHistory.push({
            rejectionReason: comment,
            rejectedBy: enquiry.preSale.presalePerson,
            rejectedRole: role
        });

        enquiry.preSale.feedback = [];
        enquiry.preSale.revisionComment = [];
        enquiry.preSale.seenbyEmployee = false;
        enquiry.preSale.seenbySalesPerson = true;

        delete enquiry.preSale.estimations;
        enquiry.preSale.newFeedbackAccess = true;

        enquiry.status = `Rejected by Presale ${role}`;

        const result = await enquiry.save();
        if (!result) {
            return res.status(404).json({ message: 'Something went wrong' });
        }

        const socket = req.app.get('io') as Server;
        socket.to(result.preSale.presalePerson.toString()).emit("notifications", 'assignedJob')

        res.status(200).json({ success: true });
    } catch (error) {
        console.log(error)
        next(error);
    }
};

export const deleteEnquiry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employeeId } = req.body

        // Check if enquiry exists and isn't already deleted
        const enquiry = await enquiryModel.findOne({
            _id: dataId,
        });

        if (!enquiry) {
            return res.status(404).json({
                message: 'Enquiry not found or already deleted'
            });
        }
        newTrash('Enquiry', dataId, employeeId)
        // Soft delete the enquiry
        await enquiryModel.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        return res.status(200).json({
            success: true,
            message: 'Enquiry deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}

export const reAssignJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enquiryId, employeeId } = req.body
        if (!employeeId) {
            return res.status(404).json({ message: 'Something went wrong' });
        }
        const enquiryUpdate = await enquiryModel.findOneAndUpdate({ _id: enquiryId }, { $set: { reAssigned: employeeId, status: 'Assigned To Presale Engineer', reAssignedSeen: false } })
        const socket = req.app.get('io') as Server;
        socket.to(employeeId.toString()).emit("notifications", 'reAssignedJob')
        return res.status(200).json({ message: 'Enquiry Reassigned successfully' })
    } catch (error) {
        next(error)
    }
}