import { Schema, model, Types } from "mongoose";

export const PRODUCT_TYPES = ['Stock', 'Non-Stock'] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export const PRODUCT_APPROVAL_STATUSES = ['Draft', 'Pending', 'Approved'] as const;
export type ProductApprovalStatus = typeof PRODUCT_APPROVAL_STATUSES[number];

export const PRODUCT_SOURCES = ['Manual', 'RFQ', 'Import'] as const;
export type ProductSource = typeof PRODUCT_SOURCES[number];

export const PRODUCT_ALIAS_TYPES = ['Superseded', 'Supplier SKU', 'Customer Ref', 'Old Code'] as const;
export type ProductAliasType = typeof PRODUCT_ALIAS_TYPES[number];

export interface ProductAlias {
    value: string;
    valueNormalized: string;
    type: ProductAliasType;
    supplierId?: Types.ObjectId;
    customerId?: Types.ObjectId;
    note?: string;
}

interface Product {
    partNo: string;
    partNoNormalized?: string;
    brandKey?: string;
    aliases?: ProductAlias[];
    source?: ProductSource;
    /** Groups size / voltage variants under one model. */
    parentModel?: string;
    /** Services and generic items: brand and part number are optional. */
    isGeneric?: boolean;
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
    trackingType?: string;
    costMethod?: string;
    defaultVendor?: Types.ObjectId;
    reorderMin?: number;
    reorderMax?: number;
    reorderPoint?: number;
    leadTimeDays?: number;
    barcode?: string;
    specs?: string;
    images?: string[];
    alternativeProducts?: Types.ObjectId[];
    uomConversions?: {
        fromUom: string;
        toUom: string;
        factor: number;
    }[];
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
        required: function (this: any) { return !this.isGeneric && this.approvalStatus !== 'Pending'; },
    },
    partNoNormalized: {
        type: String,
        index: true,
    },
    brandKey: {
        type: String,
    },
    aliases: {
        type: [{
            value: { type: String, required: true, trim: true },
            valueNormalized: { type: String, required: true, index: true },
            type: { type: String, enum: PRODUCT_ALIAS_TYPES, default: 'Superseded' },
            supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
            customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
            note: { type: String, trim: true },
        }],
        default: [],
    },
    source: {
        type: String,
        enum: PRODUCT_SOURCES,
        default: 'Manual',
    },
    parentModel: {
        type: String,
        trim: true,
        index: true,
    },
    isGeneric: {
        type: Boolean,
        default: false,
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
        required: function (this: any) { return this.approvalStatus !== 'Pending'; },
    },
    productSegment: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: function (this: any) { return this.approvalStatus !== 'Pending'; },
    },
    warehouse: {
        type: Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: function (this: any) { return this.approvalStatus !== 'Pending'; },
    },
    brand: {
        type: String,
        required: function (this: any) { return !this.isGeneric && this.approvalStatus !== 'Pending'; },
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
    trackingType: {
        type: String,
        enum: ['None', 'Serial', 'Batch'],
        default: 'None',
    },
    costMethod: {
        type: String,
        enum: ['Standard', 'Weighted Average', 'FIFO'],
        default: 'Weighted Average',
    },
    defaultVendor: {
        type: Schema.Types.ObjectId,
        ref: 'Supplier',
    },
    reorderMin: {
        type: Number,
        min: 0,
    },
    reorderMax: {
        type: Number,
        min: 0,
    },
    reorderPoint: {
        type: Number,
        min: 0,
    },
    leadTimeDays: {
        type: Number,
        min: 0,
    },
    barcode: {
        type: String,
        trim: true,
    },
    specs: {
        type: String,
        trim: true,
    },
    images: {
        type: [String],
        default: [],
    },
    alternativeProducts: [{
        type: Schema.Types.ObjectId,
        ref: 'Product',
    }],
    uomConversions: {
        type: [{
            fromUom: { type: String, trim: true },
            toUom: { type: String, trim: true },
            factor: { type: Number, min: 0 },
        }],
        default: [],
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

// Lookup used by the duplicate check: same brand + same normalised part number.
productSchema.index({ brandKey: 1, partNoNormalized: 1 });

export default model<Product>('Product', productSchema);
