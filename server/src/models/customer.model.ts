import { Schema, Document, model, Types } from "mongoose";

export const CUSTOMER_STATUSES = ["Active", "Inactive", "Blacklisted", "On Hold", "Prospect"] as const;
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];

interface ContactDetail {
  _id: string;
  courtesyTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNo: number;
  department: Types.ObjectId;
  designation?: string;
  isPrimary?: boolean;
}

interface AddressDetail {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

interface StatusHistoryEntry {
  status: CustomerStatus;
  reason?: string;
  changedBy: Types.ObjectId;
  changedDate: Date;
}

export interface Customer extends Document {
  clientRef: string;
  department: Types.ObjectId;
  contactDetails: ContactDetail[];
  companyName: string;
  customerType: Types.ObjectId;
  companyAddress: string;
  companyAddressStructured?: AddressDetail;
  shippingAddress?: string;
  shippingAddressStructured?: AddressDetail;
  sameAsBilling: boolean;
  customerEmailId: string;
  contactNo: number;
  trn?: string;
  normalizedEmail?: string;
  normalizedPhone?: string;
  normalizedTrn?: string;
  normalizedDomain?: string;
  status: CustomerStatus;
  statusReason?: string;
  statusHistory: StatusHistoryEntry[];
  createdBy: Types.ObjectId; // Denotes the current owner
  sharedWith: Types.ObjectId[]; // Array of employees with shared access
  createdDate: Date;
  updatedBy?: Types.ObjectId;
  updatedDate?: Date;
  isDeleted: boolean;
}

const contactDetailSchema = new Schema({
  courtesyTitle: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phoneNo: { type: Number, required: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
  designation: { type: String },
  isPrimary: { type: Boolean, default: false },
});

const addressDetailSchema = new Schema({
  line1: { type: String },
  line2: { type: String },
  city: { type: String },
  state: { type: String },
  country: { type: String },
  postalCode: { type: String },
}, { _id: false });

const statusHistorySchema = new Schema({
  status: { type: String, enum: CUSTOMER_STATUSES, required: true },
  reason: { type: String },
  changedBy: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  changedDate: { type: Date, default: Date.now },
}, { _id: false });

const customerSchema = new Schema<Customer>({
  clientRef: { type: String, required: true, unique: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
  contactDetails: [{ type: contactDetailSchema, required: true }],
  companyName: { type: String, required: true },
  customerType: { type: Schema.Types.ObjectId, ref: "CustomerType", required: true },
  companyAddress: { type: String, required: true },
  companyAddressStructured: { type: addressDetailSchema },
  shippingAddress: { type: String },
  shippingAddressStructured: { type: addressDetailSchema },
  sameAsBilling: { type: Boolean, default: true },
  customerEmailId: { type: String, required: true },
  contactNo: { type: Number, required: true },
  trn: { type: String },
  normalizedEmail: { type: String, index: true },
  normalizedPhone: { type: String, index: true },
  normalizedTrn: { type: String, index: true },
  normalizedDomain: { type: String, index: true },
  status: { type: String, enum: CUSTOMER_STATUSES, default: "Active", required: true },
  statusReason: { type: String },
  statusHistory: [{ type: statusHistorySchema }],
  createdBy: { type: Schema.Types.ObjectId, ref: "Employee", required: true }, // Current owner
  sharedWith: [{ type: Schema.Types.ObjectId, ref: "Employee" }], // Employees with shared access
  createdDate: { type: Date, default: Date.now },
  updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  updatedDate: { type: Date },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

export default model<Customer>("Customer", customerSchema);
