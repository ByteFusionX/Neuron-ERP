import { Router } from "express";
import { createAnnouncement, deleteAnnouncement, getAnnouncement, markAsViewed } from "../controllers/announcement.controller";
const annoRouter = Router()

annoRouter.post('/addAnnouncement',createAnnouncement)
annoRouter.get('/getAnnouncement',getAnnouncement)
annoRouter.post('/markAsViewed',markAsViewed)
annoRouter.delete('/deleteAnnouncement/:id',deleteAnnouncement)


export default annoRouter
