import { Schema, Document, model, Types } from "mongoose";

interface Scan {
  code: string;
  order: number;
  scannedAt: Date;
}

export interface ScanSession extends Document {
  sessionId: string;
  supplier?: string;
  product?: string;
  reference?: string;
  createdBy: Types.ObjectId;
  scans: Scan[];
  status: 'active' | 'closed';
  createdAt: Date;
}

const scanSchema = new Schema<Scan>({
  code: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    required: true,
  },
  scannedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const scanSessionSchema = new Schema<ScanSession>({
  sessionId: {
    type: String,
    unique: true,
    required: true,
  },
  supplier: {
    type: String,
  },
  product: {
    type: String,
  },
  reference: {
    type: String,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  scans: {
    type: [scanSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model<ScanSession>("ScanSession", scanSessionSchema);
