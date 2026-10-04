import { Schema, Document, model, Types } from "mongoose";

export interface SupplierComparison extends Document {
    supplierId: Types.ObjectId;
    supplierName?: String;
    quantity: Number;
    unitPrice: Number;
    discountType?: String;
    discountValue?: Number;
    taxPercent?: Number;
    freightCost?: Number;
    totalCost?: Number;
    netAmount?: Number;
    landedCost?: Number;
    etaTerms: String;
    paymentTerms: String;
    validityDate?: Date;
    warrantyTerms?: String;
    remarks?: String;
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
    supplierName: {
        type: String
    },
    quantity: {
        type: Number,
        required: true
    },
    unitPrice: {
        type: Number,
        required: true
    },
    discountType: {
        type: String,
        enum: ['amount', 'percent'],
        default: 'amount'
    },
    discountValue: {
        type: Number,
        default: 0
    },
    taxPercent: {
        type: Number,
        default: 0
    },
    freightCost: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number,
        default: 0
    },
    netAmount: {
        type: Number,
        default: 0
    },
    landedCost: {
        type: Number,
        default: 0
    },
    etaTerms: {
        type: String,
    },
    paymentTerms: {
        type: String,
        required: true
    },
    validityDate: {
        type: Date
    },
    warrantyTerms: {
        type: String
    },
    remarks: {
        type: String
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
