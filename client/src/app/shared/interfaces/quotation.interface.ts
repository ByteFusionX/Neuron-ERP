import { ApexChart, ApexDataLabels, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexTooltip } from "ng-apexcharts";
import { ContactDetail, getCustomer } from "./customer.interface";
import { getDepartment } from "./department.interface";
import { getEmployee } from "./employee.interface";
import { Files, getEnquiry } from "./enquiry.interface";

export interface QuoteItem {
    itemName: string;
    isOptional?: boolean;
    includeInTotal?: boolean;
    itemDetails: QuoteItemDetail[]
}

export interface OptionalItems {
    items: QuoteItem[];
    totalDiscount: number;
}

export interface QuoteItemDetail {
    _id: string;
    itemCode?: string;
    detail: string;
    quantity: number;
    unitCost: number;
    profit: number;
    availability: string;
    dealSelected: boolean;
    supplierName: string;
    supplierId?: string;
    phoneNo: string;
    unitSellingPrice: number;
    email: string;
    uom?: string;
}

export interface File {
    fileName: string;
    originalname: string;
}

/** Commercial content of a quote as it stood at one revision. */
export interface QuoteRevisionSnapshot {
    subject: string;
    currency: string;
    optionalItems: OptionalItems[];
    customerNote: string;
    termsAndCondition: string;
}

export interface QuoteRevision {
    revision: number;
    /** Null on the current revision, which has not been superseded yet. */
    savedAt: string | null;
    savedBy: { firstName?: string; lastName?: string } | null;
    reason: string;
    /** True for the live content rather than a stored snapshot. */
    current: boolean;
    snapshot: QuoteRevisionSnapshot;
}

export interface QuoteRevisionsResponse {
    revision: number;
    revisions: QuoteRevision[];
}

export interface FieldChange {
    field: string;
    from: string;
    to: string;
}

export interface EditHistoryEntry {
    editedBy: getEmployee;
    editedAt: string;
    action: 'Created' | 'Updated' | 'StatusChanged' | 'DealApproved' | 'DealRejected' | 'DealRevoked';
    fromStatus?: string;
    toStatus?: string;
    reason?: string;
    /** Set only on edits that produced a new revision. */
    revision?: number;
    changes?: FieldChange[];
}

export interface Quotatation {
    _id?: string;
    quoteId?: string;
    client: getCustomer;
    attention: ContactDetail;
    date: string;
    department: getDepartment;
    departments?: getDepartment[];
    subject: string;
    currency: string;
    quoteCompany: string;
    optionalItems: OptionalItems[];
    customerNote: DefaultAndText;
    termsAndCondition: DefaultAndText;
    createdBy: getEmployee;
    status: QuoteStatus;
    lpoFiles: File[];
    lpoValue: string;
    lpoSubmitted: boolean;
    enqId: string;
    dealData: dealData;
    rfqNo: string;
    closingDate: string;
    eventId?: any;
    saveNote?: string;
    job?: { allocateStatus?: string };
    editHistory?: EditHistoryEntry[];
    /** Bumped when a sent quote's commercial content is edited. 0 on quotes that never were. */
    revision?: number;
}

export interface getQuotatation {
    _id?: string;
    quoteId?: string;
    client: getCustomer;
    attention: ContactDetail;
    date: string;
    department: getDepartment;
    departments?: getDepartment[];
    subject: string;
    currency: string;
    quoteCompany: string;
    optionalItems: OptionalItems[];
    customerNote: DefaultAndText;
    termsAndCondition: DefaultAndText;
    createdBy: getEmployee;
    status: QuoteStatus;
    lpoFiles: [];
    lpoSubmitted: boolean;
    enqId: getEnquiry;
    dealData: dealData;
    rfqNo: string;
    closingDate: string;
    eventId?: any;
    saveNote?: string;
    editHistory?: EditHistoryEntry[];
    /** Bumped when a sent quote's commercial content is edited. 0 on quotes that never were. */
    revision?: number;
    events?: any[];
}

export interface DefaultAndText {
    defaultNote: string;
    text: string;
}

export interface getQuotation {
    quotations: Quotatation[];
    total: number;
}

export interface getDealSheet {
    dealSheet: Quotatation[];
    total: number;
}

export interface quotatationForm {
    _id?: string;
    quoteId?: string;
    client: string | getCustomer;
    attention: string | ContactDetail | undefined;
    date: string | null;
    department: string | getDepartment | undefined;
    departments?: (string | getDepartment)[];
    subject: string;
    currency: string;
    quoteCompany: string;
    optionalItems: OptionalItems[];
    customerNote: DefaultAndText;
    termsAndCondition: DefaultAndText;
    createdBy: string | getEmployee | undefined;
    status: QuoteStatus;
    rfqNo: string;
    closingDate: string;
    saveNote?: string;
    editHistory?: EditHistoryEntry[];
}

export enum QuoteStatus {
    Draft = 'Draft',
    WorkInProgress = 'Work In Progress',
    QuoteSubmitted = 'Quote Submitted',
    UnderNegotiation = 'Under negotiation',
    UnderReview = 'Under review',
    ReadyForSubmission = 'Ready for submission',
    Won = 'Won',
    Lost = 'Lost',
    Expired = 'Expired',
}

