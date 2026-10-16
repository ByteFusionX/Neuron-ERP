import Workflow from "../models/workflow.model";
import type { PipelineStage } from 'mongoose';
import { NextFunction, Request, Response } from "express"
import enquiryModel from "../models/enquiry.model";
import Employee from '../models/employee.model';
import Department from '../models/department.model';
import customerModel from "../models/customer.model";
import { Enquiry } from "../interface/enquiry.interface";
import quotationModel, { quoteStatus } from "../models/quotation.model";
import { uploadFileToAws, deleteFileFromAws } from "../common/aws-connect";
import { newTrash } from '../controllers/trash.controller'
import { getReportedEmployeesWithDepartments, widenAccessForDepartmentHead, getEmployeeData } from "../common/utils/util";
import { cancelInBlock, completeInBlock, followUpViewFilter, readCompleteBody, readScheduleBody, scheduleInBlock } from "../services/followUpTasks.service";
import { notifyByPrivilege } from "../services/notify.service";
import { getNextSequence } from "../models/counter.model";
import { getCustomerCommercialGuard } from "../common/customer-commercial-guards";
import { buildAssignmentChain, resolveCurrentAssignmentStep, advanceAssignmentStep, rejectUnassignedPresale, stageRoleIds } from "../services/presaleAssignment.service";
import { logEnquiryAudit } from "../services/enquiryAudit.service";
import { cancelOpenFollowUp } from "../services/enquiryFollowUp.service";
const { ObjectId } = require('mongodb')

const buildAssignmentEntry = async (employeeId: any, action: 'assigned' | 'reassigned' | 'self-assigned', assignedBy: any) => {
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

const applyRequestedEnquiryOwner = async (enquiryData: any, actor: any) => {
    const requestedOwner = enquiryData.accountingManager;
    delete enquiryData.accountingManager;
    delete enquiryData.createdByUser;
    if (!requestedOwner || !ObjectId.isValid(requestedOwner)) return;

    const owner = await Employee.findById(requestedOwner).select('_id');
    if (!owner) return;

    enquiryData.salesPerson = owner._id;
    if (actor?._id?.toString() !== owner._id.toString()) {
        enquiryData.createdByUser = actor._id;
    } else {
        delete enquiryData.createdByUser;
    }
};

export const createEnquiry = async (req: any, res: Response, next: NextFunction) => {
    try {
        if (!req.files) return res.status(204).json({ err: 'No data' })

        // Validate before anything is uploaded, so a rejected request leaves no orphan files behind.
        let incoming: any;
        try {
            incoming = JSON.parse(req.body.enquiryData);
        } catch {
            return res.status(400).json({ success: false, message: 'Enquiry details are missing or unreadable.' });
        }
        const missingFields = [['client', 'customer'], ['department', 'department'], ['title', 'title']]
            .filter(([key]) => !String(incoming?.[key] ?? '').trim())
            .map(([, label]) => label);
        if (missingFields.length) {
            return res.status(400).json({ success: false, message: `Enter the ${missingFields.join(', ')} before saving.` });
        }
        if (isNaN(new Date(incoming.date).getTime())) {
            return res.status(400).json({ success: false, message: 'Enter a valid enquiry date.' });
        }
        // The enquiry number follows its date, so keep it within a sane window (a day of slack covers time zones).
        const enquiryDateMs = new Date(incoming.date).getTime();
        if (enquiryDateMs > Date.now() + 86400000 || enquiryDateMs < Date.now() - 91 * 86400000) {
            return res.status(400).json({ success: false, message: 'The enquiry date cannot be in the future or more than 90 days back.' });
        }

        const enquiryFiles = req.files?.attachments ? await Promise.all(req.files.attachments.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
        })) : [];

        const presaleFiles = req.files?.presaleFiles ? await Promise.all(req.files.presaleFiles.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
        })) : [];

        const enquiryData = <Enquiry>incoming
        enquiryData.title = String(enquiryData.title).trim()
        enquiryData.requirement = String(enquiryData.requirement || '').trim()
        if (!enquiryData.requirement) {
            return res.status(400).json({ success: false, message: 'Requirement is required' });
        }
        const createdByUser = await getEmployeeData(req.user);
        await applyRequestedEnquiryOwner(enquiryData, createdByUser);
        const customerGuard = await getCustomerCommercialGuard((enquiryData as any).client);
        if (customerGuard.blocked) {
            return res.status(409).json({ success: false, message: customerGuard.message });
        }

        let enqId: string = await generateEnquiryId(enquiryData.department, enquiryData.salesPerson, enquiryData.date as string);

        enquiryData.enquiryId = enqId;
        enquiryData.attachments = []
        if (enquiryFiles) {
            enquiryData.attachments = enquiryFiles
        }

        enquiryData.status = enquiryData.status || 'new'
        enquiryData.date = new Date(enquiryData.date)
        if (enquiryData.nextFollowUpDate) enquiryData.nextFollowUpDate = new Date(enquiryData.nextFollowUpDate)
        if (enquiryData.followUpOutcome || enquiryData.nextFollowUpDate) {
            const creator = createdByUser;
            const createdBy = creator?._id?.toString();
            const createdByName = creator ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() : '';
            const history: any[] = [];
            // An outcome entered at creation already happened; the next date is the open follow-up.
            if (enquiryData.followUpOutcome) {
                enquiryData.lastFollowUpDate = enquiryData.date;
                history.push({ status: 'done', date: enquiryData.date, outcome: enquiryData.followUpOutcome, completedAt: new Date(), createdBy, createdByName, createdAt: new Date() });
            }
            if (enquiryData.nextFollowUpDate) {
                history.push({ status: 'scheduled', date: enquiryData.nextFollowUpDate, dueDate: enquiryData.nextFollowUpDate, createdBy, createdByName, createdAt: new Date() });
            }
            enquiryData.followUpHistory = history;
        }
        const newEnquiry = new enquiryModel(enquiryData)
        const saveEnquiryData = await newEnquiry.save()
        if (!saveEnquiryData) return res.status(504).json({ err: 'Internal Error' });
        await logEnquiryAudit(req, saveEnquiryData._id, 'created', `Enquiry ${enqId} created`);

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
                $lookup: { from: 'employees', localField: 'createdByUser', foreignField: '_id', as: 'createdByUser' }
            },
            {
                $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true }
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

        return res.status(200).json({
            ...savedEnquiryData[0],
            commercialWarnings: customerGuard.warnings
        });
    } catch (error) {
        console.log(error)
        next(error)
    }
}

const FOLLOW_UP_CLOSED_STATUSES = ['quoted', 'lost'];

const followUpActor = async (req: Request) => {
    const user: any = await getEmployeeData((req as any).user);
    return { id: user?._id, name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '' };
};

/** Loads an enquiry for a follow-up action, replying with the error itself when it can't take one. */
const loadFollowUpEnquiry = async (req: Request, res: Response): Promise<any | null> => {
    const { enquiryId } = req.params;
    if (!ObjectId.isValid(enquiryId)) { res.status(400).json({ success: false, message: 'Invalid enquiry id' }); return null; }
    const enquiry: any = await enquiryModel.findOne({ _id: enquiryId, isDeleted: { $ne: true } });
    if (!enquiry) { res.status(404).json({ success: false, message: 'Enquiry not found' }); return null; }
    if (FOLLOW_UP_CLOSED_STATUSES.includes(String(enquiry.status || '').toLowerCase())) {
        res.status(400).json({ success: false, message: `A ${enquiry.status} enquiry can't have follow-ups.` });
        return null;
    }
    return enquiry;
};

const parseFollowUpDate = (value: any): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Re-derives the enquiry-level summary fields from the follow-up tasks: the next date is the open task's due date
 * (cleared when none is open) and the last date/outcome come from the most recent completed one.
 */
const syncFollowUpSummary = (enquiry: any) => {
    const history: any[] = enquiry.followUpHistory || [];
    const open = history.find((entry) => entry.status === 'scheduled');
    enquiry.nextFollowUpDate = open ? open.dueDate : undefined;
    const done = history
        .filter((entry) => !entry.status || entry.status === 'done')
        .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())[0];
    if (done) {
        enquiry.lastFollowUpDate = done.date;
        enquiry.followUpOutcome = done.outcome;
    }
};

const saveFollowUpChange = async (enquiry: any) => {
    syncFollowUpSummary(enquiry);
    await enquiry.save({ validateModifiedOnly: true });
    await enquiry.populate(['client', 'department', 'salesPerson']);
};


/** Schedules the enquiry's follow-up, or moves it when one is already open (one open follow-up per enquiry). */
export const scheduleFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dueDate = parseFollowUpDate(req.body.dueDate);
        if (!dueDate) return res.status(400).json({ success: false, message: 'Choose a follow-up date.' });
        const enquiry = await loadFollowUpEnquiry(req, res);
        if (!enquiry) return;

        const actor = await followUpActor(req);
        const note = req.body.note?.trim() || '';
        const open = enquiry.followUpHistory.find((entry: any) => entry.status === 'scheduled');
        if (open) {
            open.dueDate = dueDate;
            open.date = dueDate;
            if (note) open.note = note;
        } else {
            enquiry.followUpHistory.push({
                status: 'scheduled', dueDate, date: dueDate, note,
                createdBy: actor.id, createdByName: actor.name, createdAt: new Date(),
            });
        }
        await saveFollowUpChange(enquiry);
        return res.status(200).json({ success: true, enquiry });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

/** Marks the open follow-up done with its outcome, optionally scheduling the next one in the same step. */
export const completeFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { outcome, note } = req.body;
        if (!outcome?.trim()) return res.status(400).json({ success: false, message: 'Enter the follow-up outcome.' });
        const doneOn = parseFollowUpDate(req.body.date) || new Date();
        const nextDate = parseFollowUpDate(req.body.nextFollowUpDate);
        const enquiry = await loadFollowUpEnquiry(req, res);
        if (!enquiry) return;

        const actor = await followUpActor(req);
        const now = new Date();
        const open = enquiry.followUpHistory.find((entry: any) => entry.status === 'scheduled');
        if (open) {
            open.status = 'done';
            open.date = doneOn;
            open.outcome = outcome.trim();
            open.note = note?.trim() || open.note || '';
            open.completedAt = now;
            open.createdBy = actor.id;
            open.createdByName = actor.name;
        } else {
            // Nothing was scheduled (an ad-hoc call, or an enquiry from before follow-up tasks): log it as done.
            enquiry.followUpHistory.push({
                status: 'done', date: doneOn, outcome: outcome.trim(), note: note?.trim() || '', completedAt: now,
                createdBy: actor.id, createdByName: actor.name, createdAt: now,
            });
        }
        if (nextDate) {
            enquiry.followUpHistory.push({
                status: 'scheduled', dueDate: nextDate, date: nextDate,
                createdBy: actor.id, createdByName: actor.name, createdAt: now,
            });
        }
        await saveFollowUpChange(enquiry);
        return res.status(200).json({ success: true, enquiry });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

/** Closes the open follow-up without logging an outcome. */
export const cancelFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enquiry = await loadFollowUpEnquiry(req, res);
        if (!enquiry) return;
        const open = enquiry.followUpHistory.find((entry: any) => entry.status === 'scheduled');
        if (!open && !enquiry.nextFollowUpDate) return res.status(400).json({ success: false, message: 'No follow-up is scheduled.' });
        const reason = req.body.reason?.trim() || '';
        if (open) {
            open.status = 'cancelled';
            open.cancelReason = reason;
            open.completedAt = new Date();
        }
        await saveFollowUpChange(enquiry);
        return res.status(200).json({ success: true, enquiry });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

const titleTokens = (title: string) =>
    new Set((title || '').toLowerCase().replace(/[^a-z0-9s]/g, ' ').split(/s+/).filter(t => t.length > 2));

