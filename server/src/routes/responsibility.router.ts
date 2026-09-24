import { Router } from "express";
import {
  getResponsibilities,
  createResponsibility,
  updateResponsibility,
  deleteResponsibility,
} from "../controllers/responsibility.controller";

const responsibilityRouter = Router();

// GET / is a shared lookup used by the role form.
responsibilityRouter.get("/", getResponsibilities);
responsibilityRouter.post("/", createResponsibility);
responsibilityRouter.patch("/:id", updateResponsibility);
responsibilityRouter.delete("/:id", deleteResponsibility);

export default responsibilityRouter;
