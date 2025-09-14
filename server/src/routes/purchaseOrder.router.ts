import { Router } from "express";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  getPurchaseOrderById,
  getAllPurchaseOrders,
  getPurchaseOrderByPurchaseId,
} from "../controllers/purchaseOrder.controller"; 

const router = Router();

router.post("/", createPurchaseOrder);
router.put("/:id", updatePurchaseOrder);
router.get("/:id", getPurchaseOrderById);
router.get("purchase/:id", getPurchaseOrderByPurchaseId);
router.get("/", getAllPurchaseOrders);

export default router;
