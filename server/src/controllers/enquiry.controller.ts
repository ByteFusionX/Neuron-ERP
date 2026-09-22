import { NextFunction, Request, Response } from "express"
import enquiryModel from "../models/enquiry.model";
import Employee from '../models/employee.model';
import Department from '../models/department.model';
import customerModel from "../models/customer.model";
import { Enquiry } from "../interface/enquiry.interface";
import { Server } from "socket.io";
import quotationModel from "../models/quotation.model";
import { uploadFileToAws, deleteFileFromAws } from "../common/aws-connect";
import { newTrash } from '../controllers/trash.controller'
import { getAllReportedEmployees, getEmployeeData } from "../common/utils/util";
import { createNotificationWithPrivileges } from "./notification.controller";
import { getNextSequence } from "../models/counter.model";
const { ObjectId } = require('mongodb')

const buildAssignmentEntry = async (employeeId: any, action: 'assigned' | 'reassigned', assignedBy: any) => {
    const employee: any = employeeId ? await Employee.findById(employeeId).populate('category') : null;
    return {
        employee: employeeId,
        employeeName: employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : '',
        action,
        role: employee?.category?.role || employee?.designation || '',
        assignedBy: assignedBy?._id || null,
        assignedByName: assignedBy ? `${assignedBy.firstName || ''} ${assignedBy.lastName || ''}`.trim() : '',
        date: new Date()
    };
};

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

const titleTokens = (title: string) =>
    new Set((title || '').toLowerCase().replace(/[^a-z0-9s]/g, ' ').split(/s+/).filter(t => t.length > 2));

