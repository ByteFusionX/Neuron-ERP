import { getJob } from "./job.interface";

export interface DeliveryNote {
    _id: string;
    dnNo: string;
    dnDate: string; // or Date
    jobId: any; // Populated or ID
    clientName: string;
    customerLpoNumber: string;
    subject: string;
    deliveryType?: string;
    shipToName?: string;
    shipToAddress?: string;
    contactPerson?: string;
    contactNo?: string;
    deliveryInstructions?: string;
    pod?: {
        receivedBy?: string;
        receivedContactNo?: string;
        receivedDate?: string;
        remarks?: string;
        signatureName?: string;
        deliveredBy?: any;
        attachments?: { fileName: string; originalname: string }[];
    };
    items: {
        slNo: number;
        partNo: string;
        description: string;
        orderedQty: number;
        deliveredQty: number;
        currentDeliveryQty: number;
        serialNos: string[];
        status: string;
        itemId: string;
        isInventoryItem: boolean;
        rejectedQty?: number;
        rejectionReason?: string;
    }[];
    status: string;
    rejectedHistory?: {
        rejectedBy: any;
        reason: string;
        date: string;
    }[];
    createdBy: {
        _id: string;
        firstName: string;
        lastName: string;
    };
    createdDate: string;
    updatedDate: string;
    linkedRecords?: {
        purchaseOrders: {
            _id: string;
            poNo: string;
            poStatus: string;
            poDate: string;
            supplierId?: { supplierName?: string };
        }[];
        grns: {
            _id: string;
            grnNo: string;
            grnDate: string;
            inspectionResult: string;
            outcomeStatus: string;
            purchaseOrderId: string;
        }[];
    };
    // Helper fields for UI if needed
    job?: { _id: string, jobId: string, projectName: string }; // If populated in 'job' field
}

export interface GetDeliveryNoteResponse {
    total: number;
    dns: DeliveryNote[];
}

export const DnStatus = {
    DRAFT: 'Draft',
    READY_FOR_DISPATCH: 'Ready for Dispatch',
    DISPATCHED: 'Dispatched',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
    PARTIALLY_REJECTED: 'Partially Rejected'
};
