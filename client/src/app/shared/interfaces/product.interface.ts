import { getDepartment } from "./department.interface";

export const PRODUCT_TYPES = ["Stock Product", "Non-Stock Product", "Service"] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export interface getProductCategory {
    _id: string;
    categoryName: string;
}

export interface getWarehouse {
    _id: string;
    wareHouseName: string;
}

export interface getProduct {
    _id?: string;
    partNo: string;
    itemCode: string;
    productName?: string;
    productDescription: string;
    productCategory: getProductCategory | string;
    productSegment: getDepartment | string;
    warehouse: getWarehouse | string;
    brand: string;
    type: ProductType | '';
    unitOfMeasure?: string;
    defaultTaxRate?: number | null;
    defaultSellingPrice?: number | null;
    estimatedCost?: number | null;
    isActive: boolean;
    createdBy?: any;
    createdDate: Date | string;
    updatedDate?: Date | string;
    updatedBy?: any;
    isDeleted?: boolean;
}
