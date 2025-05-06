import { Schema, Document, model, Types } from "mongoose";

interface Category extends Document {
  categoryName: string;
  role: string;
  isSalespersonWithTarget: boolean,
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
  };
  announcement: {
    viewReport: string;
    create: boolean;
    deleteOrEdit: boolean;
  };
  customer: {
    viewReport: string;
    create: boolean;
    share: boolean;
    transfer: boolean;
  };
  enquiry: {
    viewReport: string;
    create: boolean;
  };
  assignedJob: {
    viewReport: string;
  };
  quotation: {
    viewReport: string;
    create: boolean;
  };
  jobSheet: {
    viewReport: string;
  };
  dealSheet: boolean,
  portalManagement: {
    department: boolean;
    notesAndTerms: boolean;
    companyTarget: boolean;
    customerType: boolean;
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
