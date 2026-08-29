import { getJob } from "./job.interface";

export interface DeliveryNote {
    _id: string;
    dnNo: string;
    dnDate: string; // or Date
    jobId: any; // Populated or ID
    clientName: string;
    customerLpoNumber: string;
    subject: string;
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
    // Helper fields for UI if needed
    job?: { _id: string, jobId: string, projectName: string }; // If populated in 'job' field
}

export interface GetDeliveryNoteResponse {
    total: number;
    dns: DeliveryNote[];
}

export const DnStatus = {
    DRAFT: 'Draft',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
    PARTIALLY_REJECTED: 'Partially Rejected'
};
