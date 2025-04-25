import { Schema, Document, model, Types } from "mongoose";
import supplierComparisonModel, { SupplierComparison, supplierComparisonSchema } from "./supplierComparison.model";

interface Item extends Document {
    itemName: String;
    quantity: Number;
    unitPrice: Number;
    comparisonSheet: SupplierComparison[];
}

const itemSchema = new Schema<Item>({
    itemName:{
        type: String,
        required: true
    },
    quantity:{
        type: String,
        required: true
    },
    unitPrice: {
        type: String,
        required: true
    },
    comparisonSheet: [ {type: supplierComparisonSchema, required: true}],
    
})

export default model<Item>("Item", itemSchema)