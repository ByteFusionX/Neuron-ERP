import { Router } from "express";
import {
    getStockOverview,
    getStockLedger,
    getStockAvailability,
    adjustStock,
    releaseQuarantine,
    getReturnSource,
    createStockReturn,
    resolveSupplierReturn,
    getStockReservations,
    getStockItemDetails,
    releaseStockReservation
} from "../controllers/stock.controller";
import { requirePrivilege, requireAnyPrivilege } from "../common/middlewares/privilege.middleware";

const stockRouter = Router();

// Read-only availability is for every module (sales, operations, procurement), so it has no inventory gate.
stockRouter.get('/availability', getStockAvailability);

// Balance and movements have their own view privileges; roles saved before the split only have stockEntries.
const stockView = (sub: "stockBalance" | "stockMovements") => (req: any, res: any, next: any) =>
  requirePrivilege(req.employee?.category?.privileges?.inventory?.[sub] !== undefined ? `inventory.${sub}` : "inventory.stockEntries")(req, res, next);

stockRouter.use(requireAnyPrivilege("inventory.stockEntries", "inventory.stockBalance", "inventory.stockMovements"));

stockRouter.get('/overview', stockView("stockBalance"), getStockOverview);
stockRouter.get('/ledger', stockView("stockMovements"), getStockLedger);
stockRouter.get('/reservations', getStockReservations);
stockRouter.get('/item-details', getStockItemDetails);
stockRouter.get('/returns/:kind/:id', getReturnSource);
stockRouter.post('/adjust', adjustStock);
stockRouter.post('/quarantine', releaseQuarantine);
stockRouter.post('/returns', createStockReturn);
stockRouter.patch('/returns/supplier/:id/resolve', resolveSupplierReturn);
stockRouter.patch('/reservations/:id/release', releaseStockReservation);

export default stockRouter;
