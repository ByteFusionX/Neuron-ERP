import { getJob } from "./job.interface";
import { Quotatation } from "./quotation.interface";
import { Supplier } from "./suppliers.interface";

export interface ProductPartNumber {
    _id: string;
    partNo: string;
    productDescription?: string;
}

export interface QuoteItemDetails {
    _id?: string;
    detail: string;
    quantity: number;
    unitCost: number;
    unitSellingPrice: number;
    availability: string;
    partNo?: string | ProductPartNumber;
    supplierName?: string;
    email?: string;
    phoneNo?: string;
    dealSelected: boolean;
    comparison: boolean;
    comparisons: Comparisons[];
    isNewlyAdded?: boolean;
    merged?: boolean;
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
    supplierId: string;
    discount: string;
    discountType?: string;
}

export interface RejectedReason {
    rejectedBy: {
        _id: string;
        firstName: string;
        lastName: string;
        email?: string;
    };
    comment: string;
    rejectedAt: string;
    _id: string;
}

export interface PurchaseData {
    _id?: string,
    customer?: any;
    customerId: any;
    salesManager: string;
    purchaseNo: string;
    jobId: any;
    quoteId?: any;
    dealSheetId: string;
    items: QuoteItem[];
    totalLpo: number;
    status?: string;
    rejectedReason?: RejectedReason[];
    mr?: MrDetails;
    supplierDiscounts?: {
        suppliers: SupplierDiscount[];
        totalDiscount: string;
    };
    createdBy: any,
    createdAt: Date,
    updatedAt?: Date,
    lpoValue?: number;
    totalPRCost?: number;
    totalDealCost?: number;
    totalDiscountReceived?: number;
    dealProfit?: number;
    currency?: string;
    sourceType?: string;
}

export enum PurchaseStatus {
    PENDING = 'Pending',
    APPROVED = 'Approved',
    REJECTED = 'Rejected'
}

export interface PurchaseOrder {
  _id?: string;
  poNo: string;
  poStatus: string;
  items: {
    detail: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }[];
  supplierId: any;
  purchaseId: any;
  jobId: any;
  quoteId?: any;
  etaTerms: string;
  paymentTerms: string;
  shippingTerms: string;
  placeOfDelivery: string;
  subject: string;
  poDate: Date;
  termsAndCondition: string;
  discount: number;
  purchaseCompany?: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: any;
}