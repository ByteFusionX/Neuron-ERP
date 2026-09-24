import { Router } from "express";
import { getNumberingSeries, setNextNumber } from "../controllers/numbering.controller";

const numberingRouter = Router()

numberingRouter.get('/', getNumberingSeries)
numberingRouter.put('/:key', setNextNumber)

export default numberingRouter