/** Open enquiries of the same customer whose title looks like the one being entered. */
export const findSimilarEnquiries =async (req: Request, res: Response, next: NextFunction) => {
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

export const sendToPresale = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { enquiryId } = req.params;
        const enquiry = await enquiryModel.findOne({ _id: enquiryId, isDeleted: { $ne: true } });
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
        const sendable = ['New', 'In Review', 'Rejected by Presale Manager', 'new', 'rejected', 'estimated'];
        if (!sendable.includes(enquiry.status)) {
            return res.status(400).json({ success: false, message: 'This enquiry has already been sent to presale' });
        }
        if (enquiry.status === 'rejected' && enquiry.preSale?.status === 'rejected') {
            return res.status(400).json({ success: false, message: 'Presales rejected this job and the manager has not resolved it yet' });
        }

        // A job coming back after a rejection or an estimate is a revision; its presale status stays 'returned' so presales can tell it from a fresh job.
        const isResend = ['rejected', 'Rejected by Presale Manager', 'estimated'].includes(enquiry.status);
        if (isResend && !note) {
            return res.status(400).json({ success: false, message: 'Add a note telling presales what needs revising' });
        }
        const nextStatus = isResend ? 'revision' : 'in presales';

        const sender = await getEmployeeData(req.user);
        const assignApproval = await buildAssignmentChain();
        await enquiryModel.updateOne(
            { _id: enquiryId },
            {
                $set: {
                    status: nextStatus,
                    'preSale.status': isResend ? 'returned' : 'new',
                    'preSale.createdDate': new Date(),
                    'preSale.newFeedbackAccess': true,
                    'preSale.seenbyEmployee': false,
                    'preSale.seenbySalesPerson': false,
                    ...(assignApproval ? { 'preSale.assignApproval': assignApproval } : {}),
                },
                ...(isResend ? { $push: { 'preSale.revisionComment': note } } : {}),
                $unset: { reAssigned: '', reAssignedDate: '', 'preSale.presalePerson': '', ...(assignApproval ? {} : { 'preSale.assignApproval': '' }) },
            }
        );

        await logEnquiryAudit(req, enquiry._id, isResend ? 'resent-to-presale' : 'sent-to-presale',
            isResend ? 'Resent to presales' : 'Sent to presales',
            [{ label: 'Status', from: enquiry.status, to: nextStatus }, ...(isResend ? [{ label: 'Revision note', to: note }] : [])]);

        await notifyByPrivilege(
            {
                type: 'AssignedJob',
                referenceModel: 'Enquiry',
                title: 'New Presale Job',
                message: `Enquiry ${enquiry.enquiryId} has been sent to presale and is waiting to be assigned`,
                sentBy: sender?._id?.toString() || enquiry.salesPerson.toString(),
                referenceId: enquiry._id,
                additionalData: { enquiryId: enquiry._id.toString() }
            },
            {
                privilegeKey: 'assignedJob',
                checkFunction: (privileges) => privileges.assignedJob?.assign === true
            }
        );

        return res.status(200).json({ success: true, status: nextStatus });
    } catch (error) {
        console.error('Error in sendToPresale:', error);
        next(error);
    }
};

// Statuses an enquiry can be converted to a quote from. 'in progress' and 'estimated' are current values; the rest are legacy.
const CONVERTIBLE_TO_QUOTE_STATUSES = ['new', 'in progress', 'estimated', 'work in progress', 'ready for quotation'];

