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
    customer: string;
    salesManager: string;
    purchaseNo: string;
    jobId: string;
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
}
