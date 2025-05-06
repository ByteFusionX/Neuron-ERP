export interface Metric {
    name: string;
    type: string;
    value: number;
    lastWeek: number;
    lastWeekName: string;
    rank: number;
}

export interface RevenuePerPerson {
    name: string;
    type: string;
    value: number;
    lastWeek: number;
    lastWeekName: string;
    rank: number;
}

export interface ProfitPerMonth {
    profits: number[];
    months: string[];
}

export interface SalesConversion {
    total: number;
    converted: number;
}

export interface Filters {
    fromDate?: string;  
    toDate?: string;    
    salesPersonIds?: string[];
    departments?: string[];
}