/** Open enquiries of the same customer whose title looks like the one being entered. */
export const findSimilarEnquiries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const client = String(req.query.client || '');
        const title = String(req.query.title || '');
        if (!ObjectId.isValid(client) || !title.trim()) return res.status(200).json([]);

        const wanted = titleTokens(title);
        if (!wanted.size) return res.status(200).json([]);

        const open = await enquiryModel.find(
            { client: new ObjectId(client), status: { $ne: 'Quoted' } },
            { enquiryId: 1, title: 1, status: 1, date: 1 }
        ).sort({ _id: -1 }).limit(200).lean();

        const similar = open.filter((enquiry: any) => {
            const existing = titleTokens(enquiry.title);
            if (!existing.size) return false;
            const shared = [...wanted].filter(t => existing.has(t)).length;
            return shared / Math.min(wanted.size, existing.size) >= 0.7;
        }).slice(0, 5);

        return res.status(200).json(similar);
    } catch (error) {
        next(error);
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

        const assigner = await getEmployeeData(req.user);
        const assignmentEntry = presale.presalePerson
            ? await buildAssignmentEntry(presale.presalePerson, 'assigned', assigner)
            : null;

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
                ...(assignmentEntry ? { $push: { assignmentHistory: assignmentEntry } } : {})
            }
        );

        // Notify the presale person via notification
        if (presale.presalePerson) {
            const socket = req.app.get('io') as Server;
            const enquiry = await enquiryModel.findById(enquiryId);
            const userData = await getEmployeeData(req.user);
            if (enquiry) {
                await createNotificationWithPrivileges(
                    {
                        type: 'AssignedJob',
                        referenceModel: 'Enquiry',
                        title: 'New Job Assigned to You',
                        message: `A new presale job has been assigned to you for enquiry ${enquiry.enquiryId}`,
                        sentBy: userData?._id?.toString() || enquiry.salesPerson.toString(),
                        referenceId: enquiry._id,
                        additionalData: { enquiryId: enquiry._id.toString() }
                    },
                    {
                        privilegeKey: 'assignedJob',
                        checkFunction: (privileges, employeeId) => {
                            return employeeId === presale.presalePerson.toString() && 
                                   privileges.assignedJob?.viewReport !== 'none';
                        }
                    },
                    socket
                );
            }
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

export const updateEnquiryAttachments = async (req: any, res: Response) => {
    try {
        const { enquiryId } = req.params;

        const enquiry = await enquiryModel.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }

        const employee = req.employee;
        const role = employee?.category?.role;
        const isOwner = enquiry.salesPerson?.toString() === employee?._id?.toString();
        if (role !== 'admin' && role !== 'superAdmin' && !isOwner) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        let attachments = [];
        if (req.files && req.files.length > 0) {
            attachments = await Promise.all(req.files.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        if (req.body.existingFiles) {
            try {
                const existingFiles = typeof req.body.existingFiles === 'string'
                    ? JSON.parse(req.body.existingFiles)
                    : req.body.existingFiles;
                attachments = [...attachments, ...existingFiles];
            } catch (error) {
                console.error('Error parsing existingFiles:', error);
            }
        }

        const updatedEnquiry = await enquiryModel.findByIdAndUpdate(
            enquiryId,
            { $set: { attachments } },
            { new: true, runValidators: true }
        );

        return res.status(200).json({ success: true, message: 'Attachments updated successfully', data: updatedEnquiry });
    } catch (error: any) {
        console.error('Error in updateEnquiryAttachments:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

export const removeEnquiryAttachment = async (req: any, res: Response) => {
    try {
        const { enquiryId, fileName } = req.params;

        const enquiry = await enquiryModel.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ success: false, message: "Enquiry not found" });
        }

        const employee = req.employee;
        const role = employee?.category?.role;
        const isOwner = enquiry.salesPerson?.toString() === employee?._id?.toString();
        if (role !== "admin" && role !== "superAdmin" && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        const remaining = (enquiry.attachments || []).filter((file: any) => file.fileName !== fileName);
        if (remaining.length === (enquiry.attachments || []).length) {
            return res.status(404).json({ success: false, message: "Attachment not found" });
        }

        await deleteFileFromAws(fileName);
        const updated = await enquiryModel.findByIdAndUpdate(enquiryId, { $set: { attachments: remaining } }, { new: true });
        return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
        console.error("Error in removeEnquiryAttachment:", error);
        return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

export const getEnquiries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, search, sortKey, sortDir, salesPerson, status, customer, fromDate, toDate, department, access, userId, createdBy } = req.body;
        let skipNum: number = (page - 1) * row;

        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isStatus = status == null ? true : false;
        let isDepartment = department == null ? true : false;

        const dateFilter: Record<string, Date> = {};
        if (fromDate) dateFilter.$gte = new Date(fromDate);
        if (toDate) {
            const endDate = new Date(toDate);
            endDate.setDate(endDate.getDate() + 1);
            dateFilter.$lt = endDate;
        }

        const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchText = search?.trim() ? escapeRegex(search.trim()) : '';
        const matchingCustomerIds = searchText
            ? (await customerModel.find({ companyName: { $regex: searchText, $options: 'i' } }, { _id: 1 }).lean()).map((c: any) => c._id)
            : [];
        const searchFilter = searchText
            ? { $or: [
                { enquiryId: { $regex: searchText, $options: 'i' } },
                { title: { $regex: searchText, $options: 'i' } },
                { client: { $in: matchingCustomerIds } }
            ] }
            : {};

        let matchFilters = {
            isDeleted: { $ne: true },
            $and: [
                searchFilter,
                { $or: [{ salesPerson: new ObjectId(salesPerson) }, { salesPerson: { $exists: isSalesPerson } }] },
                { $or: [{ status: status }, { status: { $exists: isStatus } }] },
                { $or: [{ client: new ObjectId(customer) }, { client: { $exists: isCustomer } }] },
                Object.keys(dateFilter).length ? { date: dateFilter } : {},
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

        const creatorFilter = createdBy ? { salesPerson: new ObjectId(createdBy) } : {};
        const baseFilters = { $and: [matchFilters, accessFilter] };
        const filters = { $and: [matchFilters, accessFilter, creatorFilter] }

        // 'Sended by Presale Engineer' rows are hidden here so paging and counts stay correct.
        const hiddenStatuses = ['Quoted', 'Sended by Presale Engineer'];

        const enquiryTotal: { total: number }[] = await enquiryModel.aggregate([
            { $match: filters },
            { $match: { status: { $nin: hiddenStatuses } } },
            { $group: { _id: null, total: { $sum: 1 } } },
            { $project: { total: 1, _id: 0 } }
        ]).exec()

        const viewCounts = await enquiryModel.aggregate([
            { $match: baseFilters },
            { $match: { status: { $nin: hiddenStatuses } } },
            {
                $facet: {
                    all: [{ $count: 'total' }],
                    mine: [
                        { $match: { salesPerson: new ObjectId(userId) } },
                        { $count: 'total' }
                    ]
                }
            }
        ]).exec();

        const sortableFields: Record<string, string> = {
            date: 'date',
            enquiryId: 'enquiryId',
            description: 'title',
            status: 'status'
        };
        // Sorting by a related record's name needs that name pulled in ahead of the sort/paging stages.
        const relatedSorts: Record<string, { from: string; localField: string; name: any }> = {
            customer: { from: 'customers', localField: 'client', name: '$_sortRef.companyName' },
            department: { from: 'departments', localField: 'department', name: '$_sortRef.departmentName' },
            salesPerson: {
                from: 'employees',
                localField: 'salesPerson',
                name: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$_sortRef.firstName', 0] }, ''] }, ' ', { $ifNull: [{ $arrayElemAt: ['$_sortRef.lastName', 0] }, ''] }] }
            }
        };
        const relatedSort = relatedSorts[sortKey];
        const resolvedSortKey = relatedSort ? '_sortValue' : (sortableFields[sortKey] || '_id');
        const resolvedSortDirection = sortDir === 'asc' ? 1 : -1;
        const sortPrep: any[] = relatedSort ? [
            { $lookup: { from: relatedSort.from, localField: relatedSort.localField, foreignField: '_id', as: '_sortRef' } },
            {
                $addFields: {
                    _sortValue: {
                        $toLower: relatedSort.localField === 'salesPerson'
                            ? relatedSort.name
                            : { $ifNull: [{ $arrayElemAt: [relatedSort.name, 0] }, ''] }
                    }
                }
            }
        ] : [];

        const enquiryData = await enquiryModel.aggregate([
            { $match: filters },
            { $match: { status: { $nin: hiddenStatuses } } },
            ...sortPrep,
            { $sort: { [resolvedSortKey]: resolvedSortDirection, _id: resolvedSortDirection } },
            { $skip: skipNum },
            { $limit: row },
            ...(relatedSort ? [{ $project: { _sortRef: 0, _sortValue: 0 } }] : []),
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

        return res.status(200).json({
            total: enquiryTotal[0]?.total ?? 0,
            enquiry: enquiryData,
            viewCounts: {
                all: viewCounts[0]?.all[0]?.total ?? 0,
                mine: viewCounts[0]?.mine[0]?.total ?? 0
            }
        })

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
        return res.status(200).json({ total: 0, enquiry: [] })
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
            const userData = await getEmployeeData(req.user);
            await createNotificationWithPrivileges(
                {
                    type: 'Enquiry',
                    referenceModel: 'Enquiry',
                    title: 'Estimation sent back to enquiry',
                    message: `Presale estimation has been sent back for enquiry ${update.enquiryId}`,
                    sentBy: userData?._id?.toString() || update.salesPerson._id.toString(),
                    referenceId: update._id,
                    additionalData: { enquiryId: update._id.toString() }
                },
                { privilegeKey: 'enquiry' },
                socket
            );
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
            const userData = await getEmployeeData(req.user);
            await createNotificationWithPrivileges(
                {
                    type: 'FeedbackRequest',
                    referenceModel: 'Enquiry',
                    title: 'Feedback Requested',
                    message: `You have been requested to provide feedback for enquiry ${result.enquiryId}`,
                    sentBy: userData?._id?.toString() || result.salesPerson.toString(),
                    referenceId: result._id,
                    additionalData: { enquiryId: result._id.toString() }
                },
                {
                    privilegeKey: 'assignedJob',
                    checkFunction: (privileges, empId) => {
                        return empId === employeeId && 
                               privileges.assignedJob?.viewReport !== 'none';
                    }
                },
                socket
            );
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
        return res.status(200).json({ total: 0, feedbacks: [] });
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
            const userData = await getEmployeeData(req.user);
            await createNotificationWithPrivileges(
                {
                    type: 'AssignedJob',
                    referenceModel: 'Enquiry',
                    title: 'Feedback Received',
                    message: `Feedback has been provided for enquiry ${result.enquiryId}`,
                    sentBy: userData?._id?.toString() || presalePerson,
                    referenceId: result._id,
                    additionalData: { enquiryId: result._id.toString() }
                },
                {
                    privilegeKey: 'assignedJob',
                    checkFunction: (privileges, employeeId) => {
                        return employeeId === presalePerson && 
                               privileges.assignedJob?.viewReport !== 'none';
                    }
                },
                socket
            );
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
        const existingEnquiry = await enquiryModel.findById(enquiryId);
        const revisionStatus = existingEnquiry?.reAssigned ? 'Assigned To Presale Engineer' : 'Assigned To Presale Manager';
        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $push: { 'preSale.revisionComment': revisionComment },
                status: revisionStatus,
                'preSale.seenbyEmployee': false,
                'preSale.newFeedbackAccess': true,
                'preSale.createdDate': Date.now()
            },
            { new: true }
        );

        const socket = req.app.get('io') as Server;
        const presalePerson = result.preSale.presalePerson.toString();
        const userData = await getEmployeeData(req.user);
        await createNotificationWithPrivileges(
            {
                type: 'AssignedJob',
                referenceModel: 'Enquiry',
                title: 'Estimation sent back for revision',
                message: `Presale estimation has been sent back for revision for enquiry ${result.enquiryId}`,
                sentBy: userData?._id?.toString() || presalePerson,
                referenceId: result._id,
                additionalData: { enquiryId: result._id.toString() }
            },
            {
                privilegeKey: 'assignedJob',
                checkFunction: (privileges, employeeId) => {
                    return employeeId === presalePerson && 
                           privileges.assignedJob?.viewReport !== 'none';
                }
            },
            socket
        );

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
                status: 'Assigned To Presale Manager',
                'preSale.seenbyEmployee': false,
                'preSale.newFeedbackAccess': true,
                'preSale.createdDate': Date.now()
            },
            { new: true }
        );

        await quotationModel.updateOne({ _id: quoteId }, { $set: { status: "revised" } })

        const socket = req.app.get('io') as Server;
        const presalePerson = result.preSale.presalePerson.toString();
        const userData = await getEmployeeData(req.user);
        await createNotificationWithPrivileges(
            {
                type: 'AssignedJob',
                referenceModel: 'Enquiry',
                title: 'Estimation sent back for revision',
                message: `Presale estimation has been sent back for revision for enquiry ${result.enquiryId}`,
                sentBy: userData?._id?.toString() || presalePerson,
                referenceId: result._id,
                additionalData: { enquiryId: result._id.toString() }
            },
            {
                privilegeKey: 'assignedJob',
                checkFunction: (privileges, employeeId) => {
                    return employeeId === presalePerson && 
                           privileges.assignedJob?.viewReport !== 'none';
                }
            },
            socket
        );

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


// Numbering is per department and per calendar year, so each series stays gap-free for audit.
const seedEnquiryIdSequence = (departmentId: string, year: number) => async (): Promise<number> => {
    const lastEnquiry = await enquiryModel.aggregate([
        { $match: {
            enquiryId: { $exists: true },
            department: new ObjectId(departmentId),
            date: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) }
        } },
        { $addFields: { lastNumber: { $toInt: { $arrayElemAt: [{ $split: ["$enquiryId", "-"] }, -1] } } } },
        { $sort: { lastNumber: -1 } },
        { $limit: 1 }
    ]);
    return lastEnquiry.length ? parseInt(lastEnquiry[0].lastNumber) : 0;
};

const generateEnquiryId = async (departmentId: string, employeeId: string, date: string) => {
    try {
        const department = await Department.findById(departmentId);
        const employee = await Employee.findById(employeeId);
        let quoteId: string;

        if (employee && department) {
            // Initials of first/last name; a single-name employee uses the first two letters so the ID never has gaps.
            const nameParts = `${employee.firstName || ''} ${employee.lastName || ''}`.replace(/[^A-Za-z ]/g, '').trim().split(/s+/).filter(Boolean);
            const salesId = (nameParts.length > 1
                ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
                : (nameParts[0] || 'XX').slice(0, 2)).toUpperCase();
            const departmentName = department.departmentName.split(' ')[0].replace(/\s/g, "").toUpperCase().slice(0, 4);

            const [year, month] = date.split('-');
            const formatedDate = `${month}/${year.substring(2)}`;

            const incrementedNum = await getNextSequence(`enquiryId:${year}:${departmentId}`, seedEnquiryIdSequence(departmentId, Number(year)));
            const formattedIncrementedNum = String(incrementedNum).padStart(3, '0');
            quoteId = `ENQ-NT/${salesId}/${departmentName}-${formatedDate}-${formattedIncrementedNum}`
        }
        return quoteId;
    } catch (error) {
        console.log(error)
    }
}



export const presalesCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;

        let accessFilter: any = { status: { $in: ['Assigned To Presale Manager', 'Assigned To Presale Engineer'] } };

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

export const markAsSeenFeedback = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { enqIds } = req.body;
        const userData = await getEmployeeData(req.user);

        const result = await enquiryModel.updateOne(
            { _id: new ObjectId(enqIds), "preSale.feedback.employeeId": userData?._id },
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
        const presalePerson = result.preSale.presalePerson.toString();
        const userData = await getEmployeeData(req.user);

        if (role === 'Engineer') {
            await createNotificationWithPrivileges(
                {
                    type: 'AssignedJob',
                    referenceModel: 'Enquiry',
                    title: 'Presale Job Rejected by Engineer',
                    message: `Presale job has been rejected by engineer for enquiry ${result.enquiryId}`,
                    sentBy: userData?._id?.toString() || presalePerson,
                    referenceId: result._id,
                    additionalData: { enquiryId: result._id.toString() }
                },
                {
                    privilegeKey: 'assignedJob',
                    checkFunction: (privileges, employeeId) => {
                        return employeeId === presalePerson &&
                               privileges.assignedJob?.viewReport !== 'none';
                    }
                },
                socket
            );
        } else {
            await createNotificationWithPrivileges(
                {
                    type: 'Enquiry',
                    referenceModel: 'Enquiry',
                    title: 'Presale Job Rejected by Manager',
                    message: `Presale job has been rejected by manager for enquiry ${result.enquiryId}`,
                    sentBy: userData?._id?.toString() || presalePerson,
                    referenceId: result._id,
                    additionalData: { enquiryId: result._id.toString() }
                },
                { privilegeKey: 'enquiry' },
                socket
            );
        }

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
        const reAssigner = await getEmployeeData(req.user);
        const reAssignEntry = await buildAssignmentEntry(employeeId, 'reassigned', reAssigner);
        const enquiryUpdate = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $set: { reAssigned: employeeId, reAssignedDate: reAssignEntry.date, status: 'Assigned To Presale Engineer', reAssignedSeen: false },
                $push: { assignmentHistory: reAssignEntry }
            }
        )
        const socket = req.app.get('io') as Server;
        const enquiry = await enquiryModel.findById(enquiryId);
        const userData = await getEmployeeData(req.user);
        if (enquiry) {
            await createNotificationWithPrivileges(
                {
                    type: 'ReAssignedJob',
                    referenceModel: 'Enquiry',
                    title: 'Job Reassigned to You',
                    message: `Job has been reassigned to you for enquiry ${enquiry.enquiryId}`,
                    sentBy: userData?._id?.toString() || employeeId.toString(),
                    referenceId: enquiry._id,
                    additionalData: { enquiryId: enquiry._id.toString() }
                },
                {
                    privilegeKey: 'assignedJob',
                    checkFunction: (privileges, empId) => {
                        return empId === employeeId.toString() && 
                               privileges.assignedJob?.viewReport !== 'none';
                    }
                },
                socket
            );
        }
        return res.status(200).json({ message: 'Enquiry Reassigned successfully' })
    } catch (error) {
        next(error)
    }
}


