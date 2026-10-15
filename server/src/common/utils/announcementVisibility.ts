import { Types } from "mongoose";

/** Date an announcement goes live; older records only have `date`. */
export const PUBLISH_AT = { $ifNull: ['$publishAt', '$date'] };

export type AnnouncementState = 'draft' | 'scheduled' | 'active' | 'expired';

export const announcementState = (a: any, now = new Date()): AnnouncementState => {
    if (a.status === 'draft') return 'draft';
    const publishAt = new Date(a.publishAt ?? a.date);
    if (publishAt.getTime() > now.getTime()) return 'scheduled';
    if (a.expiresAt && new Date(a.expiresAt).getTime() <= now.getTime()) return 'expired';
    return 'active';
};

/** Match for announcements that are live right now and addressed to this user's category. */
export const activeForUser = (userId: string, categoryId: string, now = new Date()) => ({
    $and: [
        { $or: [{ category: 'all' }, { category: String(categoryId) }, { createdBy: new Types.ObjectId(String(userId)) }] },
        { status: { $ne: 'draft' } },
        { $expr: { $lte: [PUBLISH_AT, now] } },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    ],
});

/** Match for one lifecycle state (used by the authoring tabs). */
export const stateMatch = (state: AnnouncementState, now = new Date()): any => {
    switch (state) {
        case 'draft': return { status: 'draft' };
        case 'scheduled': return { status: { $ne: 'draft' }, $expr: { $gt: [PUBLISH_AT, now] } };
        case 'expired': return { status: { $ne: 'draft' }, expiresAt: { $lte: now }, $expr: { $lte: [PUBLISH_AT, now] } };
        default: return {};
    }
};
