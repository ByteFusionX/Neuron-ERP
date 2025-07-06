export interface QuoteItemDetails {
    detail: string;
    quantity: number;
    unitCost: number;
    profit: number;
    availability: string;
    supplierName?: string;
    email?: string;
    phoneNo?: string;
    dealSelected: boolean;
    comparison: boolean;
    comparisons: Comparisons[];
}

export interface Comparisons {
    supplierName?: string,
    supplierId?: string,
    quantity: number,
    unitPrice: number,
    totalCost: number,
    etaTerms: any,
    paymentTerms: any,
    selected: boolean,
    createdBy?: any,
}

export interface QuoteItem {
    itemName: string;
    itemDetails: QuoteItemDetails[];
}

export interface MrDetails {
    engineer: string;
    message: string;
}

export interface SupplierDiscount {
    supplier: string;
    discount: string;
    discountType?: string;
}

export interface PurchaseData {
    _id?: string,
    customer?: string;
    customerId: any;
    salesManager: string;
    purchaseNo: string;
    jobId: any;
    dealSheetId: string;
    items: QuoteItem[];
    totalLpo: number;
    status?: string;
    mr?: MrDetails;
    supplierDiscounts?: {
        suppliers: SupplierDiscount[];
        totalDiscount: string;
    };
    createdBy: any,
    createdAt: Date,
    updatedAt?: Date,
}

export enum PurchaseStatus {
    PENDING = 'Pending',
    APPROVED = 'Approved',
    REJECTED = 'Rejected'
}