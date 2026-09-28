import { Router } from "express";
import {
    createStockEntry,
    getStockOverview,
    getStockEntries,
    getStockEntryById,
    updateStockEntry,
    deleteStockEntry,
    getAvailableQuantity,
    createStockBlock,
    getStockBlocks,
    releaseFromQuarantine,
    getInventoryPlanning,
    getStockMovements,
    getStockReservations,
    createStockReservation,
    releaseStockReservation
} from "../controllers/stockEntry.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const stockEntryRouter = Router();

stockEntryRouter.use(requirePrivilege("inventory.stockEntries"));

stockEntryRouter.get('/overview', getStockOverview);
stockEntryRouter.get('/planning', getInventoryPlanning);
stockEntryRouter.get('/movements', getStockMovements);
stockEntryRouter.get('/reservations', getStockReservations);
stockEntryRouter.get('/available-quantity', getAvailableQuantity);
stockEntryRouter.get('/blocks', getStockBlocks);
stockEntryRouter.get('/', getStockEntries);
stockEntryRouter.get('/:id', getStockEntryById);
stockEntryRouter.post('/', createStockEntry);
stockEntryRouter.post('/block', createStockBlock);
stockEntryRouter.post('/reservations', createStockReservation);
stockEntryRouter.patch('/reservations/:id/release', releaseStockReservation);
stockEntryRouter.patch('/:id/release-quarantine', releaseFromQuarantine);
stockEntryRouter.patch('/:id', updateStockEntry);
stockEntryRouter.delete('/:id', deleteStockEntry);

export default stockEntryRouter;



























































