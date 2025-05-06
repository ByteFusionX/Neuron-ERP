import { Router } from "express";
import { fetchTrash, restoreTrash } from "../controllers/trash.controller";
const trashRouter = Router()

trashRouter.get('/', fetchTrash)
trashRouter.post('/restore', restoreTrash)

export default trashRouter;