/** Hands an enquiry over to quotations. From here on the quotation owns the process; its outcome never changes the enquiry. */
export const convertToQuote = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { enquiryId } = req.params;
        const enquiry = await enquiryModel.findOne({ _id: enquiryId, isDeleted: { $ne: true } });
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        if (!CONVERTIBLE_TO_QUOTE_STATUSES.includes(String(enquiry.status || '').toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Only new, in progress or estimated enquiries can be converted to a quote' });
        }
        if (!enquiry.client || !enquiry.contact || !String(enquiry.title || '').trim() || !String(enquiry.requirement || '').trim()) {
            return res.status(400).json({ success: false, message: 'Customer, contact and requirement summary are required before quotation' });
        }

        // Deliberately does NOT flip the enquiry to 'quoted' here. That used to happen immediately,
        // before any quotation existed — so cancelling the quote-creation flow left the enquiry
        // permanently stuck on 'quoted' with no quote behind it (orphaned, invisible to every list
        // that filters by one or the other). The enquiry is only moved to 'Quoted' once a real,
        // non-draft quotation is actually saved against it (see quotation.controller.ts, which
        // already does this on create/update). This endpoint only validates and hands off.
        return res.status(200).json({ success: true, status: enquiry.status });
    } catch (error) {
        console.error('Error in convertToQuote:', error);
        next(error);
    }
};

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
        const enquiry = await enquiryModel.findOne({ _id: enquiryId, isDeleted: { $ne: true } });
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        // Assigning is only for a job that has no one working on it; handing over a live job is reassign's job.
        const blocked = await presaleStepBlock(enquiryId);
        if (blocked) return res.status(blocked.code).json({ success: false, message: blocked.message });
        const liveStatuses = ['assigned', 'in review', 'in revision', 'completed', 'approved'];
        if (enquiry.preSale?.presalePerson && liveStatuses.includes(String(enquiry.preSale?.status))) {
            return res.status(409).json({ success: false, message: `This job is already ${enquiry.preSale.status}. Use reassign instead.` });
        }

        const assigner = await getEmployeeData(req.user);
        if (!enquiry.preSale?.presalePerson) {
            const stageBlock = await assignmentStageBlock(enquiry.preSale?.assignApproval, assigner);
            if (stageBlock) return res.status(stageBlock.code).json({ success: false, message: stageBlock.message });
        }
        if (presale.presalePerson && !/^superadmin$/i.test(String((assigner?.category as any)?.role ?? ''))
            && String(presale.presalePerson) !== String(assigner?._id)) {
            const team = await getReportedEmployeesWithDepartments(assigner?._id);
            if (!team.some((id: any) => String(id) === String(presale.presalePerson))) {
                return res.status(403).json({ success: false, message: 'You can only assign this job to someone in your team' });
            }
        }
        const assignmentEntry = presale.presalePerson
            ? await buildAssignmentEntry(presale.presalePerson, 'assigned', assigner)
            : null;

        // Only the assignment fields come from the body; estimations, feedback, revisions and history are never overwritten.
        const protectedKeys = ['estimations', 'feedback', 'revisionComment', 'assignApproval', 'rejectionHistory', 'status',
            'createdDate', 'newFeedbackAccess', 'existingPresaleFiles'];
        const presaleFields: any = {};
        Object.keys(presale).filter((k) => !protectedKeys.includes(k)).forEach((k) => { presaleFields[`preSale.${k}`] = presale[k]; });

        // Update the enquiry with presale data
        const update =await enquiryModel.updateOne(
            { _id: enquiryId },
            {
                $set: {
                    ...presaleFields,
                    'preSale.newFeedbackAccess': true,
                    'preSale.createdDate': Date.now(),
                    'preSale.status': 'assigned',
                    status: 'in presales',
                },
                // A fresh assignment starts a clean cycle: no stale reassignee, no running escalation timer.
                $unset: { reAssigned: '', reAssignedDate: '', 'preSale.assignApproval': '' },
                ...(assignmentEntry ? { $push: { assignmentHistory: assignmentEntry } } : {})
            }
        );

        if (assignmentEntry) {
            await logEnquiryAudit(req, enquiryId, 'assigned', `Assigned to ${assignmentEntry.employeeName || 'presale'}`,
                [{ label: 'Status', from: enquiry.status, to: 'in presales' }]);
        }

        // Notify the presale person via notification
        if (presale.presalePerson) {
            const enquiry = await enquiryModel.findById(enquiryId);
            const userData = await getEmployeeData(req.user);
            if (enquiry) {
                await notifyByPrivilege(
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
                    }
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

/** The enquiry's own fields (title, contact, priority...) while it is still open. Customer, department and date stay as raised. */
export const updateEnquiryDetails = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { enquiryId } = req.params;
        const enquiry: any = await enquiryModel.findById(enquiryId);
        if (!enquiry || enquiry.isDeleted) return res.status(404).json({ success: false, message: 'Enquiry not found' });

        const body = req.body || {};
        const changes: string[] = [];
        const set = (field: string, value: any, label: string) => {
            const before = enquiry[field] == null ? '' : String(enquiry[field]);
            const after = value == null ? '' : String(value);
            if (before === after) return;
            enquiry[field] = value === '' ? undefined : value;
            changes.push(label);
        };
        if (body.title !== undefined) {
            const title = String(body.title).trim();
            if (!title) return res.status(400).json({ success: false, message: 'Enter a title for the enquiry.' });
            set('title', title, 'title');
        }
        if (body.contact !== undefined) {
            if (!body.contact || !ObjectId.isValid(body.contact)) return res.status(400).json({ success: false, message: 'Pick a contact for the enquiry.' });
            const customer: any = await customerModel.findById(enquiry.client).select('contactDetails._id').lean();
            if (!(customer?.contactDetails || []).some((c: any) => String(c._id) === String(body.contact))) {
                return res.status(400).json({ success: false, message: 'That contact does not belong to this customer.' });
            }
            set('contact', body.contact, 'contact');
        }
        if (body.priority !== undefined) set('priority', body.priority, 'priority');
        if (body.source !== undefined) set('source', body.source || '', 'source');
        if (body.enquiryCategory !== undefined) set('enquiryCategory', body.enquiryCategory || '', 'category');
        if (body.requirement !== undefined) set('requirement', body.requirement, 'requirement');

        if (!changes.length) return res.status(200).json({ success: true, message: 'Nothing changed', data: enquiry });
        await enquiry.save();
        await logEnquiryAudit(req, enquiry._id, 'details-updated', `Updated ${changes.join(', ')}`);
        return res.status(200).json({ success: true, message: 'Enquiry updated', data: enquiry });
    } catch (error) {
        next(error);
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
        if (!/^superadmin$/i.test(String(role ?? '')) && !isOwner) {
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

        const before = new Set((enquiry.attachments || []).map((f: any) => f.fileName));
        const after = new Set(attachments.map((f: any) => f.fileName));
        const added = attachments.filter((f: any) => !before.has(f.fileName));
        const removed = (enquiry.attachments || []).filter((f: any) => !after.has(f.fileName));
        if (added.length) await logEnquiryAudit(req, enquiryId, 'attachment-added', `Added ${added.length === 1 ? 'document' : added.length + ' documents'}: ${added.map((f: any) => f.originalname || f.fileName).join(', ')}`);
        if (removed.length) await logEnquiryAudit(req, enquiryId, 'attachment-removed', `Removed ${removed.length === 1 ? 'document' : removed.length + ' documents'}: ${removed.map((f: any) => f.originalname || f.fileName).join(', ')}`);

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
        if (!/^superadmin$/i.test(String(role ?? '')) && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        const remaining = (enquiry.attachments || []).filter((file: any) => file.fileName !== fileName);
        if (remaining.length === (enquiry.attachments || []).length) {
            return res.status(404).json({ success: false, message: "Attachment not found" });
        }

        await deleteFileFromAws(fileName);
        const updated = await enquiryModel.findByIdAndUpdate(enquiryId, { $set: { attachments: remaining } }, { new: true });
        const removedFile: any = (enquiry.attachments || []).find((file: any) => file.fileName === fileName);
        await logEnquiryAudit(req, enquiryId, 'attachment-removed', `Removed document: ${removedFile?.originalname || fileName}`);
        return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
        console.error("Error in removeEnquiryAttachment:", error);
        return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

export const getEnquiries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let {
            page,
            row,
            search,
            sortKey,
            sortDir,
            salesPerson,
            status,
            customer,
            fromDate,
            toDate,
            department,
            access,
            userId,
            createdBy,
            overdueFollowUp,
            todayFollowUp,
            upcomingFollowUp,
            completed,
            lost: lostView,
            presales: presalesView,
            source,
            enquiryCategory,
            priority,
            followUpFromDate,
            followUpToDate,
        } = req.body;
        let skipNum: number = (page - 1) * row;

        // Lost/Quoted are stored lowercase by the newer write path but Title Case in older records.
        // Each current status also matches the old values it replaced, so old enquiries still turn up under it.
        const LEGACY_STATUS_GROUPS: Record<string, string[]> = {
            'new': ['New', 'new', 'In Review', 'in review'],
            'in progress': ['Work In Progress', 'work in progress', 'in progress', 'In Progress'],
            'in presales': ['in presales', 'Sent to Presales', 'Assigned To Presale Manager', 'Assigned To Presale Engineer', 'Assigned To Presales'],
            'estimated': ['estimated', 'Estimated', 'Ready for Quotation', 'ready for quotation'],
            'revision': ['revision', 'Revision'],
            'rejected': ['rejected', 'Rejected', 'Rejected by Presale Engineer', 'Rejected by Presale Manager'],
            'quoted': ['Quoted', 'quoted'],
            'lost': ['Lost', 'lost'],
        };
        const statusVariants = (value: any): any[] => {
            const v = typeof value === 'string' ? value : '';
            const key = v.toLowerCase();
            const group = Object.values(LEGACY_STATUS_GROUPS).find(g => g.some(s => s.toLowerCase() === key));
            return group ?? [value];
        };
        let isSalesPerson = salesPerson == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isStatus = status == null ? true : false;
        let isDepartment = department == null ? true : false;
        let isSource = source == null ? true : false;
        let isEnquiryCategory = enquiryCategory == null ? true : false;
        let isPriority = priority == null ? true : false;

        const dateFilter: Record<string, Date> = {};
        if (fromDate) dateFilter.$gte = new Date(fromDate);
        if (toDate) {
            const endDate = new Date(toDate);
            endDate.setDate(endDate.getDate() + 1);
            dateFilter.$lt = endDate;
        }
        const followUpDateFilter: Record<string, Date> = {};
        if (followUpFromDate) followUpDateFilter.$gte = new Date(followUpFromDate);
        if (followUpToDate) {
            const followUpEndDate = new Date(followUpToDate);
            followUpEndDate.setDate(followUpEndDate.getDate() + 1);
            followUpDateFilter.$lt = followUpEndDate;
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
                { $or: [{ status: { $in: statusVariants(status) } }, { status: { $exists: isStatus } }] },
                { $or: [{ client: new ObjectId(customer) }, { client: { $exists: isCustomer } }] },
                Object.keys(dateFilter).length ? { date: dateFilter } : {},
                Object.keys(followUpDateFilter).length ? { nextFollowUpDate: followUpDateFilter } : {},
                { $or: [{ source: source }, { source: { $exists: isSource } }] },
                { $or: [{ enquiryCategory: enquiryCategory }, { enquiryCategory: { $exists: isEnquiryCategory } }] },
                { $or: [{ priority: priority }, { priority: { $exists: isPriority } }] },
                {
                    $or: [{ department: new ObjectId(department) }, { department: { $exists: isDepartment } }]
                }
            ]
        }

        let accessFilter = {};
        const actingUserId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;

        access = await widenAccessForDepartmentHead(access, userId);
        let reportedToUserIds = await getReportedEmployeesWithDepartments(userId);

        switch (access) {
            case 'created':
                accessFilter = actingUserId ? { $or: [{ salesPerson: actingUserId }, { createdByUser: actingUserId }] } : {};
                break;
            case 'reported':
                accessFilter = actingUserId
                    ? { $or: [{ salesPerson: { $in: reportedToUserIds } }, { createdByUser: actingUserId }] }
                    : { salesPerson: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                if (actingUserId) reportedToUserIds.push(actingUserId);
                accessFilter = actingUserId
                    ? { $or: [{ salesPerson: { $in: reportedToUserIds } }, { createdByUser: actingUserId }] }
                    : { salesPerson: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const creatorFilter = createdBy ? { salesPerson: new ObjectId(createdBy) } : {};
        const baseFilters = { $and: [matchFilters, accessFilter] };
        const filters = { $and: [matchFilters, accessFilter, creatorFilter] }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const openFollowUpStatusFilter = { status: { $nin: ['Quoted', 'Lost', 'quoted', 'lost'] } };
        const overdueFollowUpFilter = overdueFollowUp
            ? { nextFollowUpDate: { $lt: todayStart }, ...openFollowUpStatusFilter }
            : {};
        const todayFollowUpFilter = todayFollowUp
            ? { nextFollowUpDate: { $gte: todayStart, $lte: todayEnd }, ...openFollowUpStatusFilter }
            : {};
        const upcomingFollowUpFilter = upcomingFollowUp
            ? { nextFollowUpDate: { $gt: todayEnd }, ...openFollowUpStatusFilter }
            : {};
        const listViewFilter = { $and: [overdueFollowUpFilter, todayFollowUpFilter, upcomingFollowUpFilter] };
        const listBaseFilters = { $and: [baseFilters, listViewFilter] };
        const listFilters = { $and: [filters, listViewFilter] };

        // 'Sended by Presale Engineer' rows are hidden here so paging and counts stay correct.
        // Quoted enquiries only appear under the Completed view.
        const hiddenStatuses = ['Quoted', 'quoted', 'Sended by Presale Engineer'];
        // Presales view: every enquiry currently with presales, including a rejection the manager hasn't resolved.
        const presalesMatch = {
            $or: [
                { status: { $in: ['in presales', 'Sent to Presales', 'revision', 'estimated', 'Work In Progress', 'Assigned To Presale Manager', 'Assigned To Presale Engineer', 'Assigned To Presales', 'Rejected by Presale Engineer'] } },
                { status: 'rejected', 'preSale.status': 'rejected' },
            ],
        };
        const listStatusFilter = completed
            ? { status: { $in: ['Quoted', 'quoted'] } }
            : lostView ? { status: { $in: ['Lost', 'lost'] } }
            : presalesView ? presalesMatch
            // Picking a status in the filter is explicit, so Quoted must be reachable from any tab.
            : { status: { $nin: status ? ['Sended by Presale Engineer'] : hiddenStatuses } };

        const enquiryTotal: { total: number }[] = await enquiryModel.aggregate([
            { $match: listFilters },
            { $match: listStatusFilter },
            { $group: { _id: null, total: { $sum: 1 } } },
            { $project: { total: 1, _id: 0 } }
        ]).exec()

        // Tab badges describe each view as a whole, so only access scope applies, not the grid's active filters.
        const viewCounts = await enquiryModel.aggregate([
            { $match: { $and: [{ isDeleted: { $ne: true } }, accessFilter] } },
            {
                $facet: {
                    completed: [
                        { $match: { status: { $in: ['Quoted', 'quoted'] } } },
                        { $count: 'total' }
                    ],
                    lost: [
                        { $match: { status: { $in: ['Lost', 'lost'] } } },
                        { $count: 'total' }
                    ],
                    all: [
                        { $match: { status: { $nin: hiddenStatuses } } },
                        { $count: 'total' }
                    ],
                    presales: [
                        { $match: presalesMatch },
                        { $count: 'total' }
                    ],
                    mine: [
                        { $match: { status: { $nin: hiddenStatuses } } },
                        { $match: actingUserId ? { $or: [{ salesPerson: actingUserId }, { createdByUser: actingUserId }] } : {} },
                        { $count: 'total' }
                    ],
                    overdue: [
                        { $match: { nextFollowUpDate: { $lt: todayStart }, status: { $nin: [...hiddenStatuses, 'Lost', 'lost'] } } },
                        { $count: 'total' }
                    ],
                    today: [
                        { $match: { nextFollowUpDate: { $gte: todayStart, $lte: todayEnd }, status: { $nin: [...hiddenStatuses, 'Lost', 'lost'] } } },
                        { $count: 'total' }
                    ],
                    upcoming: [
                        { $match: { nextFollowUpDate: { $gt: todayEnd }, status: { $nin: [...hiddenStatuses, 'Lost', 'lost'] } } },
                        { $count: 'total' }
                    ]
                }
            }
        ]).exec();

        const sortableFields: Record<string, string> = {
            date: 'date',
            nextFollowUpDate: 'nextFollowUpDate',
            enquiryId: 'enquiryId',
            description: 'title',
            source: 'source',
            priority: 'priority',
            enquiryCategory: 'enquiryCategory',
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
            { $match: listFilters },
            { $match: listStatusFilter },
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
                $lookup: { from: 'employees', localField: 'createdByUser', foreignField: '_id', as: 'createdByUser' }
            },
            { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } },
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
            },
            {
                $addFields: {
                    daysSinceCreated: {
                        $dateDiff: { startDate: '$date', endDate: '$$NOW', unit: 'day' }
                    },
                    daysSinceLastFollowUp: {
                        $cond: [
                            { $ifNull: ['$lastFollowUpDate', false] },
                            { $dateDiff: { startDate: '$lastFollowUpDate', endDate: '$$NOW', unit: 'day' } },
                            null
                        ]
                    }
                }
            }
        ]);

        return res.status(200).json({
            total: enquiryTotal[0]?.total ?? 0,
            enquiry: enquiryData,
            viewCounts: {
                all: viewCounts[0]?.all[0]?.total ?? 0,
                presales: viewCounts[0]?.presales[0]?.total ?? 0,
                mine: viewCounts[0]?.mine[0]?.total ?? 0,
                overdue: viewCounts[0]?.overdue[0]?.total ?? 0,
                today: viewCounts[0]?.today[0]?.total ?? 0,
                upcoming: viewCounts[0]?.upcoming[0]?.total ?? 0,
                completed: viewCounts[0]?.completed[0]?.total ?? 0,
                lost: viewCounts[0]?.lost[0]?.total ?? 0
            }
        })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

const PRESALE_TAB_STATUSES: Record<string, string[]> = {
    new: ['Sent to Presales'],
    assignedTab: ['Assigned To Presale Manager', 'Assigned To Presale Engineer', 'Assigned To Presales'],
    rejected: ['Rejected by Presale Engineer', 'Rejected by Presale Manager'],
    completedTab: ['Work In Progress'],
    cancelledTab: [],
    resolve: [],
};

/** Same tabs, keyed on the new preSale.status values used by new write paths going forward. */
const NEW_PRESALE_TAB_STATUSES: Record<string, string[]> = {
    new: ['new'],
    assignedTab: ['assigned', 'in review', 'in revision'],
    rejected: ['rejected'],
    completedTab: ['approved', 'completed'],
    cancelledTab: ['cancelled'],
    resolve: [],
};

/** Sent back to presales after a rejection: status 'revision' with preSale.status still 'returned'. */
const RESENT_MATCH = { status: 'revision', 'preSale.status': 'returned' };

/** Excludes jobs that were returned to sales and have not been resent. */
const NOT_WITH_SALES = { $nor: [{ 'preSale.status': 'returned', status: { $ne: 'revision' } }] };

/** A feedback request that hasn't been answered yet. */
const PENDING_FEEDBACK_MATCH = { 'preSale.feedback': { $elemMatch: { feedback: { $exists: false } } } };

/**
 * Query matching a presale tab across both legacy (Enquiry.status) and new (preSale.status) documents.
 * "Resolve" gathers everything waiting on someone's decision: rejected jobs and unanswered feedback requests.
 * Jobs with an open feedback request stay listed in Assigned too (status "in review").
 */
const presaleTabMatch = (tab: keyof typeof PRESALE_TAB_STATUSES) => {
    const byStatus = (key: keyof typeof PRESALE_TAB_STATUSES) => [
        { status: { $in: PRESALE_TAB_STATUSES[key] } },
        { 'preSale.status': { $in: NEW_PRESALE_TAB_STATUSES[key] } },
    ];
    if (tab === 'resolve') return { $or: [...byStatus('rejected'), PENDING_FEEDBACK_MATCH] };
    // Enquiry.status 'estimated' also lands here unless presale has already sent it on (approved) or closed it.
    if (tab === 'assignedTab') return {
        $or: [...byStatus(tab), { status: 'estimated', 'preSale.status': { $nin: ['approved', 'completed', 'cancelled', 'rejected', 'new'] } }],
    };
    // A resent job keeps preSale.status 'returned' but is back with presales, so it waits in New like a fresh one.
    if (tab === 'new') return { $or: [...byStatus(tab), RESENT_MATCH] };
    return { $or: byStatus(tab) };
};

/**
 * Presale view scope comes from the caller's role, not the query string: superAdmin and "All presale jobs" roles see every job.
 * Everyone else sees the jobs assigned to them plus those of their reportingTo team (and, for a department head, the department).
 */
const presaleViewScope = async (req: any): Promise<{ access: 'all' | 'assigned'; userId: string; scopeIds: any[] }> => {
    const employee = req.employee;
    const isSuperAdmin = /^superadmin$/i.test(String(employee?.category?.role ?? ''));
    const own = employee?.category?.privileges?.assignedJob?.viewReport;
    const extra = employee?.extraPrivileges?.assignedJob?.viewReport;
    const userId = String(employee?._id);
    const access = isSuperAdmin || own === 'all' || extra === 'all' ? 'all' : 'assigned';
    const team = access === 'assigned' ? await getReportedEmployeesWithDepartments(userId) : [];
    return { access, userId, scopeIds: [new ObjectId(userId), ...team] };
};

const canAssignPresale = (req: any): boolean => {
    const employee = req.employee;
    return /^superadmin$/i.test(String(employee?.category?.role ?? ''))
        || employee?.category?.privileges?.assignedJob?.assign === true
        || employee?.extraPrivileges?.assignedJob?.assign === true;
};

/** Jobs the user can see in a tab:their own, plus (Resolve only) ones where they've been asked for feedback. */
const presaleOwnScope = (ids: any[], tab: string) => ({
    $or: [
        { 'preSale.presalePerson': { $in: ids } },
        { reAssigned: { $in: ids } },
        ...(tab === 'resolve' ? [{ 'preSale.feedback.employeeId': { $in: ids } }] : []),
    ],
});

/** Per-tab totals for the presale page, honouring the same access scope as the list itself. */
export const presaleTabCounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { access, scopeIds } = await presaleViewScope(req);
        // Same base match as getPreSaleJobs so a tab's badge always equals its row total.
        const scope: any = {
            isDeleted: { $ne: true },
            ...NOT_WITH_SALES,
            status: { $nin: ['Quoted', 'quoted'] },
            $and: [{ $or: [{ 'preSale.presalePerson': { $exists: true, $ne: null } }, { reAssigned: { $exists: true, $ne: null } }, { status: { $in: ['Sent to Presales', 'in presales', 'revision'] } }] }],
        };
        const entries = await Promise.all(Object.keys(PRESALE_TAB_STATUSES).map(async (key) => {
            // The unassigned New pool is only for people who assign; everyone else is limited to their own jobs.
            const own = (key === 'new' ? !canAssignPresale(req) : access === 'assigned') ? [presaleOwnScope(scopeIds, key)] : [];
            const count = await enquiryModel.countDocuments({ ...scope, $and: [...scope.$and, ...own], ...presaleTabMatch(key as keyof typeof PRESALE_TAB_STATUSES) });
            return [key, count] as const;
        }));
        // Follow-up tabs span every open tab, scoped like the "all" list.
        const allOwn = access === 'assigned' ? [presaleOwnScope(scopeIds, 'all')] : [];
        const followUpEntries = await Promise.all((['overdue', 'today', 'upcoming'] as const).map(async (view) => {
            const count = await enquiryModel.countDocuments({
                ...scope,
                $and: [...scope.$and, ...allOwn],
                ...followUpViewFilter('preSale.followUp.nextFollowUpDate', view),
                'preSale.status': { $nin: PRESALE_FOLLOW_UP_CLOSED },
            });
            return [`fu${view[0].toUpperCase()}${view.slice(1)}`, count] as const;
        }));
        return res.status(200).json({ ...Object.fromEntries(entries), ...Object.fromEntries(followUpEntries) });
    } catch (error) {
        next(error);
    }
};

