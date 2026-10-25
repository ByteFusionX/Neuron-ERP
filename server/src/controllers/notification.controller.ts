import { Request, Response, NextFunction } from "express";
import Notification from "../models/notification.model";
import Employee from "../models/employee.model";
import Category, { Privileges } from "../models/category.model";
import jwt from 'jsonwebtoken';
import { getEmployeeData } from "../common/utils/util";
import { Server } from "socket.io";
import { connectedSockets } from "../services/socket-io.service";
import { ObjectId } from "mongodb";
import { sendWebPushToEmployees } from "../services/webPush.service";
import NotificationPreference from "../models/notificationPreference.model";
import { isAppMailConfigured } from "../services/email.service";
import { dealSheetCan } from "../common/utils/dealSheetPrivilege";


interface NotificationData {
    type: string;
    referenceModel: string;
    title: string;
    message: string;
    recipients: { objectId: any; status: string }[];
    sentBy: string;
    date: Date;
    referenceId: any;
    additionalData?: Record<string, unknown>;
    dedupeKey?: string;
}

export const createNotification = async (notification: NotificationData) => {
    try {
        // Validate notification data
        if (!notification.recipients || notification.recipients.length === 0) {
            throw new Error("Recipients are required");
        }

        const newNotification = new Notification(notification);

        const latestNotification = await newNotification.save();
        const populatedNotification = await Notification.findOne({
            '_id': latestNotification._id
        })
        .populate('referenceId')
        .populate('recipients.objectId')
        .populate('sentBy');
        
        if (populatedNotification && populatedNotification.type === 'Event') {
            await populatedNotification.populate({
                path: 'referenceId',
                populate: {
                    path: 'collectionId',
                },
            });
        }
        
        return populatedNotification;

    } catch (error) {
        console.error("Error creating notification:", error);
        throw error; // Re-throw the error to be handled by the caller
    }
};

