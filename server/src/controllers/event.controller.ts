import { NextFunction, Request, Response } from "express"
import { uploadFileToAws, deleteFileFromAws } from "../common/aws-connect";
import Event from '../models/events.model';
import Enquiry from '../models/enquiry.model';
import Quotation from '../models/quotation.model'
import { createNotification } from "./notification.controller";
import { Server } from "socket.io";
import Notification from "../models/notification.model";
import { getEmployeeData } from "../common/utils/util";
import { ObjectId } from "mongodb";


export const newEvent = async (req: any, res: Response, next: NextFunction) => {
    try {
        const eventData = JSON.parse(req.body.eventData)
        const userToken = req.user;
        
        const createdBy = await getEmployeeData(userToken)
        eventData.createdBy = createdBy._id
        
        if (!eventData.date) {
            return res.status(400).json({ message: 'Date is required' })
        }
        
        eventData.date = new Date(eventData.date)
        
        if (isNaN(eventData.date.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' })
        }
        
        if (eventData.collectionId) {
            eventData.collectionId = new ObjectId(eventData.collectionId)
        }
        
        if (!eventData.eventFiles) {
            eventData.eventFiles = []
        }
        
        let eventFiles = []
        if (req.files?.eventFile) {
            eventFiles = await Promise.all(req.files.eventFile.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path, file.mimetype);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        if (eventFiles.length) {
            eventData.eventFiles.push(...eventFiles);
        }

        eventData.eventFiles = eventData.eventFiles.filter(
            (file) => Object.keys(file).length > 0
        );

        const newEvent = new Event(eventData)
        await newEvent.save();
        if(newEvent.employee){
            const saveNewNotification = await createNotification({
                type:'Event',
                referenceModel: 'Event',
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
            const populatedEvent = await Event.findById(newEvent._id)
                .populate('employee')
                .populate('createdBy')
                .exec();
            if (populatedEvent) {
                return res.status(200).json({ event: populatedEvent, message: 'Event created successfully' })
            }
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
        .populate('employee')
        .populate('createdBy')
        .sort({ date: 1 })
        .exec();
        return res.status(200).json(events || []);
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

export const deleteEventFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId, fileName } = req.params
        await deleteFileFromAws(fileName)
        const updatedEvent = await Event.findByIdAndUpdate(
            eventId,
            { $pull: { eventFiles: { fileName: fileName } } },
            { new: true }
        )
        if (updatedEvent) {
            return res.status(200).json({ success: true, event: updatedEvent })
        }
        return res.status(404).json({ success: false, message: 'Event not found' })
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