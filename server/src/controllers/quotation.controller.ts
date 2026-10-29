import { NextFunction, Response, Request } from "express";
import crypto from 'crypto';
import Quotation, { quoteStatus } from '../models/quotation.model';
import { canTransitionQuoteStatus, isKnownQuoteStatus, quoteStatusRequiresReason } from '../common/quote-status-transitions';
import Job, { allocateStatus } from '../models/job.model';
import Department from '../models/department.model';
import Employee from '../models/employee.model'
import Category from '../models/category.model'
import Customer from '../models/customer.model';
import ApprovalRule from '../models/approvalRule.model';
import Enquiry from "../models/enquiry.model";
import Product from "../models/products.model";
import ProductCategory from "../models/productCategory.model";
import StockMovement from "../models/stockMovement.model";
import { getAvailability, getLastReceiptCosts, release as releaseStock, reserve as reserveStock } from "../services/stock.service";
import Warehouse from "../models/warehouse.model";
import { Server } from "socket.io";
import { logEnquiryAudit } from "../services/enquiryAudit.service";
import { logAudit } from "../services/audit.service";
import { cancelOpenFollowUp } from "../services/enquiryFollowUp.service";
import { cancelInBlock, completeInBlock, followUpActor, followUpViewFilter, readCompleteBody, readScheduleBody, scheduleInBlock } from "../services/followUpTasks.service";
import { calculateDiscountPrice, getAdminAuthoredEmployeeIds, getAllReportedEmployees, escapeRegex, getEmployeeData, getUSDRated } from "../common/utils/util";
const { ObjectId } = require('mongodb');
import { newTrash } from '../controllers/trash.controller'
import { removeFile } from '../common/utils/util'
import { dealSheetCan } from "../common/utils/dealSheetPrivilege";
import { deleteFileFromAws, uploadFileToAws } from '../common/aws-connect';
import { releaseQuoteStockHolds } from './quoteStockHold.controller';
import Event from '../models/events.model'
import { createNotificationWithPrivileges } from "./notification.controller";
import { getNextSequence } from "../models/counter.model";
import { getCustomerCommercialGuard, estimateQuoteValue, normalizeTaxForCustomer } from "../common/customer-commercial-guards";
import Workflow from '../models/workflow.model';
import { getWorkflowSteps, updateApprovalStatus } from '../services/workflow.service';
import { notify } from '../services/notify.service';

export const uploadQuoteItemImage = async (req: any, res: Response, next: NextFunction) => {
    let localFileName = '';
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: 'Select an image to upload.' });
        localFileName = file.filename;
        if (!String(file.mimetype || '').startsWith('image/')) {
            await removeFile(file.filename);
            return res.status(400).json({ success: false, message: 'Only image files are allowed.' });
        }
        if (Number(file.size || 0) > 5 * 1024 * 1024) {
            await removeFile(file.filename);
            return res.status(400).json({ success: false, message: 'Item images must be 5 MB or smaller.' });
        }
        const safeNamePart = (value: unknown, fallback: string) => String(value || fallback)
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || fallback;
        const extension = String(file.originalname || '').match(/\.[a-zA-Z0-9]+$/)?.[0]?.toLowerCase()
            || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } as Record<string, string>)[file.mimetype]
            || '.img';
        const quoteReference = safeNamePart(req.body?.quoteReference, 'draft-quote');
        const partNumber = safeNamePart(req.body?.partNumber, 'unassigned-item');
        const storedFileName = `quote-${quoteReference}_item-${partNumber}_${Date.now()}-${crypto.randomUUID().slice(0, 8)}${extension}`;
        await uploadFileToAws(storedFileName, file.path, file.mimetype);
        localFileName = '';
        return res.status(201).json({
            fileName: storedFileName,
            originalname: file.originalname,
            mimetype: file.mimetype,
        });
    } catch (error) {
        if (localFileName) await removeFile(localFileName);
        next(error);
    }
};

/**
 * Marks the source enquiry as Quoted the first time a quotation leaves Draft.
 * Creating a quote directly at a non-draft status handles this inline in `saveQuotation`;
 * this covers the draft-then-promote path, where the flip is deliberately deferred.
 */
const markEnquiryQuotedIfPromoted = async (quote: any, fromStatus?: string, toStatus?: string, req?: any) => {
    if (!quote?.enqId) return;
    if (fromStatus !== quoteStatus.Draft || !toStatus || toStatus === quoteStatus.Draft) return;
    const before: any = await Enquiry.findById(quote.enqId).select('status').lean();
    // Already handed over via "Convert to quote"; the quotation's progress no longer touches the enquiry.
    if (['quoted', 'Quoted'].includes(before?.status)) return;
    await Enquiry.findByIdAndUpdate(quote.enqId, { status: 'Quoted' });
    await cancelOpenFollowUp(quote.enqId, 'Enquiry quoted');
    await logEnquiryAudit(req, quote.enqId, 'quoted', `Quotation ${quote.quoteId || ''} issued`.replace(/\s+/g, ' '),
        [{ label: 'Status', from: before?.status, to: 'Quoted' }]);
}

// An enquiry still with presales has no finished estimation, so it can't be quoted yet.
const PRESALE_IN_PROGRESS_STATUSES = ['Sent to Presales', 'Assigned To Presale Manager', 'Assigned To Presale Engineer', 'Assigned To Presales', 'Rejected by Presale Engineer', 'Rejected by Presale Manager'];

const ACTIVE_EXPIRABLE_QUOTE_STATUSES = [
    quoteStatus.WorkInProgress,
    quoteStatus.ReadyForSubmission,
    quoteStatus.QuoteSubmitted,
    quoteStatus.UnderNegotiation,
    quoteStatus.UnderReview,
];

const CUSTOMER_SENT_STATUSES = [quoteStatus.QuoteSubmitted, quoteStatus.UnderNegotiation, quoteStatus.Won, quoteStatus.Lost];

const normalizeQuoteValidity = (quoteData: any) => {
    if (!quoteData) return;
    // The closing date is the only date a quote is judged by. validityDate is kept as a mirror of it so older readers
    // (PDF, revision snapshots, RFQ copies) stay correct; a separately entered Valid Until is ignored.
    if (quoteData.closingDate) quoteData.validityDate = quoteData.closingDate;
    else if (quoteData.validityDate) quoteData.closingDate = quoteData.validityDate;
    if (!quoteData.expiryReminderDate && quoteData.closingDate) {
        const reminderDate = new Date(quoteData.closingDate);
        if (!Number.isNaN(reminderDate.getTime())) {
            reminderDate.setDate(reminderDate.getDate() - 3);
            quoteData.expiryReminderDate = reminderDate;
        }
    }
};

const quoteLines = (quote: any): any[] =>
    (Array.isArray(quote?.optionalItems) ? quote.optionalItems : [])
        .flatMap((option: any) => Array.isArray(option?.items) ? option.items : [])
        .flatMap((item: any) => Array.isArray(item?.itemDetails)
            ? item.itemDetails.map((detail: any) => ({ item, detail }))
            : []);

const quoteGrossSelling = (quote: any): number =>
    quoteLines(quote)
        .filter(({ item }) => !(item?.isOptional && !item?.includeInTotal))
        .reduce((sum: number, { detail }) => sum + (Number(detail?.unitSellingPrice) || 0) * (Number(detail?.quantity) || 0), 0);

const quoteGrossCost = (quote: any): number =>
    quoteLines(quote)
        .filter(({ item }) => !(item?.isOptional && !item?.includeInTotal))
        .reduce((sum: number, { detail }) => sum + (Number(detail?.unitCost) || 0) * (Number(detail?.quantity) || 0), 0);

const quoteCustomerDiscount = (quote: any): number =>
    (Array.isArray(quote?.optionalItems) ? quote.optionalItems : [])
        .reduce((sum: number, option: any) => sum + (Number(option?.totalDiscount) || 0), 0);

const applyRequestedQuoteOwner = async (quoteData: any, actor: any) => {
    const requestedOwner = quoteData.accountingManager;
    delete quoteData.accountingManager;
    if (!requestedOwner) {
        return;
    }
    if (!ObjectId.isValid(requestedOwner)) {
        throw Object.assign(new Error('Selected accounting manager is invalid.'), { status: 400 });
    }
    const owner = await Employee.findById(requestedOwner, '_id').lean();
    if (!owner) {
        throw Object.assign(new Error('Selected accounting manager was not found.'), { status: 404 });
    }
    quoteData.createdBy = owner._id;
    if (actor?._id && String(actor._id) !== String(owner._id)) {
        quoteData.createdByUser = actor._id;
    }
};

/**
 * Expiry is derived, not stored: a quote that is still open and past its closing date is shown as Expired, but its real status is kept. Moving the date forward brings it straight back.
 * Quotes saved with the old stored "Expired" status still count as expired.
 */
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export const isQuoteExpired = (quote: any): boolean => {
    if (quote?.status === quoteStatus.Expired) return true;
    if (!ACTIVE_EXPIRABLE_QUOTE_STATUSES.includes(quote?.status)) return false;
    const expiry = quote?.closingDate ?? quote?.validityDate;
    return !!expiry && new Date(expiry) < startOfToday();
};

/** Mongo match for open quotes past their date (no stored-Expired quotes). */
const pastDateQuoteFilter = () => {
    const today = startOfToday();
    return {
        status: { $in: ACTIVE_EXPIRABLE_QUOTE_STATUSES },
        $or: [
            { closingDate: { $lt: today } },
            { closingDate: null, validityDate: { $lt: today } },
        ],
    };
};
const expiredQuoteFilter = () => ({ $or: [{ status: quoteStatus.Expired }, pastDateQuoteFilter()] });

/**
 * Server-side rules for a quotation payload, so the API holds the same line the form does. Returns the first problem
 * as a message, or null when the payload is acceptable. `isCreate` also constrains how a quote may start and rejects
 * dates already in the past (an existing quote may keep an old date while it is edited).
 */
const MAX_QUOTE_SUBJECT = 250;
const quotePayloadProblem = (quoteData: any, isCreate: boolean): string | null => {
    const has = (key: string) => quoteData?.[key] !== undefined;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    if (isCreate && ![quoteStatus.Draft, quoteStatus.WorkInProgress].includes(quoteData?.status)) {
        return 'A new quotation can only start as Draft or Work In Progress';
    }
    if (isCreate || has('subject')) {
        const subject = String(quoteData?.subject ?? '').trim();
        if (!subject) return 'Subject is required';
        if (subject.length > MAX_QUOTE_SUBJECT) return `Subject must be ${MAX_QUOTE_SUBJECT} characters or fewer`;
    }
    if ((isCreate || has('currency')) && !/^[A-Z]{3}$/.test(String(quoteData?.currency ?? ''))) {
        return 'Currency must be a 3-letter code such as QAR';
    }

    const dateOf = (value: any) => (value ? new Date(value) : null);
    const quoteDate = dateOf(quoteData?.quotedDate ?? quoteData?.date);
    const closing = dateOf(quoteData?.closingDate);
    for (const [label, value] of [['Quoted date', quoteDate], ['Closing date', closing]] as const) {
        if (value && Number.isNaN(value.getTime())) return `${label} is not a valid date`;
    }
    // A new Draft may be sparse; its dates are checked when it is completed.
    const sparseDraft = isCreate && quoteData?.status === quoteStatus.Draft;
    if (!sparseDraft && quoteDate && closing && closing < quoteDate) return 'Closing date cannot be before the quotation date';
    if (isCreate && quoteData?.status !== quoteStatus.Draft) {
        if (closing && closing < startOfToday) return 'Closing date cannot be in the past';
    }

    if (has('optionalItems')) {
        const options: any[] = Array.isArray(quoteData.optionalItems) ? quoteData.optionalItems : [];
        if (isCreate && quoteData?.status !== quoteStatus.Draft && !quoteLines({ optionalItems: options }).length) {
            return 'Add at least one item before creating the quotation';
        }
        for (const option of options) {
            const lines = quoteLines({ optionalItems: [option] });
            for (const { detail } of lines) {
                if (!(Number(detail?.quantity ?? 0) >= 0)) return 'Quantity cannot be negative';
                if (!(Number(detail?.unitCost ?? 0) >= 0)) return 'Unit cost cannot be negative';
                if (!(Number(detail?.unitSellingPrice ?? 0) >= 0)) return 'Unit price cannot be negative';
            }
            const discount = Number(option?.totalDiscount ?? 0);
            if (!(discount >= 0)) return 'Discount cannot be negative';
            if (discount > quoteGrossSelling({ optionalItems: [option] })) return 'Discount cannot be more than the selling total';
        }
    }
    return null;
};

