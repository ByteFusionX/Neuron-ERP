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
    type: string; // The type of notification (e.g., 'Info', 'Warning', 'Alert')
    title: string; // Brief title for the notification
    message: string; // Detailed message content
    recipients: any[]; // Array of recipient IDs (can be employees or other entities)
    sentBy: any; // Sender ID (can be an employee or system)
    date: Date; // Timestamp of the notification
    referenceId: any; // Link to related entities like events, tasks, or projects
    referenceType: string; // Type of the related entity (e.g., 'Event', 'Task')
    additionalData: any; // JSON object for extensibility
}