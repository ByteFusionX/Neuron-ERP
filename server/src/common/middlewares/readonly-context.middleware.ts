import { Response, NextFunction } from "express";

// Shared readonly context endpoints are intentionally privilege-neutral:
// any active authenticated employee may read small, pre-approved reference DTOs.
export const requireReadonlyContext = (req: any, res: Response, next: NextFunction) => {
  const employee = req.employee;
  if (!employee) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (employee.isDeleted === true || employee.isBlocked === true) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};
