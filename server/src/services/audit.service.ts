import auditLogModel, { AuditLogChange } from "../models/auditLog.model";
import { getEmployeeData } from "../common/utils/util";

export interface AuditEntry {
  entityType: string;
  entityId: any;
  entityLabel?: string;
  action: string;
  summary: string;
  changes?: AuditLogChange[];
}

/** Records one event for any module. Never throws: a failed audit write must not fail the request that caused it. */
export const logAudit = async (req: any, entry: AuditEntry): Promise<void> => {
  try {
    if (!entry.entityId) return;
    const actor: any = req?.user ? await getEmployeeData(req.user) : null;
    await auditLogModel.create({
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel,
      action: entry.action,
      summary: entry.summary,
      changes: entry.changes?.length ? entry.changes : undefined,
      actor: actor?._id,
      actorName: actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() : '',
      at: new Date(),
    });
  } catch (error) {
    console.error('Audit failed:', error);
  }
};
