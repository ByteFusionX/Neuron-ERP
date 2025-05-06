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
}


export interface Target {
  _id?:string;
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
}

export interface GetCategory {
  _id?: string;
  categoryName: string;
  role: string;
  isSalespersonWithTarget: boolean;
  privileges: Privileges;
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
  dealSheet: boolean;
  portalManagement: {
    department: boolean;
    notesAndTerms: boolean;
    companyTarget: boolean;
    customerType: boolean;
  };
}