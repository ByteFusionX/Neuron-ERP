import { Schema, Document, model, Types } from "mongoose";

interface Employee extends Document {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNo: number;
  designation: string;
  dob: Date;
  department: Types.ObjectId;
  category: Types.ObjectId;
  dateOfJoining: Date;
  reportingTo: Types.ObjectId;
  userRole: string;
  password: string;
  createdBy: Types.ObjectId;
  targets: Target[];
  isBlocked: boolean;
  isDeleted: boolean;
  lastActivity: number;
  microsoftId: string;
  approvalLimit?: {
    maxAmount: number | null;
    maxDiscountPercent: number | null;
  };
  contractType?: "permanent" | "fixed-term" | "probation" | "contractor" | "intern";
  contractStart?: Date;
  contractEnd?: Date;
  probationEnd?: Date;
  isTechnician?: boolean;
  isDriver?: boolean;
  isProjectManager?: boolean;
  driverLicense?: { number?: string; licenseClass?: string; expiry?: Date };
  compensation?: { costRatePerHour?: number; billingRate?: number };
  employmentHistory?: EmploymentHistory[];
}

interface EmploymentHistory {
  effectiveDate: Date;
  fromDesignation?: string;
  toDesignation?: string;
  fromDepartment?: Types.ObjectId;
  toDepartment?: Types.ObjectId;
  fromReportingTo?: Types.ObjectId | null;
  toReportingTo?: Types.ObjectId | null;
  reason?: string;
  changedBy?: Types.ObjectId;
  changedAt: Date;
}

interface Target {
  _id: string;
  year: number;
  salesRevenue: RangeTarget;
  grossProfit: RangeTarget;
}

interface RangeTarget {
  targetValue: number;
  criticalRange: number;
  moderateRange: number;
}

const rangeSchema = new Schema<RangeTarget>({
  targetValue: {
    type: Number,
    required: true,
  },
  criticalRange: {
    type: Number,
    required: true,
  },
  moderateRange: {
    type: Number,
    required: true,
  },
});

const targetSchema = new Schema<Target>({
  year: {
    type: Number,
    required: true,
  },
  salesRevenue: {
    type: rangeSchema,
    required: true,
  },
  grossProfit: {
    type: rangeSchema,
    required: true,
  },
});

enum UserRole {
  user,
  admin,
  superAdmin
}

const employeeSchema = new Schema<Employee>({
  microsoftId: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  contactNo: {
    type: Number,
    required: true,
  },
  designation: {
    type: String,
    required: true,
  },
  dob: {
    type: Date,
    required: true,
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: 'InternalDepartment',
    required: true,
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  dateOfJoining: {
    type: Date,
    required: true,
  },
  reportingTo: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },
  password: {
    type: String,
    required: false,
    select: false
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
  },
  targets: {
    type: [targetSchema],
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  lastActivity: {
    type: Number,
    required: false
  },
  // Personal override of the role's approval limit. null = fall back to the role.
  approvalLimit: {
    maxAmount: { type: Number, default: null, min: 0 },
    maxDiscountPercent: { type: Number, default: null, min: 0, max: 100 },
  },
  // Optional additions: absent on existing documents, no migration needed.
  contractType: {
    type: String,
    enum: ["permanent", "fixed-term", "probation", "contractor", "intern"],
    required: false,
  },
  contractStart: { type: Date, required: false },
  contractEnd: { type: Date, required: false },
  probationEnd: { type: Date, required: false },
  isTechnician: { type: Boolean, default: false },
  isDriver: { type: Boolean, default: false },
  isProjectManager: { type: Boolean, default: false },
  driverLicense: {
    number: { type: String, required: false },
    licenseClass: { type: String, required: false },
    expiry: { type: Date, required: false },
  },
  // Hidden from every query unless explicitly selected (HR-only, see employee.viewCompensation).
  compensation: {
    type: {
      costRatePerHour: { type: Number, min: 0 },
      billingRate: { type: Number, min: 0 },
    },
    select: false,
  },
  employmentHistory: {
    type: [
      {
        effectiveDate: { type: Date, required: true },
        fromDesignation: String,
        toDesignation: String,
        fromDepartment: { type: Schema.Types.ObjectId, ref: "InternalDepartment" },
        toDepartment: { type: Schema.Types.ObjectId, ref: "InternalDepartment" },
        fromReportingTo: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
        toReportingTo: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
        reason: String,
        changedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    default: undefined,
  },
});

employeeSchema.index({ firstName: 1, lastName: 1 })
export default model<Employee>("Employee", employeeSchema);
