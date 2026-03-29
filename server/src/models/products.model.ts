import { Schema, model, Types } from "mongoose";

interface Product {
    partNo: string;
    productDescription: string;
    productCategory: Types.ObjectId;
    productSegment: Types.ObjectId;
    warehouse: Types.ObjectId;
    createdBy: Types.ObjectId;
    createdDate: Date;
    updatedDate: Date;
    updatedBy: Types.ObjectId;
    isDeleted: boolean;
}


const productSchema = new Schema<Product>({
    partNo: {
        type: String,
        required: true,
    },
    productDescription: {
        type: String,
        required: true,
    },
    productCategory: {
        type: Schema.Types.ObjectId,
        ref: 'ProductCategory',
        required: true,
    },
    productSegment: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
    },
    warehouse: {
        type: Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    createdDate: {
        type: Date,
        required: true,
    },
    updatedDate: {
        type: Date,
        default: Date.now,
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

export default model<Product>('Product', productSchema);
