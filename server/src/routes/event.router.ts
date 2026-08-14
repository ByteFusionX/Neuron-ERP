import { Router } from "express";
import { deleteEvent, deleteEventFile, eventStatus, fechEvents, newEvent } from "../controllers/event.controller";
const eventRouter = Router()
const upload = require("../common/multer.storage")

eventRouter.post('/new-event', upload.fields([{ name: 'eventFile' }]), newEvent);
eventRouter.get('/fetch/:collectionId', fechEvents);
eventRouter.patch('/status', eventStatus)
eventRouter.delete('/delete/:eventId', deleteEvent)
eventRouter.delete('/:eventId/file/:fileName', deleteEventFile)

export default eventRouter;