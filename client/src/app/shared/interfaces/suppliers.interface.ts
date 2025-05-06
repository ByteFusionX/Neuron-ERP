// Supplier Interface Definitions

// Address interface
export interface Address {
    StreetNo: string;
    buildingNo: string;
    zoneNo: string;
    poBox: string;
    city: string;
    country: string;
  }
  
  // Contact Details interface
  export interface ContactDetail {
    contactName: string;
    contactDesignation: string;
    contactNumber: string;
  }
  
  // Product interface
  export interface Product {
    products: string;
    name: string;
    email: string;
    phone: string;
    paymentTerms: string;
  }
  
  // Document interface
  export interface Document {
    fileName: string;
    originalname: string;
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
    _id: string;
    id: string;
    supplierName: string;
    address: {
        streetNo: string;
        zoneNo: string;
        buildingNo: string;
        poBox: string;
        location: string;
    };
    supplierType: string;
    category: string;
    primaryContact: {
        name: string;
        email: string;
        phoneNumber: string;
    };
    products: Array<{
        productName: string;
        paymentTerm: string;
        contactName?: string;
        contactEmail?: string;
        contactNo?: string;
    }>;
    creditDays: number;
    creditValue: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  }
  
  // Request interface for creating or updating a supplier
  export interface SupplierCreateRequest {
    supplierName: string;
    address: {
        streetNo: string;
        zoneNo: string;
        buildingNo: string;
        poBox: string;
        location: string;
    };
    supplierType: string;
    category: string;
    primaryContact: {
        name: string;
        email: string;
        phoneNumber: string;
    };
    products: Array<{
        productName: string;
        paymentTerm: string;
        contactName?: string;
        contactEmail?: string;
        contactNo?: string;
    }>;
    creditDays: number;
    creditValue: number;
  }
  
  // Request interface for updating a supplier status
  export interface SupplierStatusUpdateRequest {
    approvedBy: string; // User ID
    comment?: string; // Optional comment for status change
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
        name: string;
        url: string;
        type: string;
        size: number;
    }>;
}