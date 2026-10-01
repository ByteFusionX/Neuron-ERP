export interface Enquiry {
    enquiryId: string;
    client: string;
    contact: string;
    department: string;
    salesPerson: string;
    title: string;
    source?: string;
    enquiryCategory?: string;
    priority?: string;
    requirement?: string;
    followUpOutcome?: string;
    lostReason?: string;
    competitorName?: string;
    competitorPriceGap?: string;
    date: string | Date;
    nextFollowUpDate?: string | Date;
    lastFollowUpDate?: string | Date;
    followUpHistory?: {
        date: string | Date;
        outcome?: string;
        note?: string;
        nextFollowUpDate?: string | Date;
        createdBy?: string;
        createdByName?: string;
        createdAt?: string | Date;
        correctionOf?: string | null;
        status?: 'scheduled' | 'done' | 'cancelled';
        dueDate?: string | Date;
        completedAt?: string | Date;
        cancelReason?: string;
    }[];
    attachments: string[];
    preSale: {
        presalePerson: string;
        presaleFiles: string[];
        comment:string;
        newFeedbackAccess:boolean;
    };
    status: string;
}

export interface File {
    fieldname: string,
    originalname: string,
    encoding: string,
    mimetype: string,
    destination: string,
    filename: string,
    path: string,
    size: number,
}