/** Presale report: counts per tab, per engineer and per department, plus the jobs that have waited longest. */
export const getPresaleReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { department, presale, fromDate, toDate } = req.body;
        const { access, scopeIds } = await presaleViewScope(req);
        const match: any = {
            isDeleted: { $ne: true },
            $and: [{ $or: [{ 'preSale.presalePerson': { $exists: true, $ne: null } }, { reAssigned: { $exists: true, $ne: null } }, { status: { $in: ['Sent to Presales', 'in presales', 'revision'] } }] }],
        };
        if (department) match.department = new ObjectId(department);
        const dateFilter: Record<string, Date> = {};
        if (fromDate) dateFilter.$gte = new Date(fromDate);
        if (toDate) { const end = new Date(toDate); end.setDate(end.getDate() + 1); dateFilter.$lt = end; }
        if (Object.keys(dateFilter).length) match.date = dateFilter;
        if (access === 'assigned') {
            match.$and.push({ $or: [{ 'preSale.presalePerson': { $in: scopeIds } }, { reAssigned: { $in: scopeIds } }] });
        } else if (presale) {
            match.$and.push({ $or: [{ 'preSale.presalePerson': new ObjectId(presale) }, { reAssigned: new ObjectId(presale) }] });
        }

        const rows: any[] = await enquiryModel.find(match)
            .select('enquiryId title status date client department salesPerson reAssigned reAssignedDate preSale.presalePerson preSale.createdDate preSale.rejectionHistory preSale.status')
            .populate('client', 'companyName').populate('department', 'departmentName')
            .populate('salesPerson', 'firstName lastName').populate('reAssigned', 'firstName lastName')
            .populate('preSale.presalePerson', 'firstName lastName').lean();

        const DAY = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const tabOf = (status: string, presaleStatus?: string): 'new' | 'assigned' | 'completed' | 'rejected' | null => {
            if (PRESALE_TAB_STATUSES.new.includes(status) || NEW_PRESALE_TAB_STATUSES.new.includes(presaleStatus)
                || (status === 'revision' && presaleStatus === 'returned')) return 'new';
            if (PRESALE_TAB_STATUSES.assignedTab.includes(status) || NEW_PRESALE_TAB_STATUSES.assignedTab.includes(presaleStatus)
                || (status === 'estimated' && !['approved', 'completed', 'cancelled', 'rejected', 'new'].includes(presaleStatus as string))) return 'assigned';
            if (PRESALE_TAB_STATUSES.completedTab.includes(status) || NEW_PRESALE_TAB_STATUSES.completedTab.includes(presaleStatus)) return 'completed';
            if (PRESALE_TAB_STATUSES.rejected.includes(status) || NEW_PRESALE_TAB_STATUSES.rejected.includes(presaleStatus)) return 'rejected';
            return null;
        };
        const blank = () => ({ count: 0, new: 0, assigned: 0, completed: 0, rejected: 0 });
        const kpi = blank();
        const byEngineer = new Map<string, any>();
        const byDepartment = new Map<string, any>();
        const attention: Record<'new' | 'assigned' | 'rejected', any[]> = { new: [], assigned: [], rejected: [] };
        const reasonMap = new Map<string, { reason: string; count: number }>();
        const trendMap = new Map<string, { month: string; received: number; completed: number }>();
        const monthKey = (d: any) => { const t = new Date(d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
        for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const k = monthKey(d); trendMap.set(k, { month: k, received: 0, completed: 0 }); }
        let waitTotal = 0;
        const bump = (map: Map<string, any>, id: string, name: string, tab: string) => {
            const r = map.get(id) || { id, name, ...blank() };
            r.count++; r[tab]++;
            map.set(id, r);
        };
        const fullName = (p: any) => (p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '');

        rows.forEach((e) => {
            const tab = tabOf(e.status, e.preSale?.status);
            if (!tab) return;
            kpi.count++; kpi[tab]++;
            const holder = e.reAssigned || e.preSale?.presalePerson;
            bump(byEngineer, holder?._id ? String(holder._id) : 'none', fullName(holder) || 'Unassigned', tab);
            bump(byDepartment, e.department?._id ? String(e.department._id) : 'none', e.department?.departmentName || '—', tab);
            const bucket = trendMap.get(monthKey(e.date));
            if (bucket) { bucket.received++; if (tab === 'completed') bucket.completed++; }
            (e.preSale?.rejectionHistory || []).forEach((h: any) => {
                const reason = String(h?.rejectionReason || '').trim() || 'No reason recorded';
                const r = reasonMap.get(reason) || { reason, count: 0 };
                r.count++; reasonMap.set(reason, r);
            });
            if (tab === 'new' || tab === 'assigned' || tab === 'rejected') {
                const since = new Date(e.reAssignedDate || e.preSale?.createdDate || e.date).getTime();
                attention[tab].push({
                    id: String(e._id), enquiryId: e.enquiryId, title: e.title, customer: e.client?.companyName || '',
                    salesPerson: fullName(e.salesPerson), presale: fullName(holder), status: e.status,
                    days: Math.max(0, Math.floor((now - since) / DAY)),
                });
                if (tab === 'new') waitTotal += Math.max(0, Math.floor((now - since) / DAY));
            }
        });

        const sortRows = (m: Map<string, any>) => [...m.values()].sort((a, b) => b.count - a.count);
        const oldest = (l: any[]) => l.sort((a, b) => b.days - a.days).slice(0, 50);
        return res.status(200).json({
            kpi: { ...kpi, completionRate: kpi.count ? (kpi.completed / kpi.count) * 100 : 0, rejectionRate: kpi.count ? (kpi.rejected / kpi.count) * 100 : 0 },
            breakdown: { presale: sortRows(byEngineer), department: sortRows(byDepartment) },
            avgWaitDays: attention.new.length ? waitTotal / attention.new.length : null,
            funnel: (['new', 'assigned', 'completed', 'rejected'] as const).map((key) => ({
                key, label: { new: 'New', assigned: 'Assigned', completed: 'Completed', rejected: 'Rejected' }[key], count: kpi[key], pct: kpi.count ? (kpi[key] / kpi.count) * 100 : 0,
            })),
            trend: [...trendMap.values()],
            rejectionReasons: [...reasonMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
            attention: { new: oldest(attention.new), assigned: oldest(attention.assigned), rejected: oldest(attention.rejected) },
            generatedAt: new Date(),
        });
    } catch (error) {
        next(error);
    }
};

/** A presale job in these states is no longer chased: its estimation is done, cancelled or back with sales. */
const PRESALE_FOLLOW_UP_CLOSED = ['approved', 'completed', 'cancelled', 'returned'];

/** Loads a presale job for a follow-up action, replying with the error itself when the user can't take one. */
const loadPresaleFollowUpJob = async (req: Request, res: Response): Promise<any | null> => {
    const { enquiryId } = req.params;
    if (!ObjectId.isValid(enquiryId)) { res.status(400).json({ success: false, message: 'Invalid enquiry id' }); return null; }
    const enquiry: any = await enquiryModel.findOne({ _id: enquiryId, isDeleted: { $ne: true } });
    if (!enquiry?.preSale) { res.status(404).json({ success: false, message: 'Presale job not found' }); return null; }

    const { access, scopeIds } = await presaleViewScope(req);
    if (access === 'assigned' && !canAssignPresale(req)) {
        const mine = new Set(scopeIds.map(String));
        const owns = mine.has(String(enquiry.preSale.presalePerson)) || (Array.isArray(enquiry.reAssigned) ? enquiry.reAssigned : [enquiry.reAssigned]).some((id: any) => id && mine.has(String(id)));
        if (!owns) { res.status(403).json({ success: false, message: 'This presale job is not assigned to you.' }); return null; }
    }
    if (PRESALE_FOLLOW_UP_CLOSED.includes(String(enquiry.preSale.status)) || FOLLOW_UP_CLOSED_STATUSES.includes(String(enquiry.status || '').toLowerCase())) {
        res.status(400).json({ success: false, message: 'This presale job is finished and cannot have follow-ups.' });
        return null;
    }
    return enquiry;
};

const savePresaleFollowUp = async (res: Response, enquiry: any, block: any) => {
    enquiry.set('preSale.followUp', block);
    enquiry.markModified('preSale.followUp');
    await enquiry.save({ validateModifiedOnly: true });
    return res.status(200).json({ success: true, followUp: block });
};

export const schedulePresaleFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = readScheduleBody(req, res);
        if (!body) return;
        const enquiry = await loadPresaleFollowUpJob(req, res);
        if (!enquiry) return;
        return await savePresaleFollowUp(res, enquiry, scheduleInBlock(enquiry.preSale.followUp, body.dueDate, body.note, await followUpActor(req)));
    } catch (error) {
        next(error);
    }
};

export const completePresaleFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = readCompleteBody(req, res);
        if (!body) return;
        const enquiry = await loadPresaleFollowUpJob(req, res);
        if (!enquiry) return;
        return await savePresaleFollowUp(res, enquiry, completeInBlock(enquiry.preSale.followUp, body, await followUpActor(req)));
    } catch (error) {
        next(error);
    }
};

export const cancelPresaleFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enquiry = await loadPresaleFollowUpJob(req, res);
        if (!enquiry) return;
        const block = cancelInBlock(enquiry.preSale.followUp, String(req.body.reason ?? '').trim());
        if (!block) return res.status(400).json({ success: false, message: 'No follow-up is scheduled.' });
        return await savePresaleFollowUp(res, enquiry, block);
    } catch (error) {
        next(error);
    }
};

