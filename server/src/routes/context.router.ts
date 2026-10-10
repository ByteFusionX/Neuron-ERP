import express from "express";
import { requireReadonlyContext } from "../common/middlewares/readonly-context.middleware";
import {
  getEmployeeContext,
  getEmployeesContext,
  getProductContext,
  getProductsContext,
  getSupplierContext,
  getSuppliersContext,
} from "../controllers/context.controller";

const contextRouter = express.Router();

contextRouter.use(requireReadonlyContext);

contextRouter.get("/products", getProductsContext);
contextRouter.get("/products/:id", getProductContext);
contextRouter.get("/suppliers", getSuppliersContext);
contextRouter.get("/suppliers/:id", getSupplierContext);
contextRouter.get("/employees", getEmployeesContext);
contextRouter.get("/employees/:id", getEmployeeContext);

export default contextRouter;
