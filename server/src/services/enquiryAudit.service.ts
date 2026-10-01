import { AuditLogChange } from "../models/auditLog.model";
import { logAudit } from "./audit.service";

export type EnquiryAuditChange = AuditLogChange;

/** Records one enquiry event in the global audit log. Never throws. */
export const logEnquiryAudit = (
  req: any,
  enquiryId: any,
  action: string,
  summary: string,
  changes?: EnquiryAuditChange[]
): Promise<void> => logAudit(req, { entityType: 'enquiry', entityId: enquiryId, action, summary, changes });
