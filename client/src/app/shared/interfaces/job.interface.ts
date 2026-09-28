import { Quotatation, QuoteItem } from "./quotation.interface";

export interface filterJob {
    search: string;
    page: number;
    row: number;
    status?: number | string | null;
    selectedMonth?: number;
    selectedYear?: number;
    salesPerson?: string | null;
    access?: string;
    userId?: string;
    allocateStatus?: allocateStatus | null;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc' | null;
}

export interface getJob {
    _id: string;
    jobId: string;
    quoteId: any;
    quotation: Quotatation;
    status: string;
    createdDate: string;
    updatedDate?: string;
    clientDetails?: any;
    salesPersonDetails?: any;
    departmentDetails?: any;
    purchaseNo?: any;
    mr?: any
    supplierDiscounts?:any;
    allocateStatus: allocateStatus
    allocateType: allocateType
    hasPurchaseRequest?: boolean;
    comment?: string;
    lpoValue?: number;
    procurementPerson?: {
        _id: string;
        firstName: string;
        lastName: string;
    };
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

export interface PreviousJobItems {
    _id: string;
    jobId: string;
    status: string;
    createdDate: string;
    items: QuoteItem[];
}

export enum allocateStatus {
    Pending = 'Pending',
    WorkInProgress = 'Work In Progress',
    OpenToWork = 'OpenToWork',
    Completed = 'Completed'
}