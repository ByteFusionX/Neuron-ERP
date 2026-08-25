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

export const requirePrivilege = (moduleKey: string, action?: string) => {
  return (req: any, res: Response, next: NextFunction) => {
    const employee = req.employee;
    if (!employee) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role = employee.category?.role;
    if (role === "admin" || role === "superAdmin") {
      return next();
    }

    const privilege = resolvePrivilege(employee.category?.privileges, moduleKey);

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
