import { Schema, Document, model, Types } from "mongoose";

export interface SupplierComparison extends Document {
    supplierId: Types.ObjectId;
    quantity: Number;
    unitPrice: Number;
    etaTerms: String;
    paymentTerms: String;
    selected: Boolean;
    createdBy: Types.ObjectId;
    createdAt : Date
}

export const supplierComparisonSchema = new Schema<SupplierComparison>({
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
        required : true,
    },
    quantity: {
        type: Number,
        required: true
    },
    unitPrice: {
        type: Number,
        required: true
    },
    etaTerms: {
        type: String,
    },
    paymentTerms: {
        type: String,
        required: true
    },
    selected: {
        type: Boolean,
        default: false,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref:'Employee',
        required: true
    },
    createdAt : {
        type: Date,
        default: Date.now()
    }
})

export default model<SupplierComparison>("SupplierComparison", supplierComparisonSchema)