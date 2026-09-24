import { getEmployee } from "./employee.interface";

export interface getDepartment {
    _id?:string;
    departmentName: string;
    departmentHead: getEmployee[];
    forCustomerContact: boolean;
    createdDate: number;
    code?: string;
    isActive?: boolean;
    salesTarget?: number;
}

export interface Department{
    _id?:string;
    departmentName:string,
    departmentHead?:string,
    forCustomerContact?:boolean,
    createdDate:number,
    code?:string,
    isActive?:boolean,
    salesTarget?:number
}

export interface getInternalDep{
    _id?:string;
    departmentName: string;
    departmentHead: getEmployee[] | string;
    createdDate: number;
    description?: string;
    parentDepartment?: string | null;
    code?: string;
    costCentre?: string;
    isActive?: boolean;
}