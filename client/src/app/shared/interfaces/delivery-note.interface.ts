
export interface DeliveryNote {
    _id: string;
    dnNo: string;
    dnDate: string; // or Date
    jobId: string | { _id: string, jobId: string, projectName: string }; // Populated or ID
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
    }[];
    status: string;
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
    GENERATED: 'Generated',
    DELIVERED: 'Delivered',
    PARTIALLY_DELIVERED: 'Partially Delivered',
    CANCELLED: 'Cancelled'
};
