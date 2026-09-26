import { Router } from "express";
import { getNumberingSeries, setNextNumber } from "../controllers/numbering.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const numberingRouter = Router()

numberingRouter.get('/', requirePrivilege("portalManagement", "numbering"), getNumberingSeries)
numberingRouter.put('/:key', requirePrivilege("portalManagement", "numberingEdit"), setNextNumber)

export default numberingRouter
