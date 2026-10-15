export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type AnnouncementType = 'general' | 'policy' | 'event' | 'celebration' | 'maintenance';
export type AnnouncementState = 'draft' | 'scheduled' | 'active' | 'expired';

export interface announcementPostData {
    title:String | null | undefined;
    description:String | null | undefined;
    publishAt?: string | null;
    expiresAt?: string | null;
    isEdit: boolean;
    _id: string | undefined;
    category: string[];
    priority?: AnnouncementPriority;
    type?: AnnouncementType;
    pinned?: boolean;
    requireAck?: boolean;
    link?: string | null;
    status?: 'draft' | 'published';
}

export interface announcementGetData {
    _id: string
    title: string
    description: string
    date: Date
    createdDate: Date,
    celeb: boolean
    viewedBy?: string[]
    category: string[]
    createdBy: string
    // Added by the announcements redesign (the list endpoint always sends them)
    publishAt?: string
    expiresAt?: string | null
    priority?: AnnouncementPriority
    type?: AnnouncementType
    pinned?: boolean
    requireAck?: boolean
    link?: string
    state?: AnnouncementState
    authorName?: string
    updatedAt?: string
    isRead?: boolean
    isAcknowledged?: boolean
    // Only sent to people who can create/edit announcements
    readCount?: number
    ackCount?: number
  }

export interface announcementListQuery {
    page: number
    row: number
    search?: string
    filter?: 'all' | 'unread' | 'pinned' | 'ack'
    state?: AnnouncementState
    priority?: AnnouncementPriority | ''
    type?: AnnouncementType | ''
}

export interface announcementListResponse {
    total: number
    unread: number
    pendingAck: number
    canManage: boolean
    announcements: announcementGetData[]
}
