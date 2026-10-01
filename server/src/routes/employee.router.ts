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
  setEmployeeApprovalLimit,
  setEmployeeExtraPrivilege,
  setEmployeeMicrosoftId,
} from "../controllers/employee.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
import passport from "passport";
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
empRouter.patch("/edit", requirePrivilege("employee", "edit", "employee.create"), editEmployee);
empRouter.patch(
  "/setTarget/:employeeId",
  requirePrivilege("employee", "edit", "employee.create"),
  setTarget,
);
empRouter.patch(
  "/update-target/:employeeId/:targetId",
  requirePrivilege("employee", "edit", "employee.create"),
  updateTarget,
);
empRouter.patch(
  "/approval-limit/:employeeId",
  requirePrivilege("employee", "edit", "employee.create"),
  setEmployeeApprovalLimit,
);
// /login is globally exempt from the app's own JWT middleware (there's no
// employeeToken yet at login time) but is gated here on the caller's Azure AD
// access token so `login` can trust req.user.
empRouter.post("/login", passport.authenticate("oauth-bearer", { session: false }), login);
empRouter.get("/get", getEmployee);
// Deprecated: Use /notification endpoint instead for privilege-aware notifications
// empRouter.get('/notifications', getNotificationCounts)
empRouter.post("/delete", requirePrivilege("employee", "delete", "employee.create"), deleteEmployee);
empRouter.get(
  "/no-customer-access/:customerId/:userId",
  getEmployeesForCustomerTransfer,
);
empRouter.patch(
  "/block/:employeeId",
  requirePrivilege("employee", "block", "employee.create"),
  blockEmployee,
);
empRouter.patch(
  "/extra-privilege/:employeeId",
  requirePrivilege("employee", "edit", "employee.create"),
  setEmployeeExtraPrivilege,
);
// Manual Microsoft account link/relink — recovers logins that /login's
// email-based auto-link can never fix (ERP email doesn't match Azure
// identity, or the employee's Azure account changed).
empRouter.patch(
  "/microsoft-link/:employeeId",
  requirePrivilege("employee", "edit", "employee.create"),
  setEmployeeMicrosoftId,
);

export default empRouter;
