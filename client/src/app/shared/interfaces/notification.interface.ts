export interface NotificationCounts {
    assignedJobCount: number,
    reAssignedJobCount: number,
    announcementCount: number,
    dealSheetCount: number,
    feedbackCount: number,
    quotationCount: number,
    enquiryCount: number,
    purchaseCount: number,
}

export interface TextNotification {
    _id?: string;
    type: string;
    title: string;
    message: string;
    recipients: any[];
    sentBy: any;
    date: Date;
    referenceId: any;
    referenceType: string;
    additionalData: any;
    routePath?: string;
    routeData?: any;
}