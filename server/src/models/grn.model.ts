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
