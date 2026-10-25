import { Schema, Document, model, Types } from "mongoose";
import supplierComparisonModel, { SupplierComparison, supplierComparisonSchema } from "./supplierComparison.model";

export interface ItemDetail {
    detail: string;
    quantity: number;
    unitCost: number;
    unitSellingPrice: number;
    dealUnitCost?: number;
    profit: number;
    availability: string;
    uom?: string;
    itemCode?: string;
    partNo?: Types.ObjectId;
    supplierName?: string;
    supplierId?: Types.ObjectId;
    email?: string;
    phoneNo?: string;
    dealSelected: boolean;
    isNewlyAdded?: boolean;
    merged?: boolean;
    fromMrRequest?: boolean;
    short?: boolean;
    shortReason?: string;
}

export interface Item extends Document {
    itemName: string;
    itemDetails: ItemDetail[];
}


const itemDetailSchema = new Schema({
    detail: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitCost: {
        type: Number,
        required: true,
        min: 0
    },
    unitSellingPrice: {
        type: Number,
        required: false,
        min: 0
    },
    // Purchase: the cost the deal started with, kept when a supplier award changes unitCost.
    dealUnitCost: {
        type: Number,
        min: 0
    },
    profit: {
        type: Number,
        min: 0
    },
    availability: {
        type: String,
    },
    uom: {
        type: String,
        trim: true
    },
    itemCode: {
        type: String,
        trim: true
    },
    partNo: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
    },
    supplierName: {
        type: String
    },
    // The line's default supplier (deal sheet supplier or the product's default vendor); used when no RFQ award is made.
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
    },
    email: {
        type: String,
        validate: {
            validator: (val: string) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
            message: 'Invalid email format'
        }
    },
    phoneNo: {
        type: String
    },
    dealSelected: {
        type: Boolean,
        default: false
    },
    isNewlyAdded: {
        type: Boolean,
        default: false
    },
    merged: {
        type: Boolean,
        default: false
    },
    issued: {
        type: Boolean,
        default: false
    },
    issuedQuantity: {
        type: Number,
        default: 0
    },
    fromMrRequest: {
        type: Boolean,
        default: false
    },
    // A PR line the buyer accepts as not fully covered (no supplier, or not enough quantity); it may go for approval as it is.
    short: {
        type: Boolean,
        default: false
    },
    shortReason: {
        type: String,
        trim: true
    },
    comparisons: {
        type: [supplierComparisonSchema],
        required: true
    }
});

export const itemSchema = new Schema({
    itemName: {
        type: String,
        required: true
    },
    itemDetails: {
        type: [itemDetailSchema],
        validate: [(v: any[]) => Array.isArray(v) && v.length > 0, 'At least one item detail is required']
    }
});

export default model<Item>("Item", itemSchema)