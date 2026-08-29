import { Router } from "express";
import {
    createStockEntry,
    getStockEntries,
    getStockEntryById,
    updateStockEntry,
    deleteStockEntry,
    generateGRN,
    getAvailableQuantity,
    createStockBlock,
    getStockBlocks,
    releaseFromQuarantine
} from "../controllers/stockEntry.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const stockEntryRouter = Router();

stockEntryRouter.use(requirePrivilege("inventory.stockEntries"));

stockEntryRouter.get('/generate-grn', generateGRN);
stockEntryRouter.get('/available-quantity', getAvailableQuantity);
stockEntryRouter.get('/blocks', getStockBlocks);
stockEntryRouter.get('/', getStockEntries);
stockEntryRouter.get('/:id', getStockEntryById);
stockEntryRouter.post('/', createStockEntry);
stockEntryRouter.post('/block', createStockBlock);
stockEntryRouter.patch('/:id/release-quarantine', releaseFromQuarantine);
stockEntryRouter.patch('/:id', updateStockEntry);
stockEntryRouter.delete('/:id', deleteStockEntry);

export default stockEntryRouter;



























































