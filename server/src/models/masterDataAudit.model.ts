import { Schema, model, Types } from "mongoose";

export interface MasterDataAudit {
  entity: string;
  action: string;
  summary?: string;
  changes?: Record<string, any>;
  actor?: Types.ObjectId;
  actorName?: string;
  at: Date;
}

const masterDataAuditSchema = new Schema<MasterDataAudit>({
  entity: { type: String, required: true, index: true },
  action: { type: String, required: true },
  summary: { type: String },
  changes: { type: Schema.Types.Mixed },
  actor: { type: Schema.Types.ObjectId, ref: "Employee" },
  actorName: { type: String },
  at: { type: Date, default: Date.now, index: true },
});

export default model<MasterDataAudit>("MasterDataAudit", masterDataAuditSchema);
