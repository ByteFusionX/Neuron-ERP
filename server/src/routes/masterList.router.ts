import { Router } from "express";
import { createMasterListItem, deleteMasterListItem, getMasterListItems, updateMasterListItem } from "../controllers/masterList.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const manageMasterData = requirePrivilege("portalManagement", "masterDataEdit");
const masterListRouter = Router()

masterListRouter.get('/:list', getMasterListItems)
masterListRouter.post('/:list', manageMasterData, createMasterListItem)
masterListRouter.put('/:list/:id', manageMasterData, updateMasterListItem)
masterListRouter.delete('/:list/:id', manageMasterData, deleteMasterListItem)

export default masterListRouter