export const saveQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        const userToken = req.user;

        const payloadProblem = quotePayloadProblem(quoteData, true);
        if (payloadProblem) {
            return res.status(400).json({ success: false, message: payloadProblem });
        }

        if (quoteData.enqId) {
            const linkedEnquiry = await Enquiry.findById(quoteData.enqId, { status: 1, client: 1, contact: 1, title: 1 }).lean();
            if (!linkedEnquiry) {
                return res.status(404).json({ success: false, message: 'Linked enquiry was not found.' });
            }
            const existingQuoteForEnquiry = await Quotation.findOne({
                enqId: quoteData.enqId,
                isDeleted: { $ne: true },
                status: { $nin: [quoteStatus.Lost, quoteStatus.Expired] },
                $nor: [pastDateQuoteFilter()],
            }).select('quoteId status').lean();
            if (existingQuoteForEnquiry) {
                return res.status(409).json({
                    success: false,
                    message: `This enquiry already has active quotation ${existingQuoteForEnquiry.quoteId || ''} (${existingQuoteForEnquiry.status}). Continue from that quotation instead of creating another one.`.replace(/\s+/g, ' ').trim()
                });
            }
            if (!linkedEnquiry.client || !linkedEnquiry.contact) {
                return res.status(400).json({ success: false, message: 'Select a customer and contact person on the enquiry before creating a quote.' });
            }
            if (!String(linkedEnquiry.title || '').trim()) {
                return res.status(400).json({ success: false, message: 'Add the customer requirement summary before creating a quote.' });
            }
            if (PRESALE_IN_PROGRESS_STATUSES.includes(linkedEnquiry.status)) {
                return res.status(409).json({ success: false, message: 'This enquiry is still with presales. Complete the presales workflow before creating a quote.' });
            }
        }

        const customerGuard = await getCustomerCommercialGuard(quoteData.client, estimateQuoteValue(quoteData));
        if (customerGuard.blocked) {
            return res.status(409).json({ success: false, message: customerGuard.message });
        }
        Object.assign(quoteData, normalizeTaxForCustomer(quoteData, customerGuard.customer));
        
        const createdBy = await getEmployeeData(userToken)
        quoteData.createdBy = createdBy._id
        await applyRequestedQuoteOwner(quoteData, createdBy);
        normalizeQuoteDepartments(quoteData)
        normalizeQuoteValidity(quoteData)
        // The created date is fixed at creation; the quoted date defaults to it and is what the PDF prints.
        if (!quoteData.quotedDate) quoteData.quotedDate = quoteData.date;
        const stripEmptyItemImages = (value: any): void => {
            if (Array.isArray(value)) {
                value.forEach(stripEmptyItemImages);
                return;
            }
            if (!value || typeof value !== 'object') return;
            if ('image' in value && (!value.image?.fileName || !value.image?.originalname)) delete value.image;
            Object.values(value).forEach(stripEmptyItemImages);
        };
        stripEmptyItemImages(quoteData.optionalItems);

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
                if (quoteData.status !== quoteStatus.Draft && !['quoted', 'Quoted'].includes(enquiry.status)) {
                    await Enquiry.findByIdAndUpdate(quoteData.enqId, { status: 'Quoted' });
                    await cancelOpenFollowUp(quoteData.enqId, 'Enquiry quoted');
                    await logEnquiryAudit(req, quoteData.enqId, 'quoted', 'Quotation created',
                        [{ label: 'Status', from: enquiry.status, to: 'Quoted' }]);
                }
            } else {
                console.log(`Enquiry with ID ${quoteData.enqId} not found.`);
            }
        } else {
            delete quoteData.enqId;
        }

        if (saveQuote) {
            return res.status(200).json({
                ...(saveQuote.toObject ? saveQuote.toObject() : saveQuote),
                commercialWarnings: customerGuard.warnings
            })
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
            from: 'employees',
            localField: 'createdByUser',
            foreignField: '_id',
            pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
            as: 'createdByUser'
        }
    },
    {
        $unwind: {
            path: '$createdByUser',
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

/** A quote in these states is no longer chased, so its open follow-up is closed and list views skip it. */
const QUOTE_FOLLOW_UP_CLOSED: string[] = [quoteStatus.Won, quoteStatus.Lost, quoteStatus.Expired];

export const getQuotations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const expiredFilter = expiredQuoteFilter();
        const pastDateFilter = pastDateQuoteFilter();
        let { page, search, row, salesPerson, customer, fromDate, toDate, department, quoteStatus, dealStatus, access, userId, sortKey, sortDir, followUpView, followUpFromDate, followUpToDate } = req.body;

        page = Math.max(1, parseInt(page) || 1);
        row = Math.min(100, Math.max(1, parseInt(row) || 10));
        let skipNum: number = (page - 1) * row;

        const sortableFields: Record<string, string> = { date: 'date', quoteId: 'quoteId', status: 'status', nextFollowUpDate: 'followUp.nextFollowUpDate' };
        const sortStage: Record<string, 1 | -1> = sortKey && sortableFields[sortKey]
            ? { [sortableFields[sortKey]]: sortDir === 'desc' ? -1 : 1, _id: -1 }
            : { _id: -1 };

        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isDepartment = department == null ? true : false;

        // Search matches the quote id, the subject and the customer's company name.
        const searchText = String(search ?? '').trim();
        const searchRegex = { $regex: escapeRegex(searchText), $options: 'i' };
        const searchFilter = searchText
            ? {
                $or: [
                    { quoteId: searchRegex },
                    { subject: searchRegex },
                    { client: { $in: (await Customer.find({ companyName: searchRegex }, '_id').lean()).map((c: any) => c._id) } },
                ],
            }
            : {};

        let matchFilters = {
            isDeleted: { $ne: true },
            status: { $ne: 'revised' },
            $and: [
                // "Expired" is derived from the date; any other status excludes the open quotes that are past it.
                ...(quoteStatus === 'Expired' ? [expiredFilter] : quoteStatus ? [{ status: quoteStatus }, { $nor: [pastDateFilter] }] : []),
                // "pending" also covers Won quotes that have no deal sheet yet (waiting to be converted).
                ...(dealStatus === 'pending'
                    ? [{ $or: [{ 'dealData.status': 'pending' }, { status: 'Won', 'dealData.status': { $exists: false } }] }]
                    : dealStatus ? [{ 'dealData.status': dealStatus }] : []),
                searchFilter,
                // Overdue / Today / Upcoming only list quotes that are still being chased.
                ...(followUpView ? [{ ...followUpViewFilter('followUp.nextFollowUpDate', followUpView), status: { $nin: QUOTE_FOLLOW_UP_CLOSED }, $nor: [pastDateFilter] }] : []),
                ...(followUpFromDate || followUpToDate ? [{ 'followUp.nextFollowUpDate': {
                    ...(followUpFromDate ? { $gte: new Date(followUpFromDate) } : {}),
                    ...(followUpToDate ? { $lt: new Date(new Date(followUpToDate).getTime() + 86_400_000) } : {}),
                } }] : []),
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

        const actingUserId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;

        if (access === 'reported' || access === 'createdAndReported') {
            let reportedToUserIds = await getAllReportedEmployees(userId);
            if (access === 'createdAndReported') {
                reportedToUserIds.push(actingUserId);
            }
            accessFilter = actingUserId
                ? { $or: [{ createdBy: { $in: reportedToUserIds.filter(Boolean) } }, { createdByUser: actingUserId }] }
                : { createdBy: { $in: reportedToUserIds.filter(Boolean) } };
        } else if (access === 'created' && actingUserId) {
            accessFilter = { $or: [{ createdBy: actingUserId }, { createdByUser: actingUserId }] };
        }

        const filters = { $and: [matchFilters, accessFilter] }

        // Total, page and tab badge counts are independent of each other, so they all run together.
        // An aggregate, not countDocuments: the date clause can hold an Invalid Date when no range is sent,
        // which countDocuments would reject while casting.
        const totalQuery = Quotation.aggregate([{ $match: filters }, { $count: 'total' }]).exec()
            .then((result: { total: number }[]) => result[0]?.total ?? 0);

        const quoteDataQuery = Quotation.aggregate([
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
        ]).exec();

        // Badge counts for every tab, scoped by access only (not by the active tab's filters).
        const baseView = { isDeleted: { $ne: true }, status: { $ne: 'revised' } };
        const countOf = (extra: any) => Quotation.countDocuments({ $and: [baseView, accessFilter, extra] });
        const followUpCount = (view: string) => countOf({ ...followUpViewFilter('followUp.nextFollowUpDate', view), status: { $nin: QUOTE_FOLLOW_UP_CLOSED }, $nor: [pastDateFilter] });
        const [total, quoteData, vAll, vPending, vRejected, vApproved, vMine, vOverdue, vToday, vUpcoming] = await Promise.all([
            totalQuery,
            quoteDataQuery,
            countOf({}),
            countOf({ $or: [{ 'dealData.status': 'pending' }, { status: 'Won', 'dealData.status': { $exists: false } }] }),
            countOf({ 'dealData.status': 'rejected' }),
            countOf({ 'dealData.status': 'approved' }),
            actingUserId ? countOf({ createdBy: actingUserId }) : Promise.resolve(0),
            followUpCount('overdue'),
            followUpCount('today'),
            followUpCount('upcoming'),
        ]);

        quoteData.forEach((q: any) => {
            q.isExpired = isQuoteExpired(q);
            // Quotes saved before the quoted date existed fall back to the created date.
            q.quotedDate = q.quotedDate ?? q.date;
            delete q.revisions;
        });
        const viewCounts = {
            all: vAll, 'pending-deal': vPending, 'rejected-deal': vRejected, 'ready-for-job': vApproved,
            mine: vMine, 'fu-overdue': vOverdue, 'fu-today': vToday, 'fu-upcoming': vUpcoming,
        };
        return res.status(200).json({ total: total, quotations: quoteData ?? [], viewCounts })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

/**
 * Names for the Deal Sheet approval route, so a screen can show where the deal is waiting. Used by the single
 * quote fetch and both deal sheet grids, so a deal opened from a list row shows the same route as one opened by link.
 */
const withDealStageNames = async (quotations: any[]): Promise<void> => {
    const withStages = quotations.filter((q) => q?.dealData?.approvalStatus?.length);
    if (!withStages.length) return;
    const allStages: any[] = withStages.flatMap((q) => q.dealData.approvalStatus);
    const roleIds = [...new Set(allStages.flatMap((s: any) => [s.role, s.originalRole]).filter(Boolean).map(String))];
    const personIds = [...new Set(allStages.flatMap((s: any) => [s.updatedBy, s.approver]).filter(Boolean).map(String))];
    const [roles, people] = await Promise.all([
        Category.find({ _id: { $in: roleIds } }, 'categoryName').lean(),
        Employee.find({ _id: { $in: personIds } }, 'firstName lastName').lean(),
    ]);
    const roleName = new Map(roles.map((r: any) => [String(r._id), r.categoryName]));
    const personName = new Map(people.map((p: any) => [String(p._id), `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()]));
    withStages.forEach((q) => {
        q.dealData.approvalStatus = [...q.dealData.approvalStatus]
            .sort((a: any, b: any) => a.step - b.step)
            .map((s: any) => ({
                ...s,
                roleName: s.managerApproval ? 'Reporting manager' : roleName.get(String(s.role)),
                originalRoleName: s.originalRole ? roleName.get(String(s.originalRole)) : undefined,
                updatedByName: s.updatedBy ? personName.get(String(s.updatedBy)) : undefined,
            }));
        // Where a pending deal is waiting right now, so a screen can show who must act and by when.
        const pending: any[] = q.dealData.approvalStatus.filter((s: any) => s.status === 'pending');
        const current = pending.length ? Math.min(...pending.map((s: any) => s.step)) : null;
        const here = pending.filter((s: any) => s.step === current);
        const due = here.map((s: any) => s.escalationDueAt).filter(Boolean).sort()[0];
        q.dealData.waiting = here.length ? {
            step: current,
            roleIds: here.filter((s: any) => !s.managerApproval).map((s: any) => String(s.role?._id ?? s.role)),
            approverIds: here.filter((s: any) => s.managerApproval).map((s: any) => String(s.approver)),
            roleName: here.map((s: any) => s.roleName).filter(Boolean).join(' or '),
            escalated: here.some((s: any) => !!s.escalatedAt),
            dueAt: due ?? null,
        } : null;
    });
};

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
            accessFilter = { createdBy: { $in: [...reportedToUserIds, ...await getAdminAuthoredEmployeeIds()] } };
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

        quotation.isExpired = isQuoteExpired(quotation);

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
        await withDealStageNames([quotation]);
        return res.status(200).json(quotation);
    } catch (error) {
        console.log(error)
        next(error)
    }
}

/**
 * Search box filter for the deal sheet grids. Runs after the client/employee lookups, so it can match
 * customer and sales person as well. "all" (the grid default) searches every visible text column.
 */
const buildDealSearchFilter = (searchQuery: unknown, searchCriteria: unknown): Record<string, any> => {
    const text = String(searchQuery ?? '').trim();
    if (!text) return {};
    const re = { $regex: escapeRegex(text), $options: 'i' };
    // Full-name match, so "sales exec" finds "sales executive".
    const salesPersonName = {
        $expr: {
            $regexMatch: {
                input: { $trim: { input: { $concat: [{ $ifNull: ['$createdBy.firstName', ''] }, ' ', { $ifNull: ['$createdBy.lastName', ''] }] } } },
                regex: escapeRegex(text),
                options: 'i',
            },
        },
    };
    switch (searchCriteria) {
        case 'dealId':
            return { 'dealData.dealId': re };
        case 'customer':
            return { 'client.companyName': re };
        case 'salesperson':
            return salesPersonName;
        default:
            return {
                $or: [
                    { 'dealData.dealId': re },
                    { quoteId: re },
                    { subject: re },
                    { 'client.companyName': re },
                    salesPersonName,
                ],
            };
    }
};

const DEAL_SORT_FIELDS: Record<string, string> = {
    date: 'dealData.savedDate',
    dealId: 'dealNumber',
    quoteId: 'quoteId',
    customerName: 'client.companyName',
    description: 'subject',
    salesPerson: 'createdBy.firstName',
    department: 'department.departmentName',
    paymentTerms: 'dealData.paymentTerms',
    amount: 'dealAmount',
    dealStatus: 'dealData.status',
};

const validDealSheetFilter = {
    'dealData.dealId': { $exists: true, $ne: '' },
    'dealData.savedDate': { $exists: true },
    'dealData.updatedItems.itemDetails': { $elemMatch: { dealSelected: true } },
};

const dealComputedFieldsStage = {
    $addFields: {
        dealNumber: {
            $convert: {
                input: { $arrayElemAt: [{ $split: [{ $ifNull: ['$dealData.dealId', ''] }, '-'] }, -1] },
                to: 'int',
                onError: 0,
                onNull: 0,
            },
        },
        dealAmount: {
            $reduce: {
                input: { $ifNull: ['$dealData.updatedItems', []] },
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
                                            $cond: [
                                                { $eq: ['$$this.dealSelected', true] },
                                                { $multiply: [{ $ifNull: ['$$this.quantity', 0] }, { $ifNull: ['$$this.unitSellingPrice', 0] }] },
                                                0,
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        },
    },
};

/** Grid column filters (applied after the lookups, like search) and the sort stage for the deal sheet grids. */
const buildDealGridQuery = (filters: unknown, sortKey: unknown, sortDir: unknown) => {
    const clauses: Record<string, any>[] = [];
    const list = Array.isArray(filters) ? filters : [];
    for (const f of list) {
        const key = String(f?.key ?? '');
        const op = String(f?.op ?? 'contains');
        const raw = f?.value;
        const field = DEAL_SORT_FIELDS[key];
        if (!field) continue;
        if (op === 'empty') {
            clauses.push({ [field]: { $in: [null, ''] } });
            continue;
        }
        if (raw === undefined || raw === null || raw === '') continue;
        if (key === 'date') {
            const day = new Date(String(raw));
            if (isNaN(day.getTime())) continue;
            const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
            if (op === 'on') clauses.push({ [field]: { $gte: day, $lt: next } });
            else if (op === 'before') clauses.push({ [field]: { $lt: day } });
            else if (op === 'after') clauses.push({ [field]: { $gte: next } });
            continue;
        }
        if (key === 'amount') {
            const value = Number(raw);
            if (Number.isNaN(value)) continue;
            if (op === 'gt') clauses.push({ [field]: { $gt: value } });
            else if (op === 'gte') clauses.push({ [field]: { $gte: value } });
            else if (op === 'lt') clauses.push({ [field]: { $lt: value } });
            else if (op === 'lte') clauses.push({ [field]: { $lte: value } });
            else if (op === 'isNot') clauses.push({ [field]: { $ne: value } });
            else clauses.push({ [field]: value });
            continue;
        }
        const text = escapeRegex(String(raw).trim());
        const target = key === 'salesPerson'
            ? { $expr: { $regexMatch: { input: { $trim: { input: { $concat: [{ $ifNull: ['$createdBy.firstName', ''] }, ' ', { $ifNull: ['$createdBy.lastName', ''] }] } } }, regex: op === 'is' || op === 'isNot' || op === 'eq' ? `^${text}$` : text, options: 'i' } } }
            : null;
        const exact = op === 'is' || op === 'eq';
        const negate = op === 'isNot' || op === 'notContains';
        if (target) {
            clauses.push(negate ? { $nor: [target] } : target);
            continue;
        }
        const re = { $regex: exact || op === 'isNot' ? `^${text}$` : text, $options: 'i' };
        clauses.push(negate ? { [field]: { $not: re } } : { [field]: re });
    }
    const sortField = DEAL_SORT_FIELDS[String(sortKey ?? '')];
    const sort: Record<string, 1 | -1> = sortField
        ? { [sortField]: sortDir === 'desc' ? -1 : 1, _id: -1 }
        : { 'dealData.savedDate': -1, _id: -1 };
    return { filter: clauses.length ? { $and: clauses } : {}, sort };
};

/** Per-tab totals for the deal sheet list, using the same access scope and search as the page query. */
const dealViewCounts = async (accessFilter: Record<string, any>, searchFilter: Record<string, any>) => {
    const base = { isDeleted: { $ne: true }, dealData: { $exists: true }, ...validDealSheetFilter };
    const open = { 'dealData.status': { $nin: ['rejected', 'approved'] } };
    const byView: Record<string, Record<string, any>> = {
        all: {},
        pending: open,
        approved: { 'dealData.status': 'approved' },
        rejected: { 'dealData.status': 'rejected' },
        revoked: { ...open, 'editHistory.action': 'DealRevoked' },
    };
    const keys = Object.keys(byView);
    // One pass through the lookups, split into the tab counts afterwards, instead of one full pipeline per tab.
    const result = await Quotation.aggregate([
        { $match: { $and: [base, accessFilter] } },
        { $lookup: { from: 'customers', localField: 'client', foreignField: '_id', as: 'client' } },
        { $unwind: '$client' },
        { $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' } },
        { $unwind: '$department' },
        { $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'createdBy' } },
        { $unwind: '$createdBy' },
        dealComputedFieldsStage,
        { $match: searchFilter },
        { $facet: Object.fromEntries(keys.map((k) => [k, [{ $match: byView[k] }, { $count: 'total' }]])) },
    ]).exec();
    return Object.fromEntries(keys.map((k) => [k, result?.[0]?.[k]?.[0]?.total ?? 0]));
};

export const getDealSheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, access, userId, searchQuery, searchCriteria, view, filters: gridFilters, sortKey, sortDir } = req.body;

        page = Math.max(1, parseInt(page) || 1);
        row = Math.min(100, Math.max(1, parseInt(row) || 15));
        let skipNum: number = (page - 1) * row;

        let matchFilters: any = {
            isDeleted: { $ne: true },
            dealData: { $exists: true },
            ...validDealSheetFilter,
        };

        if (view === 'all') {
            // Every deal sheet, whatever its status (rejected ones included, so All = Pending + Approved + Rejected).
        } else if (view === 'rejected') {
            matchFilters['dealData.status'] = 'rejected';
        } else if (view === 'revoked') {
            // Revoking a deal resets dealData.status back to 'pending' and deletes its job, so a
            // revoked deal is only identifiable via its editHistory, not its current status.
            matchFilters['dealData.status'] = { $nin: ['rejected', 'approved'] };
            matchFilters['editHistory.action'] = 'DealRevoked';
        } else {
            matchFilters['dealData.status'] = { $nin: ['rejected', 'approved'] };
        }


        let accessFilter = {};
        let searchFilter = {};

        const gridQuery = buildDealGridQuery(gridFilters, sortKey, sortDir);
        searchFilter = { $and: [buildDealSearchFilter(searchQuery, searchCriteria), gridQuery.filter] };

        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'reported':
                // Union in admin/superAdmin-authored deals: they fall outside the reportingTo
                // hierarchy but still need a manager who can see and act on them.
                accessFilter = { createdBy: { $in: [...reportedToUserIds, ...await getAdminAuthoredEmployeeIds()] } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { createdBy: { $in: [...reportedToUserIds, ...await getAdminAuthoredEmployeeIds()] } };
                break;

            default:
                break;
        }

        const filters = { $and: [matchFilters, accessFilter] }

        let [dealData, viewCounts] = await Promise.all([Quotation.aggregate([
            {
                $match: filters,
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
            dealComputedFieldsStage,
            {
                $match: searchFilter,
            },
            {
                $sort: gridQuery.sort
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
        ]), dealViewCounts(accessFilter, searchFilter)]);

        const total: number = viewCounts[['all', 'rejected', 'revoked'].includes(view) ? view : 'pending'] ?? 0;
        if (!dealData || !total) return res.status(200).json({ total: 0, dealSheet: [], viewCounts })
        await withDealStageNames(dealData);
        return res.status(200).json({ total: total, dealSheet: dealData, viewCounts })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getApprovedDealSheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, access, userId, role, searchQuery, searchCriteria, filters: gridFilters, sortKey, sortDir } = req.body;
        page = Math.max(1, parseInt(page) || 1);
        row = Math.min(100, Math.max(1, parseInt(row) || 15));
        let skipNum: number = (page - 1) * row;

        let accessFilter = {};
        let matchFilters = {};
        let searchFilter = {};

        let reportedToUserIds = await getAllReportedEmployees(userId);
        if (/^superadmin$/i.test(String(role ?? ''))) {
                matchFilters = {
                    isDeleted: { $ne: true },
                    dealData: { $exists: true },
                    ...validDealSheetFilter,
                    'dealData.status': 'approved'
                };
        } else {
            switch (access) {
                case 'created':
                    accessFilter = { createdBy: new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { createdBy: { $in: [...reportedToUserIds, ...await getAdminAuthoredEmployeeIds()] } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { createdBy: { $in: [...reportedToUserIds, ...await getAdminAuthoredEmployeeIds()] } };
                    break;

                default:
                    break;
            }

            matchFilters = {
                isDeleted: { $ne: true },
                dealData: { $exists: true },
                ...validDealSheetFilter,
                'dealData.status': 'approved',
            };
        }

        const gridQuery = buildDealGridQuery(gridFilters, sortKey, sortDir);
        searchFilter = { $and: [buildDealSearchFilter(searchQuery, searchCriteria), gridQuery.filter] };

        const filters = { $and: [matchFilters, accessFilter] }

        let [dealData, viewCounts] = await Promise.all([Quotation.aggregate([
            {
                $match: filters,
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
            dealComputedFieldsStage,
            {
                $match: searchFilter,
            },
            {
                $sort: gridQuery.sort
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
        ]), dealViewCounts(accessFilter, searchFilter)]);

        const total: number = viewCounts['approved'] ?? 0;
        if (!dealData || !total) return res.status(200).json({ total: 0, dealSheet: [], viewCounts })
        await withDealStageNames(dealData);
        return res.status(200).json({ total: total, dealSheet: dealData, viewCounts })

    } catch (error) {
        console.log(error)
        next(error)
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
        next(error)
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
            // Guard against blank/whitespace-only name fields producing a stray space or "undefined" in the generated number.
            const initial = (value?: string) => (value || '').trim().charAt(0).toUpperCase() || 'X';
            const salesId = `${initial(employee.firstName)}${initial(employee.lastName)}`;
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


/**
 * Update that takes a quote out of Won: the LPO, customer PO and deal sheet go, but the deal number is kept for the
 * next deal sheet and the discarded sheet's outcome (status and last comment) is archived on the quote.
 */
const wonExitUpdate = (quote: any, targetStatus: string, actorId: any, reason?: string) => {
    const dealData = quote?.dealData;
    const comments: string[] = Array.isArray(dealData?.comments) ? dealData.comments : [];
    return {
        $set: {
            status: targetStatus,
            lpoFiles: [] as any[],
            ...(dealData?.dealId ? { releasedDealId: String(dealData.dealId) } : {}),
        },
        $unset: { dealData: 1, customerAcceptance: 1 } as { [key: string]: number },
        $push: {
            ...(dealData ? {
                discardedDeals: {
                    dealId: dealData.dealId,
                    status: dealData.status,
                    lastComment: comments[comments.length - 1] ?? '',
                    discardedAt: new Date(),
                    discardedBy: actorId,
                    reason: String(reason ?? '').trim(),
                },
            } : {}),
        } as any,
    };
};

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

        if (isQuoteExpired(statusCheck)) {
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

        const editorData = await getEmployeeData(req.user);
        const targetStatus = status;

        type UpdateQuery = {
            $set?: { status: string; lpoFiles?: any[]; lostReason?: string; lostAt?: Date; lostBy?: any; customerDecision?: any; followUp?: any; releasedDealId?: string };
            $unset?: { [key: string]: number };
            $push?: { editHistory: any; discardedDeals?: any };
        };

        let updateObject: UpdateQuery = {
            $set: { status: targetStatus }
        };

        if (statusCheck.status === 'Won') {
            updateObject = wonExitUpdate(statusCheck, targetStatus, editorData?._id, reason);
        }
        if (targetStatus === quoteStatus.Lost) {
            updateObject.$set!.lostReason = String(reason ?? '').trim();
            updateObject.$set!.lostAt = new Date();
            updateObject.$set!.lostBy = editorData?._id;
            updateObject.$set!.customerDecision = {
                decision: 'rejected',
                decidedAt: new Date(),
                decidedBy: editorData?._id,
                reason: String(reason ?? '').trim(),
            };
        }
        if (CUSTOMER_SENT_STATUSES.includes(targetStatus)) {
            updateObject.$set!.followUp = {
                ...((statusCheck.followUp as any)?.toObject ? (statusCheck.followUp as any).toObject() : statusCheck.followUp || {}),
                lastActivityDate: new Date(),
            };
        }
        if (QUOTE_FOLLOW_UP_CLOSED.includes(targetStatus)) {
            const closed = cancelInBlock(updateObject.$set!.followUp ?? statusCheck.followUp, `Quote ${String(targetStatus).toLowerCase()}`);
            if (closed) updateObject.$set!.followUp = closed;
        }

        // Leaving Won discards the deal sheet and LPO files, so the history records what was removed.
        const discarded = statusCheck.status === quoteStatus.Won
            ? [
                statusCheck.dealData?.dealId && `deal sheet ${statusCheck.dealData.dealId} (${statusCheck.dealData.status}${statusCheck.dealData.comments?.length ? `, last comment: ${statusCheck.dealData.comments[statusCheck.dealData.comments.length - 1]}` : ''})`,
                statusCheck.lpoFiles?.length && `${statusCheck.lpoFiles.length} LPO file(s)`,
                statusCheck.customerAcceptance?.customerPoNumber && `customer PO ${statusCheck.customerAcceptance.customerPoNumber}`,
            ].filter(Boolean)
            : [];
        const historyReason = [
            String(reason ?? '').trim(),
            discarded.length ? `Removed: ${discarded.join(', ')}` : ''
        ].filter(Boolean).join(' — ');
        updateObject.$push = {
            ...updateObject.$push,
            editHistory: {
                editedBy: editorData?._id,
                editedAt: new Date(),
                action: 'StatusChanged',
                fromStatus: statusCheck.status,
                toStatus: targetStatus,
                ...(historyReason ? { reason: historyReason } : {}),
            }
        };

        const quoteUpdated = await Quotation.findByIdAndUpdate(
            quoteId,
            updateObject,
            { new: true }
        );

        if (quoteUpdated) {
            await markEnquiryQuotedIfPromoted(quoteUpdated, statusCheck.status, targetStatus, req);
            // Stock held for the win has nothing to hold for once the quote is no longer Won.
            if (statusCheck.status === quoteStatus.Won) {
                await releaseQuoteStockHolds(quoteUpdated._id, `Quote moved from Won to ${targetStatus}`, editorData?._id);
            }
            return res.status(200).json(targetStatus);
        }
        return res.status(404).json({ message: "Quote not found" });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

/** Statuses before the quote has gone to the customer: edits there don't create revisions. */
const UNSENT_QUOTE_STATUSES: string[] = [quoteStatus.Draft, quoteStatus.WorkInProgress, quoteStatus.ReadyForSubmission];
const REVISION_FIELDS = ['optionalItems', 'customerNote', 'termsAndCondition', 'paymentTerms', 'deliveryTerms', 'deliveryLocation', 'validityDate', 'currency'];

const selectedDealLines = (items: any[]): any[] => (Array.isArray(items) ? items : [])
    .flatMap((item: any) => Array.isArray(item?.itemDetails) ? item.itemDetails : [])
    .filter((detail: any) => !!detail?.dealSelected);

const hasActiveDeal = (quote: any): boolean => !!quote?.dealData?.status && quote.dealData.status !== 'rejected';

const currentRevisionWasSent = (quote: any): boolean => {
    const revision = quote?.revision ?? 0;
    return quote?.currentSentRevision === revision
        && (Array.isArray(quote?.sendHistory) ? quote.sendHistory : []).some((entry: any) => entry?.revision === revision);
};

const isPositiveNumber = (value: any): boolean => Number.isFinite(Number(value)) && Number(value) > 0;
const isNonNegativeNumber = (value: any): boolean => Number.isFinite(Number(value)) && Number(value) >= 0;
const hasReferenceValue = (value: any): boolean => !!(typeof value === 'object' ? value?._id : value);

const dealHandoffReadinessIssues = (quote: any): string[] => {
    const issues: string[] = [];
    const dealData = quote?.dealData;
    const selectedLines = selectedDealLines(dealData?.updatedItems);

    if (!String(dealData?.paymentTerms ?? '').trim()) {
        issues.push('payment terms');
    }
    if (!Array.isArray(quote?.lpoFiles) || quote.lpoFiles.length === 0) {
        issues.push('customer LPO attachment');
    }
    if (!selectedLines.length) {
        issues.push('at least one selected execution line');
    }

    selectedLines.forEach((line: any, index: number) => {
        const label = line?.detail ? `"${line.detail}"` : `#${index + 1}`;
        if (!String(line?.detail ?? '').trim()) {
            issues.push(`line ${label} description`);
        }
        if (!isPositiveNumber(line?.quantity)) {
            issues.push(`line ${label} quantity`);
        }
        if (!isNonNegativeNumber(line?.unitCost)) {
            issues.push(`line ${label} unit cost`);
        }
        if (!isNonNegativeNumber(line?.unitSellingPrice)) {
            issues.push(`line ${label} selling price`);
        }
        if (!hasReferenceValue(line?.supplierId) && !String(line?.supplierName ?? '').trim()) {
            issues.push(`line ${label} supplier`);
        }
    });

    (Array.isArray(dealData?.additionalCosts) ? dealData.additionalCosts : []).forEach((cost: any, index: number) => {
        const label = cost?.name || cost?.type || `#${index + 1}`;
        if (!String(cost?.type ?? '').trim()) {
            issues.push(`cost ${label} type`);
        }
        if (!isNonNegativeNumber(cost?.value)) {
            issues.push(`cost ${label} value`);
        }
        if (cost?.type === 'Supplier Discount' && !hasReferenceValue(cost?.supplierId)) {
            issues.push(`cost ${label} supplier`);
        }
    });

    return [...new Set(issues)];
};

const sumSelectedDealSelling = (lines: any[]): number =>
    lines.reduce((sum: number, line: any) => sum + (Number(line?.unitSellingPrice) || 0) * (Number(line?.quantity) || 0), 0);

const sumSelectedDealCost = (lines: any[]): number =>
    lines.reduce((sum: number, line: any) => sum + (Number(line?.unitCost) || 0) * (Number(line?.quantity) || 0), 0);

const dealCustomerDiscount = (dealData: any): number => {
    const lineDiscount = Number(dealData?.totalDiscount) || 0;
    const costDiscount = (Array.isArray(dealData?.additionalCosts) ? dealData.additionalCosts : [])
        .filter((cost: any) => cost?.type === 'Customer Discount')
        .reduce((sum: number, cost: any) => sum + (Number(cost?.value) || 0), 0);
    return lineDiscount + costDiscount;
};

const dealAdditionalCostImpact = (dealData: any): number =>
    (Array.isArray(dealData?.additionalCosts) ? dealData.additionalCosts : [])
        .reduce((sum: number, cost: any) => {
            const value = Number(cost?.value) || 0;
            if (cost?.type === 'Additional Cost') return sum + value;
            if (cost?.type === 'Supplier Discount') return sum - value;
            return sum;
        }, 0);

/** What the Deal Sheet workflow's amount and discount limits are measured against. */
const dealApprovalContext = (dealData: any) => {
    const gross = sumSelectedDealSelling(selectedDealLines(dealData?.updatedItems));
    const customerDiscount = dealCustomerDiscount(dealData);
    return {
        amount: Math.max(gross - customerDiscount, 0),
        discountPercent: gross > 0 ? (customerDiscount / gross) * 100 : 0,
    };
};

/**
 * Starts the Deal Sheet approval route for a submitted deal. Without a configured workflow (or when the
 * requester needs no approval, as for Super Admin) it returns no stages and any dealSheet approver may decide.
 */
const buildDealApprovalStatus = async (dealData: any, requesterId: any, client?: any): Promise<any[]> => {
    if (!requesterId || !(await Workflow.exists({ feature: 'dealSheet' }))) return [];
    const stages = (await getWorkflowSteps('dealSheet', String(requesterId), dealApprovalContext(dealData)))
        .map((stage: any) => ({ ...stage, role: stage.role?._id ?? stage.role }));
    if (!stages.length) return stages;

    // Approval Rules (discount, margin, payment terms, credit, deal value) name the role that must sign off a breach.
    // The route adds a final stage for any such role it does not already contain, so the deal can actually reach them.
    const breaches = await approvalRuleBreaches({ dealData, client }, null);
    const present = new Set(stages.map((stage: any) => String(stage.role)));
    let step = Math.max(...stages.map((stage: any) => stage.step));
    for (const roleId of new Set(breaches.map((breach: any) => breach.approverRoleId).filter(Boolean))) {
        if (present.has(roleId)) continue;
        stages.push({ status: 'pending', role: roleId, step: ++step, managerApproval: false, assignedAt: new Date(), ruleStage: true });
    }
    return stages;
};

/** Rule breaches still unsatisfied once the roles that already approved a stage are counted. */
const unmetRuleBreaches = (breaches: any[], approvalStatus: any[] = []) => {
    const approvedRoles = new Set(
        approvalStatus
            .filter((a: any) => a.status === 'approved')
            .flatMap((a: any) => [a.role?._id ?? a.role, a.originalRole?._id ?? a.originalRole])
            .filter(Boolean)
            .map(String)
    );
    return breaches.filter((breach: any) => !approvedRoles.has(breach.approverRoleId));
};

const asPlain = (items: any[] = []) => items.map((item: any) => (item?.toObject ? item.toObject() : { ...item }));

/** Strips the "Error: " prefix the workflow service adds when it rewraps an error. */
const workflowMessage = (error: any) => String(error?.message ?? error).replace(/^(Error:\s*)+/, '');

// Older history rows were written without an editor (update-style $push skips validation); fill them so a later save() validates.
const backfillEditHistoryEditor = (doc: any, editorId: any) => {
    if (!editorId) return;
    for (const entry of doc.editHistory ?? []) {
        if (!entry.editedBy) entry.editedBy = editorId;
    }
};

const pendingDealStage = (approvalStatus: any[] = []) => {
    const pending = approvalStatus.filter((a: any) => a.status === 'pending').sort((a: any, b: any) => a.step - b.step);
    return pending.length ? pending.filter((a: any) => a.step === pending[0].step) : [];
};

/** Everyone who can act on the stage the deal is currently waiting at. */
const dealStageApproverIds = async (approvalStatus: any[] = []): Promise<string[]> => {
    const ids = new Set<string>();
    for (const approval of pendingDealStage(approvalStatus)) {
        if (approval.managerApproval && approval.approver) {
            ids.add(String(approval.approver));
            continue;
        }
        const role = approval.role?._id ?? approval.role;
        if (!role) continue;
        const members = await Employee.find({ category: role, isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean();
        members.forEach((member: any) => ids.add(String(member._id)));
    }
    return [...ids];
};

const notifyDealApprovers = async (quote: any, approvalStatus: any[], sentBy: any, title: string, dedupe: string) => {
    const recipients = await dealStageApproverIds(approvalStatus);
    if (!recipients.length) return;
    await notify({
        type: 'DealSheet',
        referenceModel: 'Quotation',
        title,
        message: `Deal sheet for quotation ${quote.quoteId} is waiting for your approval`,
        sentBy: sentBy?.toString(),
        recipients,
        referenceId: quote._id,
        additionalData: { quotationId: quote._id.toString() },
        dedupeKey: dedupe,
        channels: ['inapp', 'push', 'email'],
    });
};

const paymentTermDays = async (paymentTerms: string): Promise<number | null> => {
    const trimmedTerms = String(paymentTerms ?? '').trim();
    if (!trimmedTerms) return null;

    const parsed = trimmedTerms.match(/\d+/);
    return parsed ? Number(parsed[0]) : null;
};

const matchesApproverRole = (employee: any, approverRole: any): boolean => {
    const employeeCategoryId = employee?.category?._id ?? employee?.category;
    const approverRoleId = approverRole?._id ?? approverRole;
    return !!employeeCategoryId && !!approverRoleId && employeeCategoryId.toString() === approverRoleId.toString();
};

const approvalRuleBreaches = async (quote: any, approver: any): Promise<any[]> => {
    const enabledRules = await ApprovalRule.find({ enabled: true }).populate('approverRole', 'categoryName').lean();
    if (!enabledRules.length) return [];

    const selectedLines = selectedDealLines(quote?.dealData?.updatedItems);
    const grossSelling = sumSelectedDealSelling(selectedLines);
    const customerDiscount = dealCustomerDiscount(quote?.dealData);
    const netSelling = Math.max(grossSelling - customerDiscount, 0);
    const totalCost = sumSelectedDealCost(selectedLines) + dealAdditionalCostImpact(quote?.dealData);
    const discountPercent = grossSelling > 0 ? (customerDiscount / grossSelling) * 100 : 0;
    const marginPercent = netSelling > 0 ? ((netSelling - totalCost) / netSelling) * 100 : 0;
    const days = await paymentTermDays(quote?.dealData?.paymentTerms);

    const customer = await Customer.findById(quote?.client, 'companyName creditLimit creditStatus').lean();
    const creditLimit = Number(customer?.creditLimit);
    const creditExceptionAmount = Number.isFinite(creditLimit) ? Math.max(netSelling - creditLimit, 0) : 0;
    const creditStatusRequiresApproval = !!customer?.creditStatus && customer.creditStatus !== 'Good Standing';

    return enabledRules
        .filter((rule: any) => {
            const threshold = Number(rule.threshold);
            if (!Number.isFinite(threshold)) return false;

            switch (rule.type) {
                case 'discount':
                    return discountPercent > threshold;
                case 'margin':
                    return marginPercent < threshold;
                case 'paymentTerms':
                    return days !== null && days > threshold;
                case 'creditException':
                    return creditExceptionAmount > threshold || (creditStatusRequiresApproval && netSelling > threshold);
                case 'deal':
                    return netSelling > threshold;
                default:
                    return false;
            }
        })
        .filter((rule: any) => !matchesApproverRole(approver, rule.approverRole))
        .map((rule: any) => {
            const threshold = Number(rule.threshold);
            const approverRoleName = rule.approverRole?.categoryName || 'Configured approver role';
            const values: Record<string, number | null> = {
                discount: Number(discountPercent.toFixed(2)),
                margin: Number(marginPercent.toFixed(2)),
                paymentTerms: days,
                creditException: Number(creditExceptionAmount.toFixed(2)),
                deal: Number(netSelling.toFixed(2)),
            };
            const labels: Record<string, string> = {
                discount: `Discount ${values.discount}% is above allowed ${threshold}%`,
                margin: `Margin ${values.margin}% is below required ${threshold}%`,
                paymentTerms: `Payment terms ${values.paymentTerms} days exceed allowed ${threshold} days`,
                creditException: `Credit exception ${values.creditException} exceeds allowed ${threshold}`,
                deal: `Deal value ${values.deal} exceeds approval threshold ${threshold}`,
            };

            return {
                type: rule.type,
                threshold,
                actual: values[rule.type],
                approverRole: approverRoleName,
                approverRoleId: String(rule.approverRole?._id ?? rule.approverRole ?? ''),
                message: labels[rule.type],
            };
        });
};

export const updateQuotation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quoteData = req.body;
        const { quoteId } = req.params;
        const { editReason } = req.body;
        delete quoteData.editReason;
        delete quoteData.editHistory;
        delete quoteData.revision;
        delete quoteData.revisions;
        // The created date never changes after the quote is saved.
        delete quoteData.date;
        delete quoteData.createdBy;
        delete quoteData.createdByUser;
        const payloadProblem = quotePayloadProblem(quoteData, false);
        if (payloadProblem) {
            return res.status(400).json({ message: payloadProblem });
        }
        normalizeQuoteDepartments(quoteData)
        normalizeQuoteValidity(quoteData)

        const existingQuote = await Quotation.findById(quoteId).lean();
        let reopened = false;
        if (existingQuote) {
            // Content is frozen once the quote expires or its deal sheet is approved (the order is in handover).
            if (isQuoteExpired(existingQuote)) {
                // An expired quote is reopened by moving its closing date forward. Its real status is kept; only a quote
                // saved with the old stored "Expired" status has none to return to, so it goes to Work In Progress.
                const sameDay = (a: any, b: any) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime();
                const closingMoved = !!quoteData.closingDate && !sameDay(quoteData.closingDate, existingQuote.closingDate);
                if (closingMoved) {
                    delete quoteData.expiryReminderDate;
                    normalizeQuoteValidity(quoteData);
                }
                const effective = new Date(quoteData.closingDate || 0);
                if (closingMoved && !Number.isNaN(effective.getTime()) && effective >= startOfToday()) {
                    quoteData.status = existingQuote.status === quoteStatus.Expired ? quoteStatus.WorkInProgress : existingQuote.status;
                    reopened = true;
                } else {
                    // Still past its date: the quote can be edited but stays expired, and its real status is untouched.
                    quoteData.status = existingQuote.status;
                }
            }
            if (existingQuote.dealData?.status === 'approved') {
                return res.status(400).json({ message: "The deal sheet is approved, so this quote can no longer be edited" });
            }
            // Editing a quote whose deal sheet was rejected sends it back to review; no other edit changes the status this way.
            const dealRejected = existingQuote.dealData?.status === 'rejected';
            if (dealRejected) {
                quoteData.status = quoteStatus.UnderReview;
            }
            // Status moves go through the same rules as the status endpoint, so an edit cannot skip them.
            if (!dealRejected && !reopened && quoteData.status && quoteData.status !== existingQuote.status) {
                if (!isKnownQuoteStatus(quoteData.status) || !canTransitionQuoteStatus(existingQuote.status, quoteData.status)) {
                    return res.status(400).json({ message: `A quote cannot move from "${existingQuote.status}" to "${quoteData.status}"` });
                }
                if (quoteData.status === quoteStatus.Won || existingQuote.status === quoteStatus.Won) {
                    return res.status(400).json({ message: "Use the status update to move a quote into or out of Won" });
                }
            }
        }
        const editorData = await getEmployeeData(req.user);
        await applyRequestedQuoteOwner(quoteData, editorData);

        const changes = await resolveHistoryNames(buildFieldChanges(existingQuote, quoteData));

        // A quote that already went to the customer keeps its old content as a revision snapshot when the commercial content changes.
        const createsRevision = !!existingQuote
            && !UNSENT_QUOTE_STATUSES.includes(existingQuote.status)
            && changes.some((c) => REVISION_FIELDS.includes(c.field));
        const nextRevision = (existingQuote?.revision ?? 0) + 1;

        const historyEntry: any = {
            editedBy: editorData?._id,
            editedAt: new Date(),
            action: 'Updated',
            toStatus: quoteData.status,
        };
        if (reopened) {
            if (existingQuote?.status === quoteStatus.Expired) historyEntry.fromStatus = quoteStatus.Expired;
            historyEntry.reason = 'Reopened after the closing date was extended';
        }
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
                    paymentTerms: existingQuote.paymentTerms,
                    deliveryTerms: existingQuote.deliveryTerms,
                    deliveryLocation: existingQuote.deliveryLocation,
                    validityDate: existingQuote.closingDate || existingQuote.validityDate,
                    quotedDate: existingQuote.quotedDate || existingQuote.date,
                },
            };
        }

        const quoteUpdated = await Quotation.findByIdAndUpdate(
            quoteId,
            { $set: set, $push: push },
        )

        if (quoteUpdated) {
            await markEnquiryQuotedIfPromoted(quoteUpdated, existingQuote?.status, quoteData.status, req);
            return res.status(200).json(quoteUpdated)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const sendQuote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const { recipient, emailStatus = 'prepared', pdfFileName, note } = req.body;
        const quote = await Quotation.findById(quoteId);
        if (!quote || quote.isDeleted) return res.status(404).json({ message: "Quote not found" });
        if (!String(recipient || '').trim()) return res.status(400).json({ message: "Recipient is required" });
        const actor = await getEmployeeData(req.user);
        const now = new Date();
        const revision = quote.revision ?? 0;
        const nextStatus = [quoteStatus.Draft, quoteStatus.WorkInProgress, quoteStatus.ReadyForSubmission, quoteStatus.UnderReview].includes(quote.status as quoteStatus)
            ? quoteStatus.QuoteSubmitted
            : quote.status;
        const record = {
            revision,
            sentAt: now,
            sentBy: actor?._id,
            recipient: String(recipient).trim(),
            emailStatus: ['prepared', 'sent', 'failed'].includes(emailStatus) ? emailStatus : 'prepared',
            ...(pdfFileName ? { pdfFileName } : {}),
            ...(note ? { note } : {}),
        };
        const updated = await Quotation.findByIdAndUpdate(
            quoteId,
            {
                $set: {
                    status: nextStatus,
                    currentSentRevision: revision,
                    'followUp.lastActivityDate': now,
                },
                $push: {
                    sendHistory: record,
                    editHistory: {
                        editedBy: actor?._id,
                        editedAt: now,
                        action: 'QuoteSent',
                        fromStatus: quote.status,
                        toStatus: nextStatus,
                        revision,
                        reason: `Sent to ${record.recipient} (${record.emailStatus})`,
                    }
                }
            },
            { new: true }
        );
        return res.status(200).json(updated);
    } catch (error) {
        next(error);
    }
};

export const updateQuoteFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const { nextFollowUpDate, reminderOwner, note } = req.body;
        const quote = await Quotation.findById(quoteId);
        if (!quote || quote.isDeleted) return res.status(404).json({ message: "Quote not found" });
        const actor = await getEmployeeData(req.user);
        const followUp: any = {
            ...((quote.followUp as any)?.toObject ? (quote.followUp as any).toObject() : quote.followUp || {}),
            lastActivityDate: new Date(),
            note: String(note || '').trim(),
        };
        if (nextFollowUpDate) followUp.nextFollowUpDate = new Date(nextFollowUpDate);
        if (reminderOwner) followUp.reminderOwner = reminderOwner;
        const updated = await Quotation.findByIdAndUpdate(
            quoteId,
            {
                $set: { followUp },
                $push: { editHistory: { editedBy: actor?._id, editedAt: new Date(), action: 'FollowUpUpdated', reason: followUp.note } }
            },
            { new: true }
        );
        return res.status(200).json(updated);
    } catch (error) {
        next(error);
    }
};

/** Loads a quote for a follow-up action, replying with the error itself when it can't take one. */
const loadQuoteForFollowUp = async (req: Request, res: Response) => {
    const { quoteId } = req.params;
    if (!ObjectId.isValid(quoteId)) { res.status(400).json({ success: false, message: 'Invalid quotation id' }); return null; }
    const quote = await Quotation.findById(quoteId);
    if (!quote || quote.isDeleted) { res.status(404).json({ success: false, message: 'Quote not found' }); return null; }
    if (QUOTE_FOLLOW_UP_CLOSED.includes(String(quote.status))) {
        res.status(400).json({ success: false, message: `A ${String(quote.status).toLowerCase()} quotation can't have follow-ups.` });
        return null;
    }
    return quote;
};

const saveQuoteFollowUp = async (req: Request, res: Response, quote: any, block: any, summary: string) => {
    const actor = await getEmployeeData(req.user);
    const followUp = { ...block, reminderOwner: quote.followUp?.reminderOwner, lastActivityDate: new Date() };
    if (!followUp.reminderOwner) delete followUp.reminderOwner;
    const updated = await Quotation.findByIdAndUpdate(
        quote._id,
        { $set: { followUp }, $push: { editHistory: { editedBy: actor?._id, editedAt: new Date(), action: 'FollowUpUpdated', reason: summary } } },
        { new: true }
    ).select('followUp status').lean();
    return res.status(200).json({ success: true, followUp: updated?.followUp ?? {} });
};

export const scheduleQuoteFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = readScheduleBody(req, res);
        if (!body) return;
        const quote = await loadQuoteForFollowUp(req, res);
        if (!quote) return;
        const block = scheduleInBlock(quote.followUp, body.dueDate, body.note, await followUpActor(req));
        return await saveQuoteFollowUp(req, res, quote, block, body.note || `Follow-up scheduled for ${body.dueDate.toISOString().slice(0, 10)}`);
    } catch (error) {
        next(error);
    }
};

