import { Schema, Document, model, Types } from "mongoose";

export enum SupplierPriceSource {
    PR = 'PR',
    PO = 'PO'
}

/** The last price a supplier gave for a product: one row per supplier, product and currency. */
export interface SupplierPrice extends Document {
    supplierId: Types.ObjectId;
    productId: Types.ObjectId;
    currency: string;
    lastPrice: number;
    lastDate: Date;
    source: SupplierPriceSource;
    sourceNo?: string;
    sourceId?: Types.ObjectId;
    previousPrice?: number;
    updatedBy?: Types.ObjectId;
}

const supplierPriceSchema = new Schema<SupplierPrice>({
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true
    },
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    currency: {
        type: String,
        required: true,
        default: 'QAR'
    },
    lastPrice: {
        type: Number,
        required: true,
        min: 0
    },
    lastDate: {
        type: Date,
        required: true
    },
    source: {
        type: String,
        enum: Object.values(SupplierPriceSource),
        required: true
    },
    sourceNo: {
        type: String
    },
    sourceId: {
        type: Schema.Types.ObjectId
    },
    previousPrice: {
        type: Number
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
    }
}, { timestamps: true });

supplierPriceSchema.index({ supplierId: 1, productId: 1, currency: 1 }, { unique: true });
supplierPriceSchema.index({ productId: 1 });

export default model<SupplierPrice>('SupplierPrice', supplierPriceSchema);
