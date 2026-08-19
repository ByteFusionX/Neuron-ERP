import { Router } from "express";
import {
  generateGRNNumber,
  createGRN,
  getGRNByLpoId,
  getAllGRNsByLpoId,
  getGRNById,
  getAllGRNs,
  updateGRNSupplierInvoices,
  updateGRNSupplierDeliveryNotes
} from "../controllers/grn.controller";
const upload = require("../common/multer.storage");

const router = Router();

router.get("/generate-grn-no", generateGRNNumber);
router.post("/", createGRN);
router.get("/", getAllGRNs);
router.patch("/:id/supplier-invoices", upload.array('files'), updateGRNSupplierInvoices);
router.patch("/:id/supplier-delivery-notes", upload.array('files'), updateGRNSupplierDeliveryNotes);
router.get("/purchase-order/:lpoId/all", getAllGRNsByLpoId);
router.get("/purchase-order/:lpoId", getGRNByLpoId);
router.get("/:id", getGRNById);

export default router;
