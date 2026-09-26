import { Schema, Document, model, Types } from "mongoose";

interface Category extends Document {
  categoryName: string;
  role: string;
  isSalespersonWithTarget: boolean,
  responsibilities: string[];
  privileges: Privileges;
  isDeleted: boolean;
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
  dealSheet: boolean,
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
  stockHold: {
    viewReport: string;
    canInitiateHold: boolean;
    canIssueCreditNote: boolean;
    canCreateReplacementLPO: boolean;
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

export enum UserRole {
  user,
  admin,
  superAdmin
}

const categorySchema = new Schema<Category>({
  categoryName: {
    type: String,
    unique: true,
    required: true,
  },
  role: {
    type: String,
    enum: UserRole,
    required: true,
  },
  isSalespersonWithTarget: {
    type: Boolean,
    default:false
  },
  // Keys from the Responsibility master list (Settings > Master Data).
  responsibilities: {
    type: [String],
    default: [],
  },
  privileges: {
    type: Object,
    required: true,
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

export default model<Category>("Category", categorySchema);