export const completeQuoteFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = readCompleteBody(req, res);
        if (!body) return;
        const quote = await loadQuoteForFollowUp(req, res);
        if (!quote) return;
        const block = completeInBlock(quote.followUp, body, await followUpActor(req));
        return await saveQuoteFollowUp(req, res, quote, block, `Follow-up done: ${body.outcome}`);
    } catch (error) {
        next(error);
    }
};

export const cancelQuoteFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quote = await loadQuoteForFollowUp(req, res);
        if (!quote) return;
        const reason = String(req.body.reason ?? '').trim();
        const block = cancelInBlock(quote.followUp, reason);
        if (!block) return res.status(400).json({ success: false, message: 'No follow-up is scheduled.' });
        return await saveQuoteFollowUp(req, res, quote, block, reason ? `Follow-up cancelled: ${reason}` : 'Follow-up cancelled');
    } catch (error) {
        next(error);
    }
};

export const recordCustomerDecision = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const { decision, reason, competitor, expectedValueLost } = req.body;
        if (!['accepted', 'rejected', 'no_response'].includes(decision)) {
            return res.status(400).json({ message: "Decision must be accepted, rejected, or no_response" });
        }
        if (decision === 'rejected' && !String(reason || '').trim()) {
            return res.status(400).json({ message: "A rejection reason is required" });
        }
        const quote = await Quotation.findById(quoteId);
        if (!quote || quote.isDeleted) return res.status(404).json({ message: "Quote not found" });
        const actor = await getEmployeeData(req.user);
        const nextStatus = decision === 'accepted' ? quoteStatus.Won : decision === 'rejected' ? quoteStatus.Lost : quote.status;
        if (nextStatus !== quote.status) {
            if (!canTransitionQuoteStatus(quote.status, nextStatus)) {
                return res.status(400).json({ message: `A quote cannot move from "${quote.status}" to "${nextStatus}"` });
            }
            if (quoteStatusRequiresReason(quote.status, nextStatus) && !String(reason ?? '').trim()) {
                return res.status(400).json({ message: nextStatus === quoteStatus.Lost ? "A reason is required when marking a quote as Lost" : "A reason is required for this status change" });
            }
            if (quote.status === quoteStatus.Won && quote.dealData?.status && quote.dealData.status !== 'rejected') {
                return res.status(400).json({ message: "A deal sheet is in progress or approved, so this quote can no longer leave Won" });
            }
        }
        const now = new Date();
        // Mail is not integrated, so a quote handed over outside the system is recorded as sent at acceptance time.
        const implicitSend = decision === 'accepted' && !currentRevisionWasSent(quote);
        const revision = quote.revision ?? 0;
        const customerDecision: any = {
            decision,
            decidedAt: now,
            decidedBy: actor?._id,
            reason: String(reason || '').trim(),
            competitor: String(competitor || '').trim(),
        };
        if (Number.isFinite(Number(expectedValueLost))) customerDecision.expectedValueLost = Number(expectedValueLost);
        const wonExit = quote.status === quoteStatus.Won && nextStatus !== quoteStatus.Won
            ? wonExitUpdate(quote, nextStatus, actor?._id, customerDecision.reason)
            : null;
        const updated = await Quotation.findByIdAndUpdate(
            quoteId,
            {
                ...(wonExit ? { $unset: wonExit.$unset } : {}),
                $set: {
                    ...(wonExit?.$set ?? {}),
                    status: nextStatus,
                    customerDecision,
                    ...(decision === 'rejected' ? { lostReason: customerDecision.reason, lostAt: now, lostBy: actor?._id } : {}),
                    ...(implicitSend ? { currentSentRevision: revision } : {}),
                    'followUp.lastActivityDate': now,
                },
                $push: {
                    ...(wonExit?.$push ?? {}),
                    ...(implicitSend ? {
                        sendHistory: {
                            revision,
                            sentAt: now,
                            sentBy: actor?._id,
                            recipient: 'Handed over outside the system',
                            emailStatus: 'sent',
                            note: 'Recorded automatically when the customer accepted',
                        },
                    } : {}),
                    editHistory: {
                        editedBy: actor?._id,
                        editedAt: now,
                        action: decision === 'accepted' ? 'CustomerAccepted' : decision === 'rejected' ? 'CustomerRejected' : 'CustomerNoResponse',
                        fromStatus: quote.status,
                        toStatus: nextStatus,
                        revision: quote.revision ?? 0,
                        reason: [customerDecision.reason, customerDecision.competitor ? `Competitor: ${customerDecision.competitor}` : ''].filter(Boolean).join(' | '),
                    }
                }
            },
            { new: true }
        );
        if (quote.status === quoteStatus.Won && nextStatus !== quoteStatus.Won) {
            await releaseQuoteStockHolds(quote._id, `Customer decision: ${decision}`, actor?._id);
        }
        return res.status(200).json(updated);
    } catch (error) {
        next(error);
    }
};

export const updateOptionalItemDecisions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const { decisions } = req.body;
        if (!Array.isArray(decisions)) return res.status(400).json({ message: "Decisions array is required" });
        const quote = await Quotation.findById(quoteId);
        if (!quote || quote.isDeleted) return res.status(404).json({ message: "Quote not found" });
        const byId = new Map(decisions.map((d: any) => [String(d.itemId), d.decision]));
        const now = new Date();
        quote.optionalItems = (quote.optionalItems || []).map((option: any) => {
            option.items = (option.items || []).map((item: any) => {
                const decision = byId.get(String(item._id));
                if (decision && ['pending', 'accepted', 'declined'].includes(decision)) {
                    item.customerDecision = decision;
                    item.customerDecisionAt = now;
                    if (item.isOptional) item.includeInTotal = decision === 'accepted';
                }
                return item;
            });
            return option;
        }) as any;
        const actor = await getEmployeeData(req.user);
        quote.editHistory.push({
            editedBy: actor?._id,
            editedAt: now,
            action: 'OptionalItemsDecided',
            reason: `${decisions.length} optional item decision(s) updated`,
        } as any);
        await quote.save();
        return res.status(200).json(quote);
    } catch (error) {
        next(error);
    }
};

export const saveDealSheet = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { quoteId } = req.params;
        const quote = await Quotation.findById(quoteId);
        if (!quote || quote.isDeleted) {
            return res.status(404).json({ message: "Quote not found" });
        }
        if (quote.status !== quoteStatus.Won) {
            return res.status(400).json({ message: "A deal sheet can only be raised after the quote is marked Won" });
        }
        if (!quote.lpoFiles?.length) {
            return res.status(400).json({ message: "Upload the accepted customer LPO before raising a deal sheet" });
        }
        // A pending deal can still be edited and resubmitted from the Deal Sheet page; only an approved one is locked.
        if (quote.dealData?.status === 'approved') {
            return res.status(409).json({ message: "This deal sheet is already approved and can no longer be edited" });
        }
        const customerGuard = await getCustomerCommercialGuard(quote.client, estimateQuoteValue(quote));
        if (customerGuard.blocked) {
            return res.status(409).json({ message: customerGuard.message });
        }

        let parsedDealData: any;
        try {
            parsedDealData = JSON.parse(req.body.dealData);
        } catch {
            return res.status(400).json({ message: "Invalid deal sheet payload" });
        }
        parsedDealData = normalizeTaxForCustomer(parsedDealData, customerGuard.customer);
        const { paymentTerms, items, removedFiles, existingFiles, costs } = parsedDealData;
        // The deal is built from the quote's first option and the discount isn't editable here, so the quote is the
        // source of truth: it is never dropped or tampered with by the payload.
        const totalDiscount = Number(quote.optionalItems?.[0]?.totalDiscount) || 0;
        // Unselected lines carry no supplier; an empty string can't cast to ObjectId.
        for (const item of Array.isArray(items) ? items : []) {
            for (const d of item?.itemDetails ?? []) {
                if (!d.supplierId) delete d.supplierId;
            }
        }
        if (!String(paymentTerms ?? '').trim()) {
            return res.status(400).json({ message: "Payment terms are required before raising a deal sheet" });
        }
        if (String(paymentTerms).trim().length > 200) {
            return res.status(400).json({ message: "Payment terms must be 200 characters or fewer" });
        }
        if (!selectedDealLines(items).length) {
            return res.status(400).json({ message: "Select at least one deal line before raising a deal sheet" });
        }
        const badLine = selectedDealLines(items).find((l: any) =>
            !(Number(l?.quantity) > 0) || !(Number(l?.unitCost) >= 0) || !(Number(l?.unitSellingPrice) >= 0) || !(Number(l?.profit ?? 0) >= 0));
        if (badLine) {
            return res.status(400).json({ message: "Every selected line needs a quantity above 0, a cost, margin and selling price of 0 or more" });
        }
        if ((Array.isArray(costs) ? costs : []).some((c: any) => !(Number(c?.value) >= 0))) {
            return res.status(400).json({ message: "Additional costs and discounts cannot be negative" });
        }
        {
            const gross = sumSelectedDealSelling(selectedDealLines(items));
            const discount = dealCustomerDiscount({ totalDiscount, additionalCosts: costs });
            if (discount > gross) {
                return res.status(400).json({ message: "The customer discount cannot be more than the deal value" });
            }
        }

        const dealFiles = req.files;

        let files = [];
        if (dealFiles) {
            files = await Promise.all(dealFiles.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        if (existingFiles && removedFiles) {
            files = [...files, ...existingFiles];
            removedFiles.map((file: any) => removeFile(file.fileName))
        } else {
            files = [...files]
        }

        // A resubmitted (previously rejected) deal keeps its number instead of burning a new one.
        // A deal raised again after the quote left Won also keeps the number it released.
        let dealId: string = quote.dealData?.dealId || quote.releasedDealId || await generateDealId();

        const createdDate = new Date()
        const userData = await getEmployeeData(req.user);
        const dealPayload = { paymentTerms, additionalCosts: costs, updatedItems: items, totalDiscount };
        // The deal enters the Deal Sheet approval workflow here (no-op when none is configured).
        let approvalStatus: any[];
        try {
            approvalStatus = await buildDealApprovalStatus(dealPayload, userData?._id, quote.client);
        } catch (error) {
            return res.status(400).json({ message: workflowMessage(error) });
        }
        let updateQuoteData = {
            dealData: {
                dealId: dealId,
                paymentTerms,
                additionalCosts: costs,
                // The first created/approved dates stay; only the revoke cycle dates move.
                savedDate: quote.dealData?.savedDate ?? createdDate,
                approvedDate: quote.dealData?.approvedDate,
                revokedDate: quote.dealData?.revokedDate,
                reapprovedDate: quote.dealData?.reapprovedDate,
                revokeResubmittedDate: quote.dealData?.revokedDate ? createdDate : quote.dealData?.revokeResubmittedDate,
                status: 'pending',
                attachments: files,
                updatedItems: items,
                totalDiscount: totalDiscount,
                requestedBy: userData?._id,
                approvalStatus,
            },
        }

        const socket = req.app.get('io') as Server;
        const quoteUpdated = await Quotation.findByIdAndUpdate(quoteId, updateQuoteData, { new: true });

        if (quoteUpdated && approvalStatus.length) {
            await notifyDealApprovers(quoteUpdated, approvalStatus, userData?._id, 'New Deal Sheet Pending Approval', `deal:${quoteUpdated._id}:${dealId}:${createdDate.getTime()}:submit`);
        } else if (quoteUpdated) {
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
                        return dealSheetCan(privileges, "approve") || dealSheetCan(privileges, "reject");
                    }
                },
                socket
            );
        }

        if (quoteUpdated) {
            await logAudit(req, {
                entityType: 'quotation',
                entityId: quoteUpdated._id,
                entityLabel: quoteUpdated.quoteId,
                action: quote.dealData?.status === 'rejected' ? 'deal-resubmitted' : 'deal-submitted',
                summary: `Deal sheet ${dealId} submitted for approval`,
                changes: [
                    { label: 'Deal status', from: quote.dealData?.status || '', to: 'pending' },
                    { label: 'Deal ID', to: dealId },
                ],
            });
            return res.status(200).json({
                ...(quoteUpdated.toObject ? quoteUpdated.toObject() : quoteUpdated),
                commercialWarnings: customerGuard.warnings
            })
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        console.log(error)
        next(error)
    }
}

