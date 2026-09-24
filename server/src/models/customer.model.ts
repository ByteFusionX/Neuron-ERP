import { Schema, Document, model, Types } from "mongoose";

export const CUSTOMER_STATUSES = ["Active", "Inactive", "Blacklisted", "On Hold", "Prospect"] as const;
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];

export const PAYMENT_TERMS = ["Cash", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"] as const;
export type PaymentTerm = typeof PAYMENT_TERMS[number];

export const CREDIT_STATUSES = ["Good Standing", "Watch", "Hold", "Exceeded"] as const;
export type CreditStatus = typeof CREDIT_STATUSES[number];

interface ContactDetail {
  _id: string;
  courtesyTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNo: number;
  department: Types.ObjectId;
  designation?: string;
  role?: string;
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

interface ShippingSite {
  siteName: string;
  address?: AddressDetail;
}

interface StatusHistoryEntry {
  status: CustomerStatus;
  reason?: string;
  changedBy: Types.ObjectId;
  changedDate: Date;
}

interface AttachmentEntry {
  fileName: string;
  originalname: string;
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
  shippingSites?: ShippingSite[];
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
  paymentTerms?: string;
  creditLimit?: number;
  creditStatus?: CreditStatus;
  taxExempt?: boolean;
  currency?: string;
  source?: string;
  statusHistory: StatusHistoryEntry[];
  attachments: AttachmentEntry[];
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
  role: { type: String, enum: ['Decision Maker', 'Buyer', 'Technical', 'Accounts', 'Other'] },
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

const shippingSiteSchema = new Schema({
  siteName: { type: String, required: true },
  address: { type: addressDetailSchema },
});

const statusHistorySchema = new Schema({
  status: { type: String, enum: CUSTOMER_STATUSES, required: true },
  reason: { type: String },
  changedBy: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  changedDate: { type: Date, default: Date.now },
}, { _id: false });

const attachmentSchema = new Schema({
  fileName: { type: String, required: true },
  originalname: { type: String, required: true },
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
  shippingSites: [{ type: shippingSiteSchema }],
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
  // Free string: values come from the Settings → Master Data "paymentTerms" list.
  paymentTerms: { type: String },
  creditLimit: { type: Number },
  creditStatus: { type: String, enum: CREDIT_STATUSES, default: "Good Standing" },
  taxExempt: { type: Boolean, default: false },
  currency: { type: String, default: "QAR" },
  source: { type: String },
  statusHistory: [{ type: statusHistorySchema }],
  attachments: [{ type: attachmentSchema }],
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
