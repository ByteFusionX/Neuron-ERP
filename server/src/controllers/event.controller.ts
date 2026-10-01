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
import Employee from "../models/employee.model";
import { createCalendarService, createAppOnlyCalendarService, isAppOnlyCalendarEnabled } from "../services/calendar.service";

// Azure AD access token (audience api://<client-id>/access_as_user) sent by the client
// in a dedicated header, because the Authorization header carries the ERP JWT.
const getAzureToken = (req: Request): string | undefined => {
    const header = req.headers['x-azure-token'];
    return Array.isArray(header) ? header[0] : header;
}

// Signed-in users go through on-behalf-of; with no Azure token, fall back to app-only
// for the event owner's mailbox when that is enabled.
const getCalendar = async (req: Request, ownerId: any) => {
    const azureToken = getAzureToken(req)
    if (azureToken) {
        return createCalendarService(azureToken)
    }
    if (isAppOnlyCalendarEnabled() && ownerId) {
        const owner: any = await Employee.findById(ownerId).select('email')
        if (owner?.email) {
            return createAppOnlyCalendarService(owner.email)
        }
    }
    throw new Error('No Azure token and no app-only fallback available')
}

const DEEP_LINK_PATHS: Record<string, string> = {
    Enquiry: 'enquiry',
    Quotation: 'quotations',
    Customer: 'customers',
};

const buildOutlookOptions = (event: any) => {
    const start = new Date(event.date);
    // Graph needs an end; fall back to one hour after the start when none was given.
    const end = event.endDate ? new Date(event.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
    const origin = (process.env.ORIGIN1 ?? 'http://localhost:4200').split(',')[0].trim();
    const path = DEEP_LINK_PATHS[event.from];
    const link = path ? `${origin}/${path}` : origin;
    return {
        subject: `${event.event}: ${event.summary}`.slice(0, 250),
        start,
        end,
        body: `<p>${event.summary}</p><p><a href="${link}">View in ERP</a></p>`,
        location: event.location,
        attendees: event.attendees,
        onlineMeeting: event.onlineMeeting,
    };
}


export const newEvent = async (req: any, res: Response, next: NextFunction) => {
    try {
        const eventData = JSON.parse(req.body.eventData)
        const userToken = req.user;
        
        const createdBy = await getEmployeeData(userToken)
        eventData.createdBy = createdBy._id
        // The form no longer asks for an assignee; the person logging the event owns it.
        eventData.employee = eventData.employee || createdBy._id
        
        if (!eventData.date) {
            return res.status(400).json({ message: 'Date is required' })
        }
        
        eventData.date = new Date(eventData.date)

        if (isNaN(eventData.date.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' })
        }

        if (eventData.endDate) {
            eventData.endDate = new Date(eventData.endDate)
            if (isNaN(eventData.endDate.getTime())) {
                return res.status(400).json({ message: 'Invalid end date format' })
            }
            if (eventData.endDate <= eventData.date) {
                return res.status(400).json({ message: 'End date must be after the start date' })
            }
        } else {
            delete eventData.endDate
        }

        // Sync state is system-managed; never trust it from the client.
        delete eventData.outlookEventId
        delete eventData.outlookSyncStatus
        
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
        // One-way push to Outlook. A Graph failure must never fail the ERP event itself.
        let outlookWarning: string | undefined
        if (newEvent.syncToOutlook) {
            try {
                const calendar = await getCalendar(req, newEvent.createdBy)
                newEvent.outlookEventId = await calendar.createEvent(buildOutlookOptions(newEvent))
                newEvent.outlookSyncStatus = 'synced'
            } catch (syncError) {
                console.error('Outlook calendar sync failed:', syncError)
                newEvent.outlookSyncStatus = 'failed'
                outlookWarning = 'Event saved, but it could not be added to your Outlook calendar.'
            }
            await newEvent.save()
        }
        if (newEvent) {
            const populatedEvent = await Event.findById(newEvent._id)
                .populate('employee')
                .populate('createdBy')
                .exec();
            if (populatedEvent) {
                return res.status(200).json({ event: populatedEvent, message: 'Event created successfully', outlookWarning })
            }
            return res.status(200).json({ event: newEvent, message: 'Event created successfully', outlookWarning })
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
        const eventUpdate: any = await Event.findOneAndUpdate({ _id: eventId }, { $set: { status: status } })
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
        const eventDelete: any = await Event.findOneAndDelete({ _id: eventId })

        // Best-effort cancel of the Outlook copy; the ERP delete already happened.
        if (eventDelete?.outlookEventId) {
            try {
                const calendar = await getCalendar(req, eventDelete.createdBy)
                await calendar.deleteEvent(eventDelete.outlookEventId)
            } catch (syncError) {
                console.error('Outlook calendar delete failed:', syncError)
            }
        }
        const eventNotificationDelete = await Notification.findOneAndDelete({ referenceId: eventId })

        if(eventDelete && eventNotificationDelete){
            return res.status(200).json({ success: true })
        }
    } catch (error) {
        next(error)
    }
}

// Edit an event and mirror the change to Outlook (PATCH) when it was synced.
export const updateEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId } = req.params
        const { event, summary, location, attendees, onlineMeeting } = req.body
        const date = req.body.date ? new Date(req.body.date) : undefined
        const endDate = req.body.endDate ? new Date(req.body.endDate) : undefined

        if ((date && isNaN(date.getTime())) || (endDate && isNaN(endDate.getTime()))) {
            return res.status(400).json({ message: 'Invalid date format' })
        }

        const existing: any = await Event.findById(eventId)
        if (!existing) {
            return res.status(404).json({ message: 'Event not found' })
        }
        const start = date ?? existing.date
        const end = endDate ?? existing.endDate
        if (end && end <= start) {
            return res.status(400).json({ message: 'End date must be after the start date' })
        }

        const changes: any = { event, summary, location, attendees, onlineMeeting, date, endDate }
        Object.keys(changes).forEach((key) => changes[key] === undefined && delete changes[key])
        Object.assign(existing, changes)

        let outlookWarning: string | undefined
        if (existing.outlookEventId) {
            try {
                const calendar = await getCalendar(req, existing.createdBy)
                await calendar.updateEvent(existing.outlookEventId, buildOutlookOptions(existing))
                existing.outlookSyncStatus = 'synced'
            } catch (syncError) {
                console.error('Outlook calendar update failed:', syncError)
                existing.outlookSyncStatus = 'failed'
                outlookWarning = 'Event updated, but the Outlook calendar could not be updated.'
            }
        }
        await existing.save()
        return res.status(200).json({ event: existing, message: 'Event updated successfully', outlookWarning })
    } catch (error) {
        next(error)
    }
}
