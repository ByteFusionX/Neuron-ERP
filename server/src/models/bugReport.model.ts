import { Schema, Document, model, Types } from "mongoose";

interface ConsoleLogEntry {
  level: string;
  message: string;
  timestamp: Date;
}

interface NetworkErrorEntry {
  method: string;
  url: string;
  status: number;
  body: string;
  timestamp: Date;
}

interface ActionTrailEntry {
  type: string;
  target?: string;
  route: string;
  timestamp: Date;
}

export interface BugReport extends Document {
  reporterId: Types.ObjectId;
  reportingTo: Types.ObjectId;
  description: string;
  route: string;
  userAgent: string;
  viewport: string;
  screenshotKeys: string[];
  consoleLog: ConsoleLogEntry[];
  networkErrors: NetworkErrorEntry[];
  actionTrail: ActionTrailEntry[];
  stateSnapshot: Record<string, unknown>;
  status: 'new' | 'analyzing' | 'implementing' | 'fix-ready' | 'approved' | 'rejected' | 'resolved' | 'failed';
  aiAnalysis: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const consoleLogSchema = new Schema<ConsoleLogEntry>({
  level: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, required: true },
}, { _id: false });

const networkErrorSchema = new Schema<NetworkErrorEntry>({
  method: { type: String, required: true },
  url: { type: String, required: true },
  status: { type: Number, required: true },
  body: { type: String, default: '' },
  timestamp: { type: Date, required: true },
}, { _id: false });

const actionTrailSchema = new Schema<ActionTrailEntry>({
  type: { type: String, required: true },
  target: { type: String, default: '' },
  route: { type: String, required: true },
  timestamp: { type: Date, required: true },
}, { _id: false });

const bugReportSchema = new Schema<BugReport>({
  reporterId: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  reportingTo: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
  },
  description: {
    type: String,
    required: true,
  },
  route: {
    type: String,
    default: '',
  },
  userAgent: {
    type: String,
    default: '',
  },
  viewport: {
    type: String,
    default: '',
  },
  screenshotKeys: {
    type: [String],
    default: [],
  },
  consoleLog: {
    type: [consoleLogSchema],
    default: [],
  },
  networkErrors: {
    type: [networkErrorSchema],
    default: [],
  },
  actionTrail: {
    type: [actionTrailSchema],
    default: [],
  },
  stateSnapshot: {
    type: Schema.Types.Mixed,
    default: {},
  },
  status: {
    type: String,
    enum: ['new', 'analyzing', 'implementing', 'fix-ready', 'approved', 'rejected', 'resolved', 'failed'],
    default: 'new',
  },
  aiAnalysis: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

export default model<BugReport>("BugReport", bugReportSchema);