// ---- Report -------------------------------------------------------------------------------------

/** Every enquiry sits in exactly one stage, derived from its status and whether presales ever held it. */
const REPORT_STAGES = [
    { key: 'new', label: 'New' },
    { key: 'presales', label: 'With Presales' },
    { key: 'estimated', label: 'Estimated' },
    { key: 'quoted', label: 'Quoted' },
    { key: 'rejected', label: 'Rejected' },
];

const enquiryStage = (e: any): string => {
    const status: string = e.status || '';
    if (status === 'Quoted') return 'quoted';
    if (status.startsWith('Rejected by Presale')) return 'rejected';
    if (status.startsWith('Assigned To Presale') || status === 'Sended by Presale Engineer') return 'presales';
    // Back with the sales person: an estimation exists if presales ever worked on it.
    if (status === 'Work In Progress') return e.preSale?.presalePerson ? 'estimated' : 'new';
    return 'other';
};

const reportMonthKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const personName = (p: any): string => [p?.firstName, p?.lastName].filter(Boolean).join(' ');

/** Accumulates one report row per key, so department / sales person / customer / presale share a code path. */
const tallyEnquiry = (map: Map<string, any>, id: string, name: string, stage: string) => {
    let row = map.get(id);
    if (!row) {
        row = { id, name, count: 0, openCount: 0, quotedCount: 0, rejectedCount: 0, conversionRate: 0 };
        map.set(id, row);
    }
    row.count += 1;
    if (stage === 'quoted') row.quotedCount += 1;
    else if (stage === 'rejected') row.rejectedCount += 1;
    else row.openCount += 1;
};

