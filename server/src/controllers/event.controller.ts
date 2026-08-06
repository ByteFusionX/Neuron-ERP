import { NextFunction, Request, Response } from "express"
import { uploadFileToAws } from "../common/aws-connect";
import Event from '../models/events.model';
import Enquiry from '../models/enquiry.model';
import Quotation from '../models/quotation.model'
import { createNotification } from "./notification.controller";
import { Server } from "socket.io";
import Notification from "../models/notification.model";


export const newEvent = async (req: any, res: Response, next: NextFunction) => {
    try {
        const eventData = JSON.parse(req.body.eventData)
        let eventFiles = []
        if (req.files?.eventFile) {
            eventFiles = await Promise.all(req.files.eventFile.map(async (file: any) => {
                // await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        if (eventFiles.length) {
            eventFiles.forEach((file) => eventData.eventFiles.push(file));
        }

        eventData.eventFiles = eventData.eventFiles.filter(
            (file) => Object.keys(file).length > 0
        );

        const newEvent = new Event(eventData)
        await newEvent.save();
        if(newEvent.employee){
            const saveNewNotification = await createNotification({
                type:'Event',
                referenceModel:'Event',
                title:`A ${newEvent.event} Assigned to You`,
                message:`${newEvent.summary}`,
                date:new Date(),
                sentBy:newEvent.createdBy,
                recipients:[{objectId:newEvent.employee,status:'unread'}],
                referenceId:newEvent._id,
                additionalData:{}
            })

            if (saveNewNotification) {
                const socket = req.app.get('io') as Server;
                saveNewNotification.recipients.forEach((recipient)=>{        
                    socket.to(recipient.objectId._id.toString()).emit("recieveNotifications", saveNewNotification)
                })
            }
        }
        switch (eventData.from) {
            case 'Enquiry':
                await Enquiry.findOneAndUpdate({ _id: eventData.collectionId }, { $set: { eventId: newEvent._id } })
                break;
            case 'Quotation':
                await Quotation.findOneAndUpdate({ _id: eventData.collectionId }, { $set: { eventId: newEvent._id } });
            default:
                break;
        }
        if (newEvent) {
            return res.status(200).json({ event: newEvent, message: 'Event created successfully' })
        }
        return res.status(500).json({ message: 'Event failed to create' })
    } catch (error) {
        next(error)
    }
}

export const fechEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const collectionId = req.params.collectionId;
        const events = await Event.find({ collectionId: collectionId })
        .populate('employee').populate('createdBy').sort({ date: 1 }).exec();
        if (events.length > 0) {
            return res.status(200).json(events);
        }
        return res.status(200).json()
    } catch (error) {
        next(error)
    }
}

export const eventStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, eventId } = req.body
        const eventUpdate = await Event.findOneAndUpdate({ _id: eventId }, { $set: { status: status } })
        return res.status(200).json({ success: true })
    } catch (error) {
        next(error)
    }
}

export const deleteEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const eventId = req.params.eventId
        const eventDelete = await Event.findOneAndDelete({ _id: eventId })
        const eventNotificationDelete = await Notification.findOneAndDelete({ referenceId: eventId })

        if(eventDelete && eventNotificationDelete){
            return res.status(200).json({ success: true })
        }
    } catch (error) {
        next(error)
    }
}