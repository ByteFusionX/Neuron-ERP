import { Schema, Document, model, Types } from "mongoose";
import supplierComparisonModel, { SupplierComparison, supplierComparisonSchema } from "./supplierComparison.model";

export interface ItemDetail extends Document {
    detail: string;
    quantity: number;
    unitCost: number;
    profit: number;
    availability: string;
    supplierName?: string;
    email?: string;
    phoneNo?: string;
    dealSelected: boolean;
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
    profit: {
        type: Number,
        min: 0
    },
    availability: {
        type: String,
    },
    supplierName: {
        type: String
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
    comparisonSheet: {
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