import announcementModel from "../models/announcement.model";
import employeeModel from "../models/employee.model";
import { filterEmployeesByPrivilege } from "../controllers/notification.controller";
import { notify } from "./notify.service";
import { registerScheduledHandler, scheduleJob } from "./outbox.service";

const HANDLER = 'announcement';

/** Notifies everyone in the announcement's audience who may view announcements (the author is left out). */
export const sendAnnouncementNotification = async (announcementId: string) => {
    const announcement: any = await announcementModel.findById(announcementId).lean();
    if (!announcement) return;

    const audience: string[] = announcement.category?.length ? announcement.category : ['all'];
    const authorId = announcement.createdBy?.toString();
    const users = await employeeModel.find({ isDeleted: { $ne: true } });
    const eligibleUsers = users.filter(user => audience.includes('all') || audience.some(cat => user.category?.toString() === cat));
    if (!eligibleUsers.some(user => user._id.toString() !== authorId)) return;

    const recipients = await filterEmployeesByPrivilege({
        privilegeKey: 'announcement',
        checkFunction: (privileges, employeeId) => {
            if (!employeeId || employeeId === authorId) return false;
            return eligibleUsers.some(user => user._id.toString() === employeeId) && privileges.announcement?.viewReport !== 'none';
        }
    }, authorId);

    // Through notify() so each recipient's mute preferences for Announcement are honoured
    await notify({
        type: 'Announcement',
        referenceModel: 'Announcement',
        title: announcement.title,
        message: announcement.description,
        sentBy: authorId,
        referenceId: announcement._id,
        additionalData: { announcementId: announcement._id.toString() },
        recipients,
    });
};

/** Sends now when the announcement is dated today or earlier; otherwise queues it for its date (editing re-queues it). */
export const dispatchAnnouncement = async (announcementId: string, date: Date | string) => {
    const sendAt = new Date(date);
    if (!Number.isNaN(sendAt.getTime()) && sendAt.getTime() > Date.now()) {
        await scheduleJob(HANDLER, { announcementId }, sendAt, `announcement:${announcementId}`, true);
        return;
    }
    await sendAnnouncementNotification(announcementId);
};

registerScheduledHandler(HANDLER, async ({ announcementId }) => { await sendAnnouncementNotification(announcementId); });