export interface dealData {
    dealId: string;
    paymentTerms: string;
    updatedItems: QuoteItem[];
    totalDiscount: number;
    additionalCosts: {
        type: string; name: string, value: number, supplierId?: string, supplierDetails?: any
    }[];
    savedDate: string;
    seenByApprover: boolean;
    status: string;
    approvedBy?: any;
    comments: string[]
    seenedBySalsePerson: boolean
    attachments: Files[]
}


export interface FilterQuote {
    page: number;
    row: number;
    search: string;
    salesPerson: string | null;
    customer: string | null;
    fromDate: string | null;
    toDate: string | null;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc' | null;
}

export interface FilterDeal {
    page: number;
    row: number;
    access?: string;
    userId?: string;
    search?: string;
    role?: string;
}

export interface nextQuoteData {
    department: getDepartment;
    createdBy: string | undefined;
    date: string;
}

export interface priceDetails {
    totalSellingPrice: number;
    totalCost: number;
    profit: number;
    perc: number;
}

export interface PieChartData {
    /** Status name. */
    name: string;
    /** Number of quotations at this status. */
    value: number;
    /** Their combined quoted value, in QAR. */
    amount: number;
}

/** Filters the report is generated for. Mirrors the quotation list's own filters. */
export interface ReportFilter {
    salesPerson: string | null;
    customer: string | null;
    department: string | null;
    fromDate: string | null;
    toDate: string | null;
    access?: string;
    userId?: string;
}

export interface ReportKpi {
    totalValue: number;
    totalCount: number;
    wonValue: number;
    wonCount: number;
    lostValue: number;
    lostCount: number;
    /** Won + Lost. Quotes still open are not counted against the win rate. */
    closedCount: number;
    winRate: number;
    openValue: number;
    openCount: number;
    avgQuoteValue: number;
    /** Null when no quotation has a logged outcome to measure. */
    avgDaysToClose: number | null;
}

export interface ReportFunnelStage {
    key: string;
    label: string;
    count: number;
    value: number;
    pct: number;
}

export interface ReportDealStatus {
    key: 'pending' | 'approved' | 'rejected';
    label: string;
    count: number;
    value: number;
}

export interface ReportTrendPoint {
    /** yyyy-MM */
    month: string;
    createdCount: number;
    createdValue: number;
    wonCount: number;
    wonValue: number;
}

export interface ReportBreakdownRow {
    id: string;
    name: string;
    count: number;
    value: number;
    wonCount: number;
    wonValue: number;
    winRate: number;
}

/** A quotation that needs chasing: closing soon, past its closing date, or gone quiet. */
export interface ReportAttentionItem {
    _id: string;
    quoteId: string;
    customer: string;
    salesPerson: string;
    status: string;
    value: number;
    closingDate: string | null;
    /** Days until closing, days overdue, or days idle, depending on the list it came from. */
    days: number;
}

export interface ReportLostReason {
    reason: string;
    count: number;
    value: number;
}

export interface ReportDetails {
    /** Everything is reported in this currency; other currencies are converted at `usdRate`. */
    currency: string;
    usdRate: number;
    generatedAt: string;
    totalValue: number;
    pieChartData: PieChartData[];
    kpi: ReportKpi;
    funnel: ReportFunnelStage[];
    dealStatus: ReportDealStatus[];
    outcomes: {
        won: { count: number; value: number };
        lost: { count: number; value: number };
        expired: { count: number; value: number };
    };
    trend: ReportTrendPoint[];
    breakdown: {
        department: ReportBreakdownRow[];
        salesPerson: ReportBreakdownRow[];
        customer: ReportBreakdownRow[];
    };
    attention: {
        overdue: ReportAttentionItem[];
        closingSoon: ReportAttentionItem[];
        idle: ReportAttentionItem[];
        idleDays: number;
        soonDays: number;
    };
    lostReasons: ReportLostReason[];
}

export type PieChartOptions = {
    series: ApexNonAxisChartSeries;
    chart: ApexChart;
    labels: string[];
    tooltip: ApexTooltip;
    legend: ApexLegend;
    dataLabels: ApexDataLabels;
    plotOptions: ApexPlotOptions;
    colors: any;
    responsive: any;
    stroke: any;
    states: any;
};


export const QuoteStatusColors: { [key in QuoteStatus]: string } = {
    [QuoteStatus.Draft]: '#9CA3AF', // Gray
    [QuoteStatus.WorkInProgress]: '#FFA500',  // Orange
    [QuoteStatus.QuoteSubmitted]: '#00BFFF',  // Deep Sky Blue
    [QuoteStatus.UnderNegotiation]: '#FFD700', // Gold
    [QuoteStatus.UnderReview]: '#32CD32',    // Lime Green
    [QuoteStatus.ReadyForSubmission]: '#FF6347', // Tomato
    [QuoteStatus.Won]: '#228B22',  // Forest Green
    [QuoteStatus.Lost]: '#FF0000', // Red
    [QuoteStatus.Expired]: '#6B7280', // Gray
};
