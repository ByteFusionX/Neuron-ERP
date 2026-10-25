import { Router } from "express";
import {
  generateGRNNumber,
  createGRN,
  getGRNByLpoId,
  getAllGRNsByLpoId,
  getGRNById,
  getAllGRNs,
  getArrivingPurchaseOrders,
  getGRNRejections,
  updateGRNSupplierInvoices,
  updateGRNSupplierDeliveryNotes,
  updateGRN
} from "../controllers/grn.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage");

const router = Router();

router.use(requirePrivilege("grn"));

router.get("/generate-grn-no", generateGRNNumber);
router.post("/", createGRN);
router.get("/", getAllGRNs);
router.get("/arriving", getArrivingPurchaseOrders);
router.patch("/:id/supplier-invoices", requirePrivilege("grn", "canUploadInvoice"), upload.array('files'), updateGRNSupplierInvoices);
router.patch("/:id/supplier-delivery-notes", requirePrivilege("grn", "canUploadInvoice"), upload.array('files'), updateGRNSupplierDeliveryNotes);
router.get("/rejections", getGRNRejections);
router.get("/purchase-order/:lpoId/all", getAllGRNsByLpoId);
router.get("/purchase-order/:lpoId", getGRNByLpoId);
router.get("/:id", getGRNById);
router.patch("/:id", updateGRN);

export default router;
