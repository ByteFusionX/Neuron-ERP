import { Router } from "express";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  getPurchaseOrderById,
  getAllPurchaseOrders,
  getPurchaseOrderByPurchaseId,
  generateLpoNo,
  updatePurchaseOrderStatus,
  updateSupplierInvoices
} from "../controllers/purchaseOrder.controller"; 

const router = Router();

router.post("/", createPurchaseOrder);
router.put("/:id", updatePurchaseOrder);
router.patch("/:id/status", updatePurchaseOrderStatus);
router.patch("/:id/supplier-invoices", updateSupplierInvoices);
router.get("/generate-po-no", generateLpoNo);
router.get("/:id", getPurchaseOrderById);
router.get("purchase/:id", getPurchaseOrderByPurchaseId);
router.get("/", getAllPurchaseOrders);

export default router;
