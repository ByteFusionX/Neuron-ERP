import { Router } from "express";
import { acknowledgeAnnouncement, createAnnouncement, deleteAnnouncement, getAnnouncement, getAnnouncementById, markAllAsViewed, markAsViewed, togglePin } from "../controllers/announcement.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const annoRouter = Router()

annoRouter.use(requirePrivilege("announcement"));

// Edits share this route; the controller additionally requires "deleteOrEdit" when isEdit is set
annoRouter.post('/addAnnouncement', requirePrivilege("announcement", "create"), createAnnouncement)
annoRouter.get('/getAnnouncement',getAnnouncement)
annoRouter.get('/getAnnouncement/:id', getAnnouncementById)
annoRouter.post('/markAsViewed',markAsViewed)
annoRouter.post('/markAllAsViewed', markAllAsViewed)
annoRouter.post('/acknowledge/:id', acknowledgeAnnouncement)
annoRouter.patch('/togglePin/:id', requirePrivilege("announcement", "deleteOrEdit"), togglePin)
annoRouter.delete('/deleteAnnouncement/:id', requirePrivilege("announcement", "deleteOrEdit"), deleteAnnouncement)


export default annoRouter
