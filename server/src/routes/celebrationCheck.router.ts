import { Router } from "express";
import { celebrationCheck } from "../controllers/celebrationCheck.controller";
const celebRouter = Router()

celebRouter.get('/',celebrationCheck)


export default celebRouter