export const getAllNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userData = await getEmployeeData(req.user);
        const employee = await Employee.findById(userData._id).populate('category').lean();
        
        if (!employee || !employee.category) {
            return res.status(200).json({ unviewed: [], viewed: [] });
        }

        const privileges = (employee.category as any).privileges as Privileges;

        // Recipients and sender only need a display name; populating whole employee documents made this response ~770 KB.
        // Read history is capped to the latest 50 — the panel never needs the full archive.
        const [unReadNotificationsRaw, viewedNotificationsRaw] = await Promise.all([
            Notification.find({
                'recipients': { $elemMatch: { objectId: employee._id, status: 'unread' } }
            })
            .populate('referenceId')
            .populate('recipients.objectId', 'firstName lastName')
            .populate('sentBy', 'firstName lastName avatar')
            .sort({ 'date': -1 })
            .limit(200),
            Notification.find({
                'recipients': { $elemMatch: { objectId: employee._id, status: 'read' } }
            })
            .populate('referenceId')
            .populate('recipients.objectId', 'firstName lastName')
            .populate('sentBy', 'firstName lastName avatar')
            .sort({ 'date': -1 })
            .limit(50),
        ]);
        
        // One batched populate for all Event notifications instead of one query round-trip per notification.
        const eventNotifications = [...unReadNotificationsRaw, ...viewedNotificationsRaw]
            .filter((n) => n.type === 'Event' && n.referenceId);
        if (eventNotifications.length) {
            await Notification.populate(eventNotifications, {
                path: 'referenceId',
                populate: { path: 'collectionId' },
            });
        }
        const unReadNotifications = unReadNotificationsRaw;
        const viewedNotifications = viewedNotificationsRaw;

        const filterByPrivileges = (notifications: any[]) => {
            return notifications.filter(notification => {
                const type = notification.type;
                
                switch (type) {
                    case 'Announcement':
                        return privileges.announcement?.viewReport !== 'none';
                    case 'AssignedJob':
                    case 'ReAssignedJob':
                    case 'FeedbackRequest':
                        return privileges.assignedJob?.viewReport !== 'none';
                    case 'DealSheet':
                        return dealSheetCan(privileges, "view");
                    case 'DealSheetResponse':
                    case 'Quotation':
                        return privileges.quotation?.viewReport !== 'none';
                    case 'Enquiry':
                    case 'EnquiryEstimationReady':
                    case 'EnquiryFollowUpOverdue':
                    case 'RfqFollowUpOverdue':
                        return privileges.enquiry?.viewReport !== 'none';
                    case 'JobAllocated':
                    case 'ProcurementTransferred':
                        return privileges.purchase?.viewReport !== 'none';
                    case 'MrRequest':
                    case 'TechnicalAssigned':
                        return privileges.technical?.viewReport !== 'none';
                    case 'MrApprovalRequest':
                        return privileges.technical?.canApproveMRRequests === true;
                    case 'MrRejected':
                        return privileges.technical?.viewReport !== 'none';
                    case 'MrApproved':
                        return privileges.purchase?.create === true;
                    case 'PurchaseApprovalRequest':
                        return privileges.purchase?.canApprovePR === true;
                    case 'PurchaseProcurementNotice':
                        return privileges.purchase?.viewReport !== 'none';
                    case 'PurchaseApproved':
                        return privileges.purchaseOrder?.canInitiateLPO === true;
                    case 'PurchaseRejected':
                        return privileges.purchase?.viewReport !== 'none';
                    case 'PurchaseRequestAllocated':
                        return privileges.purchase?.viewReport !== 'none' || privileges.purchase?.create === true;
                    case 'LpoApprovalRequest':
                        return privileges.purchaseOrder?.canApprovePOs === true;
                    case 'LpoApproved':
                    case 'LpoRejected':
                        return privileges.purchaseOrder?.viewReport !== 'none' || privileges.purchaseOrder?.canInitiateLPO === true;
                    case 'SupplierApprovalRequest':
                        return privileges.supplier?.canApproveSupplier === true;
                    case 'SupplierApproved':
                    case 'SupplierRejected':
                        return privileges.supplier?.viewReport !== 'none';
                    case 'ClaimApprovalRequest':
                        return privileges.claims?.canApprove === true;
                    case 'ClaimApproved':
                    case 'ClaimRejected':
                    case 'ClaimPaid':
                        return privileges.claims?.viewReport !== 'none';
                    case 'GrnItemsRejected':
                    case 'LpoPlaced':
                    case 'LpoDeliveryDue':
                        return !!privileges.grn?.viewReport && privileges.grn.viewReport !== 'none';
                    case 'LpoPlacedBilling':
                        return !!privileges.invoice?.viewReport && privileges.invoice.viewReport !== 'none';
                    case 'Event':
                        return true;
                    case 'BugReportAssigned':
                    case 'BugReportResolved':
                        return true;
                    default:
                        return false;
                }
            }).map(notification => {
                const routeInfo = getRoutePath(notification.type, notification.referenceId, notification.additionalData);
                return {
                    ...notification.toObject(),
                    routePath: routeInfo.routePath,
                    routeData: routeInfo.routeData
                };
            });
        };

        const filteredUnread = filterByPrivileges(unReadNotifications);
        const filteredViewed = filterByPrivileges(viewedNotifications);
        
        return res.status(200).json({ unviewed: filteredUnread, viewed: filteredViewed });
    } catch (error) {
        next(error);
    }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { notificationId, recipientId } = req.body;
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, "recipients.objectId": recipientId },
            { $set: { "recipients.$.status": "read" } },
            { new: true }
        );
        if (notification) {
            return res.status(200).json({ success: true, notification });
        }
        return res.status(404).json({ success: false, message: 'Notification not found' });
    } catch (error) {
        next(error);
    }
};

export const markAsReadByTypes = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { types, recipientId } = req.body;
        if (!Array.isArray(types) || types.length === 0 || !recipientId) {
            return res.status(400).json({ success: false, message: 'types[] and recipientId are required' });
        }
        const result = await Notification.updateMany(
            { type: { $in: types }, recipients: { $elemMatch: { objectId: recipientId, status: { $ne: "read" } } } },
            { $set: { "recipients.$.status": "read" } }
        );
        return res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        next(error);
    }
};

