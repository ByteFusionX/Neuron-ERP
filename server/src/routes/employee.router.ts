import { Router } from "express";
import {
  createEmployee,
  getEmployees,
  login,
  loginWithMicrosoft,
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
  setEmployeeExtraPrivilegeExpiry,
  setEmployeeMicrosoftId,
} from "../controllers/employee.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
import passport from "passport";
const empRouter = Router();

// /get, /login, /check, and the lookup routes below are self-service or
// cross-module lookups, not the "employee directory" report — they stay
// ungated so any authenticated user can fetch their own profile / use them.
// Read-only list for any signed-in user (pickers and names on every page); writes stay gated below.
empRouter.get("/", getEmployees);
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
// /login (employeeId/password) and /login-microsoft are globally exempt from the app's own JWT
// middleware (no employeeToken yet); /login-microsoft is gated on the caller's Azure AD token.
empRouter.post("/login", login);
empRouter.post("/login-microsoft", passport.authenticate("oauth-bearer", { session: false }), loginWithMicrosoft);
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
empRouter.patch(
  "/extra-privilege-expiry/:employeeId",
  requirePrivilege("employee", "edit", "employee.create"),
  setEmployeeExtraPrivilegeExpiry,
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
