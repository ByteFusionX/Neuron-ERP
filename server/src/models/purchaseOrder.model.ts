import { Schema, Document, model } from "mongoose";

interface PurchaseOrder extends Document {
    lpoNo: string;
    lpoValue: number;
    lpoStatus: String;
    items: {
        detail: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
    }[];
    purchaseId: any;
    jobId: any;
    quoteId: any;
    createdAt: Date;
    updatedAt: Date;
    createdBy: any;
}

interface Comparison {
  supplierId: any;
  quantity: number;
  unitPrice: number;
  etaTerms: string;
  paymentTerms: string;
  selected: boolean;
  createdBy: any;
  createdAt: Date; 
}

interface ItemDetails extends Document {
  detail: string;
  quantity: number;
  unitCost: number;
  profit: number;
  availability: string;
  supplierName: string;
  email: string;
  phoneNo: string;
  dealSelected: boolean;
  comparisons: Comparison;
  itemName: string;
}

const comparisonSchema = new Schema<Comparison>({
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
  quantity: { type: Number },
  unitPrice: { type: Number },
  etaTerms: { type: String },
  paymentTerms: { type: String },
  selected: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  createdAt: { type: Date, default: Date.now },
});

const ItemDetailSchema = new Schema<ItemDetails>({
  detail: { type: String },
  quantity: { type: Number },
  unitCost: { type: Number },
  profit: { type: Number },
  availability: { type: String },
  supplierName: { type: String },
  email: { type: String },
  phoneNo: { type: String },
  dealSelected: { type: Boolean, default: false },
  comparisons: { type: comparisonSchema },
  itemName: { type: String },
});


const purchaseOrderSchema = new Schema<PurchaseOrder>(
    {
        lpoNo: {
            type: String,
            required: true,
            unique: true,
        },
        lpoValue: {
            type: Number,
            required: true,
        },
        lpoStatus: {
            type: String,
            enum: ["open", 'Hold', 'Closed', 'Cancelled'],
            default: "open",
        },
        items: [ItemDetailSchema],
        purchaseId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "PurchaseRequest",
        },
        jobId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "Job",
        },
        quoteId: {
            type: Schema.Types.ObjectId,
            ref: "Quotation",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Employee",
        },
    },
    { timestamps: true }
);


export default model<PurchaseOrder>("PurchaseOrder", purchaseOrderSchema);
