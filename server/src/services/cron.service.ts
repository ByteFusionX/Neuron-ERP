import employeeModel from "../models/employee.model";
import announcementModel from "../models/announcement.model";
import Notification from "../models/notification.model";
import { fetchExchangeRate } from "../common/utils/util";
import Event from '../models/events.model';
import Quotation from '../models/quotation.model';
import PurchaseRequest, { PurchaseRequestStatus } from '../models/purchaseRequest.model';
import Enquiry from '../models/enquiry.model';
import Category from '../models/category.model';
import Workflow from '../models/workflow.model';
import { resolveCurrentAssignmentStep, rejectUnassignedPresale, stageRoleIds } from './presaleAssignment.service';
import { notify } from './notify.service';
import { logAudit } from './audit.service';
import { processOutbox } from './outbox.service';
import { runExclusive } from './cronLock.service';
import './announcementNotify.service';
import Rfq, { RfqStatus, RfqType } from '../models/rfq.model';
import { expireLapsedReservations } from '../controllers/quoteStockHold.controller';
const cron = require('node-cron');

const processEmployeeEvent = async (element, eventType) => {
    try {
        let eventTitle = '';
        let eventDescription = '';

        if (eventType === 'birthday') {
            eventTitle = `Happy Birthday ${element.firstName} ${element.lastName}`;
            eventDescription = 'Sending warm birthday wishes to our valued employees! May your special day be filled with joy, prosperity, and unforgettable moments. Your dedication contributes to the success of our company, and we appreciate your continued commitment. Happy Birthday!';
        } else if (eventType === 'anniversary') {

            const joinedDate = new Date(element.dateOfJoining);
            const today = new Date();
            const workAnniversary = new Date(today.getTime() - joinedDate.getTime());
            const yearsOfExperience = Math.abs(workAnniversary.getUTCFullYear() - 1970);

            eventTitle =`Congrats ${element.firstName} ${element.lastName} on ${yearsOfExperience} years! Happy Work Anniversary!`;
            eventDescription = 'Sending warm anniversary wishes to our valued employees! Thank you for your dedication and contributions to our success. Here\'s to many more years of collaboration and achievements. Happy Work Anniversary!';
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const alreadyAnnounced = await announcementModel.findOne({
            title: eventTitle,
            date: today,
            celeb: true
        });
        if (alreadyAnnounced) return true;

        const saveEvent = new announcementModel({
            title: eventTitle,
            description: eventDescription,
            date: today,
            celeb: true,
            viewedBy: [],
            createdDate: new Date(),
            category:['all']
        });


        const saveComment = await saveEvent.save();

        if (!saveComment) return false;
        return true;
    } catch (error) {
        console.error(`Error saving ${eventType} announcement:`, error.message);
        return false;
    }
};

const approverIdsOf = async (approval: any) => {
    if (approval.managerApproval && approval.approver) return [approval.approver];
    return (await employeeModel.find({ category: approval.role, isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean()).map((e: any) => e._id);
};

const notifyPurchase = (request: any, recipientIds: any[], title: string, message: string, dedupeKey: string) =>
    notify({
        type: 'PurchaseApprovalRequest',
        referenceModel: 'Purchase',
        title,
        message,
        sentBy: request.createdBy?.toString(),
        recipients: recipientIds,
        referenceId: request._id,
        additionalData: { purchaseId: request._id.toString() },
        dedupeKey,
        channels: ['inapp', 'push', 'email'],
    });

/** Nudges approvers once a pending stage has used up its reminder share of the time limit. */
const sendApprovalReminders = async () => {
    try {
        const now = new Date();
        const requests = await PurchaseRequest.find({
            approvalStatus: { $elemMatch: { status: 'pending', reminderDueAt: { $lte: now }, reminderSentAt: null, escalatedAt: null, timeoutHandledAt: null } }
        }).select('purchaseNo approvalStatus createdBy');

        for (const request of requests) {
            for (const approval of request.approvalStatus as any[]) {
                if (approval.status !== 'pending' || approval.escalatedAt || approval.timeoutHandledAt || approval.reminderSentAt || !approval.reminderDueAt || approval.reminderDueAt > now) continue;

                // Claim first: only the run that flips reminderSentAt sends the reminder
                const claim = await PurchaseRequest.updateOne(
                    { _id: request._id, approvalStatus: { $elemMatch: { _id: approval._id, reminderSentAt: null } } },
                    { $set: { 'approvalStatus.$[a].reminderSentAt': now } },
                    { arrayFilters: [{ 'a._id': approval._id }] }
                );
                if (!claim.modifiedCount) continue;

                const hoursLeft = Math.max(1, Math.round((new Date(approval.escalationDueAt).getTime() - now.getTime()) / 3600000));
                const consequence = approval.timeoutAction === 'reject'
                    ? `will be auto-rejected in about ${hoursLeft}h`
                    : approval.timeoutAction === 'notify'
                        ? `is due in about ${hoursLeft}h`
                        : `escalates in about ${hoursLeft}h`;
                try {
                    await notifyPurchase(request, await approverIdsOf(approval), 'Approval reminder', `Purchase ${request.purchaseNo} is waiting for your approval and ${consequence}`, `purchase:${request._id}:${approval._id}:reminder`);
                } catch (error) {
                    // Release the claim so the next tick retries
                    await PurchaseRequest.updateOne({ _id: request._id }, { $set: { 'approvalStatus.$[a].reminderSentAt': null } }, { arrayFilters: [{ 'a._id': approval._id }] });
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Approval reminder error:', error.message);
    }
};

/** Handles stages configured to notify only or auto-reject when their time limit passes. */
const processApprovalTimeouts = async () => {
    try {
        const now = new Date();
        const requests = await PurchaseRequest.find({
            status: PurchaseRequestStatus.Pending,
            approvalStatus: { $elemMatch: { status: 'pending', timeoutAction: { $in: ['notify', 'reject'] }, escalationDueAt: { $lte: now }, timeoutHandledAt: null } }
        });

        for (const request of requests) {
            const overdue = (request.approvalStatus as any[]).find(approval =>
                approval.status === 'pending' && ['notify', 'reject'].includes(approval.timeoutAction) && approval.escalationDueAt && approval.escalationDueAt <= now && !approval.timeoutHandledAt
            );
            if (!overdue) continue;

            // Claim first so overlapping runs or other server instances cannot handle the same timeout twice
            const claim = await PurchaseRequest.updateOne(
                { _id: request._id, approvalStatus: { $elemMatch: { _id: (overdue as any)._id, timeoutHandledAt: null } } },
                { $set: { 'approvalStatus.$[a].timeoutHandledAt': now } },
                { arrayFilters: [{ 'a._id': (overdue as any)._id }] }
            );
            if (!claim.modifiedCount) continue;

            const approverIds = await approverIdsOf(overdue);
            const requesterIds = request.createdBy ? [request.createdBy] : [];
            const timeoutKey = `purchase:${request._id}:${(overdue as any)._id}:timeout`;

            if (overdue.timeoutAction === 'reject') {
                overdue.status = 'rejected';
                overdue.updatedDate = now;
                overdue.comment = 'Auto-rejected: not actioned within the time limit';
                overdue.timeoutHandledAt = now;
                request.approvalStatus = (request.approvalStatus as any[]).filter(approval => approval.status !== 'pending') as any;
                request.status = PurchaseRequestStatus.Rejected;
                await request.save();
                await notifyPurchase(request, [...requesterIds, ...approverIds], 'Request auto-rejected', `Purchase ${request.purchaseNo} was auto-rejected because the approval time limit passed`, timeoutKey);
            } else {
                overdue.timeoutHandledAt = now;
                await request.save();
                await notifyPurchase(request, [...requesterIds, ...approverIds], 'Approval overdue', `Purchase ${request.purchaseNo} has passed its approval time limit and is still waiting`, timeoutKey);
            }
        }
    } catch (error) {
        console.error('Approval timeout error:', error.message);
    }
};

const notifyDeal = (quote: any, recipientIds: any[], title: string, message: string, dedupeKey: string, type = 'DealSheet') =>
    notify({
        type,
        referenceModel: 'Quotation',
        title,
        message,
        sentBy: quote.createdBy?.toString(),
        recipients: recipientIds,
        referenceId: quote._id,
        additionalData: { quotationId: quote._id.toString() },
        dedupeKey,
        channels: ['inapp', 'push', 'email'],
    });

const DEAL_PENDING = { isDeleted: { $ne: true }, 'dealData.status': 'pending' };

/** Deal Sheet workflow: nudges the approvers of a stage that has used up its reminder share of the time limit. */
const sendDealApprovalReminders = async () => {
    try {
        const now = new Date();
        const quotes = await Quotation.find({
            ...DEAL_PENDING,
            'dealData.approvalStatus': { $elemMatch: { status: 'pending', reminderDueAt: { $lte: now }, reminderSentAt: null, escalatedAt: null, timeoutHandledAt: null } }
        }).select('quoteId createdBy dealData.approvalStatus').lean();

        for (const quote of quotes as any[]) {
            for (const approval of quote.dealData.approvalStatus as any[]) {
                if (approval.status !== 'pending' || approval.escalatedAt || approval.timeoutHandledAt || approval.reminderSentAt || !approval.reminderDueAt || approval.reminderDueAt > now) continue;

                const claim = await Quotation.updateOne(
                    { _id: quote._id, 'dealData.approvalStatus': { $elemMatch: { _id: approval._id, reminderSentAt: null } } },
                    { $set: { 'dealData.approvalStatus.$[a].reminderSentAt': now } },
                    { arrayFilters: [{ 'a._id': approval._id }] }
                );
                if (!claim.modifiedCount) continue;

                const hoursLeft = Math.max(1, Math.round((new Date(approval.escalationDueAt).getTime() - now.getTime()) / 3600000));
                const consequence = approval.timeoutAction === 'reject'
                    ? `will be auto-rejected in about ${hoursLeft}h`
                    : approval.timeoutAction === 'notify'
                        ? `is due in about ${hoursLeft}h`
                        : `escalates in about ${hoursLeft}h`;
                try {
                    await notifyDeal(quote, await approverIdsOf(approval), 'Approval reminder', `Deal sheet for quotation ${quote.quoteId} is waiting for your approval and ${consequence}`, `deal:${quote._id}:${approval._id}:reminder`);
                } catch (error) {
                    await Quotation.updateOne({ _id: quote._id }, { $set: { 'dealData.approvalStatus.$[a].reminderSentAt': null } }, { arrayFilters: [{ 'a._id': approval._id }] });
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Deal approval reminder error:', error.message);
    }
};

/** Deal Sheet workflow: stages set to notify only or auto-reject act when their time limit passes. */
const processDealApprovalTimeouts = async () => {
    try {
        const now = new Date();
        const quotes = await Quotation.find({
            ...DEAL_PENDING,
            'dealData.approvalStatus': { $elemMatch: { status: 'pending', timeoutAction: { $in: ['notify', 'reject'] }, escalationDueAt: { $lte: now }, timeoutHandledAt: null } }
        }).select('quoteId createdBy dealData.approvalStatus dealData.requestedBy').lean();

        for (const quote of quotes as any[]) {
            const overdue = (quote.dealData.approvalStatus as any[]).find(approval =>
                approval.status === 'pending' && ['notify', 'reject'].includes(approval.timeoutAction) && approval.escalationDueAt && approval.escalationDueAt <= now && !approval.timeoutHandledAt
            );
            if (!overdue) continue;

            // Claim first so overlapping runs or other server instances cannot handle the same timeout twice
            const claim = await Quotation.updateOne(
                { _id: quote._id, 'dealData.approvalStatus': { $elemMatch: { _id: overdue._id, timeoutHandledAt: null } } },
                { $set: { 'dealData.approvalStatus.$[a].timeoutHandledAt': now } },
                { arrayFilters: [{ 'a._id': overdue._id }] }
            );
            if (!claim.modifiedCount) continue;

            const approverIds = await approverIdsOf(overdue);
            const requesterIds = [quote.dealData.requestedBy ?? quote.createdBy].filter(Boolean);
            const timeoutKey = `deal:${quote._id}:${overdue._id}:timeout`;

            if (overdue.timeoutAction === 'reject') {
                const remaining = (quote.dealData.approvalStatus as any[])
                    .map(approval => String(approval._id) === String(overdue._id)
                        ? { ...approval, status: 'rejected', updatedDate: now, comment: 'Auto-rejected: not actioned within the time limit', timeoutHandledAt: now }
                        : approval)
                    .filter(approval => approval.status !== 'pending');
                const reason = 'Auto-rejected: the approval time limit passed';
                await Quotation.updateOne(
                    { _id: quote._id, 'dealData.status': 'pending' },
                    { $set: { 'dealData.status': 'rejected', 'dealData.seenedBySalsePerson': false, 'dealData.approvalStatus': remaining }, $push: { 'dealData.comments': reason } }
                );
                await notifyDeal(quote, [...requesterIds, ...approverIds], 'Deal sheet auto-rejected', `The deal sheet for quotation ${quote.quoteId} was auto-rejected because the approval time limit passed`, timeoutKey, 'DealSheetResponse');
            } else {
                await notifyDeal(quote, [...requesterIds, ...approverIds], 'Approval overdue', `The deal sheet for quotation ${quote.quoteId} has passed its approval time limit and is still waiting`, timeoutKey);
            }
        }
    } catch (error) {
        console.error('Deal approval timeout error:', error.message);
    }
};

/** Deal Sheet workflow: a stage set to escalate hands over to the next role as soon as its time limit passes, without waiting for someone to act. */
const processDealEscalations = async () => {
    try {
        const now = new Date();
        const quotes = await Quotation.find({
            ...DEAL_PENDING,
            'dealData.approvalStatus': { $elemMatch: { status: 'pending', escalationDueAt: { $lte: now }, escalatedAt: null, timeoutHandledAt: null, timeoutAction: { $nin: ['notify', 'reject'] } } }
        }).select('quoteId createdBy dealData.approvalStatus dealData.requestedBy').lean();

        for (const quote of quotes as any[]) {
            for (const approval of quote.dealData.approvalStatus as any[]) {
                if (approval.status !== 'pending' || approval.escalatedAt || approval.timeoutHandledAt || !approval.escalationDueAt || approval.escalationDueAt > now) continue;
                if (approval.timeoutAction && approval.timeoutAction !== 'escalate') continue;

                const set: any = { 'dealData.approvalStatus.$[a].escalatedAt': now };
                if (approval.escalationRole) {
                    set['dealData.approvalStatus.$[a].originalRole'] = approval.role;
                    set['dealData.approvalStatus.$[a].role'] = approval.escalationRole;
                }
                // Claim first: only the run that still sees escalatedAt empty escalates
                const claim = await Quotation.updateOne(
                    { _id: quote._id, 'dealData.status': 'pending', 'dealData.approvalStatus': { $elemMatch: { _id: approval._id, status: 'pending', escalatedAt: null } } },
                    { $set: set },
                    { arrayFilters: [{ 'a._id': approval._id }] }
                );
                if (!claim.modifiedCount) continue;

                const requesterIds = [quote.dealData.requestedBy ?? quote.createdBy].filter(Boolean);
                const nextIds = await approverIdsOf({ ...approval, role: approval.escalationRole ?? approval.role, managerApproval: false });
                // The deal's history shows who it moved to and why, so the approver it left is not left guessing.
                const [fromRole, toRole] = await Promise.all([
                    Category.findById(approval.role, 'categoryName').lean(),
                    approval.escalationRole ? Category.findById(approval.escalationRole, 'categoryName').lean() : null,
                ]);
                await logAudit(null, {
                    entityType: 'quotation',
                    entityId: quote._id,
                    entityLabel: quote.quoteId,
                    action: 'deal-escalated',
                    summary: `Deal sheet ${quote.quoteId} was not approved in time and moved from ${(fromRole as any)?.categoryName ?? 'the approver'} to ${(toRole as any)?.categoryName ?? 'the next approver'}`,
                });
                await notifyDeal(quote, nextIds, 'Deal sheet escalated', `The deal sheet for quotation ${quote.quoteId} was not approved in time and is now waiting on your role`, `deal:${quote._id}:${approval._id}:escalated`);
                await notifyDeal(quote, requesterIds, 'Deal sheet escalated', `The deal sheet for quotation ${quote.quoteId} passed its approval time limit and was escalated`, `deal:${quote._id}:${approval._id}:escalated-requester`);
            }
        }
    } catch (error) {
        console.error('Deal escalation error:', error.message);
    }
};

const notifyPresaleRoles = (enquiry: any, recipientIds: any[], title: string, message: string, dedupeKey: string, type = 'AssignedJob') =>
    notify({
        type,
        referenceModel: 'Enquiry',
        title,
        message,
        sentBy: enquiry.salesPerson?.toString(),
        recipients: recipientIds,
        referenceId: enquiry._id,
        additionalData: { enquiryId: enquiry._id.toString() },
        dedupeKey,
        channels: ['inapp', 'push', 'email'],
    });

/** One key per enquiry, step and window, so each presale notification can only ever be created once. */
const presaleKey = (enquiry: any, approval: any, suffix: string) =>
    `presale:${enquiry._id}:${approval.stepIndex ?? 0}:${approval.restartCount ?? 0}:${approval.assignedAt ? new Date(approval.assignedAt).getTime() : 0}:${suffix}`;

const employeeIdsWithRole = async (role: any) =>
    (await employeeModel.find({ category: role?._id ?? role, isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean()).map((e: any) => e._id);

/** Everyone in the roles holding a presale assignment stage (several roles when it is an "Or" stage). */
const employeeIdsOfStage = async (assignment: any) =>
    (await employeeModel.find({ category: { $in: stageRoleIds(assignment) }, isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean()).map((e: any) => e._id);

/**
 * Drives the presale assignment workflow for jobs still waiting to be assigned:
 * reminds the responsible role once its reminder share (default 75%) of the time limit is used,
 * then applies the step's timeout action - escalate to the next role, notify only (the Super Admins decide if it drags on), or auto-reject.
 */
const PRESALE_REPEAT_REMINDER_MS = 24 * 60 * 60 * 1000;
const PRESALE_REPEAT_REMINDER_HOUR = 8;
const PRESALE_DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

/**
 * Alerts the Super Admins that a job needs their decision. The first alert goes out once `since` has passed,
 * then it repeats every working morning until someone acts (unless repeat reminders are switched off).
 */
const alertSuperAdmins = async (enquiry: any, approval: any, now: Date, since: number, title: string, message: string) => {
    const previousSentAt = approval.reminderSentAt ?? null;
    const lastSent = previousSentAt ? new Date(previousSentAt).getTime() : 0;
    const firstAlert = lastSent < since;
    if (!firstAlert) {
        const morning = new Date(now);
        morning.setHours(PRESALE_REPEAT_REMINDER_HOUR, 0, 0, 0);
        const workflow: any = await Workflow.findOne({ feature: 'presale' }).select('workingDays').lean();
        const workingDays: number[] = workflow?.workingDays?.length ? workflow.workingDays : PRESALE_DEFAULT_WORKING_DAYS;
        if (approval.repeatReminder === false || now < morning || lastSent >= morning.getTime() || !workingDays.includes(now.getDay())) return;
    }
    // Claim first: only the run that moves reminderSentAt off the value it read sends this alert
    const claim = await Enquiry.updateOne({ _id: enquiry._id, 'preSale.assignApproval.reminderSentAt': previousSentAt }, { $set: { 'preSale.assignApproval.reminderSentAt': now } });
    if (!claim.modifiedCount) return;

    try {
        const superAdminRole = await Category.findOne({ role: /^superadmin$/i }).select('_id').lean();
        const superAdmins = superAdminRole ? await employeeIdsWithRole(superAdminRole) : [];
        const daysOverdue = Math.max(1, Math.floor((now.getTime() - since) / PRESALE_REPEAT_REMINDER_MS) + 1);
        await notifyPresaleRoles(enquiry, superAdmins, title, `${message}${firstAlert ? '' : ` (reminder ${daysOverdue})`}`, presaleKey(enquiry, approval, `superadmin:${firstAlert ? 'first' : now.toISOString().slice(0, 10)}`));
    } catch (error) {
        await Enquiry.updateOne({ _id: enquiry._id, 'preSale.assignApproval.reminderSentAt': now }, { $set: { 'preSale.assignApproval.reminderSentAt': previousSentAt } });
        throw error;
    }
};

const processPresaleAssignments = async () => {
    try {
        const now = new Date();
        const waiting = { isDeleted: { $ne: true }, status: { $in: ['in presales', 'revision'] }, 'preSale.presalePerson': { $exists: false }, 'preSale.assignApproval': { $exists: true } };

        const toRemind = await Enquiry.find({ ...waiting, 'preSale.assignApproval.reminderDueAt': { $lte: now }, 'preSale.assignApproval.reminderSentAt': null, 'preSale.assignApproval.timeoutHandledAt': null }).select('enquiryId salesPerson preSale.assignApproval');
        for (const enquiry of toRemind) {
            const approval: any = enquiry.preSale.assignApproval;
            // Claim first so only one run (or server instance) sends this reminder
            const claim = await Enquiry.updateOne(
                { _id: enquiry._id, 'preSale.assignApproval.reminderSentAt': null, 'preSale.assignApproval.timeoutHandledAt': null, 'preSale.assignApproval.escalationDueAt': approval.escalationDueAt },
                { $set: { 'preSale.assignApproval.reminderSentAt': now } }
            );
            if (!claim.modifiedCount) continue;
            const hoursLeft = Math.max(1, Math.round((new Date(approval.escalationDueAt).getTime() - now.getTime()) / 3600000));
            const consequence = approval.timeoutAction === 'reject' ? `will be auto-rejected in about ${hoursLeft}h`
                : approval.timeoutAction === 'notify' ? `is due in about ${hoursLeft}h`
                    : `escalates to the next role in about ${hoursLeft}h`;
            try {
                await notifyPresaleRoles(enquiry, await employeeIdsOfStage(approval), 'Assignment reminder', `Enquiry ${enquiry.enquiryId} still needs a presale assignee and ${consequence}`, presaleKey(enquiry, approval, 'reminder'));
            } catch (error) {
                await Enquiry.updateOne({ _id: enquiry._id, 'preSale.assignApproval.reminderSentAt': now }, { $set: { 'preSale.assignApproval.reminderSentAt': null } });
                throw error;
            }
        }

        const overdue = await Enquiry.find({ ...waiting, 'preSale.assignApproval.escalationDueAt': { $lte: now } }).select('enquiryId salesPerson status preSale.assignApproval');
        for (const enquiry of overdue) {
            const approval: any = enquiry.preSale.assignApproval;
            const due = new Date(approval.escalationDueAt).getTime();

            // Every action below follows the step's configured timeout action; nothing is decided by the module.
            if (approval.timeoutAction === 'reject') {
                const claim = await Enquiry.updateOne(
                    { _id: enquiry._id, 'preSale.assignApproval.timeoutHandledAt': null, 'preSale.assignApproval.escalationDueAt': approval.escalationDueAt },
                    { $set: { 'preSale.assignApproval.timeoutHandledAt': now } }
                );
                if (!claim.modifiedCount) continue;
                await rejectUnassignedPresale(enquiry._id, 'Auto-rejected: not assigned within the workflow time limit', 'Workflow');
                await notifyPresaleRoles(enquiry, [enquiry.salesPerson], 'Presale job rejected', `Enquiry ${enquiry.enquiryId} was auto-rejected because no one was assigned within the workflow time limit`, presaleKey(enquiry, approval, 'reject'), 'Enquiry');
                continue;
            }

            if (approval.timeoutAction === 'notify') {
                if (!approval.timeoutHandledAt) {
                    const claim = await Enquiry.updateOne(
                        { _id: enquiry._id, 'preSale.assignApproval.timeoutHandledAt': null, 'preSale.assignApproval.escalationDueAt': approval.escalationDueAt },
                        { $set: { 'preSale.assignApproval.timeoutHandledAt': now } }
                    );
                    if (!claim.modifiedCount) continue;
                    await notifyPresaleRoles(enquiry, await employeeIdsOfStage(approval), 'Assignment overdue', `Enquiry ${enquiry.enquiryId} has passed its assignment time limit and is still unassigned`, presaleKey(enquiry, approval, 'overdue'));
                    continue;
                }
                // The notified role gets one more time window; if the job is still unassigned the Super Admins decide:
                // escalate it to the next step or reject it.
                const windowMs = Math.max(due - new Date(approval.assignedAt || approval.escalationDueAt).getTime(), 0);
                if (now.getTime() < due + windowMs) continue;
                await alertSuperAdmins(enquiry, approval, now, due + windowMs, 'Assignment needs a decision', `Enquiry ${enquiry.enquiryId} is still unassigned after the role was notified. Escalate it to the next step or reject it`);
                continue;
            }

            const resolved: any = await resolveCurrentAssignmentStep(approval, now);
            if (resolved === approval) {
                // Last step: nothing further to escalate to, so it is now the Super Admins' turn (assign, or restart the workflow).
                await alertSuperAdmins(enquiry, approval, now, due, 'Assignment still overdue', `Enquiry ${enquiry.enquiryId} is still unassigned and is the final step with no one to escalate to`);
                continue;
            }
            // Only the run that still sees the old step applies the escalation
            const claim = await Enquiry.updateOne(
                { _id: enquiry._id, 'preSale.assignApproval.escalationDueAt': approval.escalationDueAt, 'preSale.assignApproval.stepIndex': approval.stepIndex },
                { $set: { 'preSale.assignApproval': resolved } }
            );
            if (!claim.modifiedCount) continue;
            await notifyPresaleRoles(enquiry, await employeeIdsOfStage(resolved), 'Presale assignment escalated', `Enquiry ${enquiry.enquiryId} was not assigned in time and is now waiting on your role`, presaleKey(enquiry, resolved, 'escalated'));
        }
    } catch (error) {
        console.error('Presale assignment workflow error:', error.message);
    }
};

/**
 * Tells the owner of an open enquiry follow-up that it is overdue (its due day has passed). The owner is whoever
 * scheduled it, else the enquiry's salesperson. One notification per follow-up, however often this runs.
 */
const processOverdueFollowUps = async () => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const enquiries = await Enquiry.find({
            isDeleted: { $ne: true },
            followUpHistory: { $elemMatch: { status: 'scheduled', dueDate: { $lt: startOfToday } } }
        }).select('enquiryId salesPerson followUpHistory');

        for (const enquiry of enquiries) {
            const followUp: any = enquiry.followUpHistory.find((f: any) => f.status === 'scheduled' && f.dueDate && f.dueDate < startOfToday);
            if (!followUp) continue;
            await notify({
                type: 'EnquiryFollowUpOverdue',
                referenceModel: 'Enquiry',
                title: 'Follow-up overdue',
                message: `The follow-up for enquiry ${enquiry.enquiryId} was due on ${new Date(followUp.dueDate).toLocaleDateString('en-GB')} and is still open`,
                sentBy: enquiry.salesPerson?.toString(),
                recipients: [followUp.createdBy ?? enquiry.salesPerson],
                referenceId: enquiry._id,
                additionalData: { enquiryId: enquiry._id.toString() },
                dedupeKey: `enquiry-followup-overdue:${enquiry._id}:${followUp._id}`,
                channels: ['inapp', 'push', 'email'],
            });
        }
    } catch (error) {
        console.error('Overdue follow-up check error:', error.message);
    }
};

/**
 * Tells whoever booked an open supplier RFQ chase that it is overdue. One notification per follow-up.
 * Chases created automatically (on "Mark sent") go to the person who raised the RFQ.
 */
const processOverdueRfqFollowUps = async () => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const rfqs = await Rfq.find({
            rfqType: RfqType.Sales,
            isDeleted: false,
            status: { $nin: [RfqStatus.Closed, RfqStatus.Cancelled] },
            followUps: { $elemMatch: { status: 'scheduled', dueDate: { $lt: startOfToday } } }
        }).select('rfqNo enquiryId createdBy followUps');

        for (const rfq of rfqs) {
            const overdue = (rfq.followUps || []).filter((f: any) => f.status === 'scheduled' && f.dueDate && f.dueDate < startOfToday);
            for (const followUp of overdue as any[]) {
                const about = followUp.supplierName ? ` with ${followUp.supplierName}` : '';
                await notify({
                    type: 'RfqFollowUpOverdue',
                    referenceModel: 'Rfq',
                    title: 'RFQ follow-up overdue',
                    message: `The follow-up${about} on ${rfq.rfqNo} was due on ${new Date(followUp.dueDate).toLocaleDateString('en-GB')} and is still open`,
                    sentBy: rfq.createdBy?.toString(),
                    recipients: [followUp.createdBy ?? rfq.createdBy],
                    referenceId: rfq._id,
                    additionalData: { rfqId: rfq._id.toString(), enquiryId: rfq.enquiryId?.toString() },
                    dedupeKey: `rfq-followup-overdue:${rfq._id}:${followUp._id}`,
                    channels: ['inapp', 'push', 'email'],
                });
            }
        }
    } catch (error) {
        console.error('Overdue RFQ follow-up check error:', error.message);
    }
};

const startCronJob = () => {
    cron.schedule('0 1 * * *', () => runExclusive('daily', 30 * 60 * 1000, async () => {
        try {
            console.log('Working cron scheduled');
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();

            const [birthdayEmployees, anniversaryEmployees] = await Promise.all([
                employeeModel.find({
                    isBlocked: { $ne: true },
                    $expr: {
                        $and: [
                            { $eq: [{ $month: "$dob" }, currentMonth] },
                            { $eq: [{ $dayOfMonth: "$dob" }, currentDay] }
                        ]
                    }
                }),
                employeeModel.find({
                    isBlocked: { $ne: true },
                    $expr: {
                        $and: [
                            { $eq: [{ $month: "$dateOfJoining" }, currentMonth] },
                            { $eq: [{ $dayOfMonth: "$dateOfJoining" }, currentDay] }
                        ]
                    }
                })
            ]);

            if (birthdayEmployees.length > 0) {
                const birthdayPromises = birthdayEmployees.map(element => processEmployeeEvent(element, 'birthday'));
                await Promise.all(birthdayPromises);
            }

            if (anniversaryEmployees.length > 0) {
                const anniversaryPromises = anniversaryEmployees.map(element => processEmployeeEvent(element, 'anniversary'));
                await Promise.all(anniversaryPromises);
            }
            checkTodayEventsAndSendNotifications()

            await Quotation.updateMany(
                {
                    closingDate: { $lt: today },
                    status: { $nin: ['Won', 'Lost', 'Expired'] },
                    isDeleted: { $ne: true }
                },
                { $set: { status: 'Expired' } }
            );

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
            const notifications = await Notification.find({
                date: { $lt: thirtyDaysAgo },
                'recipients.status': 'read'
            });
    
            await Promise.all(
                notifications.map(async (notification) => {
                    const allRead = notification.recipients.every(recipient => recipient.status === 'read');
                    if (allRead) {
                        await Notification.deleteOne({ _id: notification._id });
                        return;
                    }

                    await Notification.updateOne(
                        { _id: notification._id },
                        { $pull: { recipients: { status: 'read' } } }
                    );
                })
            );

        } catch (error) {
            console.error('Cron job error:', error.message);
        }
    })).start();
    fetchExchangeRate();

    // The tick only detects what is due and hands it to notify(); the outbox pass at the end delivers
    // queued email and due scheduled jobs. Overlap and multi-instance guarded by runExclusive.
    cron.schedule('* * * * *', () => runExclusive('tick', 5 * 60 * 1000, async () => {
        await sendApprovalReminders();
        await processApprovalTimeouts();
        await sendDealApprovalReminders();
        await processDealApprovalTimeouts();
        await processDealEscalations();
        await processPresaleAssignments();
        // Hourly is plenty for a day-level due date
        if (new Date().getMinutes() === 0) {
            await processOverdueFollowUps();
            await processOverdueRfqFollowUps();
            await expireLapsedReservations();
        }
        await processOutbox();
    })).start();

    cron.schedule('0 */4 * * *', () => {
        console.log('Updating exchange rate...');
        fetchExchangeRate();
    }).start();
};

const checkTodayEventsAndSendNotifications = async () => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const events = await Event.find({ date: { $gte: startOfDay, $lt: endOfDay } });

        const day = startOfDay.toLocaleDateString('en-CA');
        for (const event of events) {
            await notify({
                type: 'Event',
                referenceModel: 'Event',
                title: `You have ${event.event} Assigned Today!`,
                message: `${event.summary}`,
                sentBy: event.createdBy,
                recipients: [event.employee],
                referenceId: event._id,
                dedupeKey: `event:${event._id}:${day}`,
            });
        }
    } catch (error) {
        console.error("Error checking today's events and sending notifications:", error);
    }
}

export { checkTodayEventsAndSendNotifications };
export default startCronJob
