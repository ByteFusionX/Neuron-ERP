import { ContactDetail, getCustomer } from "./customer.interface";
import { getDepartment } from "./department.interface";
import { getEmployee, getEmployeeDetails } from "./employee.interface";
import { OptionalItems, QuoteItem } from "./quotation.interface";

export interface Enquiry {
    enquiryId: string;
    client: string;
    contact: string;
    department: string;
    salesPerson: string;
    title: string;
    date: string;
    attachments: File[];
    presale: Presale;
    status: string;
}

export interface Estimations {
    optionalItems: OptionalItems[];
    currency: string;
    totalDiscount: number;
    presaleNote: string;
}



export interface getEnquiry {
    _id: string;
    enquiryId: string;
    client: getCustomer;
    contact: ContactDetail;
    department: getDepartment;
    salesPerson: { _id: string, firstName: string, lastName: string };
    title: string;
    date: string;
    attachments: Files[];
    preSale: {
        presalePerson: getEmployeeDetails;
        presaleFiles: Files[] | null;
        items?: QuoteItem[];
        comment: string;
        feedback?: feedback[];
        seenbyEmployee?: boolean;
        seenbySalesPerson?: boolean;
        estimations:Estimations
    };
    status: string;
    reAssignedSeen:boolean;
    eventId?:any;
    reAssigned: getEmployeeDetails;
}

export interface EnquiryTable {
    total: number;
    enquiry: getEnquiry[];
}

export interface FeedbackTable {
    total: number;
    feedbacks: getEnquiry[];
}

export interface TotalEnquiry {
    totalEnquiries: number;
    departmentId: string;
    departmentName: string;
    enquiry?: getEnquiry[];
}

export interface MonthlyEnquiry {
    total: number;
    department: getDepartment[];
    enquiry?: getEnquiry[];
    year: number;
    month: number;
}

export interface FilterEnquiry {
    page: number;
    row: number;
    salesPerson: string | null;
    status: string | null;
    fromDate: string | null;
    toDate: string | null;
}

export interface Files {
    fieldname: string,
    originalname: string,
    encoding: string,
    mimetype: string,
    destination: string,
    filename: string,
    path: string,
    size: number,
}

export interface feedback {
    _id?:string,
    employeeId:getEmployee,
    feedback:string
    seenByFeedbackProvider:boolean,
    seenByFeedbackRequester:boolean
}

export interface Presale {
    presalePerson: string;
    newPresaleFile: File[];
    comment: string;
    presalePersonName: string;
    feedback: feedback
};