export const getPreSaleJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let page = Number(req.query.page)
        let row = Number(req.query.row)
        let skipNum: number = (page - 1) * row;
        let { filter, search, sortKey, sortDir, followUp } = req.query;
        const { access, scopeIds } = await presaleViewScope(req);
        // Overdue / Today / Upcoming / None: only jobs that are still being chased.
        const followUpMatch = followUp ? { ...followUpViewFilter('preSale.followUp.nextFollowUpDate', followUp), 'preSale.status': { $nin: PRESALE_FOLLOW_UP_CLOSED } } : null;
        // Returned jobs are back with sales; they no longer belong on the presale worklist.
        let accessFilter: any = { ...NOT_WITH_SALES };
        // The New tab is the unassigned pool and belongs to the people who assign it; everyone else only sees their own jobs.
        if (filter === 'new' ? !canAssignPresale(req) : access === 'assigned') {
            accessFilter['$or'] = presaleOwnScope(scopeIds, filter as string).$or;
        }

        let statusFilterMatch: any = null;
        if (filter == 'completed') {
            statusFilterMatch = { $or: [{ status: 'Work In Progress' }, { 'preSale.status': { $in: ['approved', 'completed'] } }] };
        } else if (filter == 'reassigned') {
            statusFilterMatch = { $or: [{ status: 'Assigned To Presale Engineer' }, { 'preSale.status': 'assigned' }] };
        } else if (filter == 'assigned') {
            statusFilterMatch = {
                $and: [
                    { status: { $nin: ['Work In Progress', 'Rejected by Presale Manager'] } },
                    { 'preSale.status': { $nin: ['approved', 'completed', 'rejected', 'cancelled'] } },
                ],
            };
        } else if (filter == 'new' || filter == 'assignedTab' || filter == 'rejected' || filter == 'resolve' || filter == 'completedTab' || filter == 'cancelledTab') {
            statusFilterMatch = presaleTabMatch(filter as keyof typeof PRESALE_TAB_STATUSES);
        }

        // Quoted enquiries are normally excluded from the presale worklist (they've moved past presale),
        // but the completed tab still needs to show ones that went through presale estimation before being quoted.
        const hasEstimation = { 'preSale.estimations.optionalItems': { $exists: true, $not: { $size: 0 } } };
        const quotedExclusionMatch = filter === 'completed'
            ? { $or: [{ status: { $nin: ['Quoted', 'quoted'] } }, hasEstimation] }
            : { status: { $nin: ['Quoted', 'quoted'] } };

        // Joined fields (customer/department/assigned-by names) need their lookups run before the
        // search $match can see them, so a text search covers more than just enquiryId/title.
        const needsJoinedSearch = typeof search === 'string' && search.trim().length > 0;
        let searchFilter: any = {};
        let joinedSearchFilter: any = {};
        if (typeof search === 'string' && search.trim()) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
            searchFilter['$or'] = [
                { enquiryId: regex },
                { title: regex },
            ];
            joinedSearchFilter['$or'] = [
                { enquiryId: regex },
                { title: regex },
                { 'client.companyName': regex },
                { 'department.departmentName': regex },
                { 'salesPerson.firstName': regex },
                { 'salesPerson.lastName': regex },
            ];
        }

        const joinedLookups = [
            { $lookup: { from: 'customers', localField: 'client', foreignField: '_id', as: 'client' } },
            { $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' } },
            { $lookup: { from: 'employees', localField: 'salesPerson', foreignField: '_id', as: 'salesPerson' } },
        ];

        const sortFields: Record<string, string> = {
            enqId: 'enquiryId', customerName: 'client.companyName', description: 'title',
            assignedBy: 'salesPerson.firstName', department: 'department.departmentName', status: 'status',
            nextFollowUp: 'preSale.followUp.nextFollowUpDate',
        };
        const sortField = typeof sortKey === 'string' ? sortFields[sortKey] : undefined;
        const sortOrder: 1 | -1 = sortDir === 'desc' ? -1 : 1;
        const sortNeedsLookups = !!sortField && sortField.includes('.');
        const lookupsBeforeSort = needsJoinedSearch || sortNeedsLookups;
        const sortStage: PipelineStage = sortField ? { $sort: { [sortField]: sortOrder, _id: sortOrder } } : { $sort: { 'preSale.createdDate': -1 } };

        const totalPresale: { total: number }[] = await enquiryModel.aggregate([
            {
                $match: quotedExclusionMatch
            },
            {
                $match: {
                    ...accessFilter,
                    ...(needsJoinedSearch ? {} : searchFilter),
                    isDeleted: { $ne: true }
                }
            },
            {
                $match: { $or: [{ "preSale.presalePerson": { $exists: true, $ne: null } }, { reAssigned: { $exists: true, $ne: null } }, { status: { $in: ['Sent to Presales', 'in presales', 'revision'] } }] }
            },
            ...(statusFilterMatch ? [{ $match: statusFilterMatch }] : []),
            ...(followUpMatch ? [{ $match: followUpMatch }] : []),
            ...(needsJoinedSearch ? [...joinedLookups, { $match: joinedSearchFilter }] : []),
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            { $project: { _id: 0, total: 1 } }
        ])

        const preSaleData = await enquiryModel.aggregate([
            {
                $match: {
                    ...accessFilter,
                    ...(needsJoinedSearch ? {} : searchFilter),
                    isDeleted: { $ne: true }
                }
            },
            {
                $match: quotedExclusionMatch
            },
            {
                $match: { $or: [{ "preSale.presalePerson": { $exists: true, $ne: null } }, { reAssigned: { $exists: true, $ne: null } }, { status: { $in: ['Sent to Presales', 'in presales', 'revision'] } }] }
            },
            ...(statusFilterMatch ? [{ $match: statusFilterMatch }] : []),
            ...(followUpMatch ? [{ $match: followUpMatch }] : []),
            ...(needsJoinedSearch ? [...joinedLookups, { $match: joinedSearchFilter }] : (sortNeedsLookups ? joinedLookups : [])),
            sortStage,
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            ...(lookupsBeforeSort ? [] : joinedLookups),
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

const PRESALE_ACTIVE_STATUSES = [
    'Sent to Presales', 'in presales', 'revision', 'Assigned To Presales',
    'Assigned To Presale Manager', 'Assigned To Presale Engineer', 'Rejected by Presale Engineer',
];

// Stops a presale step from running on a lost/cancelled enquiry or on a job that isn't in a state where the step makes sense.
// An empty `allowedPresaleStatuses` only checks that the enquiry still exists and is open.
const presaleStepBlock = async (enquiryId: any, allowedPresaleStatuses: string[] = []): Promise<{ code: number; message: string } | null> => {
    const current: any = await enquiryModel.findById(enquiryId).select('status preSale.status preSale.presalePerson').lean();
    if (!current) return { code: 404, message: 'Enquiry not found' };
    if (String(current.status || '').toLowerCase() === 'lost' || current.preSale?.status === 'cancelled') {
        return { code: 409, message: 'This enquiry is lost or its presale job is cancelled.' };
    }
    // Legacy jobs created before preSale.status existed have the field missing entirely, not set to
    // some real value — that's a data-shape gap, not the job genuinely being unstarted. Treat it as
    // "assigned" for the purposes of this check (the job clearly exists and has a presale person) so
    // these old rows aren't blocked from every action with a confusing "not started" message.
    const effectiveStatus = current.preSale?.status ?? (current.preSale?.presalePerson ? 'assigned' : undefined);
    if (allowedPresaleStatuses.length && !allowedPresaleStatuses.includes(effectiveStatus)) {
        const label = current.preSale?.status
            ? `"${current.preSale.status}"`
            : 'missing its presale status (likely an older job created before this field existed)';
        return { code: 409, message: `This step is not available while the presale job is ${label}.` };
    }
    return null;
};

// While a job waits for its first assignee, only the stage the presale workflow has reached may assign it
// (the job climbs the ladder as each step's window runs out). Super Admins can always act.
const assignmentStageBlock = async (assignApproval: any, employee: any): Promise<{ code: number; message: string } | null> => {
    if (!assignApproval) return null;
    if (/^superadmin$/i.test(employee?.category?.role || '')) return null;
    const resolved = await resolveCurrentAssignmentStep(assignApproval);
    const roleId = employee?.category?._id || employee?.category;
    if (!roleId || !stageRoleIds(resolved).includes(String(roleId))) {
        return { code: 403, message: 'Assignment responsibility for this job has moved to another role in the presale workflow. You can no longer assign it.' };
    }
    return null;
};

const hasAssignFlag = (employee: any): boolean => {
    const expiresAt = employee?.extraPrivilegesExpiresAt;
    const extraExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
    return employee?.category?.privileges?.assignedJob?.assign === true
        || (!extraExpired && employee?.extraPrivileges?.assignedJob?.assign === true);
};

// Working a presale job (estimate, ask for feedback, delete the estimation) is for whoever currently holds it.
// Assigners (managers) and the super admin can step in as well.
const holderBlock = async (req: any, enquiryId: any): Promise<{ code: number; message: string } | null> => {
    const employee = req.employee || await getEmployeeData(req.user);
    if (/^superadmin$/i.test(String((employee?.category as any)?.role ?? '')) || hasAssignFlag(employee)) return null;
    const current: any = await enquiryModel.findById(enquiryId).select('reAssigned preSale.presalePerson').lean();
    const holderId = String(current?.reAssigned || current?.preSale?.presalePerson || '');
    if (!holderId || holderId !== String(employee?._id)) {
        return { code: 403, message: 'Only the person holding this presale job can do this.' };
    }
    return null;
};

export const updateEnquiryStatus =async (req: Request, res: Response, next: NextFunction) => {
    try {
        let data = req.body
        // Only these moves are allowed here; anything else (e.g. "quoted" without a quotation) goes through its own step.
        const ALLOWED_STATUS: Record<string, string> = { 'work in progress': 'Work In Progress', 'quoted': 'Quoted', 'lost': 'Lost', 'estimated': 'estimated', 'reopen': 'New' };
        const requestedStatus = ALLOWED_STATUS[String(data.status || '').trim().toLowerCase()];
        if (!requestedStatus) {
            return res.status(400).json({ message: 'This status cannot be set from here' });
        }
        const isReopen = String(data.status || '').trim().toLowerCase() === 'reopen';
        data.status = requestedStatus;
        const statusBeforeDoc: any = await enquiryModel.findById(data.id).select('status preSale.status').lean();
        const statusBefore = statusBeforeDoc?.status;
        if (isReopen) {
            if (String(statusBefore || '').toLowerCase() !== 'lost') {
                return res.status(400).json({ message: 'Only a lost enquiry can be reopened' });
            }
            const wasPresaleCancelled = statusBeforeDoc?.preSale?.status === 'cancelled';
            const reopenFields: any = {
                status: 'New',
                lostReason: '',
                competitorName: '',
                competitorPriceGap: null,
            };
            // The job was cancelled only because the enquiry was marked lost — hand it back to whoever
            // held it so they can pick the work back up, rather than guessing at its exact prior step.
            if (wasPresaleCancelled) {
                reopenFields['preSale.status'] = 'assigned';
                reopenFields['preSale.cancelReason'] = '';
                reopenFields['preSale.cancelledAt'] = null;
            }
            const reopened = await enquiryModel.findOneAndUpdate({ _id: data.id }, { $set: reopenFields }, { new: true })
                .populate(['client', 'department', 'salesPerson']);
            if (reopened) {
                await logEnquiryAudit(req, reopened._id, 'status-changed', 'Enquiry reopened',
                    [{ label: 'Status', from: 'Lost', to: 'New' }]);
            }
            return res.status(200).json({ update: reopened });
        }
        let quote = await quotationModel.findOne({ enqId: data.id })
        let status = data.status
        if (quote && data.status === 'Quoted') {
            let updateQuote = await quotationModel.updateOne({ enqId: data.id }, { $set: { 'status': 'Work In Progress' } })
            status = 'Quoted';
        }
        const isWorkInProgress = status === 'Work In Progress';
        if (isWorkInProgress) {
            const existingEnquiry = await enquiryModel.findById(data.id);
            const hasPendingFeedback = existingEnquiry?.preSale?.feedback?.some((fb: any) => !fb.feedback);
            if (hasPendingFeedback) {
                return res.status(400).json({ message: 'A feedback request is still awaiting a response. Please wait for it before sending this job back to enquiry.' });
            }
        }
        // Legacy clients may still send the old Title Case values; normalize them onto the new split status model.
        const LEGACY_STATUS_MAP: Record<string, { status: string; presaleStatus?: string }> = {
            'Work In Progress': { status: 'estimated', presaleStatus: 'approved' },
            'Quoted': { status: 'quoted' },
            'Lost': { status: 'lost' },
        };
        const mapped = LEGACY_STATUS_MAP[status];
        const updateFields: any = {
            status: mapped ? mapped.status : status,
            'preSale.seenbySalesPerson': false,
            'preSale.newFeedbackAccess': true
        };
        if (mapped?.presaleStatus) {
            updateFields['preSale.status'] = mapped.presaleStatus;
        }
        // Losing an enquiry that presale is still working on cancels the presale job (kept separate from a rejection).
        const presaleCancelled = status === 'Lost' && PRESALE_ACTIVE_STATUSES.includes(statusBefore);
        if (status === 'Lost') {
            updateFields.lostReason = data.lostReason || data.reason || '';
            if (presaleCancelled) {
                if (!String(updateFields.lostReason).trim()) {
                    return res.status(400).json({ message: 'A reason is required to mark an enquiry lost while presale is working on it.' });
                }
                updateFields['preSale.status'] = 'cancelled';
                updateFields['preSale.cancelReason'] = updateFields.lostReason;
                updateFields['preSale.cancelledAt'] = new Date();
            }
            if (data.competitorName !== undefined) updateFields.competitorName = data.competitorName;
            if (data.competitorPriceGap !== undefined) updateFields.competitorPriceGap = data.competitorPriceGap;
        }
        const update = await enquiryModel.findOneAndUpdate({ _id: data.id }, { $set: updateFields }, { new: true })
            .populate(['client', 'department', 'salesPerson'])
        if (update && status === 'Lost') {
            await cancelOpenFollowUp(update._id, 'Enquiry lost');
            update.nextFollowUpDate = undefined;
        }
        if (update) {
            const lostChanges = status === 'Lost'
                ? [
                    { label: 'Lost reason', to: updateFields.lostReason || '—' },
                    ...(updateFields.competitorName ? [{ label: 'Competitor', to: updateFields.competitorName }] : []),
                    ...(updateFields.competitorPriceGap ? [{ label: 'Price gap', to: String(updateFields.competitorPriceGap) }] : []),
                ]
                : [];
            await logEnquiryAudit(req, update._id, 'status-changed', `Status changed to ${updateFields.status}`,
                [{ label: 'Status', from: statusBefore, to: updateFields.status }, ...lostChanges]);
            if (presaleCancelled) {
                await logEnquiryAudit(req, update._id, 'presale-cancelled', 'Presale cancelled — enquiry lost',
                    [{ label: 'Reason', to: updateFields.lostReason }]);
                const userData = await getEmployeeData(req.user);
                // Only the person holding the presale job has to stop work, not everyone who can see presale jobs
                const holder = String(update.reAssigned || update.preSale?.presalePerson || '');
                if (holder) {
                    await notifyByPrivilege(
                        {
                            type: 'AssignedJob',
                            referenceModel: 'Enquiry',
                            title: 'Presale job cancelled',
                            message: `Enquiry ${update.enquiryId} was marked lost, so its presale job is cancelled. Reason: ${updateFields.lostReason}`,
                            sentBy: userData?._id?.toString() || update.salesPerson._id.toString(),
                            referenceId: update._id,
                            additionalData: { enquiryId: update._id.toString() }
                        },
                        { privilegeKey: 'assignedJob', checkFunction: (_privileges, employeeId) => employeeId === holder }
                    );
                }
            }
        }
        if (update && !quote && isWorkInProgress) {
            const userData = await getEmployeeData(req.user);
            // The enquiry owner is waiting on this estimation; the presale user who sent it gets nothing
            const owner = String(update.salesPerson?._id ?? update.salesPerson ?? '');
            await notifyByPrivilege(
                {
                    type: 'EnquiryEstimationReady',
                    referenceModel: 'Enquiry',
                    title: 'Estimation ready for review',
                    message: `The presale estimation for enquiry ${update.enquiryId} is ready for you to review`,
                    sentBy: userData?._id?.toString() || update.salesPerson._id.toString(),
                    referenceId: update._id,
                    additionalData: { enquiryId: update._id.toString() }
                },
                { privilegeKey: 'enquiry', checkFunction: (_privileges, employeeId) => employeeId === owner }
            );
            return res.status(200).json({ update })
        } else if (update) {
            return res.status(200).json({ update, quoteId: quote?.quoteId })
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
        access = await widenAccessForDepartmentHead(access, userId);
        let reportedToUserIds = await getReportedEmployeesWithDepartments(userId);

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
        const { enquiryId, comment } = req.body;
        const blocked = await presaleStepBlock(enquiryId, ['assigned', 'in revision', 'in review'])
            || await holderBlock(req, enquiryId);
        if (blocked) return res.status(blocked.code).json({ message: blocked.message });

        // The request always goes back to whoever assigned the job, so the caller doesn't pick a recipient.
        const current: any = await enquiryModel.findById(enquiryId).select('assignmentHistory preSale.presalePerson reAssigned');
        if (!current) return res.status(404).json({ message: 'Enquiry not found' });
        const holderId = String(current.reAssigned || current.preSale?.presalePerson || '');
        const lastAssignment = [...(current.assignmentHistory || [])].reverse()
            .find((h: any) => h.assignedBy && String(h.assignedBy) !== holderId);
        if (!lastAssignment) {
            return res.status(400).json({ message: 'No assigner found for this job, so there is nobody to ask for feedback.' });
        }
        const employeeId = String(lastAssignment.assignedBy);

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
                $set: { 'preSale.newFeedbackAccess': false, 'preSale.status': 'in review' }
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
            await logEnquiryAudit(req, result._id, 'feedback-requested', 'Feedback requested from presale', comment ? [{ label: 'Comment', to: String(comment) }] : undefined);
            const userData = await getEmployeeData(req.user);
            await notifyByPrivilege(
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
                }
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
        let { enquiryId, feedbackId, feedback, action } = req.body;
        const blocked = await presaleStepBlock(enquiryId, ['in review']);
        if (blocked) return res.status(blocked.code).json({ message: blocked.message });
        // Only the person who was asked for feedback can answer it (super admin excepted).
        const caller = req.employee || await getEmployeeData(req.user);
        if (!/^superadmin$/i.test(String((caller?.category as any)?.role ?? ''))) {
            const asked: any = await enquiryModel.findOne({ _id: enquiryId, 'preSale.feedback._id': feedbackId })
                .select('preSale.feedback').lean();
            const entry = asked?.preSale?.feedback?.find((f: any) => String(f._id) === String(feedbackId));
            if (!entry || String(entry.employeeId) !== String(caller?._id)) {
                return res.status(403).json({ message: 'This feedback request was not sent to you.' });
            }
        }

        const setFields: any = {
            "preSale.feedback.$.feedback": feedback,
            "preSale.feedback.$.seenByFeedbackRequester": false,
            'preSale.newFeedbackAccess': true,
        };

        if (action === 'revise') {
            // Back to the presale engineer: stays in the Assigned tab as "in revision".
            setFields['preSale.status'] = 'in revision';
            setFields['preSale.seenbyEmployee'] = false;
            setFields['preSale.createdDate'] = Date.now();
        } else {
            // Sent to sales: the presale job is done and moves to Completed.
            setFields['status'] = 'estimated';
            setFields['preSale.status'] = 'completed';
            setFields['preSale.seenbySalesPerson'] = false;
        }

        const update: any = { $set: setFields };
        if (action === 'revise') {
            update.$push = { 'preSale.revisionComment': feedback };
        }

        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId, "preSale.feedback._id": feedbackId },
            update,
            { new: true }
        );

        if (result) {
            await logEnquiryAudit(req, result._id, 'feedback-given',
                action === 'revise' ? 'Feedback given: sent back for revision' : 'Feedback given: estimation approved',
                feedback ? [{ label: 'Feedback', to: String(feedback) }] : undefined);
            // After a reassign the person doing the work is `reAssigned`, not the original presale person
            const presalePerson = String(result.reAssigned || result.preSale?.presalePerson || '');
            const userData = await getEmployeeData(req.user);
            await notifyByPrivilege(
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
                }
            );
            if (action !== 'revise') {
                // Approved estimation goes to the enquiry owner, who now has to review it
                const owner = String(result.salesPerson ?? '');
                await notifyByPrivilege(
                    {
                        type: 'EnquiryEstimationReady',
                        referenceModel: 'Enquiry',
                        title: 'Estimation ready for review',
                        message: `The presale estimation for enquiry ${result.enquiryId} is ready for you to review`,
                        sentBy: userData?._id?.toString() || presalePerson,
                        referenceId: result._id,
                        additionalData: { enquiryId: result._id.toString() }
                    },
                    { privilegeKey: 'enquiry', checkFunction: (_privileges, employeeId) => employeeId === owner }
                );
            }
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
        const blocked = await presaleStepBlock(enquiryId, ['in review', 'completed', 'approved']);
        if (blocked) return res.status(blocked.code).json({ message: blocked.message });
        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $push: { 'preSale.revisionComment': revisionComment },
                status: 'revision',
                'preSale.status': 'in revision',
                'preSale.seenbyEmployee': false,
                'preSale.newFeedbackAccess': true,
                'preSale.createdDate': Date.now()
            },
            { new: true }
        );
        if (!result) {
            return res.status(404).send('Enquiry not found or comment not added.');
        }

        await logEnquiryAudit(req, enquiryId, 'revision-requested', 'Estimation sent back for revision',
            revisionComment ? [{ label: 'Comment', to: String(revisionComment) }] : undefined);

        // After a reassign the person doing the work is `reAssigned`, not the original presale person
        const presalePerson = String(result.reAssigned || result.preSale?.presalePerson || '');
        const userData = await getEmployeeData(req.user);
        await notifyByPrivilege(
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
            }
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
        let { revisionComment } = req.body;
        let enquiryId = req.params.enquiryId;
        const blocked = await presaleStepBlock(enquiryId, ['in review', 'completed', 'approved']);
        if (blocked) return res.status(blocked.code).json({ message: blocked.message });
        const quote = await quotationModel.findOne({ enqId: enquiryId });
        const result = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $push: { 'preSale.revisionComment': revisionComment },
                status: 'revision',
                'preSale.status': 'in revision',
                'preSale.seenbyEmployee': false,
                'preSale.newFeedbackAccess': true,
                'preSale.createdDate': Date.now()
            },
            { new: true }
        );
        if (!result) {
            return res.status(404).send('Enquiry not found or comment not added.');
        }

        if (quote) {
            await quotationModel.updateOne({ _id: quote._id }, { $set: { status: "revised" } })
        }
        await logEnquiryAudit(req, enquiryId, 'revision-requested', 'Quotation estimation sent back for revision',
            revisionComment ? [{ label: 'Comment', to: String(revisionComment) }] : undefined);

        // After a reassign the person doing the work is `reAssigned`, not the original presale person
        const presalePerson = String(result.reAssigned || result.preSale?.presalePerson || '');
        const userData = await getEmployeeData(req.user);
        await notifyByPrivilege(
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
            }
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
        const blocked = await presaleStepBlock(enquiryId, ['assigned', 'in revision', 'in review'])
            || await holderBlock(req, enquiryId);
        if (blocked) return res.status(blocked.code).json({ message: blocked.message });
        if (optionalItems !== undefined && !Array.isArray(optionalItems)) {
            return res.status(400).json({ message: 'optionalItems must be a list' });
        }

        const quote =await quotationModel.findOne({ enqId: enquiryId })
        if (quote) {
            let quoteData = await quotationModel.updateOne(
                { _id: quote._id },
                {
                    $set: {
                        'optionalItems': optionalItems,
                        'currency': currency,
                        'totalDiscount': totalDiscount,
                        'status': quote.status === 'revised' ? quoteStatus.WorkInProgress : quote.status,
                    }
                }
            );
        }

        // Versioning: the first submission is v1. Edits while assigned or in review stay in the same version;
        // re-submitting after a revision request archives the previous version and becomes the next one.
        const current = await enquiryModel.findById(enquiryId, { 'preSale.estimations': 1, 'preSale.estimationHistory': 1, 'preSale.status': 1, 'preSale.revisionComment': 1 }).lean();
        const existing: any = current?.preSale?.estimations;
        const historyCount = (current?.preSale?.estimationHistory || []).length;
        const hasExisting = !!existing?.optionalItems?.length || !!existing?.currency;
        const isNewVersion = hasExisting && current?.preSale?.status === 'in revision';
        const version = hasExisting
            ? (isNewVersion ? (existing.version || historyCount + 1) + 1 : (existing.version || historyCount + 1))
            : historyCount + 1;

        const update: any = {
            $set: {
                'preSale.estimations.optionalItems': optionalItems,
                'preSale.estimations.currency': currency,
                'preSale.estimations.presaleNote': preSaleNote,
                'preSale.estimations.version': version,
                // The enquiry itself stays "in presales"; only the presale job moves to review.
                'preSale.status': 'in review',
            },
            $unset: {
                'preSale.revisionComment': ''
            }
        };
        if (isNewVersion) {
            const submitter = await getEmployeeData(req.user);
            update.$push = {
                'preSale.estimationHistory': {
                    version: existing.version || historyCount + 1,
                    optionalItems: existing.optionalItems,
                    currency: existing.currency,
                    totalDiscount: existing.totalDiscount,
                    presaleNote: existing.presaleNote,
                    archivedAt: new Date(),
                    archivedBy: submitter?._id,
                    reason: (current?.preSale?.revisionComment || []).join(' | ') || 'Revised'
                }
            };
        }

        let enquiryData = await enquiryModel.updateOne({ _id: new ObjectId(enquiryId) }, update);

        if (!enquiryData.modifiedCount) {
            return res.status(502).json();
        }
        await logEnquiryAudit(req, enquiryId, 'estimation-uploaded', isNewVersion ? `Estimation revised (v${version})` : `Estimation uploaded (v${version})`);

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
            const nameParts = `${employee.firstName || ''} ${employee.lastName || ''}`.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).filter(Boolean);
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
        const { access, scopeIds } = await presaleViewScope(req);

        let accessFilter: any = { $or: [{ status: { $in: ['Assigned To Presale Manager', 'Assigned To Presale Engineer'] } }, { 'preSale.status': { $in: ['assigned', 'in review'] } }] };

        switch (access) {
            case 'assigned':
                accessFilter = { "preSale.presalePerson": { $in: scopeIds } };
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

        delete accessFilter.status;
        accessFilter.$or = [{ status: 'Work In Progress' }, { 'preSale.status': { $in: ['approved', 'completed'] } }];

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
        const { enqId, role } = req.body;
        const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
        // The estimation is kept unless the caller explicitly asks to clear it.
        const clearEstimation = req.body.clearEstimation === true;
        if (!ObjectId.isValid(enqId)) return res.status(400).json({ success: false, message: 'Invalid enquiry id' });
        if (!comment) return res.status(400).json({ success: false, message: 'A reason is required to reject a job' });

        const enquiry = await enquiryModel.findOne({ _id: new ObjectId(enqId), isDeleted: { $ne: true } });

        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        const blocked = await presaleStepBlock(enqId, ['assigned', 'in revision', 'in review', 'rejected'])
            || await holderBlock(req, enqId);
        if (blocked) return res.status(blocked.code).json({ success: false, message: blocked.message });
        if (!enquiry.preSale?.presalePerson && !(enquiry as any).reAssigned) {
            return res.status(409).json({ success: false, message: 'This job has no assignee to reject.' });
        }

        const hadEstimation = !!enquiry.preSale.estimations;
        const rejecter = await getEmployeeData((req as any).user);

        // Add a new rejection event to the history
        if (!Array.isArray(enquiry.preSale.rejectionHistory)) enquiry.preSale.rejectionHistory = [] as any;
        enquiry.preSale.rejectionHistory.push({
            rejectionReason: comment,
            rejectedBy: rejecter?._id || (enquiry as any).reAssigned || enquiry.preSale.presalePerson,
            rejectedRole: role
        });

        // Nothing else on the presale is cleared; only an explicit clearEstimation removes the estimation.
        enquiry.preSale.seenbyEmployee = false;
        // A kept estimation is shown to the salesperson, so it counts as unseen.
        enquiry.preSale.seenbySalesPerson = !(hadEstimation && !clearEstimation);

        // Clearing never deletes: the estimation moves to the history and the next submission starts a new version.
        if (clearEstimation && hadEstimation) {
            const est: any = (enquiry.preSale as any).estimations;
            if (!Array.isArray((enquiry.preSale as any).estimationHistory)) (enquiry.preSale as any).estimationHistory = [];
            (enquiry.preSale as any).estimationHistory.push({
                version: est.version || (enquiry.preSale as any).estimationHistory.length + 1,
                optionalItems: est.optionalItems, currency: est.currency,
                totalDiscount: est.totalDiscount, presaleNote: est.presaleNote,
                archivedAt: new Date(), archivedBy: rejecter?._id, reason: `Rejected: ${comment}`
            });
            delete enquiry.preSale.estimations;
        }
        enquiry.preSale.newFeedbackAccess = true;

        // An engineer's rejection waits for the manager to review it; a manager's rejection is final, so it goes straight back to sales for resend.
        enquiry.status = 'rejected';
        enquiry.preSale.status = role === 'Engineer' ? 'rejected' : 'returned';

        const result = await enquiry.save();
        if (!result) {
            return res.status(404).json({ message: 'Something went wrong' });
        }

        await logEnquiryAudit(req, result._id, 'presale-rejected', `Presale job rejected${role ? ` by ${role}` : ''}`,
            [{ label: 'Status', to: 'rejected' }, { label: 'Reason', to: comment },
                ...(hadEstimation ? [{ label: 'Estimation', to: clearEstimation ? 'Cleared' : 'Kept' }] : [])]);

        const presalePerson = String(result.preSale.presalePerson || '');
        const userData = rejecter;

        // With a presale workflow, an engineer's rejection puts the job back in front of the assigners:
        // the assignee is cleared and the escalation chain restarts, so someone must reassign it in time.
        const assignApproval = role === 'Engineer' ? await buildAssignmentChain() : null;
        if (assignApproval) {
            await enquiryModel.updateOne(
                { _id: result._id },
                {
                    $set: { status: 'in presales', 'preSale.status': 'new', 'preSale.assignApproval': assignApproval },
                    $unset: { reAssigned: '', reAssignedDate: '', 'preSale.presalePerson': '' }
                }
            );
            await logEnquiryAudit(req, result._id, 'presale-returned-to-assigner', 'Rejected by assignee; back to presale for reassignment');
            await notifyByPrivilege(
                {
                    type: 'AssignedJob',
                    referenceModel: 'Enquiry',
                    title: 'Presale Job Rejected by Engineer',
                    message: `Enquiry ${result.enquiryId} was rejected by the assigned engineer and needs to be reassigned`,
                    sentBy: userData?._id?.toString() || presalePerson,
                    referenceId: result._id,
                    additionalData: { enquiryId: result._id.toString() }
                },
                {
                    privilegeKey: 'assignedJob',
                    checkFunction: (privileges) => privileges.assignedJob?.assign === true
                }
            );
            return res.status(200).json({ success: true });
        }

        // An engineer's own rejection waits for the manager's review and notifies no one: the rejecting engineer
        // has the on-screen confirmation. A manager's rejection is final, so the enquiry owner has to act on it.
        if (role !== 'Engineer') {
            const owner = String(result.salesPerson ?? '');
            await notifyByPrivilege(
                {
                    type: 'Enquiry',
                    referenceModel: 'Enquiry',
                    title: 'Presale Job Rejected by Manager',
                    message: `Presale job has been rejected by manager for enquiry ${result.enquiryId}`,
                    sentBy: userData?._id?.toString() || presalePerson,
                    referenceId: result._id,
                    additionalData: { enquiryId: result._id.toString() }
                },
                { privilegeKey: 'enquiry', checkFunction: (_privileges, employeeId) => employeeId === owner }
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
        const { dataId } = req.body
        // The deleter is the logged-in employee, not whatever id the client sent.
        const employeeId = String((req as any).employee?._id || '');

        // Check if enquiry exists and isn't already deleted
        const enquiry = await enquiryModel.findOne({
            _id: dataId,
            isDeleted: { $ne: true },
        });

        if (!enquiry) {
            return res.status(404).json({
                message: 'Enquiry not found or already deleted'
            });
        }
        // Only a lost enquiry can be deleted, and only by an admin or superAdmin.
        const role = (req as any).employee?.category?.role;
        if (role !== 'admin' && !/^superadmin$/i.test(String(role ?? ''))) {
            return res.status(403).json({ message: 'Only an admin can delete an enquiry' });
        }
        if (String(enquiry.status || '').toLowerCase() !== 'lost') {
            return res.status(400).json({ message: 'Only a lost enquiry can be deleted' });
        }
        await newTrash('Enquiry', dataId, employeeId)
        // Soft delete the enquiry
        await enquiryModel.findByIdAndUpdate(dataId, {
            isDeleted: true
        });
        await logEnquiryAudit(req, dataId, 'deleted', 'Enquiry deleted');

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
        const { enquiryId, employeeId, comment } = req.body
        if (!employeeId) {
            return res.status(404).json({ message: 'Something went wrong' });
        }
        const blocked = await presaleStepBlock(enquiryId);
        if (blocked) return res.status(blocked.code).json({ message: blocked.message });
        const reAssigner = await getEmployeeData(req.user);
        // Only the super admin can hand a job to someone outside their own team; everyone else is limited to
        // themselves and their reporting subtree / headed department (the same scope the assign picker shows).
        if (!/^superadmin$/i.test(String((reAssigner?.category as any)?.role ?? '')) && String(employeeId) !== String(reAssigner?._id)) {
            const team = await getReportedEmployeesWithDepartments(reAssigner?._id);
            if (!team.some((id: any) => String(id) === String(employeeId))) {
                return res.status(403).json({ message: 'You can only assign this job to someone in your team' });
            }
        }
        const existing = await enquiryModel.findById(enquiryId).select('preSale.presalePerson preSale.assignApproval preSale.status');
        // First assignment of a job sent straight to presale: no presalePerson yet, and the
        // feedback / reject / send routes all read it as the person holding the job.
        const isFirstAssignment = !existing?.preSale?.presalePerson;
        // A job handed to someone else while it's mid-revision stays "in revision" for the new holder —
        // otherwise the revision signal (and the comment/history tied to it) is silently lost.
        const wasInRevision = existing?.preSale?.status === 'in revision';

        // While a job is still waiting for its first assignee and a presale escalation workflow is
        // configured, only the role currently holding the assignment responsibility (which moves up
        // the configured chain once a step's time window elapses) may assign it. Super Admins can
        // always act. Once someone holds the job, the gate and escalation no longer apply.
        let resolvedAssignApproval = isFirstAssignment ? existing?.preSale?.assignApproval : null;
        if (resolvedAssignApproval) {
            resolvedAssignApproval = await resolveCurrentAssignmentStep(resolvedAssignApproval);
            const reAssignerRoleId = (reAssigner?.category as any)?._id || reAssigner?.category;
            const currentRoleIds = stageRoleIds(resolvedAssignApproval);
            const isSuperAdmin = /^superadmin$/i.test((reAssigner?.category as any)?.role || '');
            if (!isSuperAdmin && (reAssigner?.category as any)?.privileges?.assignedJob?.assign !== true) {
                return res.status(403).json({ success: false, message: 'Your role does not have the privilege to assign presale jobs.' });
            }
            if (!isSuperAdmin && (!reAssignerRoleId || !currentRoleIds.includes(reAssignerRoleId.toString()))) {
                return res.status(403).json({
                    success: false,
                    message: 'Assignment responsibility for this job has moved to another role in the presale workflow. You can no longer assign it.'
                });
            }
        }

        const reAssignEntry = await buildAssignmentEntry(employeeId, isFirstAssignment ? 'assigned' : 'reassigned', reAssigner);
        const enquiryUpdate = await enquiryModel.findOneAndUpdate(
            { _id: enquiryId },
            {
                $set: {
                    reAssigned: employeeId, reAssignedDate: reAssignEntry.date, status: 'in presales', 'preSale.status': wasInRevision ? 'in revision' : 'assigned', reAssignedSeen: false,
                    ...(isFirstAssignment ? { 'preSale.presalePerson': employeeId } : {}),
                    ...(typeof comment === 'string' && comment.trim() ? { 'preSale.comment': comment.trim() } : {}),
                    ...(resolvedAssignApproval ? { 'preSale.assignApproval': resolvedAssignApproval } : {}),
                },
                $push: { assignmentHistory: reAssignEntry }
            }
        )
        await logEnquiryAudit(req, enquiryId, isFirstAssignment ? 'assigned' : 'reassigned',
            `${isFirstAssignment ? 'Assigned' : 'Reassigned'} to ${reAssignEntry.employeeName || 'presale'}`);
        const enquiry = await enquiryModel.findById(enquiryId);
        const userData = await getEmployeeData(req.user);
        if (enquiry) {
            await notifyByPrivilege(
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
                }
            );
        }
        return res.status(200).json({ message: 'Enquiry Reassigned successfully' })
    } catch (error) {
        next(error)
    }
}

