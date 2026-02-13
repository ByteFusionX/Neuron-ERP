import { Request, Response, NextFunction } from "express";
import Notification from "../models/notification.model";
import Employee from "../models/employee.model";
import Category, { Privileges } from "../models/category.model";
import jwt from 'jsonwebtoken';
import { getEmployeeData } from "../common/utils/util";
import { Server } from "socket.io";
import { connectedSockets } from "../services/socket-io.service";
import { ObjectId } from "mongodb";


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
                    case 'Quotation':
                        return privileges.quotation?.viewReport !== 'none';
                    case 'Enquiry':
                        return privileges.enquiry?.viewReport !== 'none';
                    case 'Event':
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
        case 'ReAssignedJob':
            return {
                routePath: '/assigned-jobs/reassigned'
            };

        case 'FeedbackRequest':
        case 'Enquiry':
            const enquiryId = additionalData?.enquiryId || referenceId?._id?.toString() || referenceId?.toString();
            return { 
                routePath: '/enquiry',
                routeData: { enquiryId }
            };
        
        case 'DealSheet':
        case 'Quotation':
            return {
                routePath: '/quotations/view',
                routeData: referenceId
            };
        
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
    socket?: Server
): Promise<any> => {
    try {
        const eligibleEmployeeIds = await filterEmployeesByPrivilege(
            privilegeFilter,
            notificationData.sentBy
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

        return notification;
    } catch (error) {
        console.error("Error creating notification with privileges:", error);
        throw error;
    }
};
