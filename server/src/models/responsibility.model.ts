import { Schema, Document, model } from "mongoose";

export interface Responsibility extends Document {
  key: string;
  label: string;
  description?: string;
  isActive: boolean;
  isDeleted: boolean;
}

const responsibilitySchema = new Schema<Responsibility>({
  // Stable identifier stored on roles; never changes after creation.
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
});

export default model<Responsibility>("Responsibility", responsibilitySchema);
