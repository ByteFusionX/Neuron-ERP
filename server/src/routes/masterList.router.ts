import { Router } from "express";
import { createMasterListItem, deleteMasterListItem, getMasterListItems, updateMasterListItem } from "../controllers/masterList.controller";

const masterListRouter = Router()

masterListRouter.get('/:list', getMasterListItems)
masterListRouter.post('/:list', createMasterListItem)
masterListRouter.put('/:list/:id', updateMasterListItem)
masterListRouter.delete('/:list/:id', deleteMasterListItem)

export default masterListRouter
