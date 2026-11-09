import { Schema, model, Types } from "mongoose";

export interface AuditLogChange {
  label: string;
  from?: string;
  to?: string;
}

export interface AuditLogRelated {
  entityType: string;
  entityId: Types.ObjectId;
  entityLabel?: string;
}

export interface AuditLog {
  /** Module the record belongs to, e.g. "enquiry". */
  entityType: string;
  entityId: Types.ObjectId;
  /** Human-readable reference (e.g. "ENQ-0012") kept so the log still reads well if the record is deleted. */
  entityLabel?: string;
  action: string;
  summary: string;
  changes?: AuditLogChange[];
  actor?: Types.ObjectId;
  actorName?: string;
  /** Another module's record this event involves (e.g. the invoice behind a delivery note event). */
  related?: AuditLogRelated;
  at: Date;
}

const auditLogSchema = new Schema<AuditLog>({
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  entityLabel: { type: String },
  action: { type: String, required: true },
  summary: { type: String, required: true },
  changes: { type: Schema.Types.Mixed },
  actor: { type: Schema.Types.ObjectId, ref: "Employee" },
  actorName: { type: String },
  related: { type: new Schema({ entityType: String, entityId: Schema.Types.ObjectId, entityLabel: String }, { _id: false }) },
  at: { type: Date, default: Date.now },
});

// Per-record history tab, and the Settings-wide log filtered by module / newest first.
auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
auditLogSchema.index({ entityType: 1, at: -1 });
auditLogSchema.index({ at: -1 });

export default model<AuditLog>("AuditLog", auditLogSchema);