export const getEnquiryReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { salesPerson, customer, fromDate, toDate, department, access, userId } = req.body;

        const match: any = { isDeleted: { $ne: true } };
        if (salesPerson) match.salesPerson = new ObjectId(salesPerson);
        if (customer) match.client = new ObjectId(customer);
        if (department) match.department = new ObjectId(department);
        const dateFilter: Record<string, Date> = {};
        if (fromDate) dateFilter.$gte = new Date(fromDate);
        if (toDate) {
            const end = new Date(toDate);
            end.setDate(end.getDate() + 1);
            dateFilter.$lt = end;
        }
        if (Object.keys(dateFilter).length) match.date = dateFilter;

        // Same visibility rule as the list: a viewer only reports on the people they may see.
        const reportedToUserIds = access === 'reported' || access === 'createdAndReported'
            ? await getAllReportedEmployees(userId)
            : [];
        if (access === 'created') match.salesPerson = new ObjectId(userId);
        else if (access === 'reported') match.salesPerson = { $in: reportedToUserIds };
        else if (access === 'createdAndReported') match.salesPerson = { $in: [...reportedToUserIds, new ObjectId(userId)] };

        const enquiries: any[] = await enquiryModel.find(match)
            .select('enquiryId title status date client salesPerson department assignmentHistory preSale.presalePerson preSale.createdDate preSale.rejectionHistory')
            .populate('client', 'companyName')
            .populate('salesPerson', 'firstName lastName')
            .populate('department', 'departmentName')
            .populate('preSale.presalePerson', 'firstName lastName')
            .lean();

        // "Days to quote" comes from the quotation raised against the enquiry; the earliest one counts.
        const quotes: any[] = enquiries.length
            ? await quotationModel.find({ enqId: { $in: enquiries.map((e) => e._id) }, isDeleted: { $ne: true }, date: { $exists: true } })
                .select('enqId date').lean()
            : [];
        const firstQuoteAt = new Map<string, Date>();
        quotes.forEach((q) => {
            const key = String(q.enqId);
            const at = new Date(q.date);
            const seen = firstQuoteAt.get(key);
            if (!seen || at < seen) firstQuoteAt.set(key, at);
        });

        const now = new Date();
        const DAY = 24 * 60 * 60 * 1000;
        const NOT_STARTED_DAYS = 2;
        const STUCK_DAYS = 3;
        const AWAITING_QUOTE_DAYS = 7;
        const daysSince = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY));

        // One pass decorates each enquiry, so every section below is a plain filter over the same array.
        const enriched = enquiries.map((e: any) => {
            const history: any[] = e.assignmentHistory || [];
            const lastAssignment = history.length ? history[history.length - 1] : null;
            const holderId = lastAssignment?.employee ? String(lastAssignment.employee) : e.preSale?.presalePerson?._id ? String(e.preSale.presalePerson._id) : null;
            const holderName = lastAssignment?.employeeName || personName(e.preSale?.presalePerson) || '';
            const quotedAt = firstQuoteAt.get(String(e._id)) || null;
            return {
                e,
                stage: enquiryStage(e),
                holderId,
                holderName,
                createdAt: new Date(e.date),
                assignedAt: new Date(lastAssignment?.date || e.preSale?.createdDate || e.date),
                quotedAt,
                rejections: e.preSale?.rejectionHistory || [],
                sentToPresales: history.length > 0 || !!e.preSale?.presalePerson,
            };
        });

        const inStage = (key: string) => enriched.filter((r) => r.stage === key);
        const quotedRows = inStage('quoted');
        const rejectedRows = inStage('rejected');
        const presalesRows = inStage('presales');
        const total = enriched.length;
        const sentCount = enriched.filter((r) => r.sentToPresales).length;
        const everRejected = enriched.filter((r) => r.rejections.length > 0).length;

        const quoteDurations = quotedRows
            .filter((r) => r.quotedAt)
            .map((r) => (r.quotedAt!.getTime() - r.createdAt.getTime()) / DAY)
            .filter((d) => d >= 0);

        const kpi = {
            totalCount: total,
            openCount: total - quotedRows.length - rejectedRows.length,
            presalesCount: presalesRows.length,
            estimatedCount: inStage('estimated').length,
            quotedCount: quotedRows.length,
            rejectedCount: rejectedRows.length,
            everRejectedCount: everRejected,
            sentToPresalesCount: sentCount,
            conversionRate: total ? (quotedRows.length / total) * 100 : 0,
            rejectionRate: sentCount ? (everRejected / sentCount) * 100 : 0,
            avgDaysToQuote: quoteDurations.length ? quoteDurations.reduce((a, b) => a + b, 0) / quoteDurations.length : null,
        };

        const funnel = [
            ...REPORT_STAGES,
            ...(inStage('other').length ? [{ key: 'other', label: 'Other' }] : []),
        ].map((stage) => {
            const count = inStage(stage.key).length;
            return { key: stage.key, label: stage.label, count, pct: total ? (count / total) * 100 : 0 };
        });

        // Last 12 months including the current one; empty months stay in so a gap reads as a gap.
        const months: string[] = [];
        for (let i = 11; i >= 0; i--) {
            months.push(reportMonthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
        }
        const trendMap = new Map<string, any>(months.map((m) => [m, { month: m, createdCount: 0, quotedCount: 0 }]));
        enriched.forEach((r) => {
            const created = trendMap.get(reportMonthKey(r.createdAt));
            if (created) created.createdCount += 1;
            if (r.quotedAt) {
                const quoted = trendMap.get(reportMonthKey(r.quotedAt));
                if (quoted) quoted.quotedCount += 1;
            }
        });
        const trend = months.map((m) => trendMap.get(m));

        const byDepartment = new Map<string, any>();
        const bySalesPerson = new Map<string, any>();
        const byCustomer = new Map<string, any>();
        const byPresale = new Map<string, any>();
        enriched.forEach((r) => {
            const e = r.e;
            tallyEnquiry(byDepartment, String(e.department?._id), e.department?.departmentName || 'Unassigned', r.stage);
            tallyEnquiry(bySalesPerson, String(e.salesPerson?._id), personName(e.salesPerson) || 'Unknown', r.stage);
            tallyEnquiry(byCustomer, String(e.client?._id), e.client?.companyName || 'Unknown', r.stage);
            if (r.holderId) tallyEnquiry(byPresale, r.holderId, r.holderName || 'Unknown', r.stage);
        });
        const finish = (map: Map<string, any>) =>
            [...map.values()]
                .map((row) => ({ ...row, conversionRate: row.count ? (row.quotedCount / row.count) * 100 : 0 }))
                .sort((a, b) => b.count - a.count);

        // Open work only: a quoted enquiry has nothing left to chase, a rejected one is listed on its own.
        const brief = (r: any, days: number) => ({
            _id: String(r.e._id),
            enquiryId: r.e.enquiryId,
            title: r.e.title,
            customer: r.e.client?.companyName || '',
            salesPerson: personName(r.e.salesPerson),
            presale: r.holderName,
            status: r.e.status,
            days,
        });
        const byDaysDesc = (a: any, b: any) => b.days - a.days;
        const notStarted = inStage('new')
            .filter((r) => daysSince(r.createdAt) >= NOT_STARTED_DAYS)
            .map((r) => brief(r, daysSince(r.createdAt))).sort(byDaysDesc);
        const stuck = presalesRows
            .filter((r) => daysSince(r.assignedAt) >= STUCK_DAYS)
            .map((r) => brief(r, daysSince(r.assignedAt))).sort(byDaysDesc);
        const awaitingQuote = inStage('estimated')
            .filter((r) => daysSince(r.createdAt) >= AWAITING_QUOTE_DAYS)
            .map((r) => brief(r, daysSince(r.createdAt))).sort(byDaysDesc);
        const rejected = rejectedRows
            .map((r) => brief(r, daysSince(r.assignedAt))).sort(byDaysDesc);

        // What presales are holding right now, so an unbalanced load is visible at a glance.
        const workloadMap = new Map<string, any>();
        presalesRows.forEach((r) => {
            const id = r.holderId || 'unassigned';
            const row = workloadMap.get(id) || { id, name: r.holderName || 'Unassigned', count: 0, oldestDays: 0 };
            row.count += 1;
            row.oldestDays = Math.max(row.oldestDays, daysSince(r.assignedAt));
            workloadMap.set(id, row);
        });
        const workload = [...workloadMap.values()].sort((a, b) => b.count - a.count);

        // Free text left when presales rejected an enquiry; grouped so repeats stand out.
        const reasonMap = new Map<string, any>();
        enriched.forEach((r) => r.rejections.forEach((entry: any) => {
            const reason = (entry?.rejectionReason || '').trim() || 'No reason recorded';
            const row = reasonMap.get(reason) || { reason, count: 0 };
            row.count += 1;
            reasonMap.set(reason, row);
        }));
        const rejectionReasons = [...reasonMap.values()].sort((a, b) => b.count - a.count);

        return res.status(200).json({
            generatedAt: now,
            kpi,
            funnel,
            trend,
            breakdown: {
                department: finish(byDepartment),
                salesPerson: finish(bySalesPerson),
                customer: finish(byCustomer).slice(0, 25),
                presale: finish(byPresale),
            },
            attention: {
                notStarted, stuck, awaitingQuote, rejected,
                notStartedDays: NOT_STARTED_DAYS, stuckDays: STUCK_DAYS, awaitingQuoteDays: AWAITING_QUOTE_DAYS,
            },
            workload,
            rejectionReasons,
        });
    } catch (error) {
        console.error(error);
        return res.status(502).json({ error: 'Failed to generate report' });
    }
};
