import { getCustomerType } from "./customerType.interface";
import { getDepartment } from "./department.interface";

export interface ContactDetail {
    _id?: string
    courtesyTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNo:string;
    department:getDepartment;
}

export interface getCustomer {
    _id: string;
    clientRef:string;
    department: getDepartment;
    contactDetails: ContactDetail[];
    companyName: string;
    companyAddress: string;
    customerEmailId: string;
    contactNo: number;
    customerType:getCustomerType;
    createdBy:string;
    sharedWith:string[];
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