/**
 * Super Admin gives a pending deal a fresh approval route, e.g. after its time limit escalated it past the approver.
 * Ticked stages get another chance; unticked stages are skipped for this deal only. Super Admin always stays on top.
 */
export const resetDealWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const me = await getEmployeeData(req.user);
        if (!/^superadmin$/i.test((me?.category as any)?.role || '')) {
            return res.status(403).json({ message: 'Only a Super Admin can reset the deal sheet workflow' });
        }
        const quote = await Quotation.findById(req.body.quoteId);
        if (!quote || quote.isDeleted || !quote.dealData) {
            return res.status(404).json({ message: 'Deal sheet not found' });
        }
        if (quote.dealData.status !== 'pending') {
            return res.status(400).json({ message: `Only a pending deal sheet can be reset (this one is ${quote.dealData.status})` });
        }
        const chosen: string[] | null = Array.isArray(req.body.stepRoleIds) ? req.body.stepRoleIds.map(String) : null;
        let stages = await buildDealApprovalStatus(quote.dealData, quote.dealData.requestedBy, quote.client);
        const adminRole = await Category.findOne({ role: /^superadmin$/i }).select('_id').lean();
        if (chosen) {
            stages = stages.filter((stage: any) => chosen.includes(String(stage.role)));
            if (!stages.length && adminRole) {
                stages = [{ status: 'pending', role: adminRole._id, step: 1, managerApproval: false, assignedAt: new Date() }];
            }
            // Stages are numbered in the order they act; renumber after dropping the unticked ones.
            const order = [...new Set(stages.map((stage: any) => stage.step))].sort((a: any, b: any) => a - b);
            stages = stages.map((stage: any) => ({ ...stage, step: order.indexOf(stage.step) + 1 }));
        }
        const previous = asPlain(quote.dealData.approvalStatus).filter((a: any) => a.status !== 'pending');
        await Quotation.updateOne({ _id: quote._id }, { $set: { 'dealData.approvalStatus': [...previous, ...stages.map((s: any) => ({ ...s, step: s.step + previous.length }))], 'dealData.seenByApprover': false } });
        await logAudit(req, {
            entityType: 'quotation',
            entityId: quote._id,
            entityLabel: quote.quoteId,
            action: 'deal-workflow-reset',
            summary: `Deal sheet ${quote.dealData.dealId || quote.quoteId} approval workflow reset by Super Admin`,
        });
        const fresh = await Quotation.findById(quote._id);
        await notifyDealApprovers(quote, asPlain(fresh?.dealData?.approvalStatus), me?._id, 'Deal Sheet awaiting your approval', `deal:${quote._id}:${quote.dealData.dealId}:reset:${Date.now()}`);
        return res.status(200).json({ success: true, message: 'Deal sheet workflow reset' });
    } catch (error) {
        next(error);
    }
};

