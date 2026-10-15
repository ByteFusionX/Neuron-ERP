import { Router } from "express";
import {
    getStockOverview,
    getStockLedger,
    getStockAvailability,
    adjustStock,
    releaseQuarantine,
    getReturnSource,
    createStockReturn,
    getStockReservations,
    releaseStockReservation
} from "../controllers/stock.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const stockRouter = Router();

// Read-only availability is for every module (sales, operations, procurement), so it has no inventory gate.
stockRouter.get('/availability', getStockAvailability);

stockRouter.use(requirePrivilege("inventory.stockEntries"));

stockRouter.get('/overview', getStockOverview);
stockRouter.get('/ledger', getStockLedger);
stockRouter.get('/reservations', getStockReservations);
stockRouter.get('/returns/:kind/:id', getReturnSource);
stockRouter.post('/adjust', adjustStock);
stockRouter.post('/quarantine', releaseQuarantine);
stockRouter.post('/returns', createStockReturn);
stockRouter.patch('/reservations/:id/release', releaseStockReservation);

export default stockRouter;