/** Manager resolves a presale rejection by sending the job back to sales; the rejection reason stays on the enquiry. */
export const returnPresaleJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId } = req.body;
        const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
        const enquiry = await enquiryModel.findOne({ _id: enqId, isDeleted: { $ne: true } });
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        const isRejected = enquiry.preSale?.status === 'rejected' || String(enquiry.status).startsWith('Rejected by');
        if (!isRejected) {
            return res.status(400).json({ success: false, message: 'Only rejected jobs can be returned to the enquiry' });
        }

        await enquiryModel.updateOne(
            { _id: enqId },
            { $set: { status: 'rejected', 'preSale.status': 'returned', 'preSale.seenbySalesPerson': false } }
        );
        await logEnquiryAudit(req, enquiry._id, 'presale-returned', note ? `Rejected job returned to enquiry: ${note}` : 'Rejected job returned to enquiry',
            [{ label: 'Status', from: enquiry.status, to: 'rejected' }]);

        const userData = await getEmployeeData(req.user);
        const salesPerson = enquiry.salesPerson?.toString();
        await notifyByPrivilege(
            {
                type: 'Enquiry',
                referenceModel: 'Enquiry',
                title: 'Presale Job Returned',
                message: `Enquiry ${enquiry.enquiryId} was rejected by presales and returned to you${note ? `. Note: ${note}` : ''}`,
                sentBy: userData?._id?.toString() || salesPerson,
                referenceId: enquiry._id,
                additionalData: { enquiryId: enquiry._id.toString() }
            },
            {
                privilegeKey: 'enquiry',
                checkFunction: (_privileges, employeeId) => employeeId === salesPerson
            }
        );

        return res.status(200).json({ success: true, message: 'Job returned to enquiry' });
    } catch (error) {
        next(error);
    }
};

