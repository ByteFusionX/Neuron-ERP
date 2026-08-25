import { Router } from "express";
import { createAnnouncement, deleteAnnouncement, getAnnouncement, markAsViewed } from "../controllers/announcement.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const annoRouter = Router()

annoRouter.use(requirePrivilege("announcement"));

annoRouter.post('/addAnnouncement', requirePrivilege("announcement", "create"), createAnnouncement)
annoRouter.get('/getAnnouncement',getAnnouncement)
annoRouter.post('/markAsViewed',markAsViewed)
annoRouter.delete('/deleteAnnouncement/:id', requirePrivilege("announcement", "deleteOrEdit"), deleteAnnouncement)


export default annoRouter
