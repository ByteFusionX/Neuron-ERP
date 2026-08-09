import { Schema, Document, model, Types } from "mongoose";

export type AuditAction = "created" | "updated" | "deleted";

export interface FieldChange {
  before: unknown;
  after: unknown;
}

export interface AuditLog extends Document {
  entityType: string;
  entityId: Types.ObjectId;
  action: AuditAction;
  changes: Record<string, FieldChange>;
  performedBy: Types.ObjectId | null;
  performedAt: Date;
}

const auditLogSchema = new Schema<AuditLog>({
  entityType: {
    type: String,
    required: true,
    enum: ["Customer", "Employee", "Quotation"],
  },
  entityId: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: "entityType",
  },
  action: {
    type: String,
    required: true,
    enum: ["created", "updated", "deleted"],
  },
  changes: {
    type: Schema.Types.Mixed,
    default: {},
  },
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: "Employee",
    default: null,
  },
  performedAt: {
    type: Date,
    default: Date.now,
  },
});

auditLogSchema.index({ entityType: 1, entityId: 1, performedAt: -1 });

export default model<AuditLog>("AuditLog", auditLogSchema);