/** Hides a notification for the current user only; 'archived' rows are left out of both panel lists. */
export const dismissNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { notificationId } = req.body;
        const userData = await getEmployeeData(req.user);
        if (!notificationId || !userData?._id) {
            return res.status(400).json({ success: false, message: 'notificationId is required' });
        }
        const result = await Notification.updateOne(
            { _id: notificationId, "recipients.objectId": userData._id },
            { $set: { "recipients.$.status": "archived" } }
        );
        if (!result.matchedCount) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userData = await getEmployeeData(req.user);
        if (!userData?._id) {
            return res.status(400).json({ success: false, message: 'Employee not found' });
        }
        const result = await Notification.updateMany(
            { recipients: { $elemMatch: { objectId: userData._id, status: 'unread' } } },
            { $set: { "recipients.$[me].status": "read" } },
            { arrayFilters: [{ "me.objectId": userData._id, "me.status": "unread" }] }
        );
        return res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        next(error);
    }
};

export interface PrivilegeFilter {
    privilegeKey: keyof Privileges;
    privilegeValue?: string | boolean;
    checkFunction?: (privileges: Privileges, employeeId?: string) => boolean;
}

export const filterEmployeesByPrivilege = async (
    privilegeFilter: PrivilegeFilter,
    excludeEmployeeId?: string
): Promise<string[]> => {
    try {
        const allEmployees = await Employee.find({ isDeleted: { $ne: true }, isBlocked: { $ne: true } })
            .populate('category')
            .lean();

        const eligibleEmployeeIds: string[] = [];

        for (const employee of allEmployees) {
            const employeeId = employee._id.toString();
            
            if (excludeEmployeeId && employeeId === excludeEmployeeId) {
                continue;
            }

            const category = employee.category as any;
            if (!category || !category.privileges) {
                continue;
            }

            const privileges = category.privileges as Privileges;
            const privilegeValue = privileges[privilegeFilter.privilegeKey];

            if (privilegeFilter.checkFunction) {
                if (privilegeFilter.checkFunction(privileges, employeeId)) {
                    eligibleEmployeeIds.push(employeeId);
                }
            } else if (typeof privilegeValue === 'boolean') {
                if (privilegeValue === true) {
                    eligibleEmployeeIds.push(employeeId);
                }
            } else if (typeof privilegeValue === 'object' && privilegeValue !== null) {
                if ('viewReport' in privilegeValue) {
                    const viewReport = (privilegeValue as any).viewReport;
                    if (viewReport && viewReport !== 'none') {
                        eligibleEmployeeIds.push(employeeId);
                    }
                }
            }
        }

        return eligibleEmployeeIds;
    } catch (error) {
        console.error("Error filtering employees by privilege:", error);
        return [];
    }
};

