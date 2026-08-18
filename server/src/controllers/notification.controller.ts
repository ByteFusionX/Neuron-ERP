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

        const unReadNotificationsRaw = await Notification.find({
            'recipients': { $elemMatch: { objectId: employee._id, status: 'unread' } }
        })
        .populate('referenceId')
        .populate('recipients.objectId')
        .populate('sentBy')
        .sort({ 'date': -1 }); 
        
        const unReadNotifications = await Promise.all(
            unReadNotificationsRaw.map(async (notification) => {
                if (notification.type === 'Event' && notification.referenceId) {
                    await notification.populate({
                        path: 'referenceId',
                        populate: {
                            path: 'collectionId',
                        },
                    });
                }
                return notification;
            })
        );
        
        const viewedNotificationsRaw = await Notification.find({
            'recipients': { $elemMatch: { objectId: employee._id, status: 'read' } }
        })
        .populate('referenceId')
        .populate('recipients.objectId')
        .populate('sentBy')
        .sort({ 'date': -1 });
        
        const viewedNotifications = await Promise.all(
            viewedNotificationsRaw.map(async (notification) => {
                if (notification.type === 'Event' && notification.referenceId) {
                    await notification.populate({
                        path: 'referenceId',
                        populate: {
                            path: 'collectionId',
                        },
                    });
                }
                return notification;
            })
        );

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
                        return privileges.dealSheet === true;
                    case 'DealSheetResponse':
                    case 'Quotation':
                        return privileges.quotation?.viewReport !== 'none';
                    case 'Enquiry':
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
                        return privileges.claims?.viewReport !== 'none';
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

interface PrivilegeFilter {
    privilegeKey: keyof Privileges;
    privilegeValue?: string | boolean;
    checkFunction?: (privileges: Privileges, employeeId?: string) => boolean;
}

const filterEmployeesByPrivilege = async (
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
            return { routePath: '/assigned-jobs' };
        case 'ReAssignedJob':
            return { routePath: '/assigned-jobs/reassigned' };

        case 'FeedbackRequest':
        case 'Enquiry':
            const enquiryId = additionalData?.enquiryId || referenceId?._id?.toString() || referenceId?.toString();
            return { 
                routePath: '/enquiry',
                routeData: { enquiryId }
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
        case 'ClaimRejected': {
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
