import { Router } from "express";
import {
  generateGRNNumber,
  createGRN,
  getGRNByLpoId,
  getAllGRNsByLpoId,
  getGRNById
} from "../controllers/grn.controller";

const router = Router();

router.get("/generate-grn-no", generateGRNNumber);
router.post("/", createGRN);
router.get("/purchase-order/:lpoId/all", getAllGRNsByLpoId);
router.get("/purchase-order/:lpoId", getGRNByLpoId);
router.get("/:id", getGRNById);

export default router;
