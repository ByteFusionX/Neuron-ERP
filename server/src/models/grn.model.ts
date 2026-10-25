import { Schema, model, Types, Document } from "mongoose";

interface GRN extends Document {
  grnNo: string;
  grnDate: Date;
  purchaseOrderId: Types.ObjectId;
  supplierInvoiceNo?: string;
  supplierInvoiceDate?: Date;
  supplierDeliveryNoteNo?: string;
  receivedBy?: Types.ObjectId;
  warehouse: Types.ObjectId;
  destinationType: "warehouse" | "site";
  siteName?: string;
  quarantineWarehouse?: Types.ObjectId;
  inspectionResult: "Pending" | "Passed" | "Partial" | "Failed";
  inspectionDate?: Date;
  inspectionNotes?: string;
  inspectedBy?: Types.ObjectId;
  outcomeStatus: "Completed" | "Return Required" | "Return in Progress" | "Resolved";
  invoiceStatus: "Ready for Invoice" | "Blocked by Return";
  returnResolution?: "Replacement" | "Credit Note";
  returnDispatchedAt?: Date;
  returnResolvedAt?: Date;
  returnResolvedBy?: Types.ObjectId;
  jobId?: Types.ObjectId;
  supplierInvoices: {
    fileName: string;
    originalname: string;
  }[];
  supplierDeliveryNotes: {
    fileName: string;
    originalname: string;
  }[];
  items: {
    partNo?: string;
    itemDescription: string;
    uom?: string;
    orderedQty: number;
    receivedQty: number;
    acceptedQty: number;
    rejectedQty: number;
    quantityVariance?: number;
    discrepancyType?: string;
    rejectionReason?: string;
    batchNo?: string;
    serialNos?: string[];
    expiryDate?: Date;
    trackingType?: "None" | "Serial" | "Batch";
    remarks?: string;
    date?: Date;
  }[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

const itemSchema = new Schema({
  partNo: {
    type: String,
    trim: true
  },
  itemDescription: {
    type: String,
    required: true
  },
  uom: {
    type: String,
    trim: true
  },
  orderedQty: {
    type: Number,
    required: true,
    min: 0
  },
  receivedQty: {
    type: Number,
    required: true,
    min: 0
  },
  acceptedQty: {
    type: Number,
    required: true,
    min: 0
  },
  rejectedQty: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  quantityVariance: { type: Number, default: 0 },
  discrepancyType: {
    type: String,
    enum: ["Shortage", "Excess", "Damaged", "Wrong item", "Quality failure", "Document mismatch"]
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  batchNo: { type: String, trim: true },
  serialNos: { type: [String], default: [] },
  expiryDate: { type: Date },
  trackingType: { type: String, enum: ["None", "Serial", "Batch"], default: "None" },
  remarks: {
    type: String,
    trim: true
  },
  date: {
    type: Date
  }
}, { _id: false });

const grnSchema = new Schema<GRN>(
  {
    grnNo: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    grnDate: {
      type: Date,
      required: true
    },
    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "PurchaseOrder"
    },
    supplierInvoiceNo: {
      type: String,
      trim: true
    },
    supplierInvoiceDate: {
      type: Date
    },
    supplierDeliveryNoteNo: {
      type: String,
      trim: true
    },
    receivedBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee"
    },
    warehouse: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Warehouse"
    },
    destinationType: {
      type: String,
      enum: ["warehouse", "site"],
      default: "warehouse"
    },
    siteName: { type: String, trim: true },
    quarantineWarehouse: { type: Schema.Types.ObjectId, ref: "Warehouse" },
    inspectionResult: {
      type: String,
      enum: ["Pending", "Passed", "Partial", "Failed"],
      default: "Passed"
    },
    inspectionDate: { type: Date },
    inspectionNotes: { type: String, trim: true },
    inspectedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    outcomeStatus: {
      type: String,
      enum: ["Completed", "Return Required", "Return in Progress", "Resolved"],
      default: "Completed"
    },
    invoiceStatus: {
      type: String,
      enum: ["Ready for Invoice", "Blocked by Return"],
      default: "Ready for Invoice"
    },
    returnResolution: { type: String, enum: ["Replacement", "Credit Note"] },
    returnDispatchedAt: { type: Date },
    returnResolvedAt: { type: Date },
    returnResolvedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job"
    },
    supplierInvoices: {
      type: [{
        fileName: { type: String, required: true },
        originalname: { type: String, required: true }
      }],
      default: []
    },
    supplierDeliveryNotes: {
      type: [{
        fileName: { type: String, required: true },
        originalname: { type: String, required: true }
      }],
      default: []
    },
    items: {
      type: [itemSchema],
      default: []
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Employee"
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

export default model<GRN>("GRN", grnSchema);