/**
 * Super Admin gives a stuck job (every workflow step elapsed with nobody assigning) one more cycle:
 * the chain restarts from the first step and then escalates exactly as before.
 */
export const restartPresaleAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId } = req.body;
        const chosen: string[] | null = Array.isArray(req.body.stepRoleIds) ? req.body.stepRoleIds.map(String) : null;
        const me = await getEmployeeData(req.user);
        if (!/^superadmin$/i.test((me?.category as any)?.role || '')) {
            return res.status(403).json({ success: false, message: 'Only a Super Admin can restart the assignment workflow' });
        }
        const enquiry = await enquiryModel.findOne({ _id: enqId, isDeleted: { $ne: true } });
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        const current: any = enquiry.preSale?.assignApproval;
        if ((enquiry.preSale?.presalePerson as any)?.length || enquiry.preSale?.status !== 'new' || !current) {
            return res.status(400).json({ success: false, message: 'Only an unassigned job waiting in the workflow can be restarted' });
        }
        // Allowed at any time while unassigned, e.g. after the workflow steps were edited, so this job picks up the latest workflow.
        // Stages the Super Admin did not tick are switched off for this job only; Admin always stays.
        const full: any = await buildAssignmentChain();
        if (!full) {
            return res.status(400).json({ success: false, message: 'No presale workflow is configured' });
        }
        const ladder = await Workflow.findOne({ feature: 'presale' }).select('steps.role').lean();
        const disabledRoles = chosen
            ? (ladder?.steps ?? []).map((step: any) => String(step.role)).filter(id => !chosen.includes(id))
            : [];
        const chain: any = disabledRoles.length ? await buildAssignmentChain(disabledRoles) : full;
        chain.restartCount = (current.restartCount || 0) + 1;
        await enquiryModel.updateOne({ _id: enquiry._id }, { $set: { 'preSale.assignApproval': chain } });
        await logEnquiryAudit(req, enquiry._id, 'presale-workflow-restarted', `Assignment workflow restarted by Super Admin (restart ${chain.restartCount})${disabledRoles.length ? `, ${disabledRoles.length} stage(s) switched off for this job` : ''}`);
        // No notification: the Super Admin has the confirmation, and the role's own reminders and escalation take it from here
        return res.status(200).json({ success: true, message: 'Assignment workflow restarted' });
    } catch (error) {
        next(error);
    }
};

