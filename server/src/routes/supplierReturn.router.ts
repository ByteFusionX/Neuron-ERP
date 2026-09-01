import { Router } from "express";
import {
  createSupplierReturn,
  getSupplierReturns,
  getSupplierReturnById,
  resolveSupplierReturn,
  disputeSupplierReturn
} from "../controllers/supplierReturn.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const router = Router();

router.use(requirePrivilege("supplierReturn"));

router.post("/", requirePrivilege("supplierReturn", "canInitiateReturn"), createSupplierReturn);
router.get("/", getSupplierReturns);
router.get("/:id", getSupplierReturnById);
router.patch("/:id/resolve", requirePrivilege("supplierReturn", "canInitiateReturn"), resolveSupplierReturn);
router.patch("/:id/dispute", requirePrivilege("supplierReturn", "canInitiateReturn"), disputeSupplierReturn);

export default router;
