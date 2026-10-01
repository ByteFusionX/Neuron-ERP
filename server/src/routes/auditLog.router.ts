import { Router } from "express";
import { getEntityAudit, listAuditLogs } from "../controllers/auditLog.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const auditLogRouter = Router();

// The cross-module log is the Settings "Audit & History" page, so it follows that page's flag.
auditLogRouter.get('/', requirePrivilege("portalManagement", "audit"), listAuditLogs);
auditLogRouter.get('/:entityType/:entityId', getEntityAudit);

export default auditLogRouter;