/**
 * Super Admin decides a job held by the workflow (a 'notify' step that was ignored, or a step that ran out of time with
 * nobody assigning): escalate it to the next step, or reject it back to sales with a reason.
 */
export const resolveHeldPresaleAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId, action } = req.body;
        const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
        const me = await getEmployeeData(req.user);
        if (!/^superadmin$/i.test((me?.category as any)?.role || '')) {
            return res.status(403).json({ success: false, message: 'Only a Super Admin can resolve a held assignment' });
        }
        if (!['escalate', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });
        if (!ObjectId.isValid(enqId)) return res.status(400).json({ success: false, message: 'Invalid enquiry id' });
        const enquiry = await enquiryModel.findOne({ _id: enqId, isDeleted: { $ne: true } });
        const current: any = enquiry?.preSale?.assignApproval;
        if (!enquiry || !current || enquiry.preSale?.presalePerson || enquiry.preSale?.status !== 'new') {
            return res.status(400).json({ success: false, message: 'Only an unassigned job waiting in the workflow can be resolved' });
        }
        const resolved: any = await resolveCurrentAssignmentStep(current);
        if (!resolved?.escalationDueAt || new Date(resolved.escalationDueAt) > new Date()) {
            return res.status(400).json({ success: false, message: 'The current step has not run out of time yet' });
        }
        if (action === 'reject') {
            if (!comment) return res.status(400).json({ success: false, message: 'A reason is required to reject a job' });
            await rejectUnassignedPresale(enquiry._id, comment, 'Super Admin');
            await logEnquiryAudit(req, enquiry._id, 'presale-rejected', 'Unassigned presale job rejected by Super Admin',
                [{ label: 'Status', to: 'rejected' }, { label: 'Reason', to: comment }]);
            const salesPerson = enquiry.salesPerson?.toString();
            await notifyByPrivilege(
                {
                    type: 'Enquiry',
                    referenceModel: 'Enquiry',
                    title: 'Presale Job Rejected',
                    message: `Enquiry ${enquiry.enquiryId} could not be assigned in presales and was rejected: ${comment}`,
                    sentBy: me?._id?.toString() || salesPerson,
                    referenceId: enquiry._id,
                    additionalData: { enquiryId: enquiry._id.toString() }
                },
                { privilegeKey: 'enquiry', checkFunction: (_privileges, employeeId) => employeeId === salesPerson }
            );
            return res.status(200).json({ success: true, message: 'Job rejected' });
        }

        const nextStep: any = await advanceAssignmentStep(resolved);
        if (!nextStep) return res.status(400).json({ success: false, message: 'This is the last step, so there is no next step to escalate to. Assign someone, restart the workflow or reject the job' });
        await enquiryModel.updateOne({ _id: enquiry._id }, { $set: { 'preSale.assignApproval': nextStep } });
        await logEnquiryAudit(req, enquiry._id, 'presale-escalated', 'Held assignment escalated to the next step by Super Admin');
        const nextRoleIds = (await Employee.find({ category: { $in: stageRoleIds(nextStep) }, isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean()).map((e: any) => e._id.toString());
        await notifyByPrivilege(
            {
                type: 'AssignedJob',
                referenceModel: 'Enquiry',
                title: 'Presale assignment escalated',
                message: `Enquiry ${enquiry.enquiryId} was escalated by the Super Admin and is now waiting on your role`,
                sentBy: me?._id?.toString() || enquiry.salesPerson?.toString(),
                referenceId: enquiry._id,
                additionalData: { enquiryId: enquiry._id.toString() }
            },
            { privilegeKey: 'assignedJob', checkFunction: (_privileges, employeeId) => nextRoleIds.includes(String(employeeId)) }
        );
        return res.status(200).json({ success: true, message: 'Escalated to the next step' });
    } catch (error) {
        next(error);
    }
};

/** An assigner rejects a job still waiting in the New pool, so it goes back to the salesperson without being assigned first. */
export const rejectNewPresaleJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId } = req.body;
        const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
        if (!ObjectId.isValid(enqId)) return res.status(400).json({ success: false, message: 'Invalid enquiry id' });
        if (!comment) return res.status(400).json({ success: false, message: 'A reason is required to reject a job' });
        const enquiry = await enquiryModel.findOne({ _id: enqId, isDeleted: { $ne: true } });
        if (!enquiry || enquiry.preSale?.presalePerson || (enquiry as any).reAssigned || enquiry.preSale?.status !== 'new') {
            return res.status(400).json({ success: false, message: 'Only a new, unassigned job can be rejected here' });
        }
        const me = await getEmployeeData(req.user);
        await rejectUnassignedPresale(enquiry._id, comment, 'Manager');
        await logEnquiryAudit(req, enquiry._id, 'presale-rejected', 'New presale job rejected by manager',
            [{ label: 'Status', to: 'rejected' }, { label: 'Reason', to: comment }]);
        const salesPerson = enquiry.salesPerson?.toString();
        await notifyByPrivilege(
            {
                type: 'Enquiry',
                referenceModel: 'Enquiry',
                title: 'Presale Job Rejected',
                message: `Enquiry ${enquiry.enquiryId} was rejected by presales: ${comment}`,
                sentBy: me?._id?.toString() || salesPerson,
                referenceId: enquiry._id,
                additionalData: { enquiryId: enquiry._id.toString() }
            },
            { privilegeKey: 'enquiry', checkFunction: (_privileges, employeeId) => employeeId === salesPerson }
        );
        return res.status(200).json({ success: true, message: 'Job rejected' });
    } catch (error) {
        next(error);
    }
};

/** A presale user takes an unassigned job from the New pool. The conditional update makes the first claim win. */
export const selfAssignPresaleJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enqId } = req.body;
        const me = await getEmployeeData(req.user);
        if (!me?._id) {
            return res.status(401).json({ success: false, message: 'Employee not found' });
        }
        const current: any = await enquiryModel.findById(enqId).select('preSale.presalePerson preSale.assignApproval').lean();
        if (current && !current.preSale?.presalePerson) {
            const stageBlock = await assignmentStageBlock(current.preSale?.assignApproval, me);
            if (stageBlock) return res.status(stageBlock.code).json({ success: false, message: stageBlock.message });
        }
        const entry = await buildAssignmentEntry(me._id, 'self-assigned', me);
        const claimed = await enquiryModel.findOneAndUpdate(
            {
                _id: enqId,
                isDeleted: { $ne: true },
                $or: [
                    {
                        $and: [
                            { $or: [{ 'preSale.status': 'new' }, { status: 'Sent to Presales' }, RESENT_MATCH] },
                            { $or: [{ reAssigned: null }, { reAssigned: { $exists: false } }] },
                        ],
                    },
                    { 'preSale.status': 'rejected' },
                ],
            },
            {
                $set: {
                    reAssigned: me._id, reAssignedDate: entry.date, status: 'in presales', 'preSale.status': 'assigned',
                    'preSale.presalePerson': me._id, reAssignedSeen: true,
                },
                $push: { assignmentHistory: entry }
            },
            { new: true }
        );
        if (!claimed) {
            return res.status(409).json({ success: false, message: 'This job is no longer available. It may have been assigned already.' });
        }
        await logEnquiryAudit(req, claimed._id, 'self-assigned', `Self-assigned by ${entry.employeeName || 'presale'}`);
        return res.status(200).json({ success: true, message: 'Job assigned to you' });
    } catch (error) {
        next(error);
    }
};


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
    if (status === 'Quoted' || status === 'quoted') return 'quoted';
    if (status === 'Ready for Quotation' || status === 'estimated') return 'estimated';
    if (status === 'New' || status === 'In Review' || status === 'new' || status === 'in progress') return 'new';
    if (status.startsWith('Rejected by Presale') || status === 'rejected') return 'rejected';
    if (status.startsWith('Assigned To Presale') || status === 'Sended by Presale Engineer' || status === 'in presales' || status === 'revision') return 'presales';
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
        const { salesPerson, customer, fromDate, toDate, department, userId } = req.body;
        const access = await widenAccessForDepartmentHead(req.body.access, userId);

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
            ? await getReportedEmployeesWithDepartments(userId)
            : [];
        if (access === 'created') match.salesPerson = new ObjectId(userId);
        else if (access === 'reported') match.salesPerson = { $in: reportedToUserIds };
        else if (access === 'createdAndReported') match.salesPerson = { $in: [...reportedToUserIds, new ObjectId(userId)] };

        const enquiries: any[] = await enquiryModel.find(match)
            .select('enquiryId title status date nextFollowUpDate client salesPerson department assignmentHistory preSale.presalePerson preSale.createdDate preSale.rejectionHistory')
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
            nextFollowUpDate: r.e.nextFollowUpDate,
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
        const overdueFollowUps = enriched
            .filter((r) => r.e.nextFollowUpDate && !['quoted', 'rejected'].includes(r.stage) && new Date(r.e.nextFollowUpDate) <= now)
            .map((r) => brief(r, daysSince(new Date(r.e.nextFollowUpDate)))).sort(byDaysDesc);

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
                notStarted, stuck, awaitingQuote, rejected, overdueFollowUps,
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
