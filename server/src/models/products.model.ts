import { Schema, model, Types } from "mongoose";

export const PRODUCT_TYPES = ['Stock Product', 'Non-Stock Product', 'Service'] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export const PRODUCT_APPROVAL_STATUSES = ['Draft', 'Pending', 'Approved'] as const;
export type ProductApprovalStatus = typeof PRODUCT_APPROVAL_STATUSES[number];

interface Product {
    partNo: string;
    itemCode: string;
    productName?: string;
    productDescription: string;
    productCategory: Types.ObjectId;
    productSegment: Types.ObjectId;
    warehouse: Types.ObjectId;
    brand: string;
    type?: ProductType;
    unitOfMeasure?: string;
    defaultTaxRate?: number;
    defaultSellingPrice?: number;
    estimatedCost?: number;
    isActive: boolean;
    approvalStatus: ProductApprovalStatus;
    approvedBy?: Types.ObjectId;
    approvedDate?: Date;
    rejectionReason?: string;
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
    itemCode: {
        type: String,
        required: true,
    },
    productName: {
        type: String,
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
    brand: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: PRODUCT_TYPES,
    },
    unitOfMeasure: {
        type: String,
    },
    defaultTaxRate: {
        type: Number,
    },
    defaultSellingPrice: {
        type: Number,
    },
    estimatedCost: {
        type: Number,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    approvalStatus: {
        type: String,
        enum: PRODUCT_APPROVAL_STATUSES,
        default: 'Approved',
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    approvedDate: {
        type: Date,
    },
    rejectionReason: {
        type: String,
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
