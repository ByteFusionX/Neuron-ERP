import { Router } from "express";
import {
  createEmployee,
  getEmployees,
  login,
  getEmployee,
  getFilteredEmployees,
  editEmployee,
  getEmployeeByEmployeeId,
  isEmployeePresent,
  getNotificationCounts,
  setTarget,
  updateTarget,
  getEmployeesForCustomerTransfer,
  deleteEmployee,
  getPresaleEngineers,
  getPresaleManagers,
  getProcurementEmployees,
  blockEmployee,
} from "../controllers/employee.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const empRouter = Router();

// /get, /login, /check, and the lookup routes below are self-service or
// cross-module lookups, not the "employee directory" report — they stay
// ungated so any authenticated user can fetch their own profile / use them.
empRouter.get("/", requirePrivilege("employee"), getEmployees);
empRouter.get("/presale-managers", getPresaleManagers);
empRouter.get("/presale-engineers", getPresaleEngineers);
empRouter.get("/procurement-employees", getProcurementEmployees);

empRouter.get("/check", isEmployeePresent);
empRouter.get(
  "/view/get/:employeeId",
  requirePrivilege("employee"),
  getEmployeeByEmployeeId,
);
empRouter.post("/get", requirePrivilege("employee"), getFilteredEmployees);
empRouter.post("/", requirePrivilege("employee", "create"), createEmployee);
empRouter.patch("/changePasswordOfEmployee");
empRouter.patch("/edit", requirePrivilege("employee", "create"), editEmployee);
empRouter.patch(
  "/setTarget/:employeeId",
  requirePrivilege("employee", "create"),
  setTarget,
);
empRouter.patch(
  "/update-target/:employeeId/:targetId",
  requirePrivilege("employee", "create"),
  updateTarget,
);
empRouter.post("/login", login);
empRouter.get("/get", getEmployee);
// Deprecated: Use /notification endpoint instead for privilege-aware notifications
// empRouter.get('/notifications', getNotificationCounts)
empRouter.post("/delete", requirePrivilege("employee", "create"), deleteEmployee);
empRouter.get(
  "/no-customer-access/:customerId/:userId",
  getEmployeesForCustomerTransfer,
);
empRouter.patch(
  "/block/:employeeId",
  requirePrivilege("employee", "create"),
  blockEmployee,
);

export default empRouter;
