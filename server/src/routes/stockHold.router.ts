import { Router } from "express";
import {
  createStockHold,
  getStockHolds,
  getStockHoldById,
  resolveStockHold,
  disputeStockHold
} from "../controllers/stockHold.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const router = Router();

router.use(requirePrivilege("stockHold"));

router.post("/", requirePrivilege("stockHold", "canInitiateHold"), createStockHold);
router.get("/", getStockHolds);
router.get("/:id", getStockHoldById);
router.patch("/:id/resolve", requirePrivilege("stockHold", "canInitiateHold"), resolveStockHold);
router.patch("/:id/dispute", requirePrivilege("stockHold", "canInitiateHold"), disputeStockHold);

export default router;