export const getRoutePath = (notificationType: string, referenceId: any, additionalData?: any): { routePath: string; routeData?: any } => {
    switch (notificationType) {
        case 'Announcement':
            return { routePath: '/home/announcements' };
        
        case 'AssignedJob':
            return { routePath: '/presales' };
        case 'ReAssignedJob':
            return { routePath: '/presales/reassigned' };

        case 'FeedbackRequest':
        case 'Enquiry':
        case 'EnquiryEstimationReady':
        case 'EnquiryFollowUpOverdue':
            const enquiryId = additionalData?.enquiryId || referenceId?._id?.toString() || referenceId?.toString();
            return { 
                routePath: '/enquiry',
                routeData: { enquiryId }
            };
        
        case 'RfqFollowUpOverdue':
            return {
                routePath: '/enquiry',
                routeData: { enquiryId: additionalData?.enquiryId }
            };

        case 'DealSheet':
            return { routePath: '/deal-sheet/pendings' };
        case 'DealSheetResponse':
            return { routePath: '/quotations' };
        case 'Quotation':
            return {
                routePath: '/quotations/view',
                routeData: referenceId
            };

        case 'JobAllocated':
            return {
                routePath: '/purchase/create',
                routeData: { jobId: additionalData?.jobId || referenceId?._id?.toString() }
            };

        case 'ProcurementTransferred':
            return { routePath: '' };

        case 'MrRequest': {
            const technicalId = additionalData?.technicalId;
            if (technicalId) {
                return {
                    routePath: '/technical/project/material-request',
                    routeData: { technicalId }
                };
            }
            return { routePath: '/technical/project' };
        }

        case 'MrApprovalRequest': {
            const technicalId = additionalData?.technicalId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/technical/mr-approval-requests/view',
                routeData: { technicalId }
            };
        }

        case 'MrRejected': {
            const technicalId = additionalData?.technicalId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/technical/project/material-request',
                routeData: { technicalId }
            };
        }

        case 'MrApproved': {
            const jobId = additionalData?.jobId;
            return {
                routePath: '/purchase/create',
                routeData: { jobId }
            };
        }

        case 'TechnicalAssigned': {
            const projectId = additionalData?.projectId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/technical/project/edit',
                routeData: { projectId }
            };
        }

        case 'PurchaseApprovalRequest': {
            const purchaseId = additionalData?.purchaseId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/purchase/view-purchase',
                routeData: { purchaseId }
            };
        }

        case 'PurchaseProcurementNotice': {
            const purchaseId = additionalData?.purchaseId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/purchase/view-purchase',
                routeData: { purchaseId }
            };
        }

        case 'PurchaseApproved': {
            const purchaseId = additionalData?.purchaseId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/purchase/initiate-lpo',
                routeData: { purchaseId }
            };
        }

        case 'PurchaseRequestAllocated':
            // The job waits on the buyer's PR list (New tab); no purchase exists yet.
            return { routePath: '/purchase/pr' };

        case 'PurchaseRejected': {
            const purchaseId = additionalData?.purchaseId || referenceId?._id?.toString() || referenceId?.toString();
            return {
                routePath: '/purchase/view-purchase',
                routeData: { purchaseId }
            };
        }

        case 'LpoApprovalRequest':
            return { routePath: '/purchase-order/pending-approval' };

        case 'LpoApproved':
        case 'LpoRejected': {
            const purchaseId = additionalData?.purchaseId || referenceId?.purchaseId?.toString?.();
            return {
                routePath: '/purchase/initiate-lpo',
                routeData: { purchaseId }
            };
        }

        case 'SupplierApprovalRequest':
        case 'SupplierApproved':
        case 'SupplierRejected': {
            const supplierId = additionalData?.supplierId || referenceId?._id?.toString?.() || referenceId?.toString?.();
            return {
                routePath: '/suppliers',
                routeData: { supplierId }
            };
        }

        case 'ClaimApprovalRequest':
            return { routePath: '/claims/approval-requests' };

        case 'ClaimApproved':
        case 'ClaimRejected':
        case 'ClaimPaid': {
            const technicalId = additionalData?.technicalId || referenceId?.technicalId?.toString?.();
            if (technicalId) {
                return {
                    routePath: '/technical/project/claims',
                    routeData: { technicalId }
                };
            }
            return { routePath: '/claims/my-claims' };
        }
        
        case 'BugReportAssigned':
        case 'BugReportResolved':
            return { routePath: '/bug-reports' };

        // placing requires a future date, so a fresh LPO sits in Upcoming until its delivery day
        case 'LpoPlaced':
            return { routePath: '/grn/grn-list', routeData: { view: 'upcoming' } };
        case 'LpoDeliveryDue':
            return { routePath: '/grn/grn-list', routeData: { view: 'arriving' } };

        case 'LpoPlacedBilling':
            return { routePath: '/finance/vendor-bills', routeData: { view: 'upcoming' } };

        case 'GrnItemsRejected': {
            const grnId = additionalData?.grnId || referenceId?._id?.toString?.() || referenceId?.toString?.();
            return {
                routePath: '/grn/view-grn',
                routeData: { grnId }
            };
        }

        case 'DnItemsRejected': {
            const dnId = additionalData?.dnId || referenceId?._id?.toString?.() || referenceId?.toString?.();
            return {
                routePath: '/dispatch/delivery-note-register/view',
                routeData: { dnId }
            };
        }

        case 'InvoiceRejected': {
            const invoiceId = additionalData?.invoiceId || referenceId?._id?.toString?.() || referenceId?.toString?.();
            return {
                routePath: '/invoice/invoice-register/view',
                routeData: { invoiceId }
            };
        }

        case 'Event':
            if (referenceId?.collectionId) {
                const from = referenceId.from;
                if (from === 'Enquiry') {
                    return {
                        routePath: '/enquiry',
                        routeData: { enquiryId: referenceId.collectionId._id?.toString() || referenceId.collectionId.toString() }
                    };
                } else if (from === 'Quotation') {
                    return {
                        routePath: '/quotations/view',
                        routeData: referenceId.collectionId
                    };
                }
            }
            return { routePath: '/home' };
        
        default:
            return { routePath: '/home' };
    }
};

