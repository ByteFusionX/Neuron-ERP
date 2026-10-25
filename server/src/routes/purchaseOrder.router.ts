import { Router } from "express";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  reissuePurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrderByPoNo,
  getAllPurchaseOrders,
  getPurchaseOrderByPurchaseId,
  generateLpoNo,
  updatePurchaseOrderStatus,
  updateSupplierInvoices,
  getSuppliersForPurchaseRequest,
  getItemsForPurchaseRequest,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  revokePurchaseOrder,
  resetPurchaseOrderWorkflow,
  placePurchaseOrder,
  addPurchaseOrderDocuments,
  removePurchaseOrderDocument,
  getPurchaseOrderCancellable,
  cancelPurchaseOrder
} from "../controllers/purchaseOrder.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage")

const router = Router();

router.use(requirePrivilege("purchaseOrder"));

router.post("/", requirePrivilege("purchaseOrder", "canInitiateLPO"), createPurchaseOrder);
router.put("/:id", updatePurchaseOrder);
router.put("/:id/reissue", requirePrivilege("purchaseOrder", "canReissueAndRevoke"), reissuePurchaseOrder);
router.patch("/:id/status", updatePurchaseOrderStatus);
router.patch("/:id/approve", requirePrivilege("purchaseOrder", "canApprovePOs"), approvePurchaseOrder);
router.patch("/:id/reject", requirePrivilege("purchaseOrder", "canApprovePOs"), rejectPurchaseOrder);
router.patch("/:id/place", requirePrivilege("purchaseOrder", "canInitiateLPO"), placePurchaseOrder);
router.patch("/:id/documents", requirePrivilege("purchaseOrder", "canInitiateLPO"), upload.array('files'), addPurchaseOrderDocuments);
router.delete("/:id/documents/:fileName", requirePrivilege("purchaseOrder", "canInitiateLPO"), removePurchaseOrderDocument);
router.get("/:id/cancellable", getPurchaseOrderCancellable);
router.post("/:id/cancel", requirePrivilege("purchaseOrder", "canCancel"), cancelPurchaseOrder);
router.post("/:id/reset-workflow", resetPurchaseOrderWorkflow);
router.patch("/:id/supplier-invoices",upload.array('files'), updateSupplierInvoices);
router.get("/generate-po-no", generateLpoNo);
router.get("/suppliers/:purchaseId", getSuppliersForPurchaseRequest);
router.get("/items/:purchaseId/:supplierId", getItemsForPurchaseRequest);
router.get("/by-po-no/:poNo", getPurchaseOrderByPoNo);
router.delete("/:id/revoke", requirePrivilege("purchaseOrder", "canReissueAndRevoke"), revokePurchaseOrder);
router.get("/:id", getPurchaseOrderById);
router.get("purchase/:id", getPurchaseOrderByPurchaseId);
router.get("/", getAllPurchaseOrders);

export default router;
