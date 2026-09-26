import { getCustomerType } from "./customerType.interface";
import { getDepartment } from "./department.interface";

export const CUSTOMER_STATUSES = ["Active", "Inactive", "Blacklisted", "On Hold", "Prospect"] as const;
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];

export const PAYMENT_TERMS = ["Cash", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"] as const;
export type PaymentTerm = typeof PAYMENT_TERMS[number];

export const CREDIT_STATUSES = ["Good Standing", "Watch", "Hold", "Exceeded"] as const;
export type CreditStatus = typeof CREDIT_STATUSES[number];

export interface ContactDetail {
    _id?: string
    courtesyTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNo:string;
    department:getDepartment;
    designation?: string;
    role?: string;
    isPrimary?: boolean;
}

export interface AddressDetail {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
}

export interface ShippingSite {
    _id?: string;
    siteName: string;
    address?: AddressDetail;
}

export interface CustomerStatusHistoryEntry {
    status: CustomerStatus;
    reason?: string;
    changedBy: string;
    changedDate: string;
}

export interface CustomerAttachment {
    fileName: string;
    originalname: string;
}

export interface getCustomer {
    _id: string;
    clientRef:string;
    department: getDepartment;
    departments?: getDepartment[];
    contactDetails: ContactDetail[];
    companyName: string;
    companyAddress: string;
    companyAddressStructured?: AddressDetail;
    shippingAddress?: string;
    shippingAddressStructured?: AddressDetail;
    shippingSites?: ShippingSite[];
    sameAsBilling: boolean;
    trn?: string;
    customerEmailId: string;
    contactNo: number;
    customerType:getCustomerType;
    status: CustomerStatus;
    statusReason?: string;
    paymentTerms?: string;
    creditLimit?: number;
    creditStatus?: CreditStatus;
    taxExempt?: boolean;
    currency?: string;
    source?: string;
    statusHistory?: CustomerStatusHistoryEntry[];
    attachments?: CustomerAttachment[];
    createdBy:string;
    sharedWith:string[];
    updatedBy?: string;
    updatedDate?: string;
}


export interface getFilteredCustomer {
    total:number,
    customers:getCustomer[]
}

export interface getCustomerByID {
    access:boolean,
    customerData:getCustomer;
}

export interface FilterCustomer {
    page: number;
    row: number;
    createdBy: string | null;
    creditStatus?: string | null;
}
