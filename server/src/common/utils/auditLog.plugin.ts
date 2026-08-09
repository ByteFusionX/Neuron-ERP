import { Schema } from "mongoose";
import AuditLog, { AuditAction, FieldChange } from "../../models/auditLog.model";

const IGNORED_FIELDS = new Set(["_id", "__v", "password"]);

const buildDiff = (before: Record<string, any>, after: Record<string, any>): Record<string, FieldChange> => {
  const changes: Record<string, FieldChange> = {};
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) continue;
    const beforeValue = before ? before[field] : undefined;
    const afterValue = after ? after[field] : undefined;
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[field] = { before: beforeValue ?? null, after: afterValue ?? null };
    }
  }
  return changes;
};

const recordAudit = async (params: {
  entityType: string;
  entityId: unknown;
  action: AuditAction;
  changes: Record<string, FieldChange>;
  performedBy: unknown;
}) => {
  try {
    if (params.action === "updated" && Object.keys(params.changes).length === 0) return;
    await AuditLog.create({
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      changes: params.changes,
      performedBy: params.performedBy ?? null,
    });
  } catch (error) {
    // Audit logging must never break the underlying write.
    console.error(`[auditLog] failed to record ${params.action} on ${params.entityType} ${params.entityId}:`, error);
  }
};

/**
 * Attaches automatic audit logging to a Mongoose schema, covering .save()
 * (create + document-style update) and findOneAndUpdate/updateOne (query-style
 * update). Hooks have no access to the request, so callers must explicitly pass
 * the acting employee id through: `doc.$locals.actingEmployeeId = ...` before
 * .save(), or `query.setOptions({ actingEmployeeId: ... })` before a
 * findOneAndUpdate/updateOne query executes.
 */
export const auditLogPlugin = (schema: Schema, entityType: "Customer" | "Employee" | "Quotation") => {
  schema.post("init", function (this: any) {
    this.$locals.auditSnapshot = this.toObject();
  });

  schema.pre("save", function (this: any, next) {
    if (this.isNew) {
      this.$locals.auditAction = "created";
    } else {
      this.$locals.auditAction = "updated";
      this.$locals.auditChanges = buildDiff(this.$locals.auditSnapshot ?? {}, this.toObject());
    }
    next();
  });

  schema.post("save", async function (this: any, doc: any) {
    const action: AuditAction = this.$locals.auditAction ?? "updated";
    const changes =
      action === "created"
        ? buildDiff({}, doc.toObject())
        : this.$locals.auditChanges ?? {};

    await recordAudit({
      entityType,
      entityId: doc._id,
      action,
      changes,
      performedBy: this.$locals.actingEmployeeId,
    });
  });

  schema.pre(["findOneAndUpdate", "updateOne"], async function (this: any, next) {
    try {
      this._auditBefore = await this.model.findOne(this.getQuery()).lean();
    } catch (error) {
      this._auditBefore = null;
    }
    next();
  });

  schema.post(["findOneAndUpdate", "updateOne"], async function (this: any) {
    const before = this._auditBefore;
    if (!before) return;

    const after = await this.model.findOne(this.getQuery()).lean();
    if (!after) return;

    const changes = buildDiff(before, after);
    if (Object.keys(changes).length === 0) return;

    const action: AuditAction =
      changes.isDeleted && before.isDeleted === false && after.isDeleted === true ? "deleted" : "updated";

    await recordAudit({
      entityType,
      entityId: after._id,
      action,
      changes,
      performedBy: this.getOptions()?.actingEmployeeId,
    });
  });
};
