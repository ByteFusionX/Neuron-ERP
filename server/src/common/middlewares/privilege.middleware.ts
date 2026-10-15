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
// `strictAdmin` makes admin a read-only oversight tier: only superAdmin skips the check, an admin needs the flag like anyone else.
export const requirePrivilege = (moduleKey: string, action?: string, legacyKey?: string, options: { strictAdmin?: boolean } = {}) => {
  return (req: any, res: Response, next: NextFunction) => {
    const employee = req.employee;
    if (!employee) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role = employee.category?.role;
    if (/^superadmin$/i.test(role ?? "") || (role === "admin" && !options.strictAdmin)) {
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

    // Individual grants on top of the role: additive only, so an unset/false role privilege
    // can be topped up per-person, but this can never take away what the role already allows.
    const expiresAt = employee.extraPrivilegesExpiresAt;
    const extraExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
    const extra = extraExpired ? undefined : resolvePrivilege(employee.extraPrivileges, moduleKey);

    if (action) {
      if (privilege?.[action] === true || extra?.[action] === true) {
        return next();
      }
      return res.status(403).json({ message: "Forbidden" });
    }

    if (privilege == null && extra == null) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const viewReport = typeof privilege === "boolean" ? privilege : privilege?.viewReport;
    const extraViewReport = typeof extra === "boolean" ? extra : extra?.viewReport;
    if ((!viewReport || viewReport === "none") && (!extraViewReport || extraViewReport === "none")) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
};

// Read-only lookups shared by several modules (e.g. the item-entry supplier/product pickers):
// allowed when the user can view at least one of the listed modules.
export const requireAnyPrivilege = (...moduleKeys: string[]) => {
  const checks = moduleKeys.map((key) => requirePrivilege(key));
  return (req: any, res: Response, next: NextFunction) => {
    const attempt = (index: number): void => {
      if (index >= checks.length) {
        return void res.status(req.employee ? 403 : 401).json({ message: req.employee ? "Forbidden" : "Unauthorized" });
      }
      let allowed = false;
      const probe: any = { status: () => probe, json: () => probe };
      checks[index](req, probe, () => { allowed = true; });
      if (allowed) return next();
      attempt(index + 1);
    };
    attempt(0);
  };
};

// For actions that `main` left open to anyone with view access: allowed unless an admin has
// explicitly set the flag to false on the role.
// With `strictAdmin`, an admin is not waved through: they must hold the flag (role or extra grant) explicitly.
export const requireUnlessDenied = (moduleKey: string, action: string, options: { strictAdmin?: boolean } = {}) => {
  return (req: any, res: Response, next: NextFunction) => {
    const employee = req.employee;
    if (!employee) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const role = employee.category?.role;
    if (/^superadmin$/i.test(role ?? "") || (role === "admin" && !options.strictAdmin)) {
      return next();
    }
    if (role === "admin") {
      const expiresAt = employee.extraPrivilegesExpiresAt;
      const extraExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
      const extra = extraExpired ? undefined : resolvePrivilege(employee.extraPrivileges, moduleKey);
      const granted = resolvePrivilege(employee.category?.privileges, moduleKey)?.[action] === true || extra?.[action] === true;
      return granted ? next() : res.status(403).json({ message: "Forbidden" });
    }
    if (resolvePrivilege(employee.category?.privileges, moduleKey)?.[action] === false) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
};
