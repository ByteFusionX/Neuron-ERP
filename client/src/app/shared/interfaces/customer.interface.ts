import { getCustomerType } from "./customerType.interface";
import { getDepartment } from "./department.interface";

export const CUSTOMER_STATUSES = ["Active", "Inactive", "Blacklisted", "On Hold", "Prospect"] as const;
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];

export interface ContactDetail {
    _id?: string
    courtesyTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNo:string;
    department:getDepartment;
    designation?: string;
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

export interface CustomerStatusHistoryEntry {
    status: CustomerStatus;
    reason?: string;
    changedBy: string;
    changedDate: string;
}

export interface getCustomer {
    _id: string;
    clientRef:string;
    department: getDepartment;
    contactDetails: ContactDetail[];
    companyName: string;
    companyAddress: string;
    companyAddressStructured?: AddressDetail;
    shippingAddress?: string;
    shippingAddressStructured?: AddressDetail;
    sameAsBilling: boolean;
    trn?: string;
    customerEmailId: string;
    contactNo: number;
    customerType:getCustomerType;
    status: CustomerStatus;
    statusReason?: string;
    statusHistory?: CustomerStatusHistoryEntry[];
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
}