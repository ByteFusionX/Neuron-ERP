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
    source?: string | null;
    enquiryCategory?: string | null;
    priority?: string | null;
    requirement?: string | null;
    followUpOutcome?: string | null;
    lostReason?: string | null;
    competitorName?: string | null;
    competitorPriceGap?: string | null;
    date: string;
    nextFollowUpDate?: string;
    lastFollowUpDate?: string;
    followUpHistory?: EnquiryFollowUp[];
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
    source?: string | null;
    enquiryCategory?: string | null;
    priority?: string | null;
    requirement?: string | null;
    followUpOutcome?: string | null;
    lostReason?: string | null;
    competitorName?: string | null;
    competitorPriceGap?: string | null;
    date: string;
    nextFollowUpDate?: string;
    lastFollowUpDate?: string;
    followUpHistory?: EnquiryFollowUp[];
    daysSinceCreated?: number;
    daysSinceLastFollowUp?: number | null;
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
    viewCounts?: {
        all: number;
        mine: number;
        overdue: number;
        today: number;
        upcoming: number;
    };
}

export interface EnquiryFollowUp {
    _id?: string;
    date: string;
    outcome?: string;
    note?: string;
    nextFollowUpDate?: string;
    createdBy?: string | getEmployeeDetails;
    createdByName?: string;
    createdAt?: string;
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
    search?: string;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc' | null;
    salesPerson: string | null;
    customer?: string | null;
    department?: string | null;
    status: string | null;
    source?: string | null;
    enquiryCategory?: string | null;
    priority?: string | null;
    fromDate: string | null;
    toDate: string | null;
    followUpFromDate?: string | null;
    followUpToDate?: string | null;
    createdBy?: string | null;
    overdueFollowUp?: boolean;
    todayFollowUp?: boolean;
    upcomingFollowUp?: boolean;
    access?: string;
    userId?: string;
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

// ---- Enquiry report ---------------------------------------------------------------------------

export interface EnquiryReportFilter {
    salesPerson: string | null;
    customer: string | null;
    department: string | null;
    fromDate: string | null;
    toDate: string | null;
    access?: string;
    userId?: string;
}

export interface EnquiryReportKpi {
    totalCount: number;
    /** Neither quoted nor rejected. */
    openCount: number;
    presalesCount: number;
    estimatedCount: number;
    quotedCount: number;
    rejectedCount: number;
    /** Enquiries that were rejected by presales at least once, even if since reassigned. */
    everRejectedCount: number;
    sentToPresalesCount: number;
    conversionRate: number;
    /** Share of enquiries sent to presales that were rejected at least once. */
    rejectionRate: number;
    /** Null when no quoted enquiry has a quotation date to measure against. */
    avgDaysToQuote: number | null;
}

export interface EnquiryReportStage {
    key: string;
    label: string;
    count: number;
    pct: number;
}

export interface EnquiryReportBreakdownRow {
    id: string;
    name: string;
    count: number;
    openCount: number;
    quotedCount: number;
    rejectedCount: number;
    conversionRate: number;
}

/** An enquiry that needs chasing. `days` means age, time with presales or time since rejection, depending on the list. */
export interface EnquiryReportAttentionItem {
    _id: string;
    enquiryId: string;
    title: string;
    customer: string;
    salesPerson: string;
    presale: string;
    status: string;
    days: number;
    nextFollowUpDate?: string;
}

export interface EnquiryReportDetails {
    generatedAt: string;
    kpi: EnquiryReportKpi;
    funnel: EnquiryReportStage[];
    trend: { month: string; createdCount: number; quotedCount: number }[];
    breakdown: {
        department: EnquiryReportBreakdownRow[];
        salesPerson: EnquiryReportBreakdownRow[];
        customer: EnquiryReportBreakdownRow[];
        presale: EnquiryReportBreakdownRow[];
    };
    attention: {
        notStarted: EnquiryReportAttentionItem[];
        stuck: EnquiryReportAttentionItem[];
        awaitingQuote: EnquiryReportAttentionItem[];
        rejected: EnquiryReportAttentionItem[];
        overdueFollowUps: EnquiryReportAttentionItem[];
        notStartedDays: number;
        stuckDays: number;
        awaitingQuoteDays: number;
    };
    workload: { id: string; name: string; count: number; oldestDays: number }[];
    rejectionReasons: { reason: string; count: number }[];
}
