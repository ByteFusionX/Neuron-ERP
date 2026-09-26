import { Department } from "./department.interface";

export interface getEmployee {
  _id?: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  dob: string;
  department: string;
  contactNo: number | string;
  category: GetCategory;
  dateOfJoining: string;
  reportingTo: string | null | undefined;
  targets: Target[];
  isBlocked?: boolean;
}

export interface getEmployeeDetails {
  _id?: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  dob: string;
  department: Department;
  contactNo: number | string;
  category: GetCategory;
  dateOfJoining: string;
  reportingTo: getEmployee | null;
  salesValue: number;
  profitValue: number;
  targets: Target[];
  isBlocked?: boolean;
  contractType?: ContractType;
  contractStart?: string;
  contractEnd?: string;
  probationEnd?: string;
  isTechnician?: boolean;
  isDriver?: boolean;
  isProjectManager?: boolean;
  driverLicense?: DriverLicense;
  /** Only present when the viewer has employee.viewCompensation. */
  compensation?: Compensation;
  employmentHistory?: EmploymentHistoryEntry[];
}

export type ContractType = 'permanent' | 'fixed-term' | 'probation' | 'contractor' | 'intern';

export interface DriverLicense {
  number?: string;
  licenseClass?: string;
  expiry?: string;
}

export interface Compensation {
  costRatePerHour?: number;
  billingRate?: number;
}

export interface EmploymentHistoryEntry {
  effectiveDate: string;
  fromDesignation?: string;
  toDesignation?: string;
  fromDepartment?: string;
  toDepartment?: string;
  fromReportingTo?: string | null;
  toReportingTo?: string | null;
  reason?: string;
  changedBy?: string;
  changedAt: string;
}


export interface Target {
  _id?: string;
  year: string;
  salesRevenue: RangeTarget;
  grossProfit: RangeTarget;
}

export interface RangeTarget {
  targetValue: number;
  criticalRange: number;
  moderateRange: number;
}


export interface CreateEmployee {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  dob: string;
  department: string;
  contactNo: number | string;
  category: string;
  dateOfJoining: string;
  reportingTo: string | null | undefined;
  createdBy: string | undefined;
  contractType?: ContractType;
  contractStart?: string;
  contractEnd?: string;
  probationEnd?: string;
  isTechnician?: boolean;
  isDriver?: boolean;
  isProjectManager?: boolean;
  driverLicense?: DriverLicense;
  compensation?: Compensation;
  effectiveDate?: string;
  changeReason?: string;
}


export interface getCreators {
  _id: string,
  fullName: string
}

export interface getEmployeeObject {
  employeeData: getEmployee
}


export interface FilterEmployee {
  page?: number;
  row?: number;
  search?: string;
  access?: string | undefined;
  userId?: string | undefined;
  department?: string | null;
  status?: 'active' | 'blocked' | null;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc' | null;
}

export interface GetCategory {
  _id?: string;
  categoryName: string;
  role: string;
  isSalespersonWithTarget: boolean;
  /** Keys from the Responsibility master list. Older roles may still hold the retired object shape. */
  responsibilities?: string[] | Record<string, boolean>;
  employeeCount?: number;
  privileges: Privileges;
}

export interface ApprovalLimit {
  maxAmount: number | null;
  maxDiscountPercent: number | null;
}

export interface Responsibility {
  _id?: string;
  key: string;
  label: string;
  description?: string;
  isActive: boolean;
}

export interface getEmployeeByID {
  access: boolean;
  employeeData: getEmployeeDetails
}

export interface Privileges {
  dashboard: {
    viewReport: string;
    compareAgainst: string;
  };
  employee: {
    viewReport: string;
    create: boolean;
    edit?: boolean;
    delete?: boolean;
    block?: boolean;
    viewCompensation?: boolean;
  };
  announcement: {
    viewReport: string;
    create: boolean;
    deleteOrEdit: boolean;
  };
  customer: {
    viewReport: string;
    create: boolean;
    edit?: boolean;
    delete?: boolean;
    share: boolean;
    transfer: boolean;
  };
  enquiry: {
    viewReport: string;
    create: boolean;
  };
  assignedJob: {
    viewReport: string;
    assign?: boolean;
  };
  quotation: {
    viewReport: string;
    create: boolean;
  };
  jobSheet: {
    viewReport: string;
    allocateJobs: boolean;
    transferProcurementPerson: boolean;
  };
  dealSheet: boolean;
  purchase: {
    viewReport: string;
    create: boolean;
    canApprovePR: boolean;
  };
  purchaseOrder: {
    viewReport: string;
    canInitiateLPO: boolean;
    canApprovePOs: boolean;
    canReissueAndRevoke: boolean;
  };
  grn: {
    viewReport: string;
    canUploadInvoice: boolean;
  };
  technical: {
    canViewOpenToWorkAndAssign: boolean;
    canTransferToEngineer: boolean;
    viewReport: string;
    canApproveMRRequests: boolean;
  };
  supplier: {
    viewReport: string;
    canApproveSupplier: boolean;
  };
  inventory: {
    products: {
      viewReport: string;
    };
    stockEntries: {
      viewReport: string;
    };
  };
  dispatch: {
    viewReport: string;
    createDeliveryNote: boolean;
    viewPendingDelivery: boolean;
    viewInvoiceLinking: boolean;
    viewInventoryDeduction: boolean;
  };
  invoice: {
    viewReport: string;
    createInvoice: boolean;
    viewInvoicesVsDn: boolean;
    viewCancelledAdjusted: boolean;
    viewReissued: boolean;
  };
  claims: {
    viewReport: string;
    canApprove: boolean;
  };
  sensitiveData?: {
    viewCost: boolean;
    viewMargin: boolean;
    overrideDiscount: boolean;
  };
  departments?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  roles?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  portalManagement: {
    department?: boolean;
    notesAndTerms: boolean;
    companyTarget: boolean;
    customerType: boolean;
    numbering: boolean;
    masterData: boolean;
    approvalRules: boolean;
    notifications: boolean;
    audit: boolean;
    companyProfileEdit?: boolean;
    numberingEdit?: boolean;
    masterDataEdit?: boolean;
    approvalRulesEdit?: boolean;
    notificationsEdit?: boolean;
    auditEdit?: boolean;
  };
}