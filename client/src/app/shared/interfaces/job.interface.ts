import { Quotatation } from "./quotation.interface";

export interface filterJob {
    search: string;
    page: number;
    row: number;
    status: number;
    selectedMonth?: number;
    selectedYear?: number;
}

export interface getJob {
    _id: string;
    jobId: string;
    quoteId: any;
    quotation: Quotatation;
    status: string;
    createdDate: string;
    clientDetails?: any;
    salesPersonDetails?: any;
    purchaseNo?: any;
    mr?: any
    supplierDiscounts?:any;
    allocateStatus: allocateStatus
    allocateType: allocateType
}

export interface Files {
    fieldname: string,
    originalname: string,
}

export interface JobTable {
    total: number;
    totalLpo: number;
    job: getJob[];
}

export enum JobStatus {
    WorkInProgress = 'Work In Progress',
    Delivered = 'Delivered',
    partiallyDelivered = 'Partially Delivered',
    completed = 'Completed',
    cancelled = 'Cancelled',
    onHold = 'On Hold',
    invoiced = 'Invoiced'
}

export enum allocateType {
    SupplyOnly = 'Supply Only',
    ProjectWithSupply = 'Project With Supply',
    ProjectsWithOutSupply = 'Projects With Out Supply',
    AMC = 'AMC'
}

export enum allocateStatus {
    Pending = 'Pending',
    WorkInProgress = 'Work In Progress',
    OpenToWork = 'OpenToWork',
    Completed = 'Completed'
}