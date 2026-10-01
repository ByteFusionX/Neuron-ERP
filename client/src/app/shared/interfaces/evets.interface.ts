export interface Events {
    _id: string;
    from: string;
    collectionId: any,
    event:string,
    employee: any,
    summary: string,
    date: Date,
    status: string,
    createdBy:any,
    eventFiles?: { fileName: string, originalname: string }[],
    endDate?: Date,
    location?: string,
    attendees?: string[],
    onlineMeeting?: boolean,
    syncToOutlook?: boolean,
    outlookEventId?: string,
    outlookSyncStatus?: string,
}