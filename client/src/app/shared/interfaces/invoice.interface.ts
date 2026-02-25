export interface Invoice {
    _id: string;
    invoiceNo: string;
    date: Date;
    customer: {
        _id: string;
        companyName: string;
    };
    jobId: {
        _id: string;
        jobId: string;
    };
    salesperson: {
        _id: string;
        firstName: string;
        lastName: string;
    };
    amount: number;
    status: 'Paid' | 'Unpaid' | 'Partially Paid' | 'Cancelled' | 'Reissued';
    items: InvoiceItem[];
    parentInvoiceId?: string;
    referenceInvoiceId?: string;
    cancellationReason?: string;
    cancelledBy?: {
        _id: string;
        firstName: string;
        lastName: string;
        role: string;
    };
    cancelledAt?: Date;
    reissuedInvoiceId?: string;
}

export interface InvoiceItem {
    dnId?: string;
    description: string;
    amount: number;
}

export interface InvoiceListResponse {
    success: boolean;
    data: {
        invoices: Invoice[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    };
}

export interface InvoiceFilterParams {
    page?: number;
    limit?: number;
    search?: string;
    customer?: string;
    jobId?: string;
    status?: string | string[];
    salesperson?: string;
    fromDate?: string;
    toDate?: string;
}
