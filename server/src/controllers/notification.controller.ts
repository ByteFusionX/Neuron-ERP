import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Notification from "../models/notification.model";
import Employee from "../models/employee.model";
import jwt from 'jsonwebtoken';

// This database is shared with other in-progress branches whose notifications
// can reference models (e.g. 'Supplier', 'Purchase') that don't exist here.
// Only populate referenceId when the model is actually registered, so those
// documents degrade to an unpopulated ObjectId instead of throwing.
const populateReference = async (notification: any) => {
    if (notification.referenceModel && mongoose.modelNames().includes(notification.referenceModel)) {
        await notification.populate('referenceId');
        if (notification.type === 'Event' && notification.referenceId) {
            await notification.populate({
                path: 'referenceId',
                populate: { path: 'collectionId' },
            });
        }
    }
    return notification;
};


interface NotificationData {
    type: string;
    referenceModel: string;
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
        const saved = await Notification.findOne({
            '_id': latestNotification._id
        })
        .populate('recipients.objectId')
        .populate('sentBy');

        return saved ? await populateReference(saved) : saved;

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

        const unReadNotificationsRaw = await Notification.find({
            'recipients': { $elemMatch: { objectId: employee._id, status: 'unread' } }
        })
        .populate('recipients.objectId')
        .populate('sentBy')
        .sort({ 'date': -1 });
        const unReadNotifications = await Promise.all(unReadNotificationsRaw.map(populateReference));

        const viewedNotificationsRaw = await Notification.find({
            'recipients': { $elemMatch: { objectId: employee._id, status: 'read' } }
        })
        .populate('recipients.objectId')
        .populate('sentBy')
        .sort({ 'date': -1 });
        const viewedNotifications = await Promise.all(viewedNotificationsRaw.map(populateReference));

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
