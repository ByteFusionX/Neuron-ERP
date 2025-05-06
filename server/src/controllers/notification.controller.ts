import { Request, Response, NextFunction } from "express";
import Notification from "../models/notification.model";
import Employee from "../models/employee.model";
import jwt from 'jsonwebtoken';


interface NotificationData {
    type: string;
    title: string;
    message: string;
    recipients: { objectId: string; status: string }[];
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
        return await Notification.findOne({
            '_id': latestNotification._id
        })
        .populate('referenceId')
        .populate('recipients.objectId')
        .populate('sentBy')
        .populate({
            path: 'referenceId',
            populate: {
              path: 'collectionId',
            },
        });

    } catch (error) {
        console.error("Error creating notification:", error);
        throw error; // Re-throw the error to be handled by the caller
    }
};

export const getAllNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.params.token
        const jwtPayload = jwt.verify(token, process.env.JWT_SECRET)
        const userId = (<any>jwtPayload).id
        const employee = await Employee.findById(userId);

        const unReadNotifications = await Notification.find({
            'recipients': { $elemMatch: { objectId: employee._id, status: 'unread' } }
        })
        .populate('referenceId')
        .populate('recipients.objectId')
        .populate('sentBy')
        .populate({
            path: 'referenceId',
            populate: {
                path: 'collectionId',
            },
        })
        .sort({ 'date': -1 }); 
        
        const viewedNotifications = await Notification.find({
            'recipients': { $elemMatch: { objectId: employee._id, status: 'read' } }
        })
        .populate('referenceId')
        .populate('recipients.objectId')
        .populate('sentBy')
        .populate({
            path: 'referenceId',
            populate: {
                path: 'collectionId',
            },
        })
        .sort({ 'date': -1 });
        

        
        
        return res.status(200).json({unviewed:unReadNotifications,viewed:viewedNotifications});
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