export const approveDeal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const quote = await Quotation.findById(req.body.quoteId);
        if (!quote || quote.isDeleted || !quote.dealData) {
            return res.status(404).json({ message: "Pending deal sheet not found" });
        }
        if (quote.status !== quoteStatus.Won) {
            return res.status(400).json({ message: "Only a Won quotation can be approved for execution" });
        }
        if (!quote.lpoFiles?.length) {
            return res.status(400).json({ message: "Customer LPO is required before approving the deal sheet" });
        }
        if (quote.dealData.status !== 'pending') {
            return res.status(409).json({ message: `Deal sheet is already ${quote.dealData.status}` });
        }
        if (!selectedDealLines(quote.dealData.updatedItems).length) {
            return res.status(400).json({ message: "Deal sheet has no selected lines to hand over" });
        }
        const handoffIssues = dealHandoffReadinessIssues(quote);
        if (handoffIssues.length) {
            return res.status(400).json({
                message: "Deal sheet is not ready for operations handoff",
                missing: handoffIssues
            });
        }
        if (String(req.body.comment ?? '').trim().length > 500) {
            return res.status(400).json({ message: 'The note must be 500 characters or fewer' });
        }
        const approverData = await getEmployeeData(req.user);

        // Deal Sheet workflow: each stage approves in turn; the job is only created when the last stage signs off.
        let workflowStatus: any[] | null = null;
        if ((quote.dealData.approvalStatus ?? []).some((a: any) => a.status === 'pending')) {
            try {
                workflowStatus = await updateApprovalStatus(
                    'approved',
                    asPlain(quote.dealData.approvalStatus),
                    String(req.body.comment ?? ''),
                    approverData,
                    { requesterId: quote.dealData.requestedBy, ...dealApprovalContext(quote.dealData) }
                );
            } catch (error) {
                return res.status(403).json({ message: workflowMessage(error) });
            }
            if (workflowStatus.some((a: any) => a.status === 'pending')) {
                await Quotation.updateOne({ _id: quote._id }, { $set: { 'dealData.approvalStatus': workflowStatus, 'dealData.seenByApprover': false } });
                await logAudit(req, {
                    entityType: 'quotation',
                    entityId: quote._id,
                    entityLabel: quote.quoteId,
                    action: 'deal-stage-approved',
                    summary: `Deal sheet ${quote.dealData.dealId || quote.quoteId} approved at stage ${pendingDealStage(asPlain(quote.dealData.approvalStatus))[0]?.step ?? ''}, waiting for the next stage`,
                    changes: String(req.body.comment ?? '').trim() ? [{ label: 'Comment', to: String(req.body.comment).trim() }] : undefined,
                });
                await notifyDealApprovers(quote, workflowStatus, approverData?._id, 'Deal Sheet awaiting your approval', `deal:${quote._id}:${quote.dealData.dealId}:${pendingDealStage(workflowStatus)[0]?.step}:stage`);
                return res.status(200).json({ success: true, awaitingNextApproval: true, message: 'Approved at your stage. The deal sheet now waits for the next approver.' });
            }
        }

        // Roles that already signed off a stage of the route count towards the Approval Rules too.
        const approvalBreaches = unmetRuleBreaches(await approvalRuleBreaches(quote, approverData), workflowStatus ?? asPlain(quote.dealData.approvalStatus));
        if (approvalBreaches.length) {
            return res.status(403).json({
                message: "Approval rule authorization is required before this deal can be approved",
                approvalRequired: approvalBreaches
            });
        }
        const existingJob = await Job.findOne({ quoteId: req.body.quoteId, isDeleted: { $ne: true } });
        if (existingJob) {
            return res.status(409).json({ message: "A job already exists for this quotation" });
        }
        if (quote.enqId) {
            const enquiryQuoteIds = await Quotation.find({
                enqId: quote.enqId,
                _id: { $ne: quote._id },
                isDeleted: { $ne: true },
            }).distinct('_id');
            const existingEnquiryJob = enquiryQuoteIds.length ? await Job.findOne({
                isDeleted: { $ne: true },
                quoteId: { $in: enquiryQuoteIds },
            }) : null;
            if (existingEnquiryJob) {
                return res.status(409).json({ message: "A job already exists for another quotation from this enquiry" });
            }
        }
        const customerGuard = await getCustomerCommercialGuard(quote.client, estimateQuoteValue(quote));
        if (customerGuard.blocked || customerGuard.warnings.length) {
            return res.status(403).json({
                message: customerGuard.message || "Customer credit approval is required before this deal can be approved",
                approvalRequired: customerGuard.warnings.map((warning) => ({
                    type: 'creditException',
                    message: warning,
                    actual: warning
                }))
            });
        }

        const jobId = await generateJobId()
        const jobData = {
            quoteId: req.body.quoteId,
            jobId: jobId,
            comment: req.body.comment
        }

        const job = new Job(jobData);
        const saveJob = await job.save()
        if (saveJob) {
            await logAudit(req, { entityType: 'job', entityId: saveJob._id, entityLabel: jobId, action: 'created', summary: `Job ${jobId} created from approved deal sheet`, changes: String(req.body.comment ?? '').trim() ? [{ label: 'Comment', to: String(req.body.comment).trim() }] : undefined });
            const quoteUpdate = await Quotation.updateOne(
                { _id: jobData.quoteId },
                {
                    $set: { 'dealData.status': 'approved', ...(quote.dealData?.approvedDate ? { 'dealData.reapprovedDate': new Date() } : { 'dealData.approvedDate': new Date() }), 'dealData.seenedBySalsePerson': false, 'dealData.approvedBy': new ObjectId(String(approverData?._id ?? req.body.userId)), ...(workflowStatus ? { 'dealData.approvalStatus': workflowStatus } : {}) },
                    $push: { editHistory: { editedBy: approverData?._id ?? req.body.userId, editedAt: new Date(), action: 'DealApproved', reason: String(req.body.comment ?? '').trim() || undefined } }
                }
            )
            if (quoteUpdate) {
                await logAudit(req, {
                    entityType: 'quotation',
                    entityId: quote._id,
                    entityLabel: quote.quoteId,
                    action: 'deal-approved',
                    summary: `Deal sheet ${quote.dealData.dealId || quote.quoteId} approved${jobId ? ` and job ${jobId} created` : ''}`,
                    changes: [
                        { label: 'Deal status', from: 'pending', to: 'approved' },
                        ...(String(req.body.comment ?? '').trim() ? [{ label: 'Comment', to: String(req.body.comment).trim() }] : []),
                    ],
                });
                // The job's own reservation below takes over from any hold placed when the quote was won.
                await releaseQuoteStockHolds(quote._id, `Taken over by job ${jobId}`, approverData?._id, 'Converted');
                const selectedLines = selectedDealLines(quote.dealData.updatedItems)
                    .filter((line: any) => hasReferenceValue(line?.partNo) && isPositiveNumber(line?.quantity));
                // A job's reservation has no expiry: it holds the stock until a delivery takes it, or the job is lost or revoked.
                for (const line of selectedLines) {
                    const productId = typeof line.partNo === 'object' ? line.partNo._id : line.partNo;
                    try {
                        await reserveStock({
                            product: productId,
                            quantity: Number(line.quantity),
                            sourceType: 'Deal',
                            quote: quote._id,
                            job: saveJob._id,
                            customer: quote.client,
                            createdBy: approverData?._id,
                        });
                    } catch (reserveError) {
                        console.error('Could not reserve stock for deal line:', reserveError);
                    }
                }

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

        const { quoteId } = req.body;
        const comment = String(req.body.comment ?? '').trim();
        const deal = await Quotation.findById(quoteId);
        if (!deal || deal.isDeleted || !deal.dealData) {
            return res.status(404).json({ message: 'Deal not found' });
        }
        if (deal.dealData.status !== 'pending') {
            return res.status(409).json({ message: `Only a pending deal can be rejected (this one is ${deal.dealData.status})` });
        }
        if (!comment) {
            return res.status(400).json({ message: 'A reason is required to reject a deal' });
        }
        if (comment.length > 500) {
            return res.status(400).json({ message: 'The reason must be 500 characters or fewer' });
        }
        const userData = await getEmployeeData(req.user);
        // Only someone at the stage the deal is waiting on (or Super Admin) may reject it; the rejection closes the route.
        if ((deal.dealData.approvalStatus ?? []).some((a: any) => a.status === 'pending')) {
            try {
                deal.dealData.approvalStatus = await updateApprovalStatus(
                    'rejected',
                    asPlain(deal.dealData.approvalStatus),
                    comment,
                    userData,
                    { requesterId: deal.dealData.requestedBy }
                );
            } catch (error) {
                return res.status(403).json({ message: workflowMessage(error) });
            }
        }
        deal.dealData.status = 'rejected';
        deal.dealData.seenedBySalsePerson = false
        deal.dealData.comments.push(comment);
        deal.editHistory.push({
            editedBy: userData?._id ?? (req.user as any)?.id,
            editedAt: new Date(),
            action: 'DealRejected',
            reason: comment,
        } as any);
        backfillEditHistoryEditor(deal, userData?._id ?? (req.user as any)?.id);
        const savedDeal = await deal.save();
        await logAudit(req, {
            entityType: 'quotation',
            entityId: savedDeal._id,
            entityLabel: savedDeal.quoteId,
            action: 'deal-rejected',
            summary: `Deal sheet ${savedDeal.dealData?.dealId || savedDeal.quoteId} rejected`,
            changes: [
                { label: 'Deal status', from: 'pending', to: 'rejected' },
                { label: 'Reason', to: comment },
            ],
        });

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
        if (!deal || deal.isDeleted || !deal.dealData) {
            return res.status(404).json({ message: 'Deal not found' });
        }
        if (deal.dealData.status !== 'approved') {
            return res.status(409).json({ message: `Only an approved deal can be revoked (this one is ${deal.dealData.status})` });
        }

        const job = await Job.findOne({ quoteId: quoteId, isDeleted: { $ne: true } });
        const allocateStatusOrder: string[] = Object.values(allocateStatus);
        if (job && allocateStatusOrder.indexOf(job.allocateStatus) >= allocateStatusOrder.indexOf(allocateStatus.OpenToWork)) {
            return res.status(409).json({ message: 'Deal cannot be revoked once the job has started allocation (Open to Work or later)' });
        }

        // Deals approved before approvedDate existed: recover the first approval from history so it isn't lost.
        if (!deal.dealData.approvedDate) {
            const firstApproval = (deal.editHistory || []).find((h: any) => h.action === 'DealApproved');
            deal.dealData.approvedDate = firstApproval?.editedAt;
        }
        deal.dealData.revokedDate = new Date();
        deal.dealData.revokeResubmittedDate = undefined;
        deal.dealData.reapprovedDate = undefined;
        deal.dealData.status = 'pending';
        deal.dealData.seenByApprover = false;
        // A revoked deal goes through the Deal Sheet workflow again (deals raised before the workflow existed stay as they were).
        if (deal.dealData.requestedBy) {
            try {
                deal.dealData.approvalStatus = await buildDealApprovalStatus(deal.dealData, deal.dealData.requestedBy, deal.client);
            } catch (error) {
                return res.status(400).json({ message: workflowMessage(error) });
            }
        }
        const revokerData = await getEmployeeData(req.user);
        deal.editHistory.push({
            editedBy: revokerData?._id,
            editedAt: new Date(),
            action: 'DealRevoked',
        } as any);
        backfillEditHistoryEditor(deal, revokerData?._id ?? (req.user as any)?.id);
        await deal.save();
        await logAudit(req, {
            entityType: 'quotation',
            entityId: deal._id,
            entityLabel: deal.quoteId,
            action: 'deal-revoked',
            summary: `Deal sheet ${deal.dealData?.dealId || deal.quoteId} revoked`,
            changes: [
                { label: 'Deal status', from: 'approved', to: 'pending' },
                ...(job?.jobId ? [{ label: 'Removed job', from: job.jobId }] : []),
            ],
        });
        // Soft delete: the job record is kept for history, but every job query filters isDeleted.
        const jobDelete = await Job.updateOne({ quoteId: quoteId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, updatedDate: new Date() } });
        if (job) {
            // The job's stock reservations die with it; leaving them Active would block that stock forever.
            await releaseStock({ job: job._id }, 'Deal revoked', revokerData?._id);
        }

        if (jobDelete.modifiedCount) {
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
                        return dealSheetCan(privileges, "view");
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
        if (!req.files) return res.status(204).json({ err: 'No data' });
        const existingQuote = await Quotation.findById(req.body.quoteId);
        if (!existingQuote || existingQuote.isDeleted) {
            return res.status(404).json({ message: "Quote not found" });
        }
        if (existingQuote.status !== quoteStatus.Won) {
            return res.status(400).json({ message: "Customer LPO can only be uploaded after the quote is marked Won" });
        }
        if (hasActiveDeal(existingQuote)) {
            return res.status(409).json({ message: "LPO files cannot be changed while a deal sheet is in progress or approved" });
        }

        const lpoFiles = req.files;
        const newFiles = await Promise.all(lpoFiles.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path, file.mimetype);
            return { fileName: file.filename, originalname: file.originalname };
        }));
        const userData = await getEmployeeData(req.user);
        const acceptedLpoFiles = [...(existingQuote.lpoFiles || []), ...newFiles];
        const acceptedRevision = existingQuote.revision ?? 0;
        const customerPoNumber = String(req.body.customerPoNumber || '').trim();
        const acceptedByName = String(req.body.acceptedByName || '').trim();

        // Use $push to append new files to existing array
        const quote = await Quotation.findByIdAndUpdate(
            req.body.quoteId,
            {
                $set: {
                    lpoSubmitted: true,
                    customerAcceptance: {
                        acceptedRevision,
                        acceptedAt: new Date(),
                        acceptedBy: userData?._id,
                        ...(customerPoNumber ? { customerPoNumber } : {}),
                        ...(acceptedByName ? { acceptedByName } : {}),
                        lpoFiles: acceptedLpoFiles,
                    },
                },
                $push: {
                    lpoFiles: { $each: newFiles },
                    editHistory: {
                        editedBy: userData?._id,
                        editedAt: new Date(),
                        action: 'CustomerAccepted',
                        revision: acceptedRevision,
                        reason: [customerPoNumber ? `Customer PO ${customerPoNumber}` : '', acceptedByName ? `Accepted by ${acceptedByName}` : ''].filter(Boolean).join(' — '),
                    }
                }
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

export const getReportDetails = async (req: Request, res: Response, next: NextFunction) => {
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
        // The report counts a quote past its date as Expired, whatever its stored status.
        quotations.forEach((q: any) => { if (isQuoteExpired(q)) q.status = quoteStatus.Expired; });

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
        if (quote.isDeleted) {
            return res.status(404).json({
                message: 'Quote not found or already deleted'
            });
        }
        if (hasActiveDeal(quote)) {
            return res.status(409).json({
                message: 'A quotation with an active or approved deal sheet cannot be deleted'
            });
        }
        const existingJob = await Job.findOne({ quoteId: dataId, isDeleted: { $ne: true } });
        if (existingJob) {
            return res.status(409).json({
                message: 'A quotation with a job sheet cannot be deleted'
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
        const { search = '', departments = '', limit = '20', skip = '0', category = '', includePending = '', lean = '' } = req.query;
        // `lean` keeps the list to catalogue fields plus a cheap availability figure: no warehouse breakdown, last stock entry or quotation history.
        const isLean = lean === 'true';
        // Supplier RFQs work with products still awaiting approval (product approval is skipped there for now).
        const hidden = includePending === 'true' ? ['Draft'] : ['Draft', 'Pending'];
        const filter: any = { isDeleted: { $ne: true }, approvalStatus: { $nin: hidden } };

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
                        { productName: tokenRegex },
                        { partNo: tokenRegex },
                        { itemCode: tokenRegex },
                        { productCategory: { $in: matchingCategories.map((c) => c._id) } },
                    ],
                };
            }));
        }

        const limitValue = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 50);

        // Callers page through long result sets with `skip`; the _id order keeps pages from overlapping.
        // Newest first: with a fixed page size, oldest-first would bury recently added products behind the legacy ones.
        const skipValue = Math.max(parseInt(skip as string, 10) || 0, 0);

        const suggestions = await Product.find(filter)
            .select('productCategory productName productDescription partNo itemCode unitOfMeasure type defaultSellingPrice estimatedCost defaultVendor leadTimeDays')
            .populate('productCategory', 'categoryName')
            .sort({ _id: -1 })
            .skip(skipValue)
            .limit(limitValue)
            .lean();

        const productIds = suggestions.map((product: any) => product._id);
        const availability = await getAvailability(productIds);
        const lastReceipts = isLean ? new Map() : await getLastReceiptCosts(productIds);
        const warehouseRows: any[] = (isLean || !productIds.length) ? [] : await StockMovement.aggregate([
            { $match: { isDeleted: { $ne: true }, product: { $in: productIds }, stockStatus: { $ne: 'Quarantine' }, warehouse: { $exists: true } } },
            { $group: { _id: { product: '$product', warehouse: '$warehouse' }, quantity: { $sum: { $subtract: ['$quantityIn', '$quantityOut'] } } } },
        ]);
        const warehouses = warehouseRows.length ? await Warehouse.find({ _id: { $in: [...new Set(warehouseRows.map((row) => String(row._id.warehouse)))] } }).select('wareHouseName').lean() : [];
        const warehouseById = new Map(warehouses.map((warehouse: any) => [warehouse._id.toString(), warehouse.wareHouseName]));

        const recentUsage = (productIds.length && !isLean) ? await Quotation.aggregate([
            { $match: { isDeleted: { $ne: true }, 'optionalItems.items.itemDetails.productId': { $in: productIds } } },
            { $unwind: '$optionalItems' },
            { $unwind: '$optionalItems.items' },
            { $unwind: '$optionalItems.items.itemDetails' },
            { $match: { 'optionalItems.items.itemDetails.productId': { $in: productIds } } },
            { $sort: { date: -1, createdAt: -1, _id: -1 } },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'client',
                    foreignField: '_id',
                    as: 'clientInfo',
                },
            },
            { $unwind: { path: '$clientInfo', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    productId: '$optionalItems.items.itemDetails.productId',
                    quoteId: 1,
                    quoteMongoId: '$_id',
                    date: 1,
                    status: 1,
                    dealStatus: '$dealData.status',
                    customerName: '$clientInfo.companyName',
                    quantity: '$optionalItems.items.itemDetails.quantity',
                    unitSellingPrice: '$optionalItems.items.itemDetails.unitSellingPrice',
                },
            },
            {
                $group: {
                    _id: '$productId',
                    usage: { $push: '$$ROOT' },
                    quoteCount: { $sum: 1 },
                    soldCount: {
                        $sum: {
                            $cond: [
                                { $or: [{ $eq: ['$status', quoteStatus.Won] }, { $eq: ['$dealStatus', 'approved'] }] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
            {
                $project: {
                    quoteCount: 1,
                    soldCount: 1,
                    recent: { $slice: ['$usage', 3] },
                },
            },
        ]) : [];
        const usageByProduct = new Map(recentUsage.map((usage: any) => [usage._id.toString(), usage]));

        const suggestionsWithAvailability = suggestions.map((product: any) => {
            const productId = product._id.toString();
            const stock = availability.get(productId) || { onHand: 0, reserved: 0, available: 0, quarantined: 0 };
            const usage = usageByProduct.get(productId);
            const stockStatus = product.type && product.type !== 'Stock'
                ? 'Non-stock'
                : stock.available > 0
                    ? 'In stock'
                    : stock.onHand > 0
                        ? 'Reserved / blocked'
                        : 'Not in stock';
            if (isLean) {
                return {
                    ...product,
                    onHandQuantity: stock.onHand,
                    availableQuantity: stock.available,
                    stockStatus,
                };
            }
            const lastReceipt = lastReceipts.get(productId);
            return {
                ...product,
                onHandQuantity: stock.onHand,
                blockedQuantity: 0,
                reservationQuantity: stock.reserved,
                reservedQuantity: stock.reserved,
                quarantinedQuantity: stock.quarantined,
                availableQuantity: stock.available,
                stockStatus,
                warehouseAvailability: warehouseRows
                    .filter((row) => String(row._id.product) === productId && row.quantity > 0)
                    .map((row) => ({
                        warehouseId: String(row._id.warehouse),
                        warehouseName: warehouseById.get(String(row._id.warehouse)) || 'Warehouse',
                        quantity: row.quantity,
                    }))
                    .sort((x, y) => y.quantity - x.quantity)
                    .slice(0, 5),
                lastStockEntry: lastReceipt ? {
                    dateOfPurchase: lastReceipt.date,
                    supplierLpoNo: lastReceipt.lpoNo || '',
                } : null,
                salesHistory: {
                    quotedCount: usage?.quoteCount || 0,
                    soldCount: usage?.soldCount || 0,
                    recent: (usage?.recent || []).map((row: any) => ({
                        quoteId: row.quoteId,
                        quotationId: row.quoteMongoId,
                        date: row.date,
                        status: row.status,
                        dealStatus: row.dealStatus || '',
                        customerName: row.customerName || '',
                        quantity: row.quantity || 0,
                        unitSellingPrice: row.unitSellingPrice || 0,
                    })),
                },
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Product suggestions fetched successfully',
            data: suggestionsWithAvailability,
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
            .select('+revisions revision subject currency optionalItems customerNote termsAndCondition paymentTerms deliveryTerms deliveryLocation validityDate closingDate date quotedDate createdBy')
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
                        paymentTerms: quote.paymentTerms,
                        deliveryTerms: quote.deliveryTerms,
                        deliveryLocation: quote.deliveryLocation,
                        validityDate: quote.closingDate || quote.validityDate,
                        quotedDate: quote.quotedDate || quote.date,
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
        if (!quote || quote.isDeleted) {
            return res.status(404).json({ message: 'Quote not found' });
        }
        if (hasActiveDeal(quote)) {
            return res.status(409).json({ message: "LPO files cannot be removed while a deal sheet is in progress or approved" });
        }
        const nextLpoFiles = (quote.lpoFiles || []).filter((file: any) => file.fileName !== fileName) as [];
        quote.lpoFiles = nextLpoFiles as [];
        if (!nextLpoFiles.length) {
            quote.set('customerAcceptance', undefined);
        } else if (quote.customerAcceptance) {
            quote.customerAcceptance.lpoFiles = nextLpoFiles as [];
        }
        await deleteFileFromAws(fileName);
        await quote.save();
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

const EDIT_HISTORY_IGNORED_FIELDS = new Set(['_id', '__v', 'editHistory', 'createdBy', 'quoteId', 'updatedAt', 'createdAt', 'saveNote']);
const EDIT_HISTORY_DATE_FIELDS = new Set(['date', 'quotedDate', 'closingDate', 'validityDate']);
const EDIT_HISTORY_MAX_VALUE_LENGTH = 300;

const stringifyForHistory = (value: any): string => {
    if (value === undefined || value === null) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > EDIT_HISTORY_MAX_VALUE_LENGTH ? `${str.slice(0, EDIT_HISTORY_MAX_VALUE_LENGTH)}…` : str;
}

const normalizedHistoryValue = (field: string, value: any): any => {
    if (!EDIT_HISTORY_DATE_FIELDS.has(field) || value === undefined || value === null || value === '') return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
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
                image: d?.image ? {
                    fileName: str(d.image.fileName),
                    originalname: str(d.image.originalname),
                    mimetype: str(d.image.mimetype),
                } : null,
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
            : JSON.stringify(normalizedHistoryValue(field, oldValue)) === JSON.stringify(normalizedHistoryValue(field, newValue));
        if (same) continue;

        changes.push({
            field,
            from: stringifyForHistory(oldValue),
            to: stringifyForHistory(newValue),
        });
    }
    return changes;
}