const PREFERENCE_CHANNELS = ['inapp', 'push', 'email'] as const;

/** The signed-in employee's notification preferences, plus the notification types they can switch off. */
export const getNotificationPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await getEmployeeData(req.user);
        const preference: any = await NotificationPreference.findOne({ employee: user._id }).lean();
        res.status(200).json({
            muted: { inapp: [], push: [], email: [], ...(preference?.muted || {}) },
            emailDigest: preference?.emailDigest || [],
            types: (Notification.schema.path('type') as any).options.enum,
            emailAvailable: isAppMailConfigured(),
        });
    } catch (error) {
        next(error);
    }
};

export const updateNotificationPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await getEmployeeData(req.user);
        const validTypes: string[] = (Notification.schema.path('type') as any).options.enum;
        const clean = (list: any) => Array.isArray(list) ? [...new Set<string>(list.filter((type: any) => validTypes.includes(type)))] : [];

        const muted: Record<string, string[]> = {};
        PREFERENCE_CHANNELS.forEach(channel => { muted[channel] = clean(req.body?.muted?.[channel]); });

        const preference = await NotificationPreference.findOneAndUpdate(
            { employee: user._id },
            { $set: { muted, emailDigest: clean(req.body?.emailDigest) } },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true, muted: preference.muted, emailDigest: preference.emailDigest });
    } catch (error) {
        next(error);
    }
};

export const createNotificationWithPrivileges = async (
    notificationData: {
        type: string;
        referenceModel: string;
        title: string;
        message: string;
        sentBy: string;
        referenceId: any;
        additionalData?: Record<string, unknown>;
    },
    privilegeFilter: PrivilegeFilter,
    socket?: Server,
    opts?: { excludeSentByFromRecipients?: boolean }
): Promise<any> => {
    try {
        const excludeActor = opts?.excludeSentByFromRecipients !== false;
        const eligibleEmployeeIds = await filterEmployeesByPrivilege(
            privilegeFilter,
            excludeActor ? notificationData.sentBy : undefined
        );

        if (eligibleEmployeeIds.length === 0) {
            return null;
        }

        const recipients = eligibleEmployeeIds.map(employeeId => ({
            objectId: new ObjectId(employeeId),
            status: 'unread'
        }));

        const notification = await createNotification({
            ...notificationData,
            recipients,
            date: new Date()
        });

        if (notification && socket) {
            notification.recipients.forEach((recipient: any) => {
                const recipientId = recipient.objectId._id?.toString() || recipient.objectId.toString();
                if (connectedSockets[recipientId]) {
                    socket.to(recipientId).emit("recieveNotifications", notification);
                }
            });
        }

        if (notification) {
            const routeInfo = getRoutePath(notification.type, notification.referenceId, notification.additionalData);
            void sendWebPushToEmployees(eligibleEmployeeIds, {
                title: notification.title,
                body: notification.message,
                data: { routePath: routeInfo.routePath, routeData: routeInfo.routeData },
            });
        }

        return notification;
    } catch (error) {
        console.error("Error creating notification with privileges:", error);
        throw error;
    }
};
