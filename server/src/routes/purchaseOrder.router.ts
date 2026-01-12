import { Router } from "express";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  reissuePurchaseOrder,
  getPurchaseOrderById,
  getAllPurchaseOrders,
  getPurchaseOrderByPurchaseId,
  generateLpoNo,
  updatePurchaseOrderStatus,
  updateSupplierInvoices,
  getSuppliersForPurchaseRequest,
  getItemsForPurchaseRequest,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  revokePurchaseOrder
} from "../controllers/purchaseOrder.controller"; 
const upload = require("../common/multer.storage")

const router = Router();

router.post("/", createPurchaseOrder);
router.put("/:id", updatePurchaseOrder);
router.put("/:id/reissue", reissuePurchaseOrder);
router.patch("/:id/status", updatePurchaseOrderStatus);
router.patch("/:id/approve", approvePurchaseOrder);
router.patch("/:id/reject", rejectPurchaseOrder);
router.patch("/:id/supplier-invoices",upload.array('files'), updateSupplierInvoices);
router.get("/generate-po-no", generateLpoNo);
router.get("/suppliers/:purchaseId", getSuppliersForPurchaseRequest);
router.get("/items/:purchaseId/:supplierId", getItemsForPurchaseRequest);
router.delete("/:id/revoke", revokePurchaseOrder);
router.get("/:id", getPurchaseOrderById);
router.get("purchase/:id", getPurchaseOrderByPurchaseId);
router.get("/", getAllPurchaseOrders);

export default router;
