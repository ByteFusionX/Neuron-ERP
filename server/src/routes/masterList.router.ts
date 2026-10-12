import { Router } from "express";
import { createMasterListItem, deleteMasterListItem, getMasterListItems, updateMasterListItem } from "../controllers/masterList.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const manageMasterData = requirePrivilege("portalManagement", "masterDataEdit");
const masterListRouter = Router()

// Brands are only used by the product form, so reading/adding one needs the same access as products
// (sales, presale and procurement all create products from their own flows).
const brandAccess = requirePrivilege("inventory.products");
const gateBrand = (req: any, res: any, next: any) => (req.params.list === 'brand' ? brandAccess(req, res, next) : next());

masterListRouter.get('/:list', gateBrand, getMasterListItems)
// Anyone can add an option from an item dropdown; editing, hiding and deleting need the settings privilege.
masterListRouter.post('/:list', gateBrand, createMasterListItem)
masterListRouter.put('/:list/:id', manageMasterData, updateMasterListItem)
masterListRouter.delete('/:list/:id', manageMasterData, deleteMasterListItem)

export default masterListRouter
