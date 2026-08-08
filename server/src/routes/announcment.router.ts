import { Router } from "express";
import { createAnnouncement, deleteAnnouncement, getAnnouncement, markAsViewed } from "../controllers/announcement.controller";
import { authorize } from "../common/middlewares/authorize.middleware";
const annoRouter = Router()

annoRouter.post('/addAnnouncement', authorize('announcement', 'create'), createAnnouncement)
annoRouter.get('/getAnnouncement',getAnnouncement)
annoRouter.post('/markAsViewed',markAsViewed)
annoRouter.delete('/deleteAnnouncement/:id', authorize('announcement', 'deleteOrEdit'), deleteAnnouncement)


export default annoRouter
