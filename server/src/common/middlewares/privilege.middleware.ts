import { Request, Response, NextFunction } from "express";
import { getEmployeeData } from "../utils/util";

export const attachEmployee = async (req: any, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next();
  }
  try {
    const employee = await getEmployeeData(req.user);
    if (!employee) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.employee = employee;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

const resolvePrivilege = (privileges: any, moduleKey: string) => {
  return moduleKey.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), privileges);
};

// `legacyKey` is the pre-split flag (e.g. "portalManagement.department"). It grants the action only
// while the new flag has never been set on the role; an explicit true/false on the new flag wins.
export const requirePrivilege = (moduleKey: string, action?: string, legacyKey?: string) => {
  return (req: any, res: Response, next: NextFunction) => {
    const employee = req.employee;
    if (!employee) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role = employee.category?.role;
    if (role === "admin" || role === "superAdmin") {
      return next();
    }

    let privilege = resolvePrivilege(employee.category?.privileges, moduleKey);

    // stockHold privileges aren't yet assignable in category management, so
    // fall back to full access for anyone with GRN view access.
    if (moduleKey === "stockHold" && privilege == null) {
      const grnPrivilege = employee.category?.privileges?.grn;
      const hasGrnView = grnPrivilege && grnPrivilege.viewReport && grnPrivilege.viewReport !== "none";
      if (hasGrnView) {
        privilege = {
          viewReport: grnPrivilege.viewReport,
          canInitiateHold: true,
          canIssueCreditNote: true,
          canCreateReplacementLPO: true
        };
      }
    }

    if (legacyKey && action && privilege?.[action] === undefined
        && resolvePrivilege(employee.category?.privileges, legacyKey) === true) {
      return next();
    }

    if (privilege == null) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (action) {
      if (privilege[action] !== true) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return next();
    }

    const viewReport = typeof privilege === "boolean" ? privilege : privilege.viewReport;
    if (!viewReport || viewReport === "none") {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
};

// For actions that `main` left open to anyone with view access: allowed unless an admin has
// explicitly set the flag to false on the role.
export const requireUnlessDenied = (moduleKey: string, action: string) => {
  return (req: any, res: Response, next: NextFunction) => {
    const employee = req.employee;
    if (!employee) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const role = employee.category?.role;
    if (role === "admin" || role === "superAdmin") {
      return next();
    }
    if (resolvePrivilege(employee.category?.privileges, moduleKey)?.[action] === false) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
};
