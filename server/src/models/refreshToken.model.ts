import { Schema, Document, model, Types } from "mongoose";

// One row per issued refresh token. Only the SHA-256 hash is stored, so a database leak
// cannot be replayed. Tokens rotate on every use; `family` ties a login's chain together
// so reuse of an already-rotated token can revoke the whole chain.
export interface RefreshToken extends Document {
  employee: Types.ObjectId;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ip?: string;
  sessionStartedAt?: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshToken>({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  userAgent: { type: String },
  ip: { type: String },
  // When this login began; carried across rotations (createdAt is the last rotation, i.e. last activity).
  sessionStartedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// Mongo removes expired rows on its own.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<RefreshToken>("RefreshToken", refreshTokenSchema);
