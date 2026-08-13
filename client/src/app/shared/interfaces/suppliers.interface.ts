// Supplier Interface Definitions

// Address interface
export interface Address {
    streetNo: string;
    buildingNo: string;
    zoneNo: string;
    poBox: string;
    city: string;
    location: string;
}

// Contact Details interface
export interface ContactDetails {
    name: string;
    email: string;
    phoneNumber: string;
}

// Product interface
export interface Product {
    productName: string;
    contactName: string;
    contactEmail: string;
    contactNo: string;
    paymentTerm: string;
}

// Document interface
export interface Document {
    id: string;
    fileName: string;
}

// Enum for supplier status
export enum SupplierStatus {
    PENDING = 'Pending',
    APPROVED = 'Approved',
    REJECTED = 'Rejected'
}

// Employee reference interface (for populated fields)
export interface Employee {
    _id: string;
    firstName: string;
    lastName: string;
    designation: string;
    department: {
        _id: string;
        departmentName: string;
    };
}

// Main Supplier interface
export interface Supplier {
    _id?: string;
    supplierId: string;
    supplierName: string;
    address: Address;
    supplierType: string;
    category: {
      _id: string;
      departmentName: string;
    };
    contactDetails: ContactDetails;
    documents: Document[];
    status: SupplierStatus;
    products: Product[];
    creditDays: number;
    creditValue: number;
    createdDate: Date;
    updatedDate: Date;
    createdBy: string;
    approvedDate: Date;
    approvedBy: string;
    isDeleted: boolean;
    approvedHistory?: {
        date: Date;
        reason: string;
        approvedBy: {
            _id: string;
            firstName: string;
            lastName: string;
            email?: string;
        };
    }[];
    rejectHistory: {
        date: Date;
        reason: string;
        rejectedBy: {
            _id: string;
            firstName: string;
            lastName: string;
            email?: string;
        };
    }[];
}

// Request interface for creating or updating a supplier
export interface SupplierCreateRequest {
    supplierName: string;
    address: Address;
    supplierType: string;
    category: string;
    contactDetails: ContactDetails;
    products: Product[];
    creditDays: number;
    creditValue: number;
    createdBy?: string;
}

// Request interface for updating a supplier status
export interface SupplierStatusUpdateRequest {
    approvedBy: string;
    comment?: string;
}

// Parameters for listing suppliers with filtering and pagination
export interface SupplierListParams {
    page?: number;
    limit?: number;
    status?: SupplierStatus;
    supplierType?: string;
    category?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

// Response interface for a single supplier
export interface SupplierResponse {
    success: boolean;
    message: string;
    data: Supplier;
}

// Response interface for a list of suppliers with pagination
export interface SupplierListResponse {
    success: boolean;
    message: string;
    data: {
        suppliers: Supplier[];
        pagination: {
            total: number;
            page: number;
            pages: number;
            limit: number;
        };
    };
}

export interface CreateSupplierDto extends SupplierCreateRequest {
    files?: File[];
}

export interface PendingSupplier extends Supplier {
    documents: Array<{
        id: string;
        fileName: string;
    }>;
}