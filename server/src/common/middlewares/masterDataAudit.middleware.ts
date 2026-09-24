import { Request, Response, NextFunction } from "express";
import MasterDataAudit from "../../models/masterDataAudit.model";
import { getEmployeeData } from "../utils/util";

const SKIP_KEYS = ["__v", "createdAt", "updatedAt"];

// Logs successful create/update/delete calls on a master-data router.
// Never blocks or fails the request itself.
export const auditMasterData = (entityFor: (req: Request) => string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET") return next();
    res.on("finish", async () => {
      if (res.statusCode >= 400) return;
      try {
        const action = req.method === "POST" && /delete/i.test(req.path) ? "delete"
          : req.method === "POST" ? "create" : "update";
        const body: Record<string, any> = { ...(req.body ?? {}) };
        SKIP_KEYS.forEach((k) => delete body[k]);
        const employee = await getEmployeeData((req as any).user);
        const name = body.departmentName ?? body.name ?? body.customerType ?? body.departmentCode ?? undefined;
        await MasterDataAudit.create({
          entity: entityFor(req),
          action,
          summary: name ? String(name) : undefined,
          changes: body,
          actor: employee?._id,
          actorName: employee ? [employee.firstName, employee.lastName].filter(Boolean).join(" ") : undefined,
        });
      } catch (e) {
        console.log("master data audit failed", e);
      }
    });
    next();